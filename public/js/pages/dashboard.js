// Dashboard: live figures, charts and recent activity from the database
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { barChart, lineChart, donutChart, hBars } from "../charts.js";
import { formatShortDate, formatMonth, formatDate, timeAgo, daysUntil, pct, num, greeting, todayIso, shiftDate, label } from "../format.js";
import { avatar, badge, emptyState, errorState, showError, toast } from "../ui.js";
import { setQuery } from "../app.js";

const PRESETS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["custom", "Custom range"]];
const GRADE_ORDER = ["O", "A+", "A", "B+", "B", "C", "F"];
const GRADE_COLORS = { O: "var(--chart-2)", "A+": "var(--chart-2)", A: "var(--chart-1)", "B+": "var(--chart-1)", B: "var(--chart-3)", C: "var(--chart-3)", F: "var(--danger)" };

export default async function dashboard({ root, user, query, setTitle, setCrumbs, isCurrent }) {
  setTitle("Dashboard");
  setCrumbs([{ label: "Dashboard" }]);

  const range = {
    preset: query.get("range") || "30",
    from: query.get("from") || "",
    to: query.get("to") || ""
  };

  function resolvedRange() {
    if (range.preset === "custom" && range.from && range.to) return { from: range.from, to: range.to };
    const to = todayIso();
    return { from: shiftDate(to, -(Number(range.preset) || 30) + 1), to };
  }

  async function load() {
    const { from, to } = resolvedRange();
    setQuery(range.preset === "custom" ? { range: "custom", from, to } : range.preset !== "30" ? { range: range.preset } : {});
    let data;
    try {
      data = await api.get("/api/dashboard", { from, to });
    } catch (error) {
      if (!isCurrent()) return;
      showError(error);
      mount(root, errorState(error));
      root.querySelector("[data-retry]").addEventListener("click", load);
      return;
    }
    if (isCurrent()) draw(data);
  }

  function draw(d) {
    const att = d.attendance;
    const delta = att.current.pct !== null && att.previous.pct !== null ? Math.round((att.current.pct - att.previous.pct) * 10) / 10 : null;
    const deptTotal = d.departments.reduce((s, x) => s + x.count, 0);

    mount(root, html`<div class="page">
      <section class="hero">
        <div>
          <p class="eyebrow">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1>${greeting()}, ${user.full_name}</h1>
          <p>Here is how your institution is doing between ${formatDate(d.range.from)} and ${formatDate(d.range.to)}.</p>
        </div>
        <div class="hero-actions">
          <a class="btn btn-gold" href="/students/new">${icon("plus")}Add student</a>
          <a class="btn btn-secondary" href="/attendance">${icon("attendance")}Take attendance</a>
          <a class="btn btn-secondary" href="/courses">${icon("book")}Manage courses</a>
          <a class="btn btn-secondary" href="/reports">${icon("report")}Generate reports</a>
        </div>
      </section>

      <div class="card filters" style="border-radius:var(--radius-lg)">
        <span class="filter-label">${icon("calendar")} Reporting period</span>
        <select data-preset aria-label="Reporting period">
          ${PRESETS.map(([v, l]) => html`<option value="${v}" ${v === range.preset ? "selected" : ""}>${l}</option>`)}
        </select>
        <input type="date" data-from value="${d.range.from}" max="${todayIso()}" aria-label="From date" ${range.preset !== "custom" ? "disabled" : ""}>
        <input type="date" data-to value="${d.range.to}" max="${todayIso()}" aria-label="To date" ${range.preset !== "custom" ? "disabled" : ""}>
        <span class="muted">${num(att.current.records)} attendance records in this period</span>
      </div>

      <div class="kpis">
        ${kpi("Total students", num(d.counts.students), "students", html`<span>${num(d.counts.active_students)} active</span>
          ${d.counts.new_students ? html`<span class="delta up">${icon("arrowUp")}${d.counts.new_students} new</span>` : ""}`, "/students")}
        ${kpi("Faculty members", num(d.counts.faculty), "faculty", html`<span>Across ${d.counts.departments} departments</span>`, "/faculty")}
        ${kpi("Courses", num(d.counts.courses), "book", html`<span>${d.counts.departments} departments</span>`, "/courses")}
        ${kpi("Attendance", pct(att.current.pct), "attendance", html`
          ${delta !== null ? html`<span class="delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}">${icon(delta >= 0 ? "arrowUp" : "arrowDown")}${Math.abs(delta)} pts</span><span>vs previous period</span>` : html`<span>No earlier data to compare</span>`}`, "/attendance?tab=summary")}
        ${kpi("Average result", pct(d.academics.average), "award", html`<span>Pass rate ${pct(d.academics.passRate)}</span>`, "/results")}
      </div>

      ${att.lowCount ? html`<div class="alert alert-warning">${icon("warning")}
        <div><strong>${att.lowCount} student${att.lowCount > 1 ? "s are" : " is"} below ${att.threshold}% attendance</strong> in this period.
        <a class="card-link" href="/attendance?tab=summary">Review attendance ${icon("chevronRight")}</a></div></div>` : ""}

      <div class="grid grid-2-1">
        <section class="card">
          <header class="card-header"><div><h2>Attendance trend</h2><p>Daily attendance rate across all courses</p></div></header>
          <div class="card-body">${lineChart(att.trend.map((t) => ({ label: formatShortDate(t.date), value: t.pct, title: `${formatDate(t.date)}: ${pct(t.pct)} of ${t.records} records` })), { unit: "%", ariaLabel: "Daily attendance percentage" })}</div>
        </section>
        <section class="card">
          <header class="card-header"><div><h2>Students by department</h2><p>All enrolled students</p></div></header>
          <div class="card-body">${donutChart(d.departments.filter((x) => x.count).map((x) => ({ label: x.code, value: x.count })), { centerValue: String(deptTotal), centerLabel: "Students", ariaLabel: "Students per department" })}</div>
        </section>
      </div>

      <div class="grid grid-2">
        <section class="card">
          <header class="card-header"><div><h2>Enrollment by intake</h2><p>Students by month of enrollment</p></div></header>
          <div class="card-body">${barChart(d.enrollmentTrend.map((e) => ({ label: formatMonth(e.month), value: e.count, title: `${formatMonth(e.month)}: ${e.count} students` })), { ariaLabel: "Students by enrollment month" })}</div>
        </section>
        <section class="card">
          <header class="card-header"><div><h2>Grade distribution</h2><p>${d.academics.results} semester results · end-semester exams</p></div><a class="card-link" href="/results">View results ${icon("chevronRight")}</a></header>
          <div class="card-body">${barChart(GRADE_ORDER.filter((g) => d.academics.grades[g]).map((g) => ({ label: g, value: d.academics.grades[g], color: GRADE_COLORS[g], title: `Grade ${g}: ${d.academics.grades[g]} results` })), { ariaLabel: "Number of results per grade" })}</div>
        </section>
      </div>

      <div class="grid grid-3">
        <section class="card">
          <header class="card-header"><div><h2>Upcoming examinations</h2><p>Next scheduled exams</p></div><a class="card-link" href="/exams?when=upcoming">All ${icon("chevronRight")}</a></header>
          <div class="card-body">${d.upcomingExams.length ? html`<ul class="list">${d.upcomingExams.map((e) => {
            const days = daysUntil(e.exam_date);
            return html`<li class="list-item">
              <span class="date-chip"><strong>${new Date(e.exam_date + "T00:00:00").getDate()}</strong><small>${new Date(e.exam_date + "T00:00:00").toLocaleString("en", { month: "short" })}</small></span>
              <div class="grow"><a class="person" href="/exams/${e.id}"><span class="person-text"><strong>${e.course_name}</strong><small>${e.course_code} · ${label(e.exam_type)} · ${e.max_marks} marks</small></span></a></div>
              <span class="badge ${days <= 7 ? "badge-warning" : "badge-neutral"}">${days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</span>
            </li>`;
          })}</ul>` : emptyState({ iconName: "calendar", title: "No upcoming exams", text: "Scheduled examinations will appear here.", action: html`<a class="btn btn-secondary btn-sm" href="/exams">Schedule an exam</a>` })}</div>
        </section>

        <section class="card">
          <header class="card-header"><div><h2>Recent registrations</h2><p>Newest student records</p></div><a class="card-link" href="/students?sort=enrollment_date&dir=desc">All ${icon("chevronRight")}</a></header>
          <div class="card-body">${d.recentStudents.length ? html`<ul class="list">${d.recentStudents.map((s) => html`<li class="list-item">
            <a class="person grow" href="/students/${s.id}">${avatar(s)}<span class="person-text"><strong>${s.full_name}</strong><small>${s.roll_no} · ${s.department_code} · ${timeAgo(s.created_at)}</small></span></a>
            ${badge(s.status)}
          </li>`)}</ul>` : emptyState({ iconName: "students", title: "No students yet", action: html`<a class="btn btn-primary btn-sm" href="/students/new">Add the first student</a>` })}</div>
        </section>

        <section class="card">
          <header class="card-header"><div><h2>Recent activity</h2><p>Latest changes to the database</p></div><a class="card-link" href="/activity">All ${icon("chevronRight")}</a></header>
          <div class="card-body">${d.recentActivity.length ? html`<ul class="timeline">${d.recentActivity.map((a) => html`<li>
            <p>${a.summary}</p><small>${a.user_name || "System"} · ${timeAgo(a.created_at)}</small>
          </li>`)}</ul>` : emptyState({ iconName: "activity", title: "No activity yet" })}</div>
        </section>
      </div>

      <section class="card">
        <header class="card-header"><div><h2>Top performers</h2><p>Highest semester percentages from end-semester exams</p></div></header>
        <div class="card-body">${d.academics.topPerformers.length
          ? hBars(d.academics.topPerformers.map((t, i) => ({ label: `${t.full_name} · ${t.department_code}`, value: t.percentage, color: i === 0 ? "var(--chart-2)" : "var(--chart-1)" })), { max: 100, unit: "%" })
          : emptyState({ iconName: "award", title: "No results yet", text: "Enter end-semester marks to see top performers." })}</div>
      </section>
    </div>`);

    const preset = root.querySelector("[data-preset]");
    const from = root.querySelector("[data-from]");
    const to = root.querySelector("[data-to]");
    preset.addEventListener("change", () => {
      range.preset = preset.value;
      if (range.preset === "custom") {
        from.disabled = to.disabled = false;
        range.from = from.value;
        range.to = to.value;
        from.focus();
        return;
      }
      load();
    });
    const onDate = () => {
      if (!from.value || !to.value) return;
      if (from.value > to.value) return toast("The start date must be before the end date.", "error");
      range.from = from.value;
      range.to = to.value;
      load();
    };
    from.addEventListener("change", onDate);
    to.addEventListener("change", onDate);
  }

  await load();
}

function kpi(title, value, iconName, sub, href) {
  return html`<a class="card kpi" href="${href}" style="text-decoration:none;color:inherit">
    <div class="kpi-top"><span>${title}</span><span class="kpi-icon">${icon(iconName)}</span></div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </a>`;
}
