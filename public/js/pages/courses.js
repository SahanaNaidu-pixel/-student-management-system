// Course catalogue with filters and admin create/edit/delete
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import {
  pageHeader, table, bindTable, field, formModal, confirmDialog, toast, showError, emptyState, errorState,
  skeletonTable, debounce, progress, options, runChecks, checks
} from "../ui.js";
import { navigate, setQuery } from "../app.js";

export async function courseModal(existing, departments, faculty) {
  const c = existing || {};
  return formModal({
    title: existing ? `Edit ${c.code}` : "Add course",
    submitText: existing ? "Save changes" : "Create course",
    fields: html`
      ${field({ name: "code", label: "Course code", value: c.code, required: true, placeholder: "e.g. CS301", attrs: 'maxlength="12" style="text-transform:uppercase"' })}
      ${field({ name: "name", label: "Course name", value: c.name, required: true })}
      ${field({ name: "department_id", label: "Department", type: "select", value: c.department_id, required: true, options: options(departments, "id", (d) => `${d.code} · ${d.name}`, "Select department") })}
      ${field({ name: "faculty_id", label: "Faculty", type: "select", value: c.faculty_id, options: options(faculty, "id", (f) => `${f.full_name} (${f.department_code})`, "Unassigned") })}
      ${field({ name: "semester", label: "Semester", type: "select", value: c.semester, required: true, options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: `Semester ${n}` })) })}
      ${field({ name: "credits", label: "Credits", type: "number", value: c.credits ?? 3, required: true, attrs: 'min="1" max="10" step="1"' })}
      ${field({ name: "description", label: "Description", type: "textarea", value: c.description, full: true })}`,
    validate: (v) => runChecks(v, {
      code: [checks.required, (x) => (/^[A-Za-z0-9-]{3,12}$/.test(x) ? null : "Use 3–12 letters, numbers or dashes")],
      name: [checks.required],
      department_id: [checks.required],
      credits: [checks.required, (x) => (Number.isInteger(Number(x)) && x >= 1 && x <= 10 ? null : "Enter 1 to 10")]
    }),
    onSubmit: (v) => {
      const body = { ...v, department_id: Number(v.department_id), faculty_id: v.faculty_id ? Number(v.faculty_id) : null, semester: Number(v.semester), credits: Number(v.credits) };
      return existing ? api.put(`/api/courses/${c.id}`, body) : api.post("/api/courses", body);
    }
  });
}

export async function deleteCourse(c) {
  const ok = await confirmDialog({
    title: `Delete ${c.code}?`,
    message: `${c.name} will be permanently deleted together with its enrollments, attendance records, exams and marks. This cannot be undone.`,
    confirmText: "Delete course",
    danger: true
  });
  if (!ok) return false;
  try {
    await api.del(`/api/courses/${c.id}`);
    toast(`${c.code} was deleted.`);
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

export default async function courses({ root, query, isAdmin, setTitle, setCrumbs, isCurrent }) {
  setTitle("Courses");
  setCrumbs([{ label: "Courses" }]);
  const state = { q: query.get("q") || "", department: query.get("department") || "", semester: query.get("semester") || "", faculty: query.get("faculty") || "" };

  const [{ items: departments }, { items: faculty }] = await Promise.all([api.get("/api/departments"), api.get("/api/faculty")]);
  if (!isCurrent()) return;

  mount(root, html`<div class="page">
    ${pageHeader({
      title: "Courses",
      subtitle: "Course codes, credits, semesters and assigned faculty.",
      actions: isAdmin ? html`<button class="btn btn-primary" data-add>${icon("plus")}Add course</button>` : ""
    })}
    <section class="card">
      <div class="filters">
        <label class="input-icon">${icon("search")}<input type="search" data-q value="${state.q}" placeholder="Search by code or name" aria-label="Search courses"></label>
        <select data-filter="department" aria-label="Department">${options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}" ${String(o.value) === state.department ? "selected" : ""}>${o.label}</option>`)}</select>
        <select data-filter="semester" aria-label="Semester"><option value="">All semesters</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => html`<option value="${s}" ${String(s) === state.semester ? "selected" : ""}>Semester ${s}</option>`)}</select>
        <select data-filter="faculty" aria-label="Faculty">${options(faculty, "id", (f) => f.full_name, "All faculty").map((o) => html`<option value="${o.value}" ${String(o.value) === state.faculty ? "selected" : ""}>${o.label}</option>`)}</select>
      </div>
      <div data-results>${skeletonTable(6, 6)}</div>
    </section>
  </div>`);

  const results = root.querySelector("[data-results]");
  let items = [];

  async function load() {
    setQuery(state);
    try {
      ({ items } = await api.get("/api/courses", state));
      if (!isCurrent()) return;
    } catch (error) {
      showError(error);
      mount(results, errorState(error));
      results.querySelector("[data-retry]").addEventListener("click", load);
      return;
    }
    if (!items.length) {
      mount(results, emptyState({ iconName: "book", title: Object.values(state).some(Boolean) ? "No courses match these filters" : "No courses yet", action: isAdmin ? html`<button class="btn btn-primary" data-add-empty>${icon("plus")}Add course</button>` : "" }));
      results.querySelector("[data-add-empty]")?.addEventListener("click", add);
      return;
    }
    mount(results, table({
      rows: items,
      rowLink: (c) => `/courses/${c.id}`,
      columns: [
        { key: "code", label: "Code", render: (c) => html`<span class="tag">${c.code}</span>` },
        { key: "name", label: "Course", className: "primary-cell", render: (c) => html`<a class="person" href="/courses/${c.id}"><span class="person-text"><strong>${c.name}</strong><small>${c.department_name}</small></span></a>` },
        { key: "semester", label: "Sem" },
        { key: "credits", label: "Credits" },
        { key: "faculty_name", label: "Faculty", render: (c) => c.faculty_name || html`<span class="muted">Unassigned</span>` },
        { key: "enrolled_count", label: "Enrolled" },
        { key: "attendance_pct", label: "Attendance", render: (c) => progress(c.attendance_pct) },
        ...(isAdmin ? [{ key: "actions", label: "Actions", className: "right", render: (c) => html`<div class="row-actions">
          <button class="icon-btn sm" data-edit="${c.id}" aria-label="Edit ${c.code}" data-tip="Edit">${icon("edit")}</button>
          <button class="icon-btn sm danger" data-delete="${c.id}" aria-label="Delete ${c.code}" data-tip="Delete">${icon("trash")}</button>
        </div>` }] : [])
      ]
    }));
    results.querySelector("table").classList.add("stack");
    bindTable(results, { navigate });
    results.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      const saved = await courseModal(items.find((c) => c.id === Number(b.dataset.edit)), departments, faculty);
      if (saved) { toast(`${saved.code} saved.`); load(); }
    }));
    results.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      if (await deleteCourse(items.find((c) => c.id === Number(b.dataset.delete)))) load();
    }));
  }

  async function add() {
    const saved = await courseModal(null, departments, faculty);
    if (saved) { toast(`${saved.code} was created.`); load(); }
  }

  root.querySelector("[data-add]")?.addEventListener("click", add);
  root.querySelector("[data-q]").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); load(); }));
  root.querySelectorAll("[data-filter]").forEach((s) => s.addEventListener("change", () => { state[s.dataset.filter] = s.value; load(); }));
  await load();
}
