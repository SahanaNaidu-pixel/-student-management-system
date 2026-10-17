// Departments with student, faculty and course counts
import { db } from "../db.js";
import { ADMIN, ANY_USER, conflict, notFound } from "../lib/http.js";
import { validate, v, parseId } from "../lib/validate.js";
import { logActivity } from "../lib/activity.js";

const RULES = {
  code: v.string({ required: true, min: 2, max: 10, transform: (s) => s.toUpperCase(), pattern: /^[A-Z0-9&]+$/, patternMessage: "Use capital letters and numbers only" }),
  name: v.string({ required: true, min: 3, max: 100 }),
  head_of_department: v.string({ max: 100 }),
  description: v.string({ max: 500 })
};

const SELECT = `
  SELECT d.*,
    (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id) AS student_count,
    (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id AND s.status = 'active') AS active_student_count,
    (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id) AS faculty_count,
    (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.id) AS course_count
  FROM departments d`;

function checkUnique(input, excludeId = 0) {
  const fields = {};
  if (db.prepare("SELECT 1 FROM departments WHERE code = ? AND id != ?").get(input.code, excludeId)) fields.code = "Already in use";
  if (db.prepare("SELECT 1 FROM departments WHERE name = ? AND id != ?").get(input.name, excludeId)) fields.name = "Already in use";
  if (Object.keys(fields).length) throw conflict("A department with this code or name already exists.", fields);
}

export function register(router) {
  router.get("/api/departments", ANY_USER, () => ({ items: db.prepare(`${SELECT} ORDER BY d.code`).all() }));

  router.get("/api/departments/:id", ANY_USER, (ctx) => {
    const id = parseId(ctx.params.id);
    const department = db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
    if (!department) throw notFound("Department");
    const courses = db.prepare(`
      SELECT c.id, c.code, c.name, c.semester, c.credits, f.full_name AS faculty_name
      FROM courses c LEFT JOIN faculty f ON f.id = c.faculty_id WHERE c.department_id = ? ORDER BY c.semester, c.code
    `).all(id);
    const faculty = db.prepare("SELECT id, employee_id, full_name, designation, email FROM faculty WHERE department_id = ? ORDER BY full_name").all(id);
    const byYear = db.prepare("SELECT year, COUNT(*) AS count FROM students WHERE department_id = ? GROUP BY year ORDER BY year").all(id);
    return { department, courses, faculty, byYear };
  });

  router.post("/api/departments", ADMIN, (ctx) => {
    const input = validate(ctx.body, RULES);
    checkUnique(input);
    const { lastInsertRowid } = db.prepare("INSERT INTO departments (code, name, head_of_department, description) VALUES (?, ?, ?, ?)")
      .run(input.code, input.name, input.head_of_department, input.description);
    logActivity(ctx.user, "create", "department", Number(lastInsertRowid), `Created department ${input.code}`);
    ctx.status = 201;
    return db.prepare(`${SELECT} WHERE d.id = ?`).get(lastInsertRowid);
  });

  router.put("/api/departments/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    if (!db.prepare("SELECT 1 FROM departments WHERE id = ?").get(id)) throw notFound("Department");
    const input = validate(ctx.body, RULES);
    checkUnique(input, id);
    db.prepare("UPDATE departments SET code = ?, name = ?, head_of_department = ?, description = ? WHERE id = ?")
      .run(input.code, input.name, input.head_of_department, input.description, id);
    logActivity(ctx.user, "update", "department", id, `Updated department ${input.code}`);
    return db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
  });

  router.delete("/api/departments/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const dept = db.prepare(`${SELECT} WHERE d.id = ?`).get(id);
    if (!dept) throw notFound("Department");
    if (dept.student_count || dept.faculty_count || dept.course_count) {
      throw conflict(`${dept.code} still has ${dept.student_count} students, ${dept.faculty_count} faculty and ${dept.course_count} courses. Move or remove them first.`);
    }
    db.prepare("DELETE FROM departments WHERE id = ?").run(id);
    logActivity(ctx.user, "delete", "department", id, `Deleted department ${dept.code}`);
    return { ok: true };
  });
}
