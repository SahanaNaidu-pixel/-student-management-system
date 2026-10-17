// Courses, their department, semester, credits and assigned faculty
import { db } from "../db.js";
import { ADMIN, ANY_USER, HttpError, conflict, notFound } from "../lib/http.js";
import { validate, v, parseId, likePattern } from "../lib/validate.js";
import { logActivity } from "../lib/activity.js";

const RULES = {
  code: v.string({ required: true, min: 3, max: 12, transform: (s) => s.toUpperCase(), pattern: /^[A-Z0-9-]+$/, patternMessage: "Use letters, numbers and dashes only" }),
  name: v.string({ required: true, min: 3, max: 120 }),
  credits: v.int({ required: true, min: 1, max: 10 }),
  semester: v.int({ required: true, min: 1, max: 8 }),
  department_id: v.int({ required: true, min: 1 }),
  faculty_id: v.int({ min: 1 }),
  description: v.string({ max: 500 })
};

const SELECT = `
  SELECT c.*, d.code AS department_code, d.name AS department_name, f.full_name AS faculty_name,
    (SELECT COUNT(*) FROM enrollments en WHERE en.course_id = c.id) AS enrolled_count,
    (SELECT ROUND(100.0 * SUM(a.status IN ('present', 'late')) / COUNT(*), 1) FROM attendance a WHERE a.course_id = c.id) AS attendance_pct
  FROM courses c
  JOIN departments d ON d.id = c.department_id
  LEFT JOIN faculty f ON f.id = c.faculty_id`;

function check(input, excludeId = 0) {
  const fields = {};
  if (!db.prepare("SELECT 1 FROM departments WHERE id = ?").get(input.department_id)) fields.department_id = "Choose a valid department";
  if (input.faculty_id && !db.prepare("SELECT 1 FROM faculty WHERE id = ?").get(input.faculty_id)) fields.faculty_id = "Choose a valid faculty member";
  if (Object.keys(fields).length) throw new HttpError(422, "Please correct the highlighted fields.", fields);
  if (db.prepare("SELECT 1 FROM courses WHERE code = ? AND id != ?").get(input.code, excludeId)) {
    throw conflict(`Course code ${input.code} already exists.`, { code: "Already in use" });
  }
}

export function register(router) {
  router.get("/api/courses", ANY_USER, (ctx) => {
    const where = [];
    const params = [];
    const q = (ctx.query.get("q") || "").trim();
    if (q) {
      where.push("(c.code LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
      params.push(likePattern(q), likePattern(q));
    }
    for (const [key, column] of [["department", "c.department_id"], ["semester", "c.semester"], ["faculty", "c.faculty_id"]]) {
      const value = Number(ctx.query.get(key));
      if (Number.isInteger(value) && value > 0) { where.push(`${column} = ?`); params.push(value); }
    }
    const items = db.prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.semester, c.code`).all(...params);
    return { items };
  });

  router.get("/api/courses/:id", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const course = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
    if (!course) throw notFound("Course");
    const students = db.prepare(`
      SELECT s.id, s.roll_no, s.full_name, s.status,
        ROUND(100.0 * SUM(a.status IN ('present', 'late')) / NULLIF(COUNT(a.id), 0), 1) AS attendance_pct
      FROM enrollments en JOIN students s ON s.id = en.student_id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.course_id = en.course_id
      WHERE en.course_id = ? GROUP BY s.id ORDER BY s.roll_no
    `).all(id);
    const exams = db.prepare("SELECT * FROM exams WHERE course_id = ? ORDER BY exam_date").all(id);
    return { course, students, exams };
  });

  router.post("/api/courses", ADMIN, (ctx) => {
    const input = validate(ctx.body, RULES);
    check(input);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO courses (code, name, credits, semester, department_id, faculty_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.code, input.name, input.credits, input.semester, input.department_id, input.faculty_id, input.description);
    logActivity(ctx.user, "create", "course", Number(lastInsertRowid), `Created course ${input.code} ${input.name}`);
    ctx.status = 201;
    return db.prepare(`${SELECT} WHERE c.id = ?`).get(lastInsertRowid);
  });

  router.put("/api/courses/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    if (!db.prepare("SELECT 1 FROM courses WHERE id = ?").get(id)) throw notFound("Course");
    const input = validate(ctx.body, RULES);
    check(input, id);
    db.prepare(`
      UPDATE courses SET code = ?, name = ?, credits = ?, semester = ?, department_id = ?, faculty_id = ?, description = ? WHERE id = ?
    `).run(input.code, input.name, input.credits, input.semester, input.department_id, input.faculty_id, input.description, id);
    logActivity(ctx.user, "update", "course", id, `Updated course ${input.code}`);
    return db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
  });

  router.delete("/api/courses/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const existing = db.prepare("SELECT code FROM courses WHERE id = ?").get(id);
    if (!existing) throw notFound("Course");
    // Enrollments, attendance, exams and marks for the course are removed with it (ON DELETE CASCADE)
    db.prepare("DELETE FROM courses WHERE id = ?").run(id);
    logActivity(ctx.user, "delete", "course", id, `Deleted course ${existing.code}`);
    return { ok: true };
  });
}
