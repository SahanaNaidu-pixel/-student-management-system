// Faculty directory with admin create/edit/delete
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate } from "../format.js";
import {
  pageHeader, table, field, formModal, confirmDialog, toast, showError, emptyState, errorState,
  skeletonTable, debounce, avatar, options, runChecks, checks
} from "../ui.js";
import { setQuery } from "../app.js";

export default async function faculty({ root, query, isAdmin, setTitle, setCrumbs, isCurrent }) {
  setTitle("Faculty");
  setCrumbs([{ label: "Faculty" }]);
  const state = { q: query.get("q") || "", department: query.get("department") || "" };
  const { items: departments } = await api.get("/api/departments");
  if (!isCurrent()) return;
  let designations = [];

  mount(root, html`<div class="page">
    ${pageHeader({
      title: "Faculty",
      subtitle: "Teaching staff and the courses assigned to them.",
      actions: isAdmin ? html`<button class="btn btn-primary" data-add>${icon("plus")}Add faculty member</button>` : ""
    })}
    <section class="card">
      <div class="filters">
        <label class="input-icon">${icon("search")}<input type="search" data-q value="${state.q}" placeholder="Search by name, employee ID or email" aria-label="Search faculty"></label>
        <select data-filter="department" aria-label="Department">${options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}" ${String(o.value) === state.department ? "selected" : ""}>${o.label}</option>`)}</select>
      </div>
      <div data-results>${skeletonTable(6, 5)}</div>
    </section>
  </div>`);

  const results = root.querySelector("[data-results]");
  let items = [];

  function facultyModal(existing) {
    const f = existing || {};
    return formModal({
      title: existing ? `Edit ${f.full_name}` : "Add faculty member",
      submitText: existing ? "Save changes" : "Add faculty member",
      fields: html`
        ${field({ name: "full_name", label: "Full name", value: f.full_name, required: true })}
        ${field({ name: "employee_id", label: "Employee ID", value: f.employee_id, required: true, placeholder: "e.g. FAC-CSE-04", attrs: 'style="text-transform:uppercase"' })}
        ${field({ name: "email", label: "Email", type: "email", value: f.email, required: true })}
        ${field({ name: "phone", label: "Phone", type: "tel", value: f.phone })}
        ${field({ name: "department_id", label: "Department", type: "select", value: f.department_id, required: true, options: options(departments, "id", (d) => `${d.code} · ${d.name}`, "Select department") })}
        ${field({ name: "designation", label: "Designation", type: "select", value: f.designation, required: true, options: [{ value: "", label: "Select designation" }, ...designations.map((d) => ({ value: d, label: d }))] })}
        ${field({ name: "joined_on", label: "Joined on", type: "date", value: f.joined_on })}`,
      validate: (v) => runChecks(v, {
        full_name: [checks.required], employee_id: [checks.required], email: [checks.required, checks.email],
        phone: [checks.phone], department_id: [checks.required], designation: [checks.required], joined_on: [checks.notFuture]
      }),
      onSubmit: (v) => {
        const body = { ...v, department_id: Number(v.department_id) };
        return existing ? api.put(`/api/faculty/${f.id}`, body) : api.post("/api/faculty", body);
      }
    });
  }

  async function load() {
    setQuery(state);
    try {
      ({ items, designations } = await api.get("/api/faculty", state));
      if (!isCurrent()) return;
    } catch (error) {
      showError(error);
      mount(results, errorState(error));
      results.querySelector("[data-retry]").addEventListener("click", load);
      return;
    }
    if (!items.length) {
      mount(results, emptyState({ iconName: "faculty", title: state.q || state.department ? "No faculty match these filters" : "No faculty yet" }));
      return;
    }
    mount(results, table({
      rows: items,
      columns: [
        { key: "full_name", label: "Name", className: "primary-cell", render: (f) => html`<span class="person">${avatar(f)}<span class="person-text"><strong>${f.full_name}</strong><small>${f.email}</small></span></span>` },
        { key: "employee_id", label: "Employee ID", render: (f) => html`<span class="mono">${f.employee_id}</span>` },
        { key: "designation", label: "Designation" },
        { key: "department_code", label: "Department", render: (f) => html`<a class="tag" href="/departments/${f.department_id}">${f.department_code}</a>` },
        { key: "course_codes", label: "Courses", render: (f) => f.course_codes ? html`<a class="card-link" href="/courses?faculty=${f.id}">${f.course_codes}</a>` : html`<span class="muted">None</span>` },
        { key: "joined_on", label: "Joined", render: (f) => formatDate(f.joined_on) },
        ...(isAdmin ? [{ key: "actions", label: "Actions", className: "right", render: (f) => html`<div class="row-actions">
          <button class="icon-btn sm" data-edit="${f.id}" aria-label="Edit ${f.full_name}" data-tip="Edit">${icon("edit")}</button>
          <button class="icon-btn sm danger" data-delete="${f.id}" aria-label="Delete ${f.full_name}" data-tip="Delete">${icon("trash")}</button>
        </div>` }] : [])
      ]
    }));
    results.querySelector("table").classList.add("stack");
    results.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      if (await facultyModal(items.find((f) => f.id === Number(b.dataset.edit)))) { toast("Faculty member saved."); load(); }
    }));
    results.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      const f = items.find((x) => x.id === Number(b.dataset.delete));
      const ok = await confirmDialog({
        title: `Remove ${f.full_name}?`,
        message: `This faculty record will be permanently deleted.${f.course_count ? ` Their ${f.course_count} course(s) will become unassigned.` : ""}`,
        confirmText: "Remove", danger: true
      });
      if (!ok) return;
      try {
        await api.del(`/api/faculty/${f.id}`);
        toast(`${f.full_name} was removed.`);
        load();
      } catch (error) {
        showError(error);
      }
    }));
  }

  root.querySelector("[data-add]")?.addEventListener("click", async () => {
    const saved = await facultyModal();
    if (saved) { toast(`${saved.full_name} was added.`); load(); }
  });
  root.querySelector("[data-q]").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); load(); }));
  root.querySelector("[data-filter]").addEventListener("change", (e) => { state.department = e.target.value; load(); });
  await load();
}
