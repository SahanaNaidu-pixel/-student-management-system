// Reusable UI components: toasts, modals, confirmations, forms, tables, pagination, states
import { html, raw, mount, escapeHtml } from "./html.js";
import { icon } from "./icons.js";
import { initials, pct, label, todayIso } from "./format.js";
import { ApiError } from "./api.js";

/* ---------- Toasts ---------- */

export function toast(message, type = "success") {
  let region = document.getElementById("toasts");
  if (!region) {
    region = document.createElement("div");
    region.id = "toasts";
    region.className = "toasts";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const iconName = { success: "checkCircle", error: "alert", warning: "warning", info: "info" }[type] || "info";
  mount(el, html`${icon(iconName)}<span>${message}</span><button class="toast-close" aria-label="Dismiss">${icon("x")}</button>`);
  region.appendChild(el);
  const close = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector(".toast-close").addEventListener("click", close);
  setTimeout(close, type === "error" ? 7000 : 4000);
}

// Shows an API error as a toast; returns the error's field messages if any
export function showError(error, fallback = "Something went wrong.") {
  const message = error instanceof ApiError ? error.message : fallback;
  if (!(error instanceof ApiError)) console.error(error);
  toast(message, "error");
  return error?.fields || null;
}

/* ---------- Modals ---------- */

let openModals = 0;

// Opens a dialog. `render(body, close)` fills it. Resolves with the value passed to close().
export function modal({ title, size = "md", render }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const titleId = `modal-title-${Date.now()}`;
    mount(backdrop, html`
      <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <header class="modal-header">
          <h2 id="${titleId}">${title}</h2>
          <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
        </header>
        <div class="modal-body"></div>
      </div>`);
    document.body.appendChild(backdrop);
    document.body.classList.add("modal-open");
    openModals++;

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      backdrop.classList.add("leaving");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => {
        backdrop.remove();
        if (--openModals === 0) document.body.classList.remove("modal-open");
        previousFocus?.focus?.();
      }, 160);
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(undefined); }
      if (e.key === "Tab") trapFocus(e, backdrop.querySelector(".modal"));
    };
    document.addEventListener("keydown", onKey, true);
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(undefined); });
    backdrop.querySelector("[data-close]").addEventListener("click", () => close(undefined));

    render(backdrop.querySelector(".modal-body"), close);
    const focusable = backdrop.querySelector(".modal-body [autofocus], .modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea, .modal-body button");
    (focusable || backdrop.querySelector("[data-close]")).focus();
  });
}

function trapFocus(event, container) {
  const items = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

// Custom confirmation dialog. Resolves true when confirmed.
export function confirmDialog({ title, message, confirmText = "Confirm", danger = false }) {
  return modal({
    title,
    size: "sm",
    render(body, close) {
      mount(body, html`
        <div class="confirm">
          <div class="confirm-icon ${danger ? "danger" : ""}">${icon(danger ? "warning" : "info")}</div>
          <p>${message}</p>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-ghost" data-cancel>Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${confirmText}</button>
        </footer>`);
      body.querySelector("[data-cancel]").addEventListener("click", () => close(false));
      body.querySelector("[data-ok]").addEventListener("click", () => close(true));
      setTimeout(() => body.querySelector("[data-cancel]").focus());
    }
  }).then(Boolean);
}

// A modal containing a form. `onSubmit(values)` may throw an ApiError to show field errors.
export function formModal({ title, size = "md", fields, submitText = "Save", onSubmit, validate }) {
  return modal({
    title,
    size,
    render(body, close) {
      mount(body, html`
        <form class="form" novalidate>
          <div class="form-grid">${fields}</div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
            <button type="submit" class="btn btn-primary">${submitText}</button>
          </footer>
        </form>`);
      const form = body.querySelector("form");
      body.querySelector("[data-cancel]").addEventListener("click", () => close(undefined));
      bindForm(form, { validate, onSubmit: async (values) => close(await onSubmit(values)) });
    }
  });
}

/* ---------- Forms ---------- */

export function field({ name, label: text, type = "text", value = "", required = false, options, placeholder = "", hint = "", attrs = "", full = false, autofocus = false }) {
  const id = `f-${name}`;
  const req = required ? raw(" required") : "";
  const auto = autofocus ? raw(" autofocus") : "";
  let control;
  if (type === "select") {
    control = html`<select id="${id}" name="${name}"${req}${auto} ${raw(attrs)}>
      ${options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value ?? "") ? raw("selected") : ""}>${o.label}</option>`)}
    </select>`;
  } else if (type === "textarea") {
    control = html`<textarea id="${id}" name="${name}" rows="3" placeholder="${placeholder}"${req}${auto} ${raw(attrs)}>${value ?? ""}</textarea>`;
  } else {
    control = html`<input id="${id}" name="${name}" type="${type}" value="${value ?? ""}" placeholder="${placeholder}"${req}${auto} ${raw(attrs)}>`;
  }
  return html`
    <div class="field ${full ? "field-full" : ""}" data-field="${name}">
      <label for="${id}">${text}${required ? html`<span class="req" aria-hidden="true">*</span>` : ""}</label>
      ${control}
      ${hint ? html`<p class="hint">${hint}</p>` : ""}
      <p class="field-error" id="${id}-error" role="alert"></p>
    </div>`;
}

export function formValues(form) {
  const values = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === "checkbox") values[el.name] = el.checked;
    else values[el.name] = el.value.trim();
  }
  return values;
}

export function setFieldErrors(form, errors) {
  form.querySelectorAll(".field.has-error").forEach((f) => {
    f.classList.remove("has-error");
    f.querySelector(".field-error").textContent = "";
    f.querySelector("input, select, textarea")?.removeAttribute("aria-invalid");
  });
  let first = null;
  for (const [name, message] of Object.entries(errors || {})) {
    const wrapper = form.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!wrapper) continue;
    wrapper.classList.add("has-error");
    wrapper.querySelector(".field-error").textContent = message;
    const control = wrapper.querySelector("input, select, textarea");
    control?.setAttribute("aria-invalid", "true");
    control?.setAttribute("aria-describedby", wrapper.querySelector(".field-error").id);
    first ||= control;
  }
  first?.focus();
  return Boolean(first);
}

// Wires submit handling: client validation, busy state, server field errors
export function bindForm(form, { validate, onSubmit }) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(form);
    const clientErrors = validate ? validate(values) : null;
    if (clientErrors && Object.keys(clientErrors).length) {
      setFieldErrors(form, clientErrors);
      return;
    }
    setFieldErrors(form, {});
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true);
    try {
      await onSubmit(values);
    } catch (error) {
      const fields = showError(error);
      if (fields) setFieldErrors(form, fields);
    } finally {
      setBusy(button, false);
    }
  });
}

export function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.setAttribute("aria-busy", String(busy));
}

// Common client-side checks mirroring the server rules
export const checks = {
  required: (v) => (v ? null : "This field is required"),
  email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Enter a valid email address"),
  phone: (v) => (!v || /^\+?\d{10,15}$/.test(v.replace(/[\s-]/g, "")) ? null : "Enter a 10–15 digit phone number"),
  notFuture: (v) => (!v || v <= todayIso() ? null : "Date cannot be in the future")
};

export function runChecks(values, rules) {
  const errors = {};
  for (const [name, fns] of Object.entries(rules)) {
    for (const fn of fns) {
      const message = fn(values[name], values);
      if (message) { errors[name] = message; break; }
    }
  }
  return errors;
}

/* ---------- Display helpers ---------- */

const STATUS_TONES = {
  active: "success", present: "success", pass: "success", graduated: "info",
  inactive: "neutral", late: "warning", suspended: "danger", absent: "danger", fail: "danger"
};

export const badge = (text, tone) => html`<span class="badge badge-${tone || STATUS_TONES[String(text).toLowerCase()] || "neutral"}">${label(text)}</span>`;

export function gradeBadge(grade) {
  const tone = grade === "F" ? "danger" : grade === "O" || grade === "A+" ? "gold" : grade === "A" || grade === "B+" ? "success" : "neutral";
  return html`<span class="grade grade-${tone}">${grade ?? "—"}</span>`;
}

export function avatar(person, size = "md") {
  const name = person.full_name || person.name || "";
  if (person.has_photo && person.id && person.roll_no !== undefined) {
    return html`<img class="avatar avatar-${size}" src="/api/students/${person.id}/photo?v=${person.photo_version || ""}" alt="" loading="lazy">`;
  }
  return html`<span class="avatar avatar-${size}" aria-hidden="true">${initials(name)}</span>`;
}

export function progress(value, threshold = 75) {
  if (value === null || value === undefined) return html`<span class="muted">No records</span>`;
  const tone = value < threshold ? "danger" : value < 85 ? "warning" : "success";
  return html`<div class="meter meter-${tone}" title="${pct(value)}">
    <div class="meter-track"><div class="meter-fill" style="width:${Math.max(0, Math.min(100, value))}%"></div></div>
    <span>${pct(value)}</span>
  </div>`;
}

export function emptyState({ iconName = "compass", title, text = "", action = "" }) {
  return html`<div class="empty">
    <div class="empty-icon">${icon(iconName)}</div>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ""}
    ${action}
  </div>`;
}

export function errorState(error, retryLabel = "Try again") {
  return emptyState({
    iconName: "alert",
    title: "Could not load this page",
    text: error?.message || "Something went wrong.",
    action: html`<button class="btn btn-secondary" data-retry>${icon("refresh")}${retryLabel}</button>`
  });
}

export function skeletonTable(rows = 6, cols = 5) {
  return html`<div class="card"><div class="skeleton-table">
    ${Array.from({ length: rows }, () => html`<div class="skeleton-row">${Array.from({ length: cols }, () => html`<span class="skeleton"></span>`)}</div>`)}
  </div></div>`;
}

export function skeletonPage() {
  return html`<div class="page">
    <div class="page-header"><div><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-text"></span></div></div>
    <div class="kpis">${Array.from({ length: 4 }, () => html`<div class="card kpi"><span class="skeleton skeleton-text"></span><span class="skeleton skeleton-title"></span></div>`)}</div>
    ${skeletonTable()}
  </div>`;
}

export function pageHeader({ title, subtitle = "", actions = "" }) {
  return html`<header class="page-header">
    <div>
      <h1>${title}</h1>
      ${subtitle ? html`<p class="subtitle">${subtitle}</p>` : ""}
    </div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

/* ---------- Tables ---------- */

// columns: [{ key, label, sortable, render(row), className }]
export function table({ columns, rows, sort, rowLink, caption = "" }) {
  const sortIcon = (key) => {
    if (!sort || sort.key !== key) return icon("sort", "sort-icon");
    return icon(sort.dir === "desc" ? "arrowDown" : "arrowUp", "sort-icon active");
  };
  return html`<div class="table-wrap">
    <table class="table">
      ${caption ? html`<caption class="sr-only">${caption}</caption>` : ""}
      <thead><tr>
        ${columns.map((c) => c.sortable
          ? html`<th class="${c.className || ""}" aria-sort="${sort?.key === c.key ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}">
              <button class="th-sort" data-sort="${c.key}">${c.label}${sortIcon(c.key)}</button></th>`
          : html`<th class="${c.className || ""}">${c.label}</th>`)}
      </tr></thead>
      <tbody>
        ${rows.map((row) => html`<tr ${rowLink ? raw(`data-href="${escapeHtml(rowLink(row))}" class="clickable"`) : ""}>
          ${columns.map((c) => html`<td class="${c.className || ""}" data-label="${c.label}">${c.render ? c.render(row) : row[c.key] ?? "—"}</td>`)}
        </tr>`)}
      </tbody>
    </table>
  </div>`;
}

// Hooks up sort headers and clickable rows inside a container
export function bindTable(container, { onSort, navigate } = {}) {
  container.querySelectorAll("[data-sort]").forEach((btn) => btn.addEventListener("click", () => onSort?.(btn.dataset.sort)));
  container.querySelectorAll("tr[data-href]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, button, input, select, label")) return;
      navigate?.(tr.dataset.href);
    });
  });
}

export function pagination({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);
  return html`<nav class="pagination" aria-label="Pagination">
    <p class="muted">Showing <strong>${from}–${to}</strong> of <strong>${total}</strong></p>
    <div class="pager">
      <label class="page-size">Rows
        <select data-page-size aria-label="Rows per page">
          ${[10, 25, 50].map((n) => html`<option value="${n}" ${n === pageSize ? raw("selected") : ""}>${n}</option>`)}
        </select>
      </label>
      <button class="icon-btn" data-page="${page - 1}" ${page <= 1 ? raw("disabled") : ""} aria-label="Previous page">${icon("chevronLeft")}</button>
      ${nums.map((p) => html`<button class="page-btn ${p === page ? "active" : ""}" data-page="${p}" ${p === page ? raw('aria-current="page"') : ""}>${p}</button>`)}
      <button class="icon-btn" data-page="${page + 1}" ${page >= pages ? raw("disabled") : ""} aria-label="Next page">${icon("chevronRight")}</button>
    </div>
  </nav>`;
}

export function bindPagination(container, { onPage, onPageSize }) {
  container.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => onPage(Number(b.dataset.page))));
  container.querySelector("[data-page-size]")?.addEventListener("change", (e) => onPageSize(Number(e.target.value)));
}

/* ---------- Tabs ---------- */

export function tabs(items, active) {
  return html`<div class="tabs" role="tablist">
    ${items.map((t) => html`<button class="tab ${t.key === active ? "active" : ""}" role="tab" aria-selected="${t.key === active}" data-tab="${t.key}">
      ${t.icon ? icon(t.icon) : ""}${t.label}${t.count !== undefined ? html`<span class="tab-count">${t.count}</span>` : ""}
    </button>`)}
  </div>`;
}

export function bindTabs(container, onChange) {
  const list = container.querySelector(".tabs");
  const buttons = [...list.querySelectorAll("[data-tab]")];
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => onChange(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
      next.focus();
      next.click();
    });
  });
}

/* ---------- Misc ---------- */

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const options = (items, valueKey, labelFn, placeholder) => [
  ...(placeholder !== undefined ? [{ value: "", label: placeholder }] : []),
  ...items.map((i) => ({ value: i[valueKey], label: labelFn(i) }))
];

// Reads a file chosen in an <input type=file>
export function readFile(file, as = "dataURL") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    if (as === "text") reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}
