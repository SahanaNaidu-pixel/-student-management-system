// Semester results calculated from end-semester marks
import { api, download } from "../api.js";
import { html, mount, raw } from "../html.js";
import { icon } from "../icons.js";
import { pct, formatDate, todayIso } from "../format.js";
import { pageHeader, emptyState, errorState, skeletonTable, gradeBadge, badge, debounce, showError, toast, options } from "../ui.js";
import { setQuery } from "../app.js";

export default async function results({ root, query, setTitle, setCrumbs, isCurrent }) {
  setTitle("Results");
  setCrumbs([{ label: "Results" }]);
  const state = { q: query.get("q") || "", semester: query.get("semester") || "", department: query.get("department") || "", status: query.get("status") || "" };
  const { items: departments } = await api.get("/api/departments");
  if (!isCurrent()) return;

  mount(root, html`<div class="page">
    ${pageHeader({
      title: "Results",
      subtitle: "Totals, percentages and grades from end-semester examinations. A student passes only with at least 35% in every subject.",
      actions: html`<button class="btn btn-secondary" data-print>${icon("print")}Print</button><button class="btn btn-secondary" data-export>${icon("download")}Export CSV</button>`
    })}
    <div class="print-only"><h2>Semester results</h2><p class="muted">Generated ${formatDate(todayIso())}</p></div>
    <div class="kpis" data-stats></div>
    <section class="card">
      <div class="filters">
        <label class="input-icon">${icon("search")}<input type="search" data-q value="${state.q}" placeholder="Search by name or roll number" aria-label="Search"></label>
        <select data-k="semester" aria-label="Semester"><option value="">All semesters</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => html`<option value="${s}" ${String(s) === state.semester ? "selected" : ""}>Semester ${s}</option>`)}</select>
        <select data-k="department" aria-label="Department">${options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}" ${String(o.value) === state.department ? "selected" : ""}>${o.label}</option>`)}</select>
        <select data-k="status" aria-label="Student status"><option value="">All students</option><option value="active" ${state.status === "active" ? "selected" : ""}>Active students</option></select>
      </div>
      <div data-results>${skeletonTable(8, 6)}</div>
    </section>
  </div>`);

  const results = root.querySelector("[data-results]");

  async function load() {
    setQuery(state);
    let data;
    try {
      data = await api.get("/api/results", state);
    } catch (error) {
      showError(error);
      mount(results, errorState(error));
      results.querySelector("[data-retry]").addEventListener("click", load);
      return;
    }
    if (!isCurrent()) return;
    const s = data.stats;
    mount(root.querySelector("[data-stats]"), html`
      <div class="card kpi"><div class="kpi-top"><span>Results</span><span class="kpi-icon">${icon("file")}</span></div><div class="kpi-value">${s.count}</div></div>
      <div class="card kpi"><div class="kpi-top"><span>Average</span><span class="kpi-icon">${icon("trend")}</span></div><div class="kpi-value">${pct(s.average)}</div></div>
      <div class="card kpi"><div class="kpi-top"><span>Passed</span><span class="kpi-icon">${icon("checkCircle")}</span></div><div class="kpi-value">${s.passed}</div><div class="kpi-sub">${s.count ? pct((s.passed / s.count) * 100) : "—"} pass rate</div></div>
      <div class="card kpi"><div class="kpi-top"><span>Failed</span><span class="kpi-icon">${icon("alert")}</span></div><div class="kpi-value">${s.failed}</div></div>`);

    if (!data.items.length) {
      mount(results, emptyState({ iconName: "award", title: "No results found", text: "Results appear once marks for end-semester exams are entered.", action: html`<a class="btn btn-secondary" href="/exams?type=end-semester">Go to examinations</a>` }));
      return;
    }
    // Subject columns are the union of subjects in the filtered results
    const subjects = [...new Map(data.items.flatMap((r) => r.subjects).map((x) => [x.course_code, x.course_name])).entries()].sort();
    mount(results, html`<div class="table-wrap"><table class="table">
      <thead><tr>
        <th>Roll no</th><th>Student</th><th>Dept</th><th>Sem</th>
        ${subjects.map(([code, name]) => html`<th class="right" title="${name}">${code}</th>`)}
        <th class="right">Total</th><th class="right">%</th><th>Grade</th><th>Status</th>
      </tr></thead>
      <tbody>${data.items.map((r) => {
        const bySubject = new Map(r.subjects.map((x) => [x.course_code, x]));
        return html`<tr>
          <td class="mono">${r.roll_no}</td>
          <td class="nowrap"><a class="person" href="/students/${r.student_id}?tab=results"><strong>${r.full_name}</strong></a></td>
          <td><span class="tag">${r.department_code}</span></td>
          <td>${r.semester}</td>
          ${subjects.map(([code]) => {
            const x = bySubject.get(code);
            return html`<td class="right mono" ${x && !x.passed ? raw('style="color:var(--danger);font-weight:700"') : ""}>${x ? x.marks : "—"}</td>`;
          })}
          <td class="right mono"><strong>${r.total}</strong><span class="muted">/${r.max}</span></td>
          <td class="right mono">${pct(r.percentage, 2)}</td>
          <td>${gradeBadge(r.grade)}</td>
          <td>${badge(r.passed ? "pass" : "fail")}</td>
        </tr>`;
      })}</tbody></table></div>`);
  }

  root.querySelector("[data-q]").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); load(); }));
  root.querySelectorAll("[data-k]").forEach((s) => s.addEventListener("change", () => { state[s.dataset.k] = s.value; load(); }));
  root.querySelector("[data-export]").addEventListener("click", () => { download("/api/results/export.csv", state); toast("Your CSV export is downloading.", "info"); });
  root.querySelector("[data-print]").addEventListener("click", () => window.print());
  await load();
}
