// Semester results calculated from end-semester exam marks
import { db } from "../db.js";
import { summarize, gradeFor, PASS_PERCENT } from "./grading.js";
import { likePattern } from "./validate.js";

const BASE = `
  SELECT m.student_id, m.marks, e.id AS exam_id, e.name AS exam_name, e.max_marks,
         c.id AS course_id, c.code AS course_code, c.name AS course_name, c.semester, c.credits
  FROM marks m
  JOIN exams e ON e.id = m.exam_id
  JOIN courses c ON c.id = e.course_id
  WHERE e.exam_type = 'end-semester'`;

function subjectRow(r) {
  const percentage = Math.round((r.marks / r.max_marks) * 10000) / 100;
  const passed = percentage >= PASS_PERCENT;
  return {
    exam_id: r.exam_id, exam_name: r.exam_name, course_id: r.course_id, course_code: r.course_code,
    course_name: r.course_name, credits: r.credits, marks: r.marks, max_marks: r.max_marks,
    percentage, passed, grade: gradeFor(percentage, passed)
  };
}

// All semester results for one student, newest semester first
export function resultsForStudent(studentId) {
  const rows = db.prepare(`${BASE} AND m.student_id = ? ORDER BY c.semester DESC, c.code`).all(studentId);
  const bySemester = new Map();
  for (const r of rows) {
    if (!bySemester.has(r.semester)) bySemester.set(r.semester, []);
    bySemester.get(r.semester).push(subjectRow(r));
  }
  return [...bySemester].map(([semester, subjects]) => ({ semester, subjects, ...summarize(subjects) }));
}

// One row per student per semester, with optional filters
export function resultsList({ semester, departmentId, q, studentStatus } = {}) {
  const where = [];
  const params = [];
  if (semester) { where.push("c.semester = ?"); params.push(semester); }
  if (departmentId) { where.push("s.department_id = ?"); params.push(departmentId); }
  if (studentStatus) { where.push("s.status = ?"); params.push(studentStatus); }
  if (q) {
    where.push("(s.roll_no LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\')");
    params.push(likePattern(q), likePattern(q));
  }
  const rows = db.prepare(`
    SELECT x.*, s.roll_no, s.full_name, d.code AS department_code
    FROM (${BASE}) x
    JOIN students s ON s.id = x.student_id
    JOIN departments d ON d.id = s.department_id
    JOIN courses c ON c.id = x.course_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY s.roll_no, x.semester, x.course_code
  `).all(...params);

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.student_id}|${r.semester}`;
    if (!groups.has(key)) {
      groups.set(key, {
        student_id: r.student_id, roll_no: r.roll_no, full_name: r.full_name,
        department_code: r.department_code, semester: r.semester, subjects: []
      });
    }
    groups.get(key).subjects.push(subjectRow(r));
  }
  return [...groups.values()].map((g) => ({ ...g, ...summarize(g.subjects) }));
}

