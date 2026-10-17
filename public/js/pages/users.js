// User accounts (administrators only; also enforced by the server)
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate, timeAgo, label } from "../format.js";
import { pageHeader, table, field, formModal, confirmDialog, toast, showError, badge, avatar, runChecks, checks } from "../ui.js";

const passwordCheck = (required) => (v) => {
  if (!v) return required ? "This field is required" : null;
  if (v.length < 8) return "Use at least 8 characters";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Use both letters and numbers";
  return null;
};

export default async function users({ root, user: me, setTitle, setCrumbs, isCurrent }) {
  setTitle("User accounts");
  setCrumbs([{ label: "User accounts" }]);

  function userModal(existing) {
    const u = existing || { role: "staff", is_active: 1 };
    return formModal({
      title: existing ? `Edit ${u.username}` : "Create user account",
      submitText: existing ? "Save changes" : "Create account",
      fields: html`
        ${field({ name: "full_name", label: "Full name", value: u.full_name, required: true })}
        ${existing ? field({ name: "username_display", label: "Username", value: u.username, attrs: "disabled" }) : field({ name: "username", label: "Username", value: u.username, required: true, attrs: 'autocomplete="off" autocapitalize="none"' })}
        ${field({ name: "role", label: "Role", type: "select", value: u.role, required: true, options: [{ value: "staff", label: "Staff – manage students, attendance and marks" }, { value: "admin", label: "Administrator – full access" }] })}
        ${field({ name: "password", label: existing ? "New password" : "Password", type: "password", required: !existing, hint: existing ? "Leave blank to keep the current password." : "At least 8 characters with letters and numbers.", attrs: 'autocomplete="new-password"' })}
        ${existing ? html`<div class="field field-full"><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="is_active" ${u.is_active ? "checked" : ""} ${u.id === me.id ? "disabled" : ""}>Account is active</label>
          <p class="hint">Inactive accounts cannot sign in. Changing role, status or password signs the user out.</p></div>` : ""}`,
      validate: (v) => runChecks(v, {
        full_name: [checks.required],
        ...(existing ? {} : { username: [checks.required, (x) => (/^[a-zA-Z0-9._-]{3,30}$/.test(x) ? null : "3–30 letters, numbers, dot, dash or underscore")] }),
        password: [passwordCheck(!existing)]
      }),
      onSubmit: (v) => {
        if (!existing) return api.post("/api/users", v);
        return api.put(`/api/users/${u.id}`, { full_name: v.full_name, role: v.role, password: v.password || undefined, is_active: u.id === me.id ? true : v.is_active });
      }
    });
  }

  async function load() {
    const { items } = await api.get("/api/users");
    if (!isCurrent()) return;
    mount(root, html`<div class="page">
      ${pageHeader({
        title: "User accounts",
        subtitle: "Administrators have full access. Staff can manage students, attendance and marks but cannot delete records or change setup.",
        actions: html`<button class="btn btn-primary" data-add>${icon("plus")}Create account</button>`
      })}
      <section class="card">${table({
        rows: items,
        columns: [
          { key: "full_name", label: "User", className: "primary-cell", render: (u) => html`<span class="person">${avatar(u)}<span class="person-text"><strong>${u.full_name}${u.id === me.id ? " (you)" : ""}</strong><small>${u.username}</small></span></span>` },
          { key: "role", label: "Role", render: (u) => badge(label(u.role), u.role === "admin" ? "gold" : "info") },
          { key: "is_active", label: "Status", render: (u) => badge(u.is_active ? "active" : "inactive") },
          { key: "last_login_at", label: "Last sign-in", render: (u) => (u.last_login_at ? timeAgo(u.last_login_at) : html`<span class="muted">Never</span>`) },
          { key: "created_at", label: "Created", render: (u) => formatDate(u.created_at) },
          { key: "actions", label: "Actions", className: "right", render: (u) => html`<div class="row-actions">
            <button class="icon-btn sm" data-edit="${u.id}" aria-label="Edit ${u.username}" data-tip="Edit">${icon("edit")}</button>
            ${u.id !== me.id ? html`<button class="icon-btn sm danger" data-delete="${u.id}" aria-label="Delete ${u.username}" data-tip="Delete">${icon("trash")}</button>` : ""}
          </div>` }
        ]
      })}</section>
    </div>`);
    root.querySelector("table").classList.add("stack");

    root.querySelector("[data-add]").addEventListener("click", async () => {
      const saved = await userModal();
      if (saved) { toast(`Account ${saved.username} was created.`); load(); }
    });
    root.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      if (await userModal(items.find((u) => u.id === Number(b.dataset.edit)))) { toast("Account saved."); load(); }
    }));
    root.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      const u = items.find((x) => x.id === Number(b.dataset.delete));
      const ok = await confirmDialog({ title: `Delete ${u.username}?`, message: `${u.full_name}'s account will be permanently deleted. Records they created are kept.`, confirmText: "Delete account", danger: true });
      if (!ok) return;
      try {
        await api.del(`/api/users/${u.id}`);
        toast("Account deleted.");
        load();
      } catch (error) {
        showError(error);
      }
    }));
  }
  await load();
}
