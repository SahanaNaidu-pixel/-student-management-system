// Student records: CRUD, profile, enrollments, photos, CSV import/export
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, transaction } from "../db.js";
import { config } from "../config.js";
import { ADMIN, ANY_USER, HttpError, badRequest, conflict, notFound } from "../lib/http.js";
import { validate, v, parseId, pagination, sorting, likePattern } from "../lib/validate.js";
import { logActivity } from "../lib/activity.js";
import { resultsForStudent } from "../lib/results.js";
import { sendCsv, parseCsv } from "../lib/csv.js";

export const STUDENT_STATUSES = ["active", "inactive", "graduated", "suspended"];

const RULES = {
  roll_no: v.string({
    required: true, min: 3, max: 20, transform: (s) => s.toUpperCase(),
    pattern: /^[A-Z0-9-]+$/, patternMessage: "Use letters, numbers and dashes only"
  }),
  full_name: v.string({ required: true, min: 2, max: 100, pattern: /^[\p{L} .'-]+$/u, patternMessage: "Use letters, spaces, dots, apostrophes or dashes" }),
  email: v.email({ required: true }),
  phone: v.phone(),
  date_of_birth: v.date({ notFuture: true }),
  gender: v.oneOf(["Male", "Female", "Other"]),
  department_id: v.int({ required: true, min: 1 }),
  year: v.int({ required: true, min: 1, max: 4 }),
  semester: v.int({ required: true, min: 1, max: 8 }),
  enrollment_date: v.date({ required: true, notFuture: true }),
  status: v.oneOf(STUDENT_STATUSES, { required: true })
};

// Rules that need more than one field or the database
function checkStudent(input, excludeId = 0) {
  const fields = {};
  if (input.semester !== 2 * input.year - 1 && input.semester !== 2 * input.year) {
    fields.semester = `Year ${input.year} covers semesters ${2 * input.year - 1} and ${2 * input.year}`;
  }
  if (input.date_of_birth && input.date_of_birth >= input.enrollment_date) {
    fields.date_of_birth = "Date of birth must be before the enrollment date";
  }
  if (!db.prepare("SELECT 1 FROM departments WHERE id = ?").get(input.department_id)) {
    fields.department_id = "Choose a valid department";
  }
  if (Object.keys(fields).length) throw new HttpError(422, "Please correct the highlighted fields.", fields);

  const duplicates = {};
  if (db.prepare("SELECT 1 FROM students WHERE roll_no = ? AND id != ?").get(input.roll_no, excludeId)) {
    duplicates.roll_no = `Roll number ${input.roll_no} is already registered`;
  }
  if (db.prepare("SELECT 1 FROM students WHERE email = ? AND id != ?").get(input.email, excludeId)) {
    duplicates.email = "This email belongs to another student";
  }
  if (Object.keys(duplicates).length) throw conflict("This student conflicts with an existing record.", duplicates);
}

const ATTENDANCE_PCT = `(
  SELECT ROUND(100.0 * SUM(a.status IN ('present', 'late')) / COUNT(*), 1)
  FROM attendance a WHERE a.student_id = s.id
)`;

const SORTS = {
  roll_no: "s.roll_no", full_name: "s.full_name", department: "d.code", year: "s.year",
  semester: "s.semester", enrollment_date: "s.enrollment_date", status: "s.status", attendance: "attendance_pct"
};

// Builds the WHERE clause shared by the list and the CSV export
function filters(query) {
  const where = [];
  const params = [];
  const q = (query.get("q") || "").trim();
  if (q) {
    where.push("(s.roll_no LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\' OR s.email LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\' OR d.code LIKE ? ESCAPE '\\')");
    params.push(...Array(5).fill(likePattern(q)));
  }
  for (const [key, column] of [["department", "s.department_id"], ["semester", "s.semester"], ["year", "s.year"]]) {
    const value = Number(query.get(key));
    if (Number.isInteger(value) && value > 0) { where.push(`${column} = ?`); params.push(value); }
  }
  const status = query.get("status");
  if (STUDENT_STATUSES.includes(status)) { where.push("s.status = ?"); params.push(status); }
  const course = Number(query.get("course"));
  if (Number.isInteger(course) && course > 0) {
    where.push("EXISTS (SELECT 1 FROM enrollments en WHERE en.student_id = s.id AND en.course_id = ?)");
    params.push(course);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

function getStudent(id) {
  const student = db.prepare(`
    SELECT s.*, d.code AS department_code, d.name AS department_name, ${ATTENDANCE_PCT} AS attendance_pct
    FROM students s JOIN departments d ON d.id = s.department_id WHERE s.id = ?
  `).get(id);
  if (!student) throw notFound("Student");
  const { photo_file, ...rest } = student;
  return { ...rest, has_photo: Boolean(photo_file) };
}

// New students are enrolled in their department's courses for their semester
function autoEnroll(studentId, departmentId, semester) {
  db.prepare(`
    INSERT OR IGNORE INTO enrollments (student_id, course_id)
    SELECT ?, id FROM courses WHERE department_id = ? AND semester = ?
  `).run(studentId, departmentId, semester);
}

function removePhotoFile(file) {
  if (!file) return;
  fs.rm(path.join(config.uploadDir, path.basename(file)), { force: true }, () => {});
}

const PHOTO_TYPES = [
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" }
];

const CSV_COLUMNS = [
  { key: "roll_no", label: "roll_no" },
  { key: "full_name", label: "full_name" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
  { key: "date_of_birth", label: "date_of_birth" },
  { key: "gender", label: "gender" },
  { key: "department_code", label: "department_code" },
  { key: "year", label: "year" },
  { key: "semester", label: "semester" },
  { key: "enrollment_date", label: "enrollment_date" },
  { key: "status", label: "status" },
  { key: "attendance_pct", label: "attendance_percent" }
];

export function register(router) {
  router.get("/api/students", ANY_USER, (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query);
    const { sql, params } = filters(ctx.query);
    const order = sorting(ctx.query, SORTS, "roll_no");
    const total = db.prepare(`SELECT COUNT(*) AS n FROM students s JOIN departments d ON d.id = s.department_id ${sql}`).get(...params).n;
    const items = db.prepare(`
      SELECT s.id, s.roll_no, s.full_name, s.email, s.phone, s.year, s.semester, s.status, s.enrollment_date,
             s.photo_file IS NOT NULL AS has_photo, d.code AS department_code, d.name AS department_name,
             ${ATTENDANCE_PCT} AS attendance_pct
      FROM students s JOIN departments d ON d.id = s.department_id
      ${sql} ORDER BY ${order}, s.id LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);
    return { items, total, page, pageSize };
  });

  router.get("/api/students/export.csv", ANY_USER, (ctx) => {
    const { sql, params } = filters(ctx.query);
    const rows = db.prepare(`
      SELECT s.*, d.code AS department_code, ${ATTENDANCE_PCT} AS attendance_pct
      FROM students s JOIN departments d ON d.id = s.department_id ${sql} ORDER BY s.roll_no
    `).all(...params);
    sendCsv(ctx.res, "students.csv", CSV_COLUMNS, rows);
  });

  router.post("/api/students/import", ADMIN, (ctx) => {
    if (typeof ctx.body.csv !== "string" || !ctx.body.csv.trim()) throw badRequest("Choose a CSV file to import.");
    const rows = parseCsv(ctx.body.csv);
    if (rows.length < 2) throw badRequest("The CSV file has no student rows.");
    if (rows.length > 2001) throw badRequest("Import at most 2000 students at a time.");

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const required = ["roll_no", "full_name", "email", "department_code", "year", "semester", "enrollment_date"];
    const missing = required.filter((h) => !header.includes(h));
    if (missing.length) throw badRequest(`Missing column(s): ${missing.join(", ")}.`);

    const departments = new Map(db.prepare("SELECT id, code FROM departments").all().map((d) => [d.code.toUpperCase(), d.id]));
    const errors = [];
    const seenRoll = new Set();
    const seenEmail = new Set();
    const valid = [];

    rows.slice(1).forEach((cells, i) => {
      const line = i + 2;
      const raw = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()]));
      raw.department_id = departments.get(String(raw.department_code).toUpperCase());
      raw.status = raw.status ? raw.status.toLowerCase() : "active";
      if (raw.gender) raw.gender = raw.gender[0].toUpperCase() + raw.gender.slice(1).toLowerCase();
      try {
        if (!raw.department_id) throw new HttpError(422, "", { department_code: `Unknown department "${raw.department_code}"` });
        const input = validate(raw, RULES);
        checkStudent(input);
        if (seenRoll.has(input.roll_no)) throw new HttpError(409, "", { roll_no: "Appears twice in this file" });
        if (seenEmail.has(input.email)) throw new HttpError(409, "", { email: "Appears twice in this file" });
        seenRoll.add(input.roll_no);
        seenEmail.add(input.email);
        valid.push(input);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        errors.push({ line, messages: Object.entries(error.fields || {}).map(([f, m]) => `${f}: ${m}`) });
      }
    });

    // All-or-nothing: nothing is imported if any row is invalid
    if (errors.length) {
      throw new HttpError(422, `${errors.length} row(s) have problems. Nothing was imported.`, { rows: errors.slice(0, 50) });
    }
    transaction(() => {
      const insert = db.prepare(`
        INSERT INTO students (roll_no, full_name, email, phone, date_of_birth, gender, department_id, year, semester, enrollment_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const s of valid) {
        const { lastInsertRowid } = insert.run(s.roll_no, s.full_name, s.email, s.phone, s.date_of_birth, s.gender,
          s.department_id, s.year, s.semester, s.enrollment_date, s.status);
        autoEnroll(Number(lastInsertRowid), s.department_id, s.semester);
      }
      logActivity(ctx.user, "import", "student", null, `Imported ${valid.length} students from CSV`);
    });
    return { imported: valid.length };
  });

  router.get("/api/students/:id", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const student = getStudent(id);
    const courses = db.prepare(`
      SELECT c.id, c.code, c.name, c.credits, c.semester, f.full_name AS faculty_name,
             COUNT(a.id) AS classes,
             SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late, SUM(a.status = 'absent') AS absent,
             ROUND(100.0 * SUM(a.status IN ('present', 'late')) / NULLIF(COUNT(a.id), 0), 1) AS attendance_pct
      FROM enrollments en
      JOIN courses c ON c.id = en.course_id
      LEFT JOIN faculty f ON f.id = c.faculty_id
      LEFT JOIN attendance a ON a.course_id = c.id AND a.student_id = en.student_id
      WHERE en.student_id = ?
      GROUP BY c.id ORDER BY c.semester DESC, c.code
    `).all(id);
    const attendance = db.prepare(`
      SELECT COUNT(*) AS classes, SUM(status = 'present') AS present, SUM(status = 'late') AS late, SUM(status = 'absent') AS absent
      FROM attendance WHERE student_id = ?
    `).get(id);
    const recentAttendance = db.prepare(`
      SELECT a.date, a.status, c.code AS course_code, c.name AS course_name
      FROM attendance a JOIN courses c ON c.id = a.course_id
      WHERE a.student_id = ? ORDER BY a.date DESC, c.code LIMIT 15
    `).all(id);
    const marks = db.prepare(`
      SELECT e.id AS exam_id, e.name AS exam_name, e.exam_type, e.exam_date, e.max_marks, m.marks,
             c.code AS course_code, c.name AS course_name
      FROM marks m JOIN exams e ON e.id = m.exam_id JOIN courses c ON c.id = e.course_id
      WHERE m.student_id = ? ORDER BY e.exam_date DESC
    `).all(id);
    return { student, courses, attendance, recentAttendance, marks, results: resultsForStudent(id) };
  });

  router.post("/api/students", ANY_USER, (ctx) => {
    const input = validate(ctx.body, RULES);
    checkStudent(input);
    const id = transaction(() => {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO students (roll_no, full_name, email, phone, date_of_birth, gender, department_id, year, semester, enrollment_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.roll_no, input.full_name, input.email, input.phone, input.date_of_birth, input.gender,
        input.department_id, input.year, input.semester, input.enrollment_date, input.status);
      const newId = Number(lastInsertRowid);
      autoEnroll(newId, input.department_id, input.semester);
      logActivity(ctx.user, "create", "student", newId, `Registered ${input.full_name} (${input.roll_no})`);
      return newId;
    });
    ctx.status = 201;
    return getStudent(id);
  });

  router.put("/api/students/:id", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    getStudent(id);
    const input = validate(ctx.body, RULES);
    checkStudent(input, id);
    db.prepare(`
      UPDATE students SET roll_no = ?, full_name = ?, email = ?, phone = ?, date_of_birth = ?, gender = ?,
        department_id = ?, year = ?, semester = ?, enrollment_date = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(input.roll_no, input.full_name, input.email, input.phone, input.date_of_birth, input.gender,
      input.department_id, input.year, input.semester, input.enrollment_date, input.status, id);
    logActivity(ctx.user, "update", "student", id, `Updated ${input.full_name} (${input.roll_no})`);
    return getStudent(id);
  });

  router.delete("/api/students/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const existing = db.prepare("SELECT roll_no, full_name, photo_file FROM students WHERE id = ?").get(id);
    if (!existing) throw notFound("Student");
    transaction(() => {
      db.prepare("DELETE FROM students WHERE id = ?").run(id);
      logActivity(ctx.user, "delete", "student", id, `Deleted ${existing.full_name} (${existing.roll_no})`);
    });
    removePhotoFile(existing.photo_file);
    return { ok: true };
  });

  router.put("/api/students/:id/enrollments", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const student = getStudent(id);
    const ids = ctx.body.courseIds;
    if (!Array.isArray(ids) || ids.length > 60 || !ids.every((c) => Number.isInteger(c) && c > 0)) {
      throw badRequest("courseIds must be a list of course IDs.");
    }
    const unique = [...new Set(ids)];
    const found = unique.length
      ? db.prepare(`SELECT COUNT(*) AS n FROM courses WHERE id IN (${unique.map(() => "?").join(",")})`).get(...unique).n
      : 0;
    if (found !== unique.length) throw badRequest("One or more courses do not exist.");

    transaction(() => {
      const current = db.prepare("SELECT course_id FROM enrollments WHERE student_id = ?").all(id).map((r) => r.course_id);
      const remove = db.prepare("DELETE FROM enrollments WHERE student_id = ? AND course_id = ?");
      const removeAttendance = db.prepare("DELETE FROM attendance WHERE student_id = ? AND course_id = ?");
      const removeMarks = db.prepare("DELETE FROM marks WHERE student_id = ? AND exam_id IN (SELECT id FROM exams WHERE course_id = ?)");
      const add = db.prepare("INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?, ?)");
      // Dropping a course also drops the student's attendance and marks for it
      current.filter((c) => !unique.includes(c)).forEach((c) => {
        remove.run(id, c);
        removeAttendance.run(id, c);
        removeMarks.run(id, c);
      });
      unique.forEach((c) => add.run(id, c));
      logActivity(ctx.user, "update", "enrollment", id, `Updated course enrollment for ${student.full_name} (${unique.length} courses)`);
    });
    return { ok: true };
  });

  router.get("/api/students/:id/photo", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const row = db.prepare("SELECT photo_file FROM students WHERE id = ?").get(id);
    if (!row || !row.photo_file) throw notFound("Photo");
    const file = path.join(config.uploadDir, path.basename(row.photo_file));
    const type = PHOTO_TYPES.find((t) => file.endsWith("." + t.ext));
    if (!type || !fs.existsSync(file)) throw notFound("Photo");
    ctx.res.writeHead(200, { "Content-Type": type.mime, "Cache-Control": "private, max-age=300" });
    fs.createReadStream(file).pipe(ctx.res);
  });

  router.post("/api/students/:id/photo", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const row = db.prepare("SELECT full_name, photo_file FROM students WHERE id = ?").get(id);
    if (!row) throw notFound("Student");
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(ctx.body.dataUrl || ""));
    if (!match) throw badRequest("Upload a PNG, JPEG or WebP image.");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > config.maxPhotoBytes) throw badRequest("The photo must be 2 MB or smaller.");
    // Trust the file's real content, not its declared type
    const type = PHOTO_TYPES.find((t) => t.test(bytes));
    if (!type) throw badRequest("That file is not a valid PNG, JPEG or WebP image.");

    fs.mkdirSync(config.uploadDir, { recursive: true });
    const fileName = `${crypto.randomUUID()}.${type.ext}`;
    fs.writeFileSync(path.join(config.uploadDir, fileName), bytes);
    db.prepare("UPDATE students SET photo_file = ?, updated_at = datetime('now') WHERE id = ?").run(fileName, id);
    removePhotoFile(row.photo_file);
    logActivity(ctx.user, "update", "student", id, `Updated profile photo for ${row.full_name}`);
    return { ok: true };
  });

  router.delete("/api/students/:id/photo", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const row = db.prepare("SELECT full_name, photo_file FROM students WHERE id = ?").get(id);
    if (!row) throw notFound("Student");
    db.prepare("UPDATE students SET photo_file = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
    removePhotoFile(row.photo_file);
    logActivity(ctx.user, "update", "student", id, `Removed profile photo for ${row.full_name}`);
    return { ok: true };
  });
}
