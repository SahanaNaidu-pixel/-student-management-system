// One course: enrolled students with attendance, and its exams
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate, label, todayIso } from "../format.js";
import { pageHeader, table, emptyState, progress, badge, toast } from "../ui.js";
import { navigate } from "../app.js";
import { courseModal, deleteCourse } from "./courses.js";

export default async function courseDetail({ root, params, isAdmin, setTitle, setCrumbs, isCurrent }) {
  async function load() {
    const { course: c, students, exams } = await api.get(`/api/courses/${encodeURIComponent(params.id)}`);
    if (!isCurrent()) return;
    setTitle(`${c.code} ${c.name}`);
    setCrumbs([{ label: "Courses", href: "/courses" }, { label: c.code }]);
    const today = todayIso();

    mount(root, html`<div class="page">
      ${pageHeader({
        title: c.name,
        subtitle: `${c.code} · ${c.department_name} · Semester ${c.semester} · ${c.credits} credits · ${c.faculty_name || "No faculty assigned"}`,
        actions: html`
          <a class="btn btn-secondary" href="/attendance?course=${c.id}">${icon("attendance")}Take attendance</a>
          ${isAdmin ? html`<button class="btn btn-secondary" data-edit>${icon("edit")}Edit</button><button class="btn btn-danger" data-delete>${icon("trash")}Delete</button>` : ""}`
      })}
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span>Enrolled students</span><span class="kpi-icon">${icon("students")}</span></div><div class="kpi-value">${c.enrolled_count}</div></div>
        <div class="card kpi"><div class="kpi-top"><span>Course attendance</span><span class="kpi-icon">${icon("attendance")}</span></div><div class="kpi-value">${c.attendance_pct ?? "—"}${c.attendance_pct !== null ? "%" : ""}</div></div>
        <div class="card kpi"><div class="kpi-top"><span>Examinations</span><span class="kpi-icon">${icon("exam")}</span></div><div class="kpi-value">${exams.length}</div></div>
      </div>
      <div class="grid grid-2-1">
        <section class="card"><header class="card-header"><h2>Enrolled students</h2><a class="card-link" href="/students?course=${c.id}">Open in directory ${icon("chevronRight")}</a></header>
          <div class="card-body">${students.length ? table({
            rows: students, rowLink: (s) => `/students/${s.id}`,
            columns: [
              { key: "roll_no", label: "Roll no", render: (s) => html`<span class="mono">${s.roll_no}</span>` },
              { key: "full_name", label: "Name", render: (s) => html`<strong>${s.full_name}</strong>` },
              { key: "status", label: "Status", render: (s) => badge(s.status) },
              { key: "attendance_pct", label: "Attendance", render: (s) => progress(s.attendance_pct) }
            ]
          }) : emptyState({ iconName: "students", title: "No students enrolled", text: "Enroll students from their profile page." })}</div></section>
        <section class="card"><header class="card-header"><h2>Examinations</h2><a class="card-link" href="/exams?course=${c.id}">Manage ${icon("chevronRight")}</a></header>
          <div class="card-body">${exams.length ? html`<ul class="list">${exams.map((e) => html`<li class="list-item">
            <div class="grow"><a class="person" href="/exams/${e.id}"><span class="person-text"><strong>${e.name}</strong><small>${label(e.exam_type)} · ${formatDate(e.exam_date)} · ${e.max_marks} marks</small></span></a></div>
            ${badge(e.exam_date >= today ? "Upcoming" : "Completed", e.exam_date >= today ? "info" : "neutral")}
          </li>`)}</ul>` : emptyState({ iconName: "exam", title: "No exams scheduled" })}</div></section>
      </div>
    </div>`);

    root.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => navigate(tr.dataset.href)));
    root.querySelector("[data-edit]")?.addEventListener("click", async () => {
      const [{ items: departments }, { items: faculty }] = await Promise.all([api.get("/api/departments"), api.get("/api/faculty")]);
      if (await courseModal(c, departments, faculty)) { toast("Course saved."); load(); }
    });
    root.querySelector("[data-delete]")?.addEventListener("click", async () => {
      if (await deleteCourse(c)) navigate("/courses", { replace: true });
    });
  }
  await load();
}
