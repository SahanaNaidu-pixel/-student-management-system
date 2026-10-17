// Attendance: take a class register, browse records and review per-student summaries
import { api, download } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate, todayIso, shiftDate, pct, num } from "../format.js";
import {
  pageHeader, tabs, bindTabs, table, pagination, bindPagination, badge, progress, emptyState, errorState,
  skeletonTable, toast, showError, confirmDialog, setBusy, avatar, options, debounce
} from "../ui.js";
import { setQuery, navigate } from "../app.js";

const STATUSES = ["present", "late", "absent"];

export default async function attendance({ root, query, isAdmin, setTitle, setCrumbs, isCurrent }) {
  setTitle("Attendance");
  setCrumbs([{ label: "Attendance" }]);
  let active = query.get("tab") || "take";

  const [{ items: courses }, { items: departments }] = await Promise.all([api.get("/api/courses"), api.get("/api/departments")]);
  if (!isCurrent()) return;
  const courseOptions = (placeholder, selected) => options(courses, "id", (c) => `${c.code} · ${c.name}`, placeholder)
    .map((o) => html`<option value="${o.value}" ${String(o.value) === String(selected || "") ? "selected" : ""}>${o.label}</option>`);

  function draw() {
    mount(root, html`<div class="page">
      ${pageHeader({ title: "Attendance", subtitle: "Percentages are calculated from recorded classes. Late counts as attended." })}
      <section class="card">
        ${tabs([
          { key: "take", label: "Take attendance", icon: "check" },
          { key: "records", label: "Records", icon: "file" },
          { key: "summary", label: "Student summary", icon: "report" }
        ], active)}
        <div data-tab-body></div>
      </section>
    </div>`);
    bindTabs(root, (key) => {
      active = key;
      query = new URLSearchParams(key === "take" ? "" : `tab=${key}`);
      setQuery(key === "take" ? {} : { tab: key });
      draw();
    });
    const body = root.querySelector("[data-tab-body]");
    if (active === "records") return records(body);
    if (active === "summary") return summary(body);
    return take(body);
  }

  /* ----- Take attendance ----- */
  function take(body) {
    const state = { course: query.get("course") || "", date: query.get("date") || todayIso() };
    mount(body, html`
      <div class="register-toolbar">
        <div class="field"><label for="reg-course">Course</label><select id="reg-course" data-course>${courseOptions("Select a course", state.course)}</select></div>
        <div class="field" style="max-width:220px"><label for="reg-date">Date</label><input id="reg-date" type="date" data-date value="${state.date}" max="${todayIso()}"></div>
      </div>
      <div data-sheet></div>`);
    const sheetBox = body.querySelector("[data-sheet]");

    async function loadSheet() {
      setQuery({ course: state.course, date: state.date !== todayIso() ? state.date : "" });
      if (!state.course) {
        mount(sheetBox, emptyState({ iconName: "attendance", title: "Choose a course to begin", text: "The register lists every active student enrolled in the course." }));
        return;
      }
      mount(sheetBox, skeletonTable(6, 3));
      let sheet;
      try {
        sheet = await api.get("/api/attendance/sheet", state);
      } catch (error) {
        showError(error);
        mount(sheetBox, errorState(error));
        sheetBox.querySelector("[data-retry]").addEventListener("click", loadSheet);
        return;
      }
      if (!isCurrent()) return;
      if (!sheet.students.length) {
        mount(sheetBox, emptyState({ iconName: "students", title: "No active students are enrolled in this course", action: html`<a class="btn btn-secondary" href="/courses/${state.course}">Open course</a>` }));
        return;
      }
      const statuses = new Map(sheet.students.map((s) => [s.id, s.status || "present"]));

      const counts = () => {
        const c = { present: 0, late: 0, absent: 0 };
        statuses.forEach((v) => c[v]++);
        return c;
      };

      mount(sheetBox, html`
        <div class="register-summary">
          ${sheet.recorded ? badge("Already recorded – saving will update it", "info") : badge("Not yet recorded", "warning")}
          <span data-counts></span>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" data-all="present">${icon("check")}Mark all present</button>
          <button class="btn btn-ghost btn-sm" data-all="absent">${icon("x")}Mark all absent</button>
        </div>
        ${table({
          rows: sheet.students,
          columns: [
            { key: "roll_no", label: "Roll no", render: (s) => html`<span class="mono">${s.roll_no}</span>` },
            { key: "full_name", label: "Student", className: "primary-cell", render: (s) => html`<span class="person">${avatar(s, "sm")}<span class="person-text"><strong>${s.full_name}</strong></span></span>` },
            { key: "status", label: "Status", className: "right", render: (s) => html`<div class="segmented" role="radiogroup" aria-label="Attendance for ${s.full_name}">
              ${STATUSES.map((st) => html`<label><input type="radio" name="st-${s.id}" value="${st}" data-student="${s.id}" ${statuses.get(s.id) === st ? "checked" : ""}><span class="s-${st}">${st[0].toUpperCase() + st.slice(1)}</span></label>`)}
            </div>` }
          ]
        })}
        <footer class="form-actions">
          <span class="muted" style="margin-right:auto">${sheet.course.code} · ${formatDate(sheet.date)}</span>
          <button class="btn btn-primary" data-save>${icon("check")}Save attendance</button>
        </footer>`);
      sheetBox.querySelector("table").classList.add("stack");

      const showCounts = () => {
        const c = counts();
        mount(sheetBox.querySelector("[data-counts]"), html`Present <strong>${c.present}</strong> · Late <strong>${c.late}</strong> · Absent <strong>${c.absent}</strong> · Attendance <strong>${pct(((c.present + c.late) / statuses.size) * 100)}</strong>`);
      };
      showCounts();
      sheetBox.querySelectorAll("input[type=radio]").forEach((r) => r.addEventListener("change", () => {
        statuses.set(Number(r.dataset.student), r.value);
        showCounts();
      }));
      sheetBox.querySelectorAll("[data-all]").forEach((b) => b.addEventListener("click", () => {
        statuses.forEach((_, id) => statuses.set(id, b.dataset.all));
        sheetBox.querySelectorAll(`input[value="${b.dataset.all}"]`).forEach((r) => (r.checked = true));
        showCounts();
      }));
      sheetBox.querySelector("[data-save]").addEventListener("click", async (e) => {
        const button = e.currentTarget;
        setBusy(button, true);
        try {
          const entries = [...statuses].map(([student_id, status]) => ({ student_id, status }));
          const { saved } = await api.post("/api/attendance/sheet", { course_id: Number(state.course), date: state.date, entries });
          toast(`Attendance saved for ${saved} students.`);
          loadSheet();
        } catch (error) {
          showError(error);
          setBusy(button, false);
        }
      });
    }

    body.querySelector("[data-course]").addEventListener("change", (e) => { state.course = e.target.value; loadSheet(); });
    body.querySelector("[data-date]").addEventListener("change", (e) => {
      if (!e.target.value) return;
      if (e.target.value > todayIso()) { toast("Attendance cannot be recorded for a future date.", "error"); e.target.value = state.date; return; }
      state.date = e.target.value;
      loadSheet();
    });
    loadSheet();
  }

  /* ----- Records ----- */
  function records(body) {
    const state = {
      tab: "records",
      from: query.get("from") || shiftDate(todayIso(), -29), to: query.get("to") || todayIso(),
      course: query.get("course") || "", status: query.get("status") || "", student: query.get("student") || "", q: query.get("q") || "",
      page: Number(query.get("page")) || 1, pageSize: 15
    };
    mount(body, html`
      <div class="filters">
        <label class="input-icon">${icon("search")}<input type="search" data-q value="${state.q}" placeholder="Student name or roll number" aria-label="Search student"></label>
        <input type="date" data-k="from" value="${state.from}" aria-label="From date">
        <input type="date" data-k="to" value="${state.to}" aria-label="To date">
        <select data-k="course" aria-label="Course">${courseOptions("All courses", state.course)}</select>
        <select data-k="status" aria-label="Status"><option value="">All statuses</option>${STATUSES.map((s) => html`<option value="${s}" ${s === state.status ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`)}</select>
        ${state.student ? html`<button class="btn btn-ghost" data-clear-student>${icon("x")}One student only</button>` : ""}
        <button class="btn btn-secondary" data-export>${icon("download")}Export CSV</button>
      </div>
      <div data-results>${skeletonTable(8, 5)}</div>`);
    const results = body.querySelector("[data-results]");
    const filters = () => ({ from: state.from, to: state.to, course: state.course, status: state.status, student: state.student, q: state.q });

    async function load() {
      setQuery({ ...filters(), tab: "records", page: state.page > 1 ? state.page : "" });
      let data;
      try {
        data = await api.get("/api/attendance", { ...filters(), page: state.page, pageSize: state.pageSize });
      } catch (error) {
        showError(error);
        mount(results, errorState(error));
        results.querySelector("[data-retry]").addEventListener("click", load);
        return;
      }
      if (!isCurrent()) return;
      if (!data.items.length) {
        mount(results, emptyState({ iconName: "file", title: "No attendance records match these filters", text: "Try widening the date range." }));
        return;
      }
      const t = data.totals;
      const attended = (t.present || 0) + (t.late || 0);
      mount(results, html`
        <div class="register-summary">
          <span>Records <strong>${num(data.total)}</strong></span>
          <span>Present <strong>${num(t.present)}</strong></span><span>Late <strong>${num(t.late)}</strong></span><span>Absent <strong>${num(t.absent)}</strong></span>
          <span>Attendance rate <strong>${pct((attended / data.total) * 100)}</strong></span>
        </div>
        ${table({
          rows: data.items,
          columns: [
            { key: "date", label: "Date", render: (a) => html`<span class="nowrap">${formatDate(a.date)}</span>` },
            { key: "full_name", label: "Student", className: "primary-cell", render: (a) => html`<a class="person" href="/students/${a.student_id}"><span class="person-text"><strong>${a.full_name}</strong><small>${a.roll_no}</small></span></a>` },
            { key: "course_code", label: "Course", render: (a) => html`<span class="tag" title="${a.course_name}">${a.course_code}</span>` },
            { key: "status", label: "Status", render: (a) => badge(a.status) },
            { key: "recorded_by", label: "Recorded by", render: (a) => a.recorded_by || "—" },
            ...(isAdmin ? [{ key: "actions", label: "", className: "right", render: (a) => html`<button class="icon-btn sm danger" data-delete="${a.id}" aria-label="Delete record" data-tip="Delete">${icon("trash")}</button>` }] : [])
          ]
        })}
        ${pagination(data)}`);
      results.querySelector("table").classList.add("stack");
      bindPagination(results, { onPage: (p) => { state.page = p; load(); }, onPageSize: (n) => { state.pageSize = n; state.page = 1; load(); } });
      results.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Delete attendance record?", message: "This single attendance entry will be permanently removed and percentages will be recalculated.", confirmText: "Delete", danger: true });
        if (!ok) return;
        try {
          await api.del(`/api/attendance/${b.dataset.delete}`);
          toast("Attendance record deleted.");
          load();
        } catch (error) {
          showError(error);
        }
      }));
    }

    body.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => {
      state[el.dataset.k] = el.value;
      state.page = 1;
      load();
    }));
    body.querySelector("[data-q]").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
    body.querySelector("[data-clear-student]")?.addEventListener("click", (e) => { state.student = ""; e.currentTarget.remove(); load(); });
    body.querySelector("[data-export]").addEventListener("click", () => { download("/api/attendance/export.csv", filters()); toast("Your CSV export is downloading.", "info"); });
    load();
  }

  /* ----- Summary ----- */
  function summary(body) {
    const state = { from: query.get("from") || "", to: query.get("to") || "", course: query.get("course") || "", department: query.get("department") || "", low: query.get("low") === "1" };
    mount(body, html`
      <div class="filters">
        <span class="filter-label">From</span><input type="date" data-k="from" value="${state.from}" aria-label="From date">
        <span class="filter-label">To</span><input type="date" data-k="to" value="${state.to}" aria-label="To date">
        <select data-k="course" aria-label="Course">${courseOptions("All courses", state.course)}</select>
        <select data-k="department" aria-label="Department">${options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}" ${String(o.value) === state.department ? "selected" : ""}>${o.label}</option>`)}</select>
        <label class="filter-label" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-low ${state.low ? "checked" : ""}>Below threshold only</label>
        <button class="btn btn-secondary" data-export>${icon("download")}Export CSV</button>
      </div>
      <div data-results>${skeletonTable(8, 6)}</div>`);
    const results = body.querySelector("[data-results]");
    const filters = () => ({ from: state.from, to: state.to, course: state.course, department: state.department });

    async function load() {
      setQuery({ tab: "summary", ...filters(), low: state.low ? 1 : "" });
      let data;
      try {
        data = await api.get("/api/attendance/summary", filters());
      } catch (error) {
        showError(error);
        mount(results, errorState(error));
        results.querySelector("[data-retry]").addEventListener("click", load);
        return;
      }
      if (!isCurrent()) return;
      const below = data.items.filter((s) => s.attendance_pct < data.threshold);
      const rows = state.low ? below : data.items;
      mount(results, html`
        <div class="register-summary">
          <span>Students <strong>${data.items.length}</strong></span>
          <span>Below ${data.threshold}% <strong style="color:var(--danger)">${below.length}</strong></span>
          <span class="muted">Sorted from lowest attendance</span>
        </div>
        ${rows.length ? table({
          rows,
          rowLink: (s) => `/students/${s.student_id}`,
          columns: [
            { key: "full_name", label: "Student", className: "primary-cell", render: (s) => html`<a class="person" href="/students/${s.student_id}"><span class="person-text"><strong>${s.full_name}</strong><small>${s.roll_no}</small></span></a>` },
            { key: "classes", label: "Classes" },
            { key: "present", label: "Present" },
            { key: "late", label: "Late" },
            { key: "absent", label: "Absent" },
            { key: "attendance_pct", label: "Attendance", render: (s) => progress(s.attendance_pct, data.threshold) }
          ]
        }) : emptyState({ iconName: "checkCircle", title: state.low ? "Every student is above the threshold" : "No attendance records for these filters" })}`);
      results.querySelector("table")?.classList.add("stack");
      results.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("a")) navigate(tr.dataset.href); }));
    }

    body.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => { state[el.dataset.k] = el.value; load(); }));
    body.querySelector("[data-low]").addEventListener("change", (e) => { state.low = e.target.checked; load(); });
    body.querySelector("[data-export]").addEventListener("click", () => { download("/api/reports/attendance-summary.csv", filters()); toast("Your CSV export is downloading.", "info"); });
    load();
  }

  draw();
}
