# Student Management System

A full-stack university administration system for students, departments, courses, faculty, attendance, examinations, results and reports. It has a SQLite database, a secure JSON API, and a responsive interface with light and dark themes.

It grew out of the original two-module project (Student Registration and Student Result). Both modules still exist as the **Students** and **Examinations / Results** modules, with the same grading rules, and the original 12 students and their marks are part of the seed data.

## Features

| Area | What you can do |
|------|-----------------|
| **Dashboard** | Live counts, attendance rate vs the previous period, average result and pass rate, attendance trend, students by department, enrollment by intake, grade distribution, upcoming exams, recent registrations, recent activity, top performers, reporting-period picker |
| **Students** | Add, view, edit and delete; search by name, roll number, email or department; filter by department, course, semester and status; sortable, paginated table; profile page with photo upload, courses, attendance and results tabs; enrollment management; CSV import (validated, all-or-nothing) and export |
| **Departments** | Create, edit and delete (blocked while in use); student, faculty and course counts; detail page |
| **Courses** | Codes, credits, semester, department and assigned faculty; enrolled students and their attendance |
| **Faculty** | Profiles, designations and assigned courses |
| **Attendance** | Class register per course and date (present / late / absent, mark-all, edit an earlier day); records with date, course, status and student filters; per-student summary highlighting students below 75% |
| **Examinations** | Schedule mid-term, end-semester, quiz and practical exams; marks entry with live percentage and grade; marks open only after the exam date |
| **Results** | Semester totals, percentages, grades (O, A+, A, B+, B, C, F) and pass/fail from end-semester marks |
| **Reports** | CSV downloads for students, attendance (summary and raw), results and departments; print-friendly layouts |
| **Administration** | Admin and staff accounts, password change, full activity log |

**Interface:** collapsible sidebar, breadcrumbs, global search (press `/`), toast notifications, custom confirmation dialogs, loading skeletons, empty states, 404/403 pages, keyboard-friendly forms and tabs, light/dark theme toggle, print styles and a phone layout.

## Technology

- **Backend:** Node.js 22.13+ built-in modules only (`http`, `node:sqlite`, `crypto`). There are **no npm dependencies** to install.
- **Database:** SQLite with foreign keys, CHECK and UNIQUE constraints, indexes and versioned migrations (`server/migrations`).
- **Frontend:** plain HTML, CSS and JavaScript modules (no framework, no build step). Charts are hand-drawn SVG.

## Getting started

```bash
# 1. Configuration (ports, database path, demo account passwords)
cp .env.example .env

# 2. Create the database and load the demo data
npm run seed

# 3. Start the server
npm start
```

Then open **http://localhost:3000**.

### Demo accounts

Created by `npm run seed` from the `SEED_*` values in `.env`:

| Role | Username | Password | Can do |
|------|----------|----------|--------|
| Administrator | `admin` | `Admin@12345` | Everything |
| Staff | `staff` | `Staff@12345` | View everything; add and edit students; enrollments; attendance; marks |

Change these passwords before using the system with real data. Signed-in users can change their own password from the user menu.

### Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Start the server |
| `npm run dev` | Start and restart automatically when server files change |
| `npm run migrate` | Apply new database migrations |
| `npm run seed` | Load demo data into an **empty** database (refuses if data exists) |
| `npm run seed:reset` | **Delete all records** and reload the demo data |
| `npm run start:production` | Seed only if the database is empty, then start (used on Render) |
| `npm test` | Run the API test suite against a temporary database |

## Deploying to Render

The repo includes a `render.yaml` Blueprint that sets up the web service, a **persistent disk** for the database and photos, and production settings (HTTPS-only cookies, proxy-aware login limits, health check).

1. Sign in at [render.com](https://render.com) with your GitHub account and allow it to access this repository.
2. Choose **New → Blueprint**, select this repository, and Render reads `render.yaml`.
3. When asked for **`SEED_ADMIN_PASSWORD`**, enter a strong password (at least 8 characters with letters and numbers). It is stored only in Render, never in the repo.
4. Confirm. Render shows the cost: the **Starter** instance plus a 1 GB disk (a disk requires a paid instance).
5. When the deploy finishes, open the `https://<name>.onrender.com` URL and sign in as **`admin`** with that password.

What happens on start (`npm run start:production`):

- **First start:** migrations run and only the admin account is created (`SEED_MODE=accounts`). There are no demo students. Add departments and courses, then add students or import them from CSV.
- **Every later start or redeploy:** the database already has records, so the seed step does nothing and your data is kept.
- Pushing to `main` redeploys automatically. Apps with a disk have a short pause during each deploy.

After the first sign-in:

- Change the admin password under **user menu → Change password**. The `SEED_ADMIN_PASSWORD` value is only used once, for the first start.
- Create staff accounts under **User accounts**.
- Render takes daily snapshots of the disk. You can also download CSV exports from **Reports** as an extra backup.
- To use your own domain, add it under the service's **Settings → Custom Domains**; HTTPS is automatic.

To try a demo copy with sample data instead, set `SEED_MODE` to `demo` **before the first start** (the seed only ever runs on an empty database).

## Configuration (`.env`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Where the server listens. Use `HOST=0.0.0.0` to allow other devices on your network. |
| `DB_PATH` | `data/sms.db` | SQLite database file |
| `UPLOAD_DIR` | `data/uploads` | Profile photos |
| `SESSION_TTL_HOURS` | `8` | How long a sign-in lasts |
| `COOKIE_SECURE` | `false` | Set to `true` when served over HTTPS |
| `TRUST_PROXY` | `false` | Set to `true` behind a hosting proxy so login limits use the real client IP |
| `SEED_MODE` | `demo` | `demo` loads sample data; `accounts` creates only the user accounts |
| `SEED_*` | see `.env.example` | Accounts created by the seed script |

`.env` and the `data/` folder are git-ignored, so passwords and student data are never committed.

## Seed data

`npm run seed` loads:

- **The original records:** the 12 students from the old Student Registration module, with their semester 3 marks in Mathematics, Physics, Chemistry, English and Programming from the old Student Result module.
- **Demo data,** clearly separate from those: 6 departments, 15 faculty, 20 courses, 16 more students in the 2022 and 2024 batches, six weeks of attendance, mid-term marks and upcoming exams. It is generated deterministically, and exam and attendance dates are relative to the day you run the seed.

## Grading rules (unchanged from the original Result module)

- A subject is passed with at least **35%**; a semester is passed only if **every** subject is passed.
- Percentage = total marks ÷ maximum marks × 100.
- Grades: **O** ≥ 90, **A+** ≥ 80, **A** ≥ 70, **B+** ≥ 60, **B** ≥ 50, **C** below 50, **F** if any subject is failed.
- Semester results use **end-semester** exams. Mid-terms, quizzes and practicals appear on the student profile.
- Attendance % = (present + late) ÷ classes recorded × 100. Below **75%** is flagged.

## Security

- Passwords are hashed with scrypt; sessions use random tokens stored as SHA-256 hashes, in `HttpOnly`, `SameSite=Strict` cookies.
- Five failed sign-ins for a username from the same address lock further attempts for 15 minutes.
- **Permissions are enforced by the server** on every API route, not just by hiding buttons.
- All SQL is parameterized; search input has LIKE wildcards escaped; sort columns are whitelisted.
- Input is validated on both the client and the server; duplicate roll numbers, emails, codes and IDs are reported on the exact field.
- Related changes (imports, enrollment updates, attendance registers, marks sheets) run in database transactions.
- Photo uploads are limited to 2 MB and checked by their actual content (PNG/JPEG/WebP), stored under random names and served only to signed-in users.
- The API accepts only JSON request bodies (blocks cross-site form posts), and pages are served with a strict Content-Security-Policy.
- CSV exports neutralise spreadsheet formulas. Unexpected errors are logged on the server and shown to users as a generic message.

## Project structure

```
server/
  index.js            HTTP server, static files, security headers, error handling
  config.js           Environment configuration
  db.js               SQLite connection, migrations, transactions
  migrations/         Versioned SQL schema
  seed.js             Demo data
  lib/                Validation, auth, CSV, grading, results, activity log
  routes/             API endpoints per module
public/
  index.html          Single-page app entry
  css/app.css         Design system (tokens, components, themes, responsive, print)
  js/app.js           Shell: routing, sidebar, search, theme, session
  js/ui.js            Reusable components (tables, forms, modals, toasts…)
  js/charts.js        SVG charts
  js/pages/           One module per screen
tests/api.test.js     Integration tests
```

To use your institution's name, change `APP_NAME` and `INSTITUTION` at the top of `public/js/app.js`.

## Data from the old version

The previous version stored records in each browser's localStorage. Its 12 sample students and results are included in the seed. If you typed extra records into the old pages, export them to a CSV file with the columns listed in **Students → Import CSV** and import them.
