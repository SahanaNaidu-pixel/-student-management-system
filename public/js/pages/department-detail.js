// One department: courses, faculty and students by year
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { barChart } from "../charts.js";
import { pageHeader, table, emptyState, toast } from "../ui.js";
import { navigate } from "../app.js";
import { departmentModal, deleteDepartment } from "./departments.js";

export default async function departmentDetail({ root, params, isAdmin, setTitle, setCrumbs, isCurrent }) {
  async function load() {
    const { department: d, courses, faculty, byYear } = await api.get(`/api/departments/${encodeURIComponent(params.id)}`);
    if (!isCurrent()) return;
    setTitle(d.name);
    setCrumbs([{ label: "Departments", href: "/departments" }, { label: d.code }]);

    mount(root, html`<div class="page">
      ${pageHeader({
        title: d.name,
        subtitle: d.description || (d.head_of_department ? `Head of department: ${d.head_of_department}` : ""),
        actions: html`
          <a class="btn btn-secondary" href="/students?department=${d.id}">${icon("students")}View students</a>
          ${isAdmin ? html`<button class="btn btn-secondary" data-edit>${icon("edit")}Edit</button><button class="btn btn-danger" data-delete>${icon("trash")}Delete</button>` : ""}`
      })}
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span>Students</span><span class="kpi-icon">${icon("students")}</span></div><div class="kpi-value">${d.student_count}</div><div class="kpi-sub">${d.active_student_count} active</div></div>
        <div class="card kpi"><div class="kpi-top"><span>Faculty</span><span class="kpi-icon">${icon("faculty")}</span></div><div class="kpi-value">${d.faculty_count}</div></div>
        <div class="card kpi"><div class="kpi-top"><span>Courses</span><span class="kpi-icon">${icon("book")}</span></div><div class="kpi-value">${d.course_count}</div></div>
        <div class="card kpi"><div class="kpi-top"><span>Head of department</span><span class="kpi-icon">${icon("user")}</span></div><div class="kpi-value" style="font-size:1.1rem">${d.head_of_department || "—"}</div></div>
      </div>
      <div class="grid grid-1-2">
        <section class="card"><header class="card-header"><h2>Students by year</h2></header>
          <div class="card-body">${barChart(byYear.map((y) => ({ label: `Year ${y.year}`, value: y.count })), { ariaLabel: "Students by year" })}</div></section>
        <section class="card"><header class="card-header"><h2>Courses</h2><a class="card-link" href="/courses?department=${d.id}">Manage ${icon("chevronRight")}</a></header>
          <div class="card-body">${courses.length ? table({
            rows: courses, rowLink: (c) => `/courses/${c.id}`,
            columns: [
              { key: "code", label: "Code", render: (c) => html`<span class="tag">${c.code}</span>` },
              { key: "name", label: "Course" },
              { key: "semester", label: "Sem" },
              { key: "credits", label: "Credits" },
              { key: "faculty_name", label: "Faculty", render: (c) => c.faculty_name || html`<span class="muted">Unassigned</span>` }
            ]
          }) : emptyState({ iconName: "book", title: "No courses yet" })}</div></section>
      </div>
      <section class="card"><header class="card-header"><h2>Faculty</h2><a class="card-link" href="/faculty?department=${d.id}">Manage ${icon("chevronRight")}</a></header>
        <div class="card-body">${faculty.length ? table({
          rows: faculty,
          columns: [
            { key: "full_name", label: "Name", render: (f) => html`<strong>${f.full_name}</strong>` },
            { key: "employee_id", label: "Employee ID", render: (f) => html`<span class="mono">${f.employee_id}</span>` },
            { key: "designation", label: "Designation" },
            { key: "email", label: "Email" }
          ]
        }) : emptyState({ iconName: "faculty", title: "No faculty yet" })}</div></section>
    </div>`);

    root.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => navigate(tr.dataset.href)));
    root.querySelector("[data-edit]")?.addEventListener("click", async () => {
      if (await departmentModal(d)) { toast("Department saved."); load(); }
    });
    root.querySelector("[data-delete]")?.addEventListener("click", async () => {
      if (await deleteDepartment(d)) navigate("/departments", { replace: true });
    });
  }
  await load();
}
