// Departments overview with create, edit and delete
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { pageHeader, field, formModal, confirmDialog, toast, showError, emptyState, runChecks, checks } from "../ui.js";

export function departmentModal(existing) {
  const d = existing || {};
  return formModal({
    title: existing ? `Edit ${d.code}` : "Add department",
    submitText: existing ? "Save changes" : "Create department",
    fields: html`
      ${field({ name: "code", label: "Code", value: d.code, required: true, placeholder: "e.g. CSE", attrs: 'maxlength="10" style="text-transform:uppercase"' })}
      ${field({ name: "name", label: "Name", value: d.name, required: true, placeholder: "Computer Science & Engineering" })}
      ${field({ name: "head_of_department", label: "Head of department", value: d.head_of_department, full: true })}
      ${field({ name: "description", label: "Description", type: "textarea", value: d.description, full: true })}`,
    validate: (v) => runChecks(v, {
      code: [checks.required, (x) => (/^[A-Za-z0-9&]{2,10}$/.test(x) ? null : "Use 2–10 letters or numbers")],
      name: [checks.required]
    }),
    onSubmit: (v) => (existing ? api.put(`/api/departments/${d.id}`, v) : api.post("/api/departments", v))
  });
}

export async function deleteDepartment(d) {
  const ok = await confirmDialog({
    title: `Delete ${d.code}?`,
    message: `The ${d.name} department will be permanently deleted. Departments that still have students, faculty or courses cannot be deleted.`,
    confirmText: "Delete department",
    danger: true
  });
  if (!ok) return false;
  try {
    await api.del(`/api/departments/${d.id}`);
    toast(`${d.code} was deleted.`);
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

export default async function departments({ root, isAdmin, setTitle, setCrumbs, isCurrent }) {
  setTitle("Departments");
  setCrumbs([{ label: "Departments" }]);

  async function load() {
    const { items } = await api.get("/api/departments");
    if (!isCurrent()) return;
    mount(root, html`<div class="page">
      ${pageHeader({
        title: "Departments",
        subtitle: "Academic departments with their students, faculty and courses.",
        actions: isAdmin ? html`<button class="btn btn-primary" data-add>${icon("plus")}Add department</button>` : ""
      })}
      ${items.length ? html`<div class="dept-grid">${items.map((d) => html`
        <a class="card dept-card" href="/departments/${d.id}">
          <div class="dept-card-top">
            <span class="dept-code">${d.code}</span>
            ${isAdmin ? html`<span class="row-actions">
              <button class="icon-btn sm" data-edit="${d.id}" aria-label="Edit ${d.code}" data-tip="Edit">${icon("edit")}</button>
              <button class="icon-btn sm danger" data-delete="${d.id}" aria-label="Delete ${d.code}" data-tip="Delete">${icon("trash")}</button>
            </span>` : ""}
          </div>
          <h3>${d.name}</h3>
          <p class="desc">${d.head_of_department ? html`Head: ${d.head_of_department}` : html`<span class="muted">No head assigned</span>`}</p>
          <div class="dept-stats">
            <div><strong>${d.student_count}</strong><small>Students</small></div>
            <div><strong>${d.faculty_count}</strong><small>Faculty</small></div>
            <div><strong>${d.course_count}</strong><small>Courses</small></div>
          </div>
        </a>`)}</div>`
      : html`<div class="card">${emptyState({ iconName: "building", title: "No departments yet", text: "Create a department before registering students.", action: isAdmin ? html`<button class="btn btn-primary" data-add>${icon("plus")}Add department</button>` : "" })}</div>`}
    </div>`);

    root.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", async () => {
      const saved = await departmentModal();
      if (saved) { toast(`${saved.code} was created.`); load(); }
    }));
    root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async (e) => {
      e.preventDefault();
      const saved = await departmentModal(items.find((d) => d.id === Number(b.dataset.edit)));
      if (saved) { toast("Department saved."); load(); }
    }));
    root.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async (e) => {
      e.preventDefault();
      if (await deleteDepartment(items.find((d) => d.id === Number(b.dataset.delete)))) load();
    }));
  }

  await load();
}
