// npm run seed        - loads demo data into an empty database
// npm run seed:reset  - wipes ALL records first, then loads demo data
//
// The 12 students and their semester 3 marks are the records from the original
// Student Registration and Student Result modules. Everything else is demo data.
import fs from "node:fs";
import { db, migrate, transaction } from "./db.js";
import { config } from "./config.js";
import { hashPassword, passwordProblem } from "./lib/auth.js";

const reset = process.argv.includes("--reset");

migrate();

const existing = db.prepare("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM students) AS n").get().n;
if (existing && !reset) {
  console.error("The database already contains records. Nothing was changed.");
  console.error("Run `npm run seed:reset` to delete everything and load the demo data again.");
  process.exit(1);
}

const env = process.env;
const accounts = [
  { username: env.SEED_ADMIN_USERNAME, password: env.SEED_ADMIN_PASSWORD, full_name: "System Administrator", role: "admin" },
  { username: env.SEED_STAFF_USERNAME, password: env.SEED_STAFF_PASSWORD, full_name: "Academic Office Staff", role: "staff" }
];
for (const a of accounts) {
  if (!a.username || !a.password) {
    console.error("Set SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD, SEED_STAFF_USERNAME and SEED_STAFF_PASSWORD.");
    console.error("Copy .env.example to .env to use the demo values.");
    process.exit(1);
  }
  const problem = passwordProblem(a.password);
  if (problem) {
    console.error(`Password for ${a.username}: ${problem}.`);
    process.exit(1);
  }
}

// Deterministic random numbers so the demo data is the same on every machine
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(2026);
const between = (min, max) => Math.round(min + random() * (max - min));

const isoDate = (d) => d.toISOString().slice(0, 10);
const daysFromToday = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

const departments = [
  ["CSE", "Computer Science & Engineering", "Dr. Meera Krishnan", "Software, systems and computing."],
  ["ECE", "Electronics & Communication Engineering", "Dr. Sanjay Menon", "Circuits, communication and signal processing."],
  ["EEE", "Electrical & Electronics Engineering", "Dr. Kavitha Rao", "Power systems, machines and control."],
  ["MECH", "Mechanical Engineering", "Dr. Ravi Shankar", "Design, thermal and manufacturing engineering."],
  ["CIVIL", "Civil Engineering", "Dr. Anitha Reddy", "Structures, construction and environment."],
  ["BSH", "Basic Sciences & Humanities", "Dr. Joseph Thomas", "Mathematics, physics, chemistry and English for all branches."]
];

const faculty = [
  ["FAC-CSE-01", "Dr. Meera Krishnan", "Professor", "CSE", "2012-06-15"],
  ["FAC-CSE-02", "Arvind Bhat", "Assistant Professor", "CSE", "2019-07-01"],
  ["FAC-CSE-03", "Nisha Varghese", "Assistant Professor", "CSE", "2021-01-11"],
  ["FAC-ECE-01", "Dr. Sanjay Menon", "Professor", "ECE", "2010-08-02"],
  ["FAC-ECE-02", "Pooja Hegde", "Associate Professor", "ECE", "2016-06-20"],
  ["FAC-EEE-01", "Dr. Kavitha Rao", "Professor", "EEE", "2011-07-18"],
  ["FAC-EEE-02", "Suresh Pillai", "Assistant Professor", "EEE", "2020-02-03"],
  ["FAC-MECH-01", "Dr. Ravi Shankar", "Professor", "MECH", "2009-06-01"],
  ["FAC-MECH-02", "Imran Khan", "Associate Professor", "MECH", "2015-08-10"],
  ["FAC-CIVIL-01", "Dr. Anitha Reddy", "Professor", "CIVIL", "2013-07-22"],
  ["FAC-CIVIL-02", "Deepak Joshi", "Assistant Professor", "CIVIL", "2022-01-05"],
  ["FAC-BSH-01", "Dr. Joseph Thomas", "Professor", "BSH", "2008-06-30"],
  ["FAC-BSH-02", "Revathi Subramanian", "Associate Professor", "BSH", "2014-07-07"],
  ["FAC-BSH-03", "Farhan Ali", "Assistant Professor", "BSH", "2018-06-25"],
  ["FAC-BSH-04", "Grace Fernandes", "Lecturer", "BSH", "2023-08-01"]
];

// [code, name, credits, semester, department, faculty employee id]
const courses = [
  // Semester 3 subjects from the original Student Result module, taken by every branch
  ["MA201", "Mathematics", 4, 3, "BSH", "FAC-BSH-01"],
  ["PH201", "Physics", 3, 3, "BSH", "FAC-BSH-02"],
  ["CH201", "Chemistry", 3, 3, "BSH", "FAC-BSH-03"],
  ["EN201", "English", 2, 3, "BSH", "FAC-BSH-04"],
  ["CS201", "Programming", 4, 3, "CSE", "FAC-CSE-02"],
  // Branch courses
  ["CS102", "Problem Solving with C", 4, 2, "CSE", "FAC-CSE-03"],
  ["CS301", "Data Structures", 4, 3, "CSE", "FAC-CSE-01"],
  ["CS501", "Database Management Systems", 4, 5, "CSE", "FAC-CSE-01"],
  ["EC102", "Basic Electronics", 3, 2, "ECE", "FAC-ECE-02"],
  ["EC301", "Signals and Systems", 4, 3, "ECE", "FAC-ECE-01"],
  ["EC501", "Digital Communication", 4, 5, "ECE", "FAC-ECE-01"],
  ["EE102", "Circuit Theory", 3, 2, "EEE", "FAC-EEE-02"],
  ["EE301", "Electrical Machines", 4, 3, "EEE", "FAC-EEE-01"],
  ["EE501", "Power Systems", 4, 5, "EEE", "FAC-EEE-01"],
  ["ME102", "Engineering Drawing", 3, 2, "MECH", "FAC-MECH-02"],
  ["ME301", "Thermodynamics", 4, 3, "MECH", "FAC-MECH-01"],
  ["ME501", "Design of Machine Elements", 4, 5, "MECH", "FAC-MECH-01"],
  ["CE102", "Engineering Mechanics", 3, 2, "CIVIL", "FAC-CIVIL-02"],
  ["CE301", "Strength of Materials", 4, 3, "CIVIL", "FAC-CIVIL-01"],
  ["CE501", "Structural Analysis", 4, 5, "CIVIL", "FAC-CIVIL-01"]
];
const COMMON_SEM3 = ["MA201", "PH201", "CH201", "EN201", "CS201"];

// Original records: [roll, name, dob, gender, email, phone, dept, maths, physics, chemistry, english, programming]
const originalStudents = [
  ["23CS001", "Arjun Reddy", "2005-03-14", "Male", "arjun@college.edu", "9876543210", "CSE", 85, 78, 72, 80, 92],
  ["23CS002", "Priya Sharma", "2005-07-22", "Female", "priya@college.edu", "9876543211", "CSE", 95, 88, 90, 86, 97],
  ["23CS003", "Kiran Kumar", "2005-01-19", "Male", "kiran@college.edu", "9876543213", "CSE", 68, 72, 65, 70, 75],
  ["23CS004", "Sneha Patel", "2005-09-02", "Female", "sneha@college.edu", "9876543214", "CSE", 88, 82, 79, 91, 85],
  ["23EC001", "Rahul Verma", "2004-11-05", "Male", "rahul@college.edu", "9876543212", "ECE", 30, 55, 48, 62, 58],
  ["23EC002", "Ananya Iyer", "2005-04-11", "Female", "ananya@college.edu", "9876543215", "ECE", 92, 94, 89, 90, 93],
  ["23EE001", "Vikram Singh", "2004-12-27", "Male", "vikram@college.edu", "9876543216", "EEE", 55, 60, 52, 58, 50],
  ["23EE002", "Divya Nair", "2005-06-08", "Female", "divya@college.edu", "9876543217", "EEE", 74, 69, 71, 80, 66],
  ["23ME001", "Mohammed Faiz", "2005-02-15", "Male", "faiz@college.edu", "9876543218", "MECH", 45, 40, 38, 52, 44],
  ["23ME002", "Lakshmi Prasad", "2004-10-30", "Female", "lakshmi@college.edu", "9876543219", "MECH", 62, 28, 55, 67, 60],
  ["23CE001", "Rohan Gupta", "2005-08-21", "Male", "rohan@college.edu", "9876543220", "CIVIL", 58, 63, 61, 66, 57],
  ["23CE002", "Meghana Rao", "2005-05-03", "Female", "meghana@college.edu", "9876543221", "CIVIL", 81, 77, 84, 88, 79]
];

// Demo students in other batches: [roll, name, gender, dept, year, semester, enrollment date, status]
const demoStudents = [
  ["22CS001", "Aditya Menon", "Male", "CSE", 3, 5, "2022-08-08", "active"],
  ["22CS002", "Fatima Sheikh", "Female", "CSE", 3, 5, "2022-08-08", "active"],
  ["22EC001", "Harish Babu", "Male", "ECE", 3, 5, "2022-08-08", "active"],
  ["22EC002", "Ishita Das", "Female", "ECE", 3, 5, "2022-08-08", "active"],
  ["22EE001", "Naveen Kumar", "Male", "EEE", 3, 5, "2022-08-08", "suspended"],
  ["22ME001", "Gaurav Mishra", "Male", "MECH", 3, 5, "2022-08-08", "active"],
  ["22CE001", "Swathi Reddy", "Female", "CIVIL", 3, 5, "2022-08-08", "active"],
  ["24CS001", "Riya Kapoor", "Female", "CSE", 1, 2, "2024-08-12", "active"],
  ["24CS002", "Sameer Joshi", "Male", "CSE", 1, 2, "2024-08-12", "active"],
  ["24CS003", "Tanvi Kulkarni", "Female", "CSE", 1, 2, "2024-08-12", "active"],
  ["24EC001", "Varun Nair", "Male", "ECE", 1, 2, "2024-08-12", "active"],
  ["24EE001", "Pallavi Gowda", "Female", "EEE", 1, 2, "2024-08-12", "inactive"],
  ["24ME001", "Yash Agarwal", "Male", "MECH", 1, 2, "2024-08-12", "active"],
  ["24ME002", "Keerthi Suresh", "Female", "MECH", 1, 2, "2024-08-12", "active"],
  ["24CE001", "Arun Prakash", "Male", "CIVIL", 1, 2, "2024-08-12", "active"],
  ["24CE002", "Nandini Iyer", "Female", "CIVIL", 1, 2, "2024-08-12", "active"]
];

function wipe() {
  for (const table of ["marks", "exams", "attendance", "enrollments", "students", "courses", "faculty", "departments", "activity_log", "sessions", "users"]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

// Weekdays in the last `days` days that match the course's weekly timetable
function classDates(days, weekdays) {
  const dates = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    if (weekdays.includes(d.getUTCDay())) dates.push(isoDate(d));
  }
  return dates;
}

transaction(() => {
  if (reset) wipe();

  const userIds = {};
  for (const a of accounts) {
    const { lastInsertRowid } = db.prepare("INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)")
      .run(a.username, a.full_name, a.role, hashPassword(a.password));
    userIds[a.role] = Number(lastInsertRowid);
  }

  const deptIds = {};
  for (const [code, name, head, description] of departments) {
    deptIds[code] = Number(db.prepare("INSERT INTO departments (code, name, head_of_department, description) VALUES (?, ?, ?, ?)")
      .run(code, name, head, description).lastInsertRowid);
  }

  const facultyIds = {};
  for (const [empId, name, designation, dept, joined] of faculty) {
    const email = name.toLowerCase().replace(/^dr\. /, "").replace(/[^a-z ]/g, "").split(" ").join(".") + "@college.edu";
    const phone = "98450" + String(between(10000, 99999));
    facultyIds[empId] = Number(db.prepare(`
      INSERT INTO faculty (employee_id, full_name, email, phone, designation, department_id, joined_on) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(empId, name, email, phone, designation, deptIds[dept], joined).lastInsertRowid);
  }

  const courseIds = {};
  const courseSemester = {};
  for (const [code, name, credits, semester, dept, fac] of courses) {
    courseIds[code] = Number(db.prepare(`
      INSERT INTO courses (code, name, credits, semester, department_id, faculty_id) VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, name, credits, semester, deptIds[dept], facultyIds[fac]).lastInsertRowid);
    courseSemester[code] = { semester, dept };
  }

  const insertStudent = db.prepare(`
    INSERT INTO students (roll_no, full_name, email, phone, date_of_birth, gender, department_id, year, semester, enrollment_date, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const enroll = db.prepare("INSERT INTO enrollments (student_id, course_id, enrolled_on) VALUES (?, ?, ?)");
  const branchCourses = (dept, semester) =>
    Object.entries(courseSemester).filter(([code, c]) => c.dept === dept && c.semester === semester && !COMMON_SEM3.includes(code)).map(([code]) => code);

  const students = [];
  originalStudents.forEach(([roll, name, dob, gender, email, phone, dept, ...marks], i) => {
    const enrolled = `2023-08-0${(i % 3) + 7}`;
    const id = Number(insertStudent.run(roll, name, email, phone, dob, gender, deptIds[dept], 2, 3, enrolled, "active", `${enrolled} 10:00:00`).lastInsertRowid);
    const codes = [...COMMON_SEM3, ...branchCourses(dept, 3)];
    codes.forEach((code) => enroll.run(id, courseIds[code], enrolled));
    students.push({ id, codes, marks, rate: 0.7 + random() * 0.28 });
  });

  demoStudents.forEach(([roll, name, gender, dept, year, semester, enrolled, status], i) => {
    const email = name.toLowerCase().replace(/ /g, ".") + "@college.edu";
    const phone = "9988" + String(100000 + i * 731).slice(0, 6);
    const birthYear = Number(enrolled.slice(0, 4)) - 18;
    const dob = `${birthYear}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`;
    const id = Number(insertStudent.run(roll, name, email, phone, dob, gender, deptIds[dept], year, semester, enrolled, status, `${enrolled} 10:00:00`).lastInsertRowid);
    const codes = branchCourses(dept, semester);
    codes.forEach((code) => enroll.run(id, courseIds[code], enrolled));
    if (status === "active") students.push({ id, codes, marks: null, rate: 0.6 + random() * 0.38 });
  });

  // Attendance for the last six weeks, three or two classes a week per course
  const insertAttendance = db.prepare("INSERT INTO attendance (student_id, course_id, date, status, recorded_by) VALUES (?, ?, ?, ?, ?)");
  const timetable = {};
  Object.keys(courseIds).forEach((code, i) => (timetable[code] = i % 2 ? [2, 4] : [1, 3, 5]));
  for (const student of students) {
    for (const code of student.codes) {
      for (const date of classDates(42, timetable[code])) {
        const r = random();
        const status = r < student.rate ? "present" : r < student.rate + 0.05 ? "late" : "absent";
        insertAttendance.run(student.id, courseIds[code], date, status, userIds.staff);
      }
    }
  }

  // Semester 3 end-semester exams with the original marks
  const insertExam = db.prepare("INSERT INTO exams (course_id, name, exam_type, exam_date, max_marks) VALUES (?, ?, ?, ?, ?)");
  const insertMark = db.prepare("INSERT INTO marks (exam_id, student_id, marks) VALUES (?, ?, ?)");
  COMMON_SEM3.forEach((code, i) => {
    const examId = Number(insertExam.run(courseIds[code], "End Semester Examination", "end-semester", `2026-05-${String(11 + i * 2).padStart(2, "0")}`, 100).lastInsertRowid);
    for (const s of students.filter((st) => st.marks)) insertMark.run(examId, s.id, s.marks[i]);
  });

  // Branch courses: a completed mid-term with marks, and upcoming exams
  Object.keys(courseIds).filter((code) => !COMMON_SEM3.includes(code)).forEach((code, i) => {
    const midId = Number(insertExam.run(courseIds[code], "Mid-Term Examination", "mid-term", daysFromToday(-20 + (i % 5)), 50).lastInsertRowid);
    for (const s of students.filter((st) => st.codes.includes(code))) {
      insertMark.run(midId, s.id, Math.min(50, Math.max(8, Math.round(50 * (s.rate - 0.15 + random() * 0.3)))));
    }
    insertExam.run(courseIds[code], "End Semester Examination", "end-semester", daysFromToday(25 + i * 2), 100);
    if (i % 3 === 0) insertExam.run(courseIds[code], "Quiz 2", "quiz", daysFromToday(4 + (i % 7)), 20);
  });

  db.prepare("INSERT INTO activity_log (user_id, action, entity, summary) VALUES (?, 'seed', 'system', ?)")
    .run(userIds.admin, "Loaded demo data (original 12 students and results, plus demo batches)");
});

if (reset && fs.existsSync(config.uploadDir)) {
  for (const file of fs.readdirSync(config.uploadDir)) fs.rmSync(`${config.uploadDir}/${file}`, { force: true });
}

const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log(`Seeded ${count("departments")} departments, ${count("faculty")} faculty, ${count("courses")} courses, ` +
  `${count("students")} students, ${count("attendance")} attendance records, ${count("exams")} exams and ${count("marks")} marks.`);
console.log("Sign-in accounts are the SEED_* values from your .env file.");
