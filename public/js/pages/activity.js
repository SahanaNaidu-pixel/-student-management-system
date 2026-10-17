// Full audit trail of changes
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { formatDate, timeAgo, label } from "../format.js";
import { pageHeader, table, pagination, bindPagination, emptyState, badge } from "../ui.js";

const TONES = { create: "success", import: "success", update: "info", delete: "danger", attendance: "gold", marks: "gold", seed: "neutral" };

export default async function activity({ root, setTitle, setCrumbs, isCurrent }) {
  setTitle("Activity log");
  setCrumbs([{ label: "Activity log" }]);
  const state = { page: 1, pageSize: 25 };

  async function load() {
    const data = await api.get("/api/activity", state);
    if (!isCurrent()) return;
    mount(root, html`<div class="page">
      ${pageHeader({ title: "Activity log", subtitle: "Every change made through the system, newest first." })}
      <section class="card">${data.items.length ? html`${table({
        rows: data.items,
        columns: [
          { key: "created_at", label: "When", render: (a) => html`<span class="nowrap" title="${formatDate(a.created_at)}">${timeAgo(a.created_at)}</span>` },
          { key: "action", label: "Action", render: (a) => badge(label(a.action), TONES[a.action]) },
          { key: "summary", label: "Details", className: "primary-cell" },
          { key: "user_name", label: "By", render: (a) => a.user_name || "System" }
        ]
      })}${pagination(data)}` : emptyState({ iconName: "activity", title: "No activity yet" })}</section>
    </div>`);
    root.querySelector("table")?.classList.add("stack");
    bindPagination(root, { onPage: (p) => { state.page = p; load(); }, onPageSize: (n) => { state.pageSize = n; state.page = 1; load(); } });
  }
  await load();
}
