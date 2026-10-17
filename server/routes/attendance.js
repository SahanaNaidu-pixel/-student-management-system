// Attendance: class registers, records and per-student summaries
import { db, transaction } from "../db.js";
import { ADMIN, ANY_USER, HttpError, badRequest, notFound } from "../lib/http.js";
import { validate, v, parseId, pagination, likePattern } from "../lib/validate.js";
import { logActivity } from "../lib/activity.js";
import { sendCsv } from "../lib/csv.js";

export const ATTENDANCE_STATUSES = ["present", "absent", "late"];
export const LOW_ATTENDANCE = 75;

function getCourse(id) {
  const course = db.prepare(`
    SELECT c.id, c.code, c.name, c.semester, d.code AS department_code
    FROM courses c JOIN departments d ON d.id = c.department_id WHERE c.id = ?
  `).get(id);
  if (!course) throw notFound("Course");
  return course;
}

// Filters shared by the records list, summary and CSV export
function recordFilters(query) {
  const where = [];
  const params = [];
  const from = query.get("from");
  const to = query.get("to");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push("a.date >= ?"); params.push(from); }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push("a.date <= ?"); params.push(to); }
  for (const [key, column] of [["course", "a.course_id"], ["student", "a.student_id"], ["department", "s.department_id"]]) {
    const value = Number(query.get(key));
    if (Number.isInteger(value) && value > 0) { where.push(`${column} = ?`); params.push(value); }
  }
  const status = query.get("status");
  if (ATTENDANCE_STATUSES.includes(status)) { where.push("a.status = ?"); params.push(status); }
  const q = (query.get("q") || "").trim();
  if (q) {
    where.push("(s.roll_no LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\')");
    params.push(likePattern(q), likePattern(q));
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

const RECORDS_FROM = `
  FROM attendance a
  JOIN students s ON s.id = a.student_id
  JOIN courses c ON c.id = a.course_id
  LEFT JOIN users u ON u.id = a.recorded_by`;

export function attendanceSummary(query) {
  const { sql, params } = recordFilters(query);
  return db.prepare(`
    SELECT s.id AS student_id, s.roll_no, s.full_name,
      COUNT(*) AS classes, SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late,
      SUM(a.status = 'absent') AS absent,
      ROUND(100.0 * SUM(a.status IN ('present', 'late')) / COUNT(*), 1) AS attendance_pct
    ${RECORDS_FROM} ${sql}
    GROUP BY s.id ORDER BY attendance_pct ASC, s.roll_no
  `).all(...params);
}

export function register(router) {
  // The class register for one course on one date
  router.get("/api/attendance/sheet", ANY_USER, (ctx) => {
    const course = getCourse(parseId(ctx.query.get("course"), "course"));
    const { date } = validate({ date: ctx.query.get("date") }, { date: v.date({ required: true }) });
    const students = db.prepare(`
      SELECT s.id, s.roll_no, s.full_name, s.status AS student_status, s.photo_file IS NOT NULL AS has_photo, a.status
      FROM enrollments en
      JOIN students s ON s.id = en.student_id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.course_id = en.course_id AND a.date = ?
      WHERE en.course_id = ? AND s.status = 'active'
      ORDER BY s.roll_no
    `).all(date, course.id);
    return { course, date, students, recorded: students.some((s) => s.status) };
  });

  router.post("/api/attendance/sheet", ANY_USER, (ctx) => {
    const input = validate(ctx.body, {
      course_id: v.int({ required: true, min: 1 }),
      date: v.date({ required: true, notFuture: true })
    });
    const course = getCourse(input.course_id);
    const entries = ctx.body.entries;
    if (!Array.isArray(entries) || entries.length === 0) throw badRequest("Mark attendance for at least one student.");

    const enrolled = new Set(db.prepare("SELECT student_id FROM enrollments WHERE course_id = ?").all(course.id).map((r) => r.student_id));
    for (const entry of entries) {
      if (!Number.isInteger(entry.student_id) || !enrolled.has(entry.student_id)) {
        throw badRequest("Attendance can only be recorded for students enrolled in this course.");
      }
      if (!ATTENDANCE_STATUSES.includes(entry.status)) throw badRequest("Each student must be marked present, absent or late.");
    }

    transaction(() => {
      const upsert = db.prepare(`
        INSERT INTO attendance (student_id, course_id, date, status, recorded_by) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (student_id, course_id, date)
        DO UPDATE SET status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = datetime('now')
      `);
      for (const e of entries) upsert.run(e.student_id, course.id, input.date, e.status, ctx.user.id);
      const present = entries.filter((e) => e.status !== "absent").length;
      logActivity(ctx.user, "attendance", "course", course.id, `Recorded attendance for ${course.code} on ${input.date} (${present}/${entries.length} present)`);
    });
    return { saved: entries.length };
  });

  router.get("/api/attendance", ANY_USER, (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query, 15);
    const { sql, params } = recordFilters(ctx.query);
    const total = db.prepare(`SELECT COUNT(*) AS n ${RECORDS_FROM} ${sql}`).get(...params).n;
    const totals = db.prepare(`
      SELECT SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late, SUM(a.status = 'absent') AS absent
      ${RECORDS_FROM} ${sql}
    `).get(...params);
    const items = db.prepare(`
      SELECT a.id, a.date, a.status, a.recorded_at, s.id AS student_id, s.roll_no, s.full_name,
             c.id AS course_id, c.code AS course_code, c.name AS course_name, u.full_name AS recorded_by
      ${RECORDS_FROM} ${sql}
      ORDER BY a.date DESC, c.code, s.roll_no LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);
    return { items, total, page, pageSize, totals };
  });

  router.get("/api/attendance/summary", ANY_USER, (ctx) => ({
    items: attendanceSummary(ctx.query),
    threshold: LOW_ATTENDANCE
  }));

  router.get("/api/attendance/export.csv", ANY_USER, (ctx) => {
    const { sql, params } = recordFilters(ctx.query);
    const rows = db.prepare(`
      SELECT a.date, a.status, s.roll_no, s.full_name, c.code AS course_code, c.name AS course_name, u.full_name AS recorded_by
      ${RECORDS_FROM} ${sql} ORDER BY a.date DESC, c.code, s.roll_no
    `).all(...params);
    sendCsv(ctx.res, "attendance.csv", [
      { key: "date", label: "Date" }, { key: "course_code", label: "Course code" }, { key: "course_name", label: "Course" },
      { key: "roll_no", label: "Roll no" }, { key: "full_name", label: "Student" }, { key: "status", label: "Status" },
      { key: "recorded_by", label: "Recorded by" }
    ], rows);
  });

  router.delete("/api/attendance/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const row = db.prepare(`
      SELECT a.date, s.roll_no, c.code FROM attendance a
      JOIN students s ON s.id = a.student_id JOIN courses c ON c.id = a.course_id WHERE a.id = ?
    `).get(id);
    if (!row) throw new HttpError(404, "Attendance record not found.");
    db.prepare("DELETE FROM attendance WHERE id = ?").run(id);
    logActivity(ctx.user, "delete", "attendance", id, `Deleted attendance of ${row.roll_no} for ${row.code} on ${row.date}`);
    return { ok: true };
  });
}
