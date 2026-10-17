// Faculty members and the courses they teach
import { db } from "../db.js";
import { ADMIN, ANY_USER, HttpError, conflict, notFound } from "../lib/http.js";
import { validate, v, parseId, likePattern } from "../lib/validate.js";
import { logActivity } from "../lib/activity.js";

export const DESIGNATIONS = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer", "Lab Instructor"];

const RULES = {
  employee_id: v.string({ required: true, min: 3, max: 20, transform: (s) => s.toUpperCase(), pattern: /^[A-Z0-9-]+$/, patternMessage: "Use letters, numbers and dashes only" }),
  full_name: v.string({ required: true, min: 2, max: 100 }),
  email: v.email({ required: true }),
  phone: v.phone(),
  designation: v.oneOf(DESIGNATIONS, { required: true }),
  department_id: v.int({ required: true, min: 1 }),
  joined_on: v.date({ notFuture: true })
};

const SELECT = `
  SELECT f.*, d.code AS department_code, d.name AS department_name,
    (SELECT COUNT(*) FROM courses c WHERE c.faculty_id = f.id) AS course_count,
    (SELECT GROUP_CONCAT(c.code, ', ') FROM courses c WHERE c.faculty_id = f.id) AS course_codes
  FROM faculty f JOIN departments d ON d.id = f.department_id`;

function check(input, excludeId = 0) {
  if (!db.prepare("SELECT 1 FROM departments WHERE id = ?").get(input.department_id)) {
    throw new HttpError(422, "Please correct the highlighted fields.", { department_id: "Choose a valid department" });
  }
  const fields = {};
  if (db.prepare("SELECT 1 FROM faculty WHERE employee_id = ? AND id != ?").get(input.employee_id, excludeId)) fields.employee_id = "Already in use";
  if (db.prepare("SELECT 1 FROM faculty WHERE email = ? AND id != ?").get(input.email, excludeId)) fields.email = "Already in use";
  if (Object.keys(fields).length) throw conflict("A faculty member with this employee ID or email already exists.", fields);
}

export function register(router) {
  router.get("/api/faculty", ANY_USER, (ctx) => {
    const where = [];
    const params = [];
    const q = (ctx.query.get("q") || "").trim();
    if (q) {
      where.push("(f.full_name LIKE ? ESCAPE '\\' OR f.employee_id LIKE ? ESCAPE '\\' OR f.email LIKE ? ESCAPE '\\')");
      params.push(likePattern(q), likePattern(q), likePattern(q));
    }
    const dept = Number(ctx.query.get("department"));
    if (Number.isInteger(dept) && dept > 0) { where.push("f.department_id = ?"); params.push(dept); }
    const items = db.prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY f.full_name`).all(...params);
    return { items, designations: DESIGNATIONS };
  });

  router.post("/api/faculty", ADMIN, (ctx) => {
    const input = validate(ctx.body, RULES);
    check(input);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO faculty (employee_id, full_name, email, phone, designation, department_id, joined_on) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.employee_id, input.full_name, input.email, input.phone, input.designation, input.department_id, input.joined_on);
    logActivity(ctx.user, "create", "faculty", Number(lastInsertRowid), `Added faculty member ${input.full_name}`);
    ctx.status = 201;
    return db.prepare(`${SELECT} WHERE f.id = ?`).get(lastInsertRowid);
  });

  router.put("/api/faculty/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    if (!db.prepare("SELECT 1 FROM faculty WHERE id = ?").get(id)) throw notFound("Faculty member");
    const input = validate(ctx.body, RULES);
    check(input, id);
    db.prepare(`
      UPDATE faculty SET employee_id = ?, full_name = ?, email = ?, phone = ?, designation = ?, department_id = ?, joined_on = ? WHERE id = ?
    `).run(input.employee_id, input.full_name, input.email, input.phone, input.designation, input.department_id, input.joined_on, id);
    logActivity(ctx.user, "update", "faculty", id, `Updated faculty member ${input.full_name}`);
    return db.prepare(`${SELECT} WHERE f.id = ?`).get(id);
  });

  router.delete("/api/faculty/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const existing = db.prepare("SELECT full_name FROM faculty WHERE id = ?").get(id);
    if (!existing) throw notFound("Faculty member");
    // Assigned courses become unassigned (ON DELETE SET NULL)
    db.prepare("DELETE FROM faculty WHERE id = ?").run(id);
    logActivity(ctx.user, "delete", "faculty", id, `Removed faculty member ${existing.full_name}`);
    return { ok: true };
  });
}
