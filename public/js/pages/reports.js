// Reports: CSV exports and a printable department summary, all from live records
import { api, download } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { pct, formatDate, todayIso, shiftDate } from "../format.js";
import { pageHeader, table, emptyState, toast, options, progress } from "../ui.js";

export default async function reports({ root, setTitle, setCrumbs, isCurrent }) {
  setTitle("Reports");
  setCrumbs([{ label: "Reports" }]);
  const [{ items: summary }, { items: departments }, { items: courses }] = await Promise.all([
    api.get("/api/reports/departments"), api.get("/api/departments"), api.get("/api/courses")
  ]);
  if (!isCurrent()) return;

  const deptOptions = options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}">${o.label}</option>`);

  mount(root, html`<div class="page">
    ${pageHeader({ title: "Reports", subtitle: "Download spreadsheets or print summaries. Every report is generated from current records." })}

    <div class="grid grid-3 no-print">
      <section class="card report-card">
        <span class="report-icon">${icon("students")}</span>
        <h2>Student directory</h2>
        <p>Every student with contact details, department, semester, status and overall attendance.</p>
        <div class="field"><label for="r-s-dept">Department</label><select id="r-s-dept" data-s-dept>${deptOptions}</select></div>
        <div class="field"><label for="r-s-status">Status</label><select id="r-s-status" data-s-status><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="graduated">Graduated</option><option value="suspended">Suspended</option></select></div>
        <div class="actions"><button class="btn btn-primary" data-report="students">${icon("download")}Download CSV</button></div>
      </section>

      <section class="card report-card">
        <span class="report-icon">${icon("attendance")}</span>
        <h2>Attendance summary</h2>
        <p>Classes attended per student for a period, flagging anyone below the 75% requirement.</p>
        <div class="form-grid">
          <div class="field"><label for="r-a-from">From</label><input id="r-a-from" type="date" data-a-from value="${shiftDate(todayIso(), -29)}"></div>
          <div class="field"><label for="r-a-to">To</label><input id="r-a-to" type="date" data-a-to value="${todayIso()}"></div>
        </div>
        <div class="field"><label for="r-a-course">Course</label><select id="r-a-course" data-a-course>${options(courses, "id", (c) => `${c.code} · ${c.name}`, "All courses").map((o) => html`<option value="${o.value}">${o.label}</option>`)}</select></div>
        <div class="actions">
          <button class="btn btn-primary" data-report="attendance">${icon("download")}Summary CSV</button>
          <button class="btn btn-secondary" data-report="attendance-raw">${icon("download")}All records</button>
        </div>
      </section>

      <section class="card report-card">
        <span class="report-icon">${icon("award")}</span>
        <h2>Academic results</h2>
        <p>Semester-wise marks, totals, percentages, grades and pass/fail status from end-semester exams.</p>
        <div class="field"><label for="r-r-dept">Department</label><select id="r-r-dept" data-r-dept>${deptOptions}</select></div>
        <div class="field"><label for="r-r-sem">Semester</label><select id="r-r-sem" data-r-sem><option value="">All semesters</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => html`<option value="${s}">Semester ${s}</option>`)}</select></div>
        <div class="actions">
          <button class="btn btn-primary" data-report="results">${icon("download")}Download CSV</button>
          <a class="btn btn-secondary" href="/results">${icon("eye")}View</a>
        </div>
      </section>
    </div>

    <section class="card">
      <header class="card-header">
        <div><h2>Department summary</h2><p>Students, staff, attendance and results by department · ${formatDate(todayIso())}</p></div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" data-print>${icon("print")}Print</button>
          <button class="btn btn-secondary btn-sm" data-report="departments">${icon("download")}CSV</button>
        </div>
      </header>
      <div class="card-body">${summary.length ? table({
        rows: summary,
        columns: [
          { key: "code", label: "Department", render: (d) => html`<strong>${d.code}</strong> <span class="muted">${d.name}</span>` },
          { key: "students", label: "Students", className: "right" },
          { key: "active_students", label: "Active", className: "right" },
          { key: "faculty", label: "Faculty", className: "right" },
          { key: "courses", label: "Courses", className: "right" },
          { key: "attendance_pct", label: "Attendance", render: (d) => progress(d.attendance_pct) },
          { key: "average_pct", label: "Avg result", className: "right", render: (d) => pct(d.average_pct) },
          { key: "pass_rate", label: "Pass rate", className: "right", render: (d) => pct(d.pass_rate) }
        ]
      }) : emptyState({ iconName: "building", title: "No departments yet" })}</div>
    </section>
  </div>`);

  const val = (sel) => root.querySelector(sel).value;
  const run = {
    students: () => download("/api/students/export.csv", { department: val("[data-s-dept]"), status: val("[data-s-status]") }),
    attendance: () => download("/api/reports/attendance-summary.csv", { from: val("[data-a-from]"), to: val("[data-a-to]"), course: val("[data-a-course]") }),
    "attendance-raw": () => download("/api/attendance/export.csv", { from: val("[data-a-from]"), to: val("[data-a-to]"), course: val("[data-a-course]") }),
    results: () => download("/api/results/export.csv", { department: val("[data-r-dept]"), semester: val("[data-r-sem]") }),
    departments: () => download("/api/reports/departments.csv")
  };
  root.querySelectorAll("[data-report]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.report.startsWith("attendance") && val("[data-a-from]") > val("[data-a-to]")) {
      return toast("The start date must be before the end date.", "error");
    }
    run[b.dataset.report]();
    toast("Your report is downloading.", "info");
  }));
  root.querySelector("[data-print]").addEventListener("click", () => window.print());
}
