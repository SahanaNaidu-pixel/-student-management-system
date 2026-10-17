// Examinations: schedule, filter and open for marks entry
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate, daysUntil, label, todayIso } from "../format.js";
import {
  pageHeader, table, bindTable, field, formModal, confirmDialog, toast, showError, emptyState, errorState,
  skeletonTable, badge, options, runChecks, checks
} from "../ui.js";
import { navigate, setQuery } from "../app.js";

const TYPES = ["mid-term", "end-semester", "quiz", "practical"];

export function examModal(existing, courses) {
  const e = existing || { exam_type: "mid-term", max_marks: 100 };
  return formModal({
    title: existing ? "Edit examination" : "Schedule examination",
    submitText: existing ? "Save changes" : "Schedule",
    fields: html`
      ${field({ name: "course_id", label: "Course", type: "select", value: e.course_id, required: true, full: true, options: options(courses, "id", (c) => `${c.code} · ${c.name} (Sem ${c.semester})`, "Select course") })}
      ${field({ name: "name", label: "Exam name", value: e.name, required: true, placeholder: "e.g. Mid-Term Examination" })}
      ${field({ name: "exam_type", label: "Type", type: "select", value: e.exam_type, required: true, options: TYPES.map((t) => ({ value: t, label: label(t) })), hint: "Semester results use end-semester exams." })}
      ${field({ name: "exam_date", label: "Date", type: "date", value: e.exam_date, required: true })}
      ${field({ name: "max_marks", label: "Maximum marks", type: "number", value: e.max_marks, required: true, attrs: 'min="1" max="1000" step="1"' })}`,
    validate: (v) => runChecks(v, {
      course_id: [checks.required], name: [checks.required], exam_date: [checks.required],
      max_marks: [checks.required, (x) => (Number.isInteger(Number(x)) && x >= 1 && x <= 1000 ? null : "Enter 1 to 1000")]
    }),
    onSubmit: (v) => {
      const body = { ...v, course_id: Number(v.course_id), max_marks: Number(v.max_marks) };
      return existing ? api.put(`/api/exams/${e.id}`, body) : api.post("/api/exams", body);
    }
  });
}

export async function deleteExam(e) {
  const ok = await confirmDialog({
    title: "Delete examination?",
    message: `${e.name} for ${e.course_code} will be permanently deleted${e.marks_count ? ` together with ${e.marks_count} entered marks` : ""}. This cannot be undone.`,
    confirmText: "Delete exam", danger: true
  });
  if (!ok) return false;
  try {
    await api.del(`/api/exams/${e.id}`);
    toast("Examination deleted.");
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

export default async function exams({ root, query, isAdmin, setTitle, setCrumbs, isCurrent }) {
  setTitle("Examinations");
  setCrumbs([{ label: "Examinations" }]);
  const state = { when: query.get("when") || "", type: query.get("type") || "", course: query.get("course") || "", department: query.get("department") || "" };
  const [{ items: courses }, { items: departments }] = await Promise.all([api.get("/api/courses"), api.get("/api/departments")]);
  if (!isCurrent()) return;

  mount(root, html`<div class="page">
    ${pageHeader({
      title: "Examinations",
      subtitle: "Schedule assessments and enter marks once they are held.",
      actions: html`<a class="btn btn-secondary" href="/results">${icon("award")}View results</a>
        ${isAdmin ? html`<button class="btn btn-primary" data-add>${icon("plus")}Schedule exam</button>` : ""}`
    })}
    <section class="card">
      <div class="filters">
        <select data-k="when" aria-label="When"><option value="">All dates</option>
          <option value="upcoming" ${state.when === "upcoming" ? "selected" : ""}>Upcoming</option>
          <option value="past" ${state.when === "past" ? "selected" : ""}>Completed</option></select>
        <select data-k="type" aria-label="Type"><option value="">All types</option>${TYPES.map((t) => html`<option value="${t}" ${t === state.type ? "selected" : ""}>${label(t)}</option>`)}</select>
        <select data-k="department" aria-label="Department">${options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}" ${String(o.value) === state.department ? "selected" : ""}>${o.label}</option>`)}</select>
        <select data-k="course" aria-label="Course">${options(courses, "id", (c) => `${c.code} · ${c.name}`, "All courses").map((o) => html`<option value="${o.value}" ${String(o.value) === state.course ? "selected" : ""}>${o.label}</option>`)}</select>
      </div>
      <div data-results>${skeletonTable(8, 6)}</div>
    </section>
  </div>`);

  const results = root.querySelector("[data-results]");
  let items = [];

  async function load() {
    setQuery(state);
    try {
      ({ items } = await api.get("/api/exams", state));
      if (!isCurrent()) return;
    } catch (error) {
      showError(error);
      mount(results, errorState(error));
      results.querySelector("[data-retry]").addEventListener("click", load);
      return;
    }
    if (!items.length) {
      mount(results, emptyState({ iconName: "exam", title: "No examinations match these filters", action: isAdmin ? html`<button class="btn btn-primary" data-add-empty>${icon("plus")}Schedule exam</button>` : "" }));
      results.querySelector("[data-add-empty]")?.addEventListener("click", add);
      return;
    }
    const today = todayIso();
    mount(results, table({
      rows: items,
      rowLink: (e) => `/exams/${e.id}`,
      columns: [
        { key: "exam_date", label: "Date", render: (e) => html`<span class="nowrap">${formatDate(e.exam_date)}</span>` },
        { key: "name", label: "Examination", className: "primary-cell", render: (e) => html`<a class="person" href="/exams/${e.id}"><span class="person-text"><strong>${e.course_name}</strong><small>${e.course_code} · ${e.name}</small></span></a>` },
        { key: "exam_type", label: "Type", render: (e) => html`<span class="tag">${label(e.exam_type)}</span>` },
        { key: "max_marks", label: "Max", className: "right" },
        { key: "progress", label: "Marks entered", render: (e) => e.exam_date > today
          ? badge(daysUntil(e.exam_date) === 0 ? "Today" : `In ${daysUntil(e.exam_date)} days`, "info")
          : html`<span class="${e.marks_count < e.enrolled_count ? "muted" : ""}">${e.marks_count} / ${e.enrolled_count}</span>` },
        { key: "average_marks", label: "Average", className: "right", render: (e) => e.average_marks !== null ? `${e.average_marks} / ${e.max_marks}` : "—" },
        ...(isAdmin ? [{ key: "actions", label: "Actions", className: "right", render: (e) => html`<div class="row-actions">
          <button class="icon-btn sm" data-edit="${e.id}" aria-label="Edit exam" data-tip="Edit">${icon("edit")}</button>
          <button class="icon-btn sm danger" data-delete="${e.id}" aria-label="Delete exam" data-tip="Delete">${icon("trash")}</button>
        </div>` }] : [])
      ]
    }));
    results.querySelector("table").classList.add("stack");
    bindTable(results, { navigate });
    results.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      if (await examModal(items.find((e) => e.id === Number(b.dataset.edit)), courses)) { toast("Examination saved."); load(); }
    }));
    results.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      if (await deleteExam(items.find((e) => e.id === Number(b.dataset.delete)))) load();
    }));
  }

  async function add() {
    if (await examModal(null, courses)) { toast("Examination scheduled."); load(); }
  }

  root.querySelector("[data-add]")?.addEventListener("click", add);
  root.querySelectorAll("[data-k]").forEach((s) => s.addEventListener("change", () => { state[s.dataset.k] = s.value; load(); }));
  await load();
}
