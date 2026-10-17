-- Initial schema for the Student Management System

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'staff')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE departments (
  id                 INTEGER PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  head_of_department TEXT,
  description        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE faculty (
  id            INTEGER PRIMARY KEY,
  employee_id   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT,
  designation   TEXT    NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  joined_on     TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE courses (
  id            INTEGER PRIMARY KEY,
  code          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  credits       INTEGER NOT NULL CHECK (credits BETWEEN 1 AND 10),
  semester      INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  faculty_id    INTEGER REFERENCES faculty(id) ON DELETE SET NULL,
  description   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE students (
  id              INTEGER PRIMARY KEY,
  roll_no         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name       TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone           TEXT,
  date_of_birth   TEXT,
  gender          TEXT    CHECK (gender IN ('Male', 'Female', 'Other')),
  department_id   INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  year            INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
  semester        INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 8),
  enrollment_date TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'graduated', 'suspended')),
  photo_file      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE enrollments (
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_on TEXT    NOT NULL DEFAULT (date('now')),
  PRIMARY KEY (student_id, course_id)
);

CREATE TABLE attendance (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recorded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, course_id, date)
);

CREATE TABLE exams (
  id         INTEGER PRIMARY KEY,
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  exam_type  TEXT    NOT NULL CHECK (exam_type IN ('mid-term', 'end-semester', 'quiz', 'practical')),
  exam_date  TEXT    NOT NULL,
  max_marks  INTEGER NOT NULL CHECK (max_marks BETWEEN 1 AND 1000),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE marks (
  exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks      REAL    NOT NULL CHECK (marks >= 0),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (exam_id, student_id)
);

CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT    NOT NULL,
  entity     TEXT    NOT NULL,
  entity_id  INTEGER,
  summary    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_students_department ON students(department_id);
CREATE INDEX idx_students_status     ON students(status);
CREATE INDEX idx_students_semester   ON students(semester);
CREATE INDEX idx_faculty_department  ON faculty(department_id);
CREATE INDEX idx_courses_department  ON courses(department_id);
CREATE INDEX idx_courses_faculty     ON courses(faculty_id);
CREATE INDEX idx_enrollments_course  ON enrollments(course_id);
CREATE INDEX idx_attendance_course   ON attendance(course_id, date);
CREATE INDEX idx_attendance_date     ON attendance(date);
CREATE INDEX idx_exams_course        ON exams(course_id);
CREATE INDEX idx_exams_date          ON exams(exam_date);
CREATE INDEX idx_marks_student       ON marks(student_id);
CREATE INDEX idx_sessions_user       ON sessions(user_id);
CREATE INDEX idx_activity_created    ON activity_log(created_at);
