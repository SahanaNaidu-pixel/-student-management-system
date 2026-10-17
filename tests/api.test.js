// API integration tests. Run with: npm test
// Uses a temporary database, so your real data is never touched.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sms-test-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.UPLOAD_DIR = path.join(tmp, "uploads");

const { migrate, db } = await import("../server/db.js");
const { hashPassword } = await import("../server/lib/auth.js");
const { createServer } = await import("../server/index.js");

let server;
let base;
const cookies = {};

before(async () => {
  migrate();
  const add = db.prepare("INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)");
  add.run("admin", "Test Admin", "admin", hashPassword("Admin12345"));
  add.run("staff", "Test Staff", "staff", hashPassword("Staff12345"));
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(method, url, body, as = "admin") {
  const headers = {};
  if (as && cookies[as]) headers.Cookie = cookies[as];
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* CSV or empty */ }
  return { status: res.status, data, headers: res.headers };
}

async function login(username, password) {
  const res = await call("POST", "/api/auth/login", { username, password }, null);
  if (res.status === 200) cookies[username] = res.headers.get("set-cookie").split(";")[0];
  return res;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const ids = {};

test("rejects requests that are not signed in", async () => {
  assert.equal((await call("GET", "/api/students", undefined, null)).status, 401);
});

test("login rejects a wrong password and accepts the right one", async () => {
  assert.equal((await login("admin", "wrong-password")).status, 401);
  assert.equal((await login("admin", "Admin12345")).status, 200);
  assert.equal((await login("staff", "Staff12345")).status, 200);
  assert.equal((await call("GET", "/api/auth/me")).data.user.role, "admin");
});

test("non-JSON request bodies are refused", async () => {
  const res = await fetch(base + "/api/departments", {
    method: "POST", headers: { Cookie: cookies.admin, "Content-Type": "application/x-www-form-urlencoded" }, body: "code=X"
  });
  assert.equal(res.status, 415);
});

test("departments: create, duplicate check, staff cannot create", async () => {
  const res = await call("POST", "/api/departments", { code: "cse", name: "Computer Science" });
  assert.equal(res.status, 201);
  assert.equal(res.data.code, "CSE");
  ids.dept = res.data.id;
  assert.equal((await call("POST", "/api/departments", { code: "CSE", name: "Other" })).status, 409);
  assert.equal((await call("POST", "/api/departments", { code: "ECE", name: "Electronics" }, "staff")).status, 403);
});

test("courses: create with department", async () => {
  const res = await call("POST", "/api/courses", { code: "CS301", name: "Data Structures", credits: 4, semester: 3, department_id: ids.dept });
  assert.equal(res.status, 201);
  ids.course = res.data.id;
});

test("students: validation, create, duplicates, auto-enrollment", async () => {
  const bad = await call("POST", "/api/students", { roll_no: "", full_name: "A", email: "not-an-email" });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.fields.roll_no && bad.data.fields.email && bad.data.fields.department_id);

  const wrongSemester = await call("POST", "/api/students", {
    roll_no: "23CS001", full_name: "Arjun Reddy", email: "arjun@college.edu", department_id: ids.dept,
    year: 2, semester: 5, enrollment_date: "2023-08-07", status: "active"
  });
  assert.equal(wrongSemester.status, 422);
  assert.ok(wrongSemester.data.fields.semester);

  const student = {
    roll_no: "23cs001", full_name: "Arjun Reddy", email: "Arjun@College.edu", phone: "9876543210", date_of_birth: "2005-03-14",
    gender: "Male", department_id: ids.dept, year: 2, semester: 3, enrollment_date: "2023-08-07", status: "active"
  };
  const created = await call("POST", "/api/students", student, "staff");
  assert.equal(created.status, 201);
  assert.equal(created.data.roll_no, "23CS001");
  assert.equal(created.data.email, "arjun@college.edu");
  ids.s1 = created.data.id;

  const dup = await call("POST", "/api/students", { ...student, email: "other@college.edu" });
  assert.equal(dup.status, 409);
  assert.ok(dup.data.fields.roll_no);
  const dupEmail = await call("POST", "/api/students", { ...student, roll_no: "23CS999" });
  assert.equal(dupEmail.status, 409);
  assert.ok(dupEmail.data.fields.email);

  const s2 = await call("POST", "/api/students", { ...student, roll_no: "23CS002", full_name: "Priya Sharma", email: "priya@college.edu" });
  ids.s2 = s2.data.id;

  const profile = await call("GET", `/api/students/${ids.s1}`);
  assert.deepEqual(profile.data.courses.map((c) => c.code), ["CS301"]);
});

test("students: search, filter, sort and paginate", async () => {
  const search = await call("GET", "/api/students?q=priya");
  assert.equal(search.data.total, 1);
  assert.equal(search.data.items[0].roll_no, "23CS002");

  const page = await call("GET", "/api/students?pageSize=1&page=2&sort=roll_no&dir=asc");
  assert.equal(page.data.total, 2);
  assert.equal(page.data.items[0].roll_no, "23CS002");

  assert.equal((await call("GET", "/api/students?status=graduated")).data.total, 0);
  // LIKE wildcards in the search box are treated as plain text
  assert.equal((await call("GET", "/api/students?q=%25")).data.total, 0);
});

test("students: update persists", async () => {
  const profile = (await call("GET", `/api/students/${ids.s2}`)).data.student;
  const res = await call("PUT", `/api/students/${ids.s2}`, { ...profile, phone: "9000000001", status: "inactive" });
  assert.equal(res.status, 200);
  const again = (await call("GET", `/api/students/${ids.s2}`)).data.student;
  assert.equal(again.phone, "9000000001");
  assert.equal(again.status, "inactive");
  await call("PUT", `/api/students/${ids.s2}`, { ...again, status: "active" });
});

test("attendance: register saves and the percentage is calculated from records", async () => {
  const sheet = await call("GET", `/api/attendance/sheet?course=${ids.course}&date=${daysAgo(1)}`, undefined, "staff");
  assert.equal(sheet.data.students.length, 2);

  for (const [day, status] of [[4, "present"], [3, "present"], [2, "late"], [1, "absent"]]) {
    const res = await call("POST", "/api/attendance/sheet", {
      course_id: ids.course, date: daysAgo(day), entries: [{ student_id: ids.s1, status }, { student_id: ids.s2, status: "present" }]
    }, "staff");
    assert.equal(res.status, 200);
  }
  // Re-saving the same day updates instead of duplicating
  await call("POST", "/api/attendance/sheet", { course_id: ids.course, date: daysAgo(1), entries: [{ student_id: ids.s1, status: "absent" }] });

  const summary = (await call("GET", `/api/attendance/summary?course=${ids.course}`)).data.items;
  const arjun = summary.find((s) => s.student_id === ids.s1);
  assert.equal(arjun.classes, 4);
  assert.equal(arjun.attendance_pct, 75);

  const future = await call("POST", "/api/attendance/sheet", { course_id: ids.course, date: "2999-01-01", entries: [{ student_id: ids.s1, status: "present" }] });
  assert.equal(future.status, 422);
});

test("exams: marks validation and results use the original grading rules", async () => {
  const exam = await call("POST", "/api/exams", { course_id: ids.course, name: "End Semester Examination", exam_type: "end-semester", exam_date: daysAgo(5), max_marks: 100 });
  assert.equal(exam.status, 201);
  ids.exam = exam.data.id;

  const tooHigh = await call("PUT", `/api/exams/${ids.exam}/marks`, { entries: [{ student_id: ids.s1, marks: 120 }] }, "staff");
  assert.equal(tooHigh.status, 422);

  const saved = await call("PUT", `/api/exams/${ids.exam}/marks`, { entries: [{ student_id: ids.s1, marks: 92 }, { student_id: ids.s2, marks: 30 }] }, "staff");
  assert.equal(saved.data.saved, 2);

  const results = (await call("GET", "/api/results")).data;
  const arjun = results.items.find((r) => r.student_id === ids.s1);
  const priya = results.items.find((r) => r.student_id === ids.s2);
  assert.equal(arjun.grade, "O");
  assert.equal(arjun.passed, true);
  assert.equal(priya.grade, "F");
  assert.equal(priya.passed, false);
  assert.equal(results.stats.passed, 1);

  const future = await call("POST", "/api/exams", { course_id: ids.course, name: "Quiz", exam_type: "quiz", exam_date: "2999-01-01", max_marks: 20 });
  const early = await call("PUT", `/api/exams/${future.data.id}/marks`, { entries: [{ student_id: ids.s1, marks: 10 }] });
  assert.equal(early.status, 400);
});

test("dashboard figures come from the database", async () => {
  const d = (await call("GET", "/api/dashboard")).data;
  assert.equal(d.counts.students, 2);
  assert.equal(d.counts.departments, 1);
  assert.equal(d.counts.courses, 1);
  assert.equal(d.academics.passRate, 50);
  assert.ok(d.attendance.current.records >= 8);
  assert.equal(d.upcomingExams.length, 1);
});

test("CSV export and all-or-nothing import", async () => {
  const csv = await call("GET", "/api/students/export.csv");
  assert.match(csv.data, /23CS001,Arjun Reddy,arjun@college.edu/);

  const header = "roll_no,full_name,email,department_code,year,semester,enrollment_date";
  const bad = await call("POST", "/api/students/import", { csv: `${header}\n23CS010,Kiran Kumar,kiran@college.edu,CSE,2,3,2023-08-07\n23CS011,Bad Row,bad,XYZ,2,3,2023-08-07` });
  assert.equal(bad.status, 422);
  assert.equal(bad.data.fields.rows[0].line, 3);
  assert.equal((await call("GET", "/api/students")).data.total, 2);

  const good = await call("POST", "/api/students/import", { csv: `${header}\n23CS010,Kiran Kumar,kiran@college.edu,CSE,2,3,2023-08-07` });
  assert.equal(good.data.imported, 1);
});

test("photo upload rejects files that are not images", async () => {
  const fake = "data:image/png;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");
  assert.equal((await call("POST", `/api/students/${ids.s1}/photo`, { dataUrl: fake })).status, 400);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  assert.equal((await call("POST", `/api/students/${ids.s1}/photo`, { dataUrl: png })).status, 200);
  assert.equal((await call("GET", `/api/students/${ids.s1}`)).data.student.has_photo, true);
});

test("delete: staff is refused, admin can delete, related rows cascade", async () => {
  assert.equal((await call("DELETE", `/api/students/${ids.s2}`, undefined, "staff")).status, 403);
  assert.equal((await call("DELETE", `/api/students/${ids.s2}`)).status, 200);
  assert.equal((await call("GET", `/api/students/${ids.s2}`)).status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attendance WHERE student_id = ?").get(ids.s2).n, 0);
  // A department that still has students cannot be deleted
  assert.equal((await call("DELETE", `/api/departments/${ids.dept}`)).status, 409);
});

test("logout ends the session", async () => {
  await call("POST", "/api/auth/logout", {}, "staff");
  assert.equal((await call("GET", "/api/auth/me", undefined, "staff")).status, 401);
});
