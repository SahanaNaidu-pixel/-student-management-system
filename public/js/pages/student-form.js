// Add or edit a student
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { todayIso } from "../format.js";
import { field, bindForm, runChecks, checks, toast, pageHeader, options } from "../ui.js";
import { navigate } from "../app.js";

const STATUS_OPTIONS = [["active", "Active"], ["inactive", "Inactive"], ["graduated", "Graduated"], ["suspended", "Suspended"]];

export default async function studentForm({ root, params, setTitle, setCrumbs, isCurrent }) {
  const editing = Boolean(params.id);
  const [{ items: departments }, existing] = await Promise.all([
    api.get("/api/departments"),
    editing ? api.get(`/api/students/${encodeURIComponent(params.id)}`).then((r) => r.student) : null
  ]);
  if (!isCurrent()) return;

  const s = existing || { status: "active", enrollment_date: todayIso(), year: 1, semester: 1 };
  setTitle(editing ? `Edit ${s.full_name}` : "Add student");
  setCrumbs([
    { label: "Students", href: "/students" },
    ...(editing ? [{ label: s.full_name, href: `/students/${s.id}` }, { label: "Edit" }] : [{ label: "Add student" }])
  ]);

  const semesterOptions = (year) => [2 * year - 1, 2 * year].map((n) => ({ value: n, label: `Semester ${n}` }));

  mount(root, html`<div class="page">
    ${pageHeader({
      title: editing ? "Edit student" : "Register a new student",
      subtitle: editing ? `${s.full_name} · ${s.roll_no}` : "New students are automatically enrolled in their department's courses for the chosen semester."
    })}
    <form class="card" novalidate>
      <section class="form-section">
        <h2>Personal details</h2>
        <p>Basic identity information.</p>
        <div class="form-grid">
          ${field({ name: "full_name", label: "Full name", value: s.full_name, required: true, autofocus: !editing, attrs: 'autocomplete="off" maxlength="100"' })}
          ${field({ name: "date_of_birth", label: "Date of birth", type: "date", value: s.date_of_birth, attrs: `max="${todayIso()}"` })}
          ${field({ name: "gender", label: "Gender", type: "select", value: s.gender, options: [{ value: "", label: "Prefer not to say" }, ...["Male", "Female", "Other"].map((g) => ({ value: g, label: g }))] })}
        </div>
      </section>
      <section class="form-section">
        <h2>Contact</h2>
        <p>Used for official communication.</p>
        <div class="form-grid">
          ${field({ name: "email", label: "Email", type: "email", value: s.email, required: true, placeholder: "name@college.edu", attrs: 'autocomplete="off"' })}
          ${field({ name: "phone", label: "Phone", type: "tel", value: s.phone, placeholder: "10-digit number", attrs: 'inputmode="tel"' })}
        </div>
      </section>
      <section class="form-section">
        <h2>Academic details</h2>
        <p>Roll numbers and emails must be unique.</p>
        <div class="form-grid cols-3">
          ${field({ name: "roll_no", label: "Roll number", value: s.roll_no, required: true, placeholder: "e.g. 23CS001", attrs: 'maxlength="20" style="text-transform:uppercase"' })}
          ${field({ name: "department_id", label: "Department", type: "select", value: s.department_id, required: true, options: options(departments, "id", (d) => `${d.code} · ${d.name}`, "Select department") })}
          ${field({ name: "enrollment_date", label: "Enrollment date", type: "date", value: s.enrollment_date, required: true, attrs: `max="${todayIso()}"` })}
          ${field({ name: "year", label: "Year", type: "select", value: s.year, required: true, options: [1, 2, 3, 4].map((y) => ({ value: y, label: `Year ${y}` })) })}
          ${field({ name: "semester", label: "Semester", type: "select", value: s.semester, required: true, options: semesterOptions(Number(s.year) || 1) })}
          ${field({ name: "status", label: "Status", type: "select", value: s.status, required: true, options: STATUS_OPTIONS.map(([value, l]) => ({ value, label: l })) })}
        </div>
      </section>
      <footer class="form-actions">
        <a class="btn btn-ghost" href="${editing ? `/students/${s.id}` : "/students"}">Cancel</a>
        <button type="submit" class="btn btn-primary">${icon("check")}${editing ? "Save changes" : "Register student"}</button>
      </footer>
    </form>
  </div>`);

  const form = root.querySelector("form");
  const year = form.elements.year;
  const semester = form.elements.semester;
  year.addEventListener("change", () => {
    const current = Number(semester.value);
    const opts = semesterOptions(Number(year.value));
    mount(semester, html`${opts.map((o) => html`<option value="${o.value}">${o.label}</option>`)}`);
    if (opts.some((o) => o.value === current)) semester.value = String(current);
  });

  bindForm(form, {
    validate: (v) => runChecks(v, {
      full_name: [checks.required, (x) => (x.length < 2 ? "Enter the full name" : null)],
      email: [checks.required, checks.email],
      phone: [checks.phone],
      roll_no: [checks.required, (x) => (/^[A-Za-z0-9-]{3,20}$/.test(x) ? null : "Use 3–20 letters, numbers or dashes")],
      department_id: [checks.required],
      enrollment_date: [checks.required, checks.notFuture],
      date_of_birth: [checks.notFuture, (x, all) => (x && all.enrollment_date && x >= all.enrollment_date ? "Must be before the enrollment date" : null)]
    }),
    onSubmit: async (values) => {
      const body = { ...values, department_id: Number(values.department_id), year: Number(values.year), semester: Number(values.semester) };
      const saved = editing ? await api.put(`/api/students/${s.id}`, body) : await api.post("/api/students", body);
      toast(editing ? "Student details saved." : `${saved.full_name} has been registered.`);
      navigate(`/students/${saved.id}`);
    }
  });
}
