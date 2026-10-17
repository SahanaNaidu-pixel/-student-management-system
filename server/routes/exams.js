// Examinations, marks entry and semester results
import { db, transaction } from "../db.js";
import { ADMIN, ANY_USER, HttpError, badRequest, notFound } from "../lib/http.js";
import { validate, v, parseId, localToday } from "../lib/validate.js";
import { logActivity } from "../lib/activity.js";
import { resultsList } from "../lib/results.js";
import { gradeFor, PASS_PERCENT } from "../lib/grading.js";
import { sendCsv } from "../lib/csv.js";
import { STUDENT_STATUSES } from "./students.js";

export const EXAM_TYPES = ["mid-term", "end-semester", "quiz", "practical"];

const RULES = {
  course_id: v.int({ required: true, min: 1 }),
  name: v.string({ required: true, min: 3, max: 100 }),
  exam_type: v.oneOf(EXAM_TYPES, { required: true }),
  exam_date: v.date({ required: true }),
  max_marks: v.int({ required: true, min: 1, max: 1000 })
};

const SELECT = `
  SELECT e.*, c.code AS course_code, c.name AS course_name, c.semester, d.code AS department_code,
    (SELECT COUNT(*) FROM enrollments en WHERE en.course_id = e.course_id) AS enrolled_count,
    (SELECT COUNT(*) FROM marks m WHERE m.exam_id = e.id) AS marks_count,
    (SELECT ROUND(AVG(m.marks), 2) FROM marks m WHERE m.exam_id = e.id) AS average_marks
  FROM exams e JOIN courses c ON c.id = e.course_id JOIN departments d ON d.id = c.department_id`;

const today = localToday;

function getExam(id) {
  const exam = db.prepare(`${SELECT} WHERE e.id = ?`).get(id);
  if (!exam) throw notFound("Exam");
  return exam;
}

function resultFilters(query) {
  const semester = Number(query.get("semester"));
  const departmentId = Number(query.get("department"));
  const status = query.get("status");
  return {
    semester: Number.isInteger(semester) && semester > 0 ? semester : null,
    departmentId: Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null,
    studentStatus: STUDENT_STATUSES.includes(status) ? status : null,
    q: (query.get("q") || "").trim()
  };
}

export function register(router) {
  router.get("/api/exams", ANY_USER, (ctx) => {
    const where = [];
    const params = [];
    for (const [key, column] of [["course", "e.course_id"], ["department", "c.department_id"], ["semester", "c.semester"]]) {
      const value = Number(ctx.query.get(key));
      if (Number.isInteger(value) && value > 0) { where.push(`${column} = ?`); params.push(value); }
    }
    const type = ctx.query.get("type");
    if (EXAM_TYPES.includes(type)) { where.push("e.exam_type = ?"); params.push(type); }
    const when = ctx.query.get("when");
    if (when === "upcoming") { where.push("e.exam_date >= ?"); params.push(today()); }
    if (when === "past") { where.push("e.exam_date < ?"); params.push(today()); }
    const order = when === "upcoming" ? "e.exam_date ASC" : "e.exam_date DESC";
    const items = db.prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}, c.code`).all(...params);
    return { items, types: EXAM_TYPES };
  });

  router.get("/api/exams/:id", ANY_USER, (ctx) => {
    const exam = getExam(parseId(ctx.params.id));
    const students = db.prepare(`
      SELECT s.id, s.roll_no, s.full_name, s.status, m.marks
      FROM enrollments en JOIN students s ON s.id = en.student_id
      LEFT JOIN marks m ON m.student_id = s.id AND m.exam_id = ?
      WHERE en.course_id = ? ORDER BY s.roll_no
    `).all(exam.id, exam.course_id).map((s) => {
      if (s.marks === null) return { ...s, percentage: null, grade: null };
      const percentage = Math.round((s.marks / exam.max_marks) * 10000) / 100;
      return { ...s, percentage, grade: gradeFor(percentage, percentage >= PASS_PERCENT) };
    });
    return { exam, students, passPercent: PASS_PERCENT, isFuture: exam.exam_date > today() };
  });

  router.post("/api/exams", ADMIN, (ctx) => {
    const input = validate(ctx.body, RULES);
    const course = db.prepare("SELECT code FROM courses WHERE id = ?").get(input.course_id);
    if (!course) throw new HttpError(422, "Please correct the highlighted fields.", { course_id: "Choose a valid course" });
    const { lastInsertRowid } = db.prepare("INSERT INTO exams (course_id, name, exam_type, exam_date, max_marks) VALUES (?, ?, ?, ?, ?)")
      .run(input.course_id, input.name, input.exam_type, input.exam_date, input.max_marks);
    logActivity(ctx.user, "create", "exam", Number(lastInsertRowid), `Scheduled ${input.name} for ${course.code} on ${input.exam_date}`);
    ctx.status = 201;
    return getExam(Number(lastInsertRowid));
  });

  router.put("/api/exams/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const existing = getExam(id);
    const input = validate(ctx.body, RULES);
    const fields = {};
    if (!db.prepare("SELECT 1 FROM courses WHERE id = ?").get(input.course_id)) fields.course_id = "Choose a valid course";
    if (existing.marks_count && input.course_id !== existing.course_id) fields.course_id = "Marks are already entered; the course cannot change";
    const highest = db.prepare("SELECT MAX(marks) AS m FROM marks WHERE exam_id = ?").get(id).m;
    if (highest !== null && input.max_marks < highest) fields.max_marks = `A student already scored ${highest}`;
    if (existing.marks_count && input.exam_date > today()) fields.exam_date = "Marks are already entered; the date cannot be in the future";
    if (Object.keys(fields).length) throw new HttpError(422, "Please correct the highlighted fields.", fields);

    db.prepare("UPDATE exams SET course_id = ?, name = ?, exam_type = ?, exam_date = ?, max_marks = ? WHERE id = ?")
      .run(input.course_id, input.name, input.exam_type, input.exam_date, input.max_marks, id);
    logActivity(ctx.user, "update", "exam", id, `Updated exam ${input.name}`);
    return getExam(id);
  });

  router.delete("/api/exams/:id", ADMIN, (ctx) => {
    const exam = getExam(parseId(ctx.params.id));
    db.prepare("DELETE FROM exams WHERE id = ?").run(exam.id);
    logActivity(ctx.user, "delete", "exam", exam.id, `Deleted exam ${exam.name} (${exam.course_code}) and its ${exam.marks_count} marks`);
    return { ok: true };
  });

  // Saves marks for many students at once; a null mark clears that student's entry
  router.put("/api/exams/:id/marks", ANY_USER, (ctx) => {
    const exam = getExam(parseId(ctx.params.id));
    if (exam.exam_date > today()) throw badRequest("Marks can be entered once the exam date has passed.");
    const entries = ctx.body.entries;
    if (!Array.isArray(entries) || entries.length === 0) throw badRequest("No marks were sent.");

    const enrolled = new Set(db.prepare("SELECT student_id FROM enrollments WHERE course_id = ?").all(exam.course_id).map((r) => r.student_id));
    const fields = {};
    for (const e of entries) {
      if (!Number.isInteger(e.student_id) || !enrolled.has(e.student_id)) throw badRequest("Marks can only be entered for students enrolled in this course.");
      if (e.marks === null || e.marks === "") continue;
      const n = Number(e.marks);
      if (!Number.isFinite(n) || n < 0 || n > exam.max_marks) fields[e.student_id] = `Enter a value from 0 to ${exam.max_marks}`;
    }
    if (Object.keys(fields).length) throw new HttpError(422, "Some marks are out of range.", fields);

    const saved = transaction(() => {
      const upsert = db.prepare(`
        INSERT INTO marks (exam_id, student_id, marks) VALUES (?, ?, ?)
        ON CONFLICT (exam_id, student_id) DO UPDATE SET marks = excluded.marks, updated_at = datetime('now')
      `);
      const clear = db.prepare("DELETE FROM marks WHERE exam_id = ? AND student_id = ?");
      let count = 0;
      for (const e of entries) {
        if (e.marks === null || e.marks === "") clear.run(exam.id, e.student_id);
        else { upsert.run(exam.id, e.student_id, Math.round(Number(e.marks) * 100) / 100); count++; }
      }
      logActivity(ctx.user, "marks", "exam", exam.id, `Entered marks for ${exam.name} (${exam.course_code}) – ${count} students`);
      return count;
    });
    return { saved };
  });

  router.get("/api/results", ANY_USER, (ctx) => {
    const items = resultsList(resultFilters(ctx.query));
    const passed = items.filter((r) => r.passed).length;
    const grades = {};
    for (const r of items) grades[r.grade] = (grades[r.grade] || 0) + 1;
    const average = items.length ? Math.round((items.reduce((s, r) => s + r.percentage, 0) / items.length) * 100) / 100 : null;
    return { items, stats: { count: items.length, passed, failed: items.length - passed, average, grades } };
  });

  router.get("/api/results/export.csv", ANY_USER, (ctx) => {
    const items = resultsList(resultFilters(ctx.query));
    sendCsv(ctx.res, "results.csv", [
      { key: "roll_no", label: "Roll no" }, { key: "full_name", label: "Student" }, { key: "department_code", label: "Department" },
      { key: "semester", label: "Semester" },
      { label: "Subjects", value: (r) => r.subjects.map((s) => `${s.course_code}: ${s.marks}/${s.max_marks}`).join("; ") },
      { key: "total", label: "Total" }, { key: "max", label: "Maximum" }, { key: "percentage", label: "Percentage" },
      { key: "grade", label: "Grade" }, { label: "Status", value: (r) => (r.passed ? "PASS" : "FAIL") }
    ], items);
  });
}
