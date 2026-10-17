// Dashboard statistics, global search, reports and the activity log
import { db } from "../db.js";
import { ANY_USER } from "../lib/http.js";
import { pagination, likePattern, isValidDate, localToday } from "../lib/validate.js";
import { resultsList } from "../lib/results.js";
import { sendCsv } from "../lib/csv.js";
import { attendanceSummary, LOW_ATTENDANCE } from "./attendance.js";

const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
};

// Date range from ?from=&to=, defaulting to the last 30 days
function dateRange(query) {
  let to = query.get("to");
  let from = query.get("from");
  if (!isValidDate(to || "")) to = localToday();
  if (!isValidDate(from || "")) from = addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

function attendanceRate(from, to) {
  return db.prepare(`
    SELECT ROUND(100.0 * SUM(status IN ('present', 'late')) / COUNT(*), 1) AS pct, COUNT(*) AS records
    FROM attendance WHERE date BETWEEN ? AND ?
  `).get(from, to);
}

function departmentSummary() {
  const results = resultsList();
  return db.prepare(`
    SELECT d.id, d.code, d.name,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id) AS students,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id AND s.status = 'active') AS active_students,
      (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id) AS faculty,
      (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.id) AS courses,
      (SELECT ROUND(100.0 * SUM(a.status IN ('present', 'late')) / COUNT(*), 1)
         FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.department_id = d.id) AS attendance_pct
    FROM departments d ORDER BY d.code
  `).all().map((d) => {
    const own = results.filter((r) => r.department_code === d.code);
    return {
      ...d,
      results: own.length,
      average_pct: own.length ? Math.round((own.reduce((s, r) => s + r.percentage, 0) / own.length) * 10) / 10 : null,
      pass_rate: own.length ? Math.round((own.filter((r) => r.passed).length / own.length) * 1000) / 10 : null
    };
  });
}

export function register(router) {
  router.get("/api/dashboard", ANY_USER, (ctx) => {
    const { from, to } = dateRange(ctx.query);
    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    const previous = { from: addDays(from, -days), to: addDays(from, -1) };

    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM students) AS students,
        (SELECT COUNT(*) FROM students WHERE status = 'active') AS active_students,
        (SELECT COUNT(*) FROM faculty) AS faculty,
        (SELECT COUNT(*) FROM courses) AS courses,
        (SELECT COUNT(*) FROM departments) AS departments,
        (SELECT COUNT(*) FROM students WHERE enrollment_date BETWEEN ? AND ?) AS new_students
    `).get(from, to);

    const results = resultsList();
    const grades = {};
    for (const r of results) grades[r.grade] = (grades[r.grade] || 0) + 1;

    const lowAttendance = attendanceSummary(new URLSearchParams({ from, to })).filter((s) => s.attendance_pct < LOW_ATTENDANCE);

    return {
      range: { from, to },
      counts,
      attendance: {
        current: attendanceRate(from, to),
        previous: attendanceRate(previous.from, previous.to),
        lowCount: lowAttendance.length,
        threshold: LOW_ATTENDANCE,
        trend: db.prepare(`
          SELECT date, ROUND(100.0 * SUM(status IN ('present', 'late')) / COUNT(*), 1) AS pct, COUNT(*) AS records
          FROM attendance WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date
        `).all(from, to)
      },
      academics: {
        results: results.length,
        average: results.length ? Math.round((results.reduce((s, r) => s + r.percentage, 0) / results.length) * 10) / 10 : null,
        passRate: results.length ? Math.round((results.filter((r) => r.passed).length / results.length) * 1000) / 10 : null,
        grades,
        topPerformers: [...results].sort((a, b) => b.percentage - a.percentage).slice(0, 5)
          .map(({ student_id, roll_no, full_name, department_code, semester, percentage, grade }) =>
            ({ student_id, roll_no, full_name, department_code, semester, percentage, grade }))
      },
      enrollmentTrend: db.prepare(`
        SELECT substr(enrollment_date, 1, 7) AS month, COUNT(*) AS count
        FROM students GROUP BY month ORDER BY month DESC LIMIT 12
      `).all().reverse(),
      departments: db.prepare(`
        SELECT d.code, d.name, COUNT(s.id) AS count FROM departments d
        LEFT JOIN students s ON s.department_id = d.id GROUP BY d.id ORDER BY count DESC, d.code
      `).all(),
      recentStudents: db.prepare(`
        SELECT s.id, s.roll_no, s.full_name, s.status, s.created_at, s.photo_file IS NOT NULL AS has_photo, d.code AS department_code
        FROM students s JOIN departments d ON d.id = s.department_id ORDER BY s.created_at DESC, s.id DESC LIMIT 6
      `).all(),
      upcomingExams: db.prepare(`
        SELECT e.id, e.name, e.exam_type, e.exam_date, e.max_marks, c.code AS course_code, c.name AS course_name
        FROM exams e JOIN courses c ON c.id = e.course_id WHERE e.exam_date >= ? ORDER BY e.exam_date, c.code LIMIT 6
      `).all(localToday()),
      recentActivity: db.prepare(`
        SELECT a.*, u.full_name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT 8
      `).all()
    };
  });

  router.get("/api/search", ANY_USER, (ctx) => {
    const q = (ctx.query.get("q") || "").trim();
    if (q.length < 2) return { students: [], courses: [], faculty: [], departments: [] };
    const like = likePattern(q);
    return {
      students: db.prepare(`
        SELECT id, roll_no, full_name, email FROM students
        WHERE roll_no LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' ORDER BY full_name LIMIT 6
      `).all(like, like, like),
      courses: db.prepare("SELECT id, code, name FROM courses WHERE code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY code LIMIT 4").all(like, like),
      faculty: db.prepare("SELECT id, employee_id, full_name, designation FROM faculty WHERE full_name LIKE ? ESCAPE '\\' OR employee_id LIKE ? ESCAPE '\\' ORDER BY full_name LIMIT 4").all(like, like),
      departments: db.prepare("SELECT id, code, name FROM departments WHERE code LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY code LIMIT 3").all(like, like)
    };
  });

  router.get("/api/activity", ANY_USER, (ctx) => {
    const { page, pageSize, offset } = pagination(ctx.query, 20);
    const total = db.prepare("SELECT COUNT(*) AS n FROM activity_log").get().n;
    const items = db.prepare(`
      SELECT a.*, u.full_name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT ? OFFSET ?
    `).all(pageSize, offset);
    return { items, total, page, pageSize };
  });

  router.get("/api/reports/departments", ANY_USER, () => ({ items: departmentSummary() }));

  router.get("/api/reports/departments.csv", ANY_USER, (ctx) => {
    sendCsv(ctx.res, "department-summary.csv", [
      { key: "code", label: "Code" }, { key: "name", label: "Department" }, { key: "students", label: "Students" },
      { key: "active_students", label: "Active students" }, { key: "faculty", label: "Faculty" }, { key: "courses", label: "Courses" },
      { key: "attendance_pct", label: "Attendance %" }, { key: "average_pct", label: "Average result %" }, { key: "pass_rate", label: "Pass rate %" }
    ], departmentSummary());
  });

  router.get("/api/reports/attendance-summary.csv", ANY_USER, (ctx) => {
    sendCsv(ctx.res, "attendance-summary.csv", [
      { key: "roll_no", label: "Roll no" }, { key: "full_name", label: "Student" }, { key: "classes", label: "Classes" },
      { key: "present", label: "Present" }, { key: "late", label: "Late" }, { key: "absent", label: "Absent" },
      { key: "attendance_pct", label: "Attendance %" },
      { label: "Below threshold", value: (r) => (r.attendance_pct < LOW_ATTENDANCE ? "YES" : "") }
    ], attendanceSummary(ctx.query));
  });
}
