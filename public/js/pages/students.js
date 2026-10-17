// Student directory: search, filters, sorting, pagination, CSV import/export
import { api, download } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { label } from "../format.js";
import {
  pageHeader, table, bindTable, pagination, bindPagination, avatar, badge, progress, emptyState, errorState,
  skeletonTable, debounce, confirmDialog, toast, showError, modal, readFile, setBusy, options
} from "../ui.js";
import { navigate, setQuery } from "../app.js";

const STATUSES = ["active", "inactive", "graduated", "suspended"];

export default async function students({ root, query, isAdmin, setTitle, setCrumbs, isCurrent }) {
  setTitle("Students");
  setCrumbs([{ label: "Students" }]);

  const state = {
    q: query.get("q") || "",
    department: query.get("department") || "",
    course: query.get("course") || "",
    semester: query.get("semester") || "",
    status: query.get("status") || "",
    sort: query.get("sort") || "roll_no",
    dir: query.get("dir") || "asc",
    page: Number(query.get("page")) || 1,
    pageSize: Number(query.get("pageSize")) || 10
  };

  const [{ items: departments }, { items: courses }] = await Promise.all([api.get("/api/departments"), api.get("/api/courses")]);
  if (!isCurrent()) return;

  const filterParams = () => ({ q: state.q, department: state.department, course: state.course, semester: state.semester, status: state.status });

  mount(root, html`<div class="page">
    ${pageHeader({
      title: "Students",
      subtitle: "Search, filter and manage every student record.",
      actions: html`
        ${isAdmin ? html`<button class="btn btn-secondary" data-import>${icon("upload")}Import CSV</button>` : ""}
        <button class="btn btn-secondary" data-export>${icon("download")}Export CSV</button>
        <a class="btn btn-primary" href="/students/new">${icon("plus")}Add student</a>`
    })}
    <section class="card">
      <div class="filters">
        <label class="input-icon">${icon("search")}<input type="search" data-q value="${state.q}" placeholder="Search by name, roll number, email or department" aria-label="Search students"></label>
        <select data-filter="department" aria-label="Department">${options(departments, "id", (d) => d.code, "All departments").map((o) => html`<option value="${o.value}" ${String(o.value) === state.department ? "selected" : ""}>${o.label}</option>`)}</select>
        <select data-filter="course" aria-label="Course">${options(courses, "id", (c) => `${c.code} · ${c.name}`, "All courses").map((o) => html`<option value="${o.value}" ${String(o.value) === state.course ? "selected" : ""}>${o.label}</option>`)}</select>
        <select data-filter="semester" aria-label="Semester"><option value="">All semesters</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => html`<option value="${s}" ${String(s) === state.semester ? "selected" : ""}>Semester ${s}</option>`)}</select>
        <select data-filter="status" aria-label="Status"><option value="">All statuses</option>${STATUSES.map((s) => html`<option value="${s}" ${s === state.status ? "selected" : ""}>${label(s)}</option>`)}</select>
        <button class="btn btn-ghost" data-clear>${icon("x")}Clear</button>
      </div>
      <div data-results></div>
    </section>
  </div>`);

  const results = root.querySelector("[data-results]");
  let requestId = 0;

  async function load() {
    const id = ++requestId;
    setQuery({ ...filterParams(), sort: state.sort !== "roll_no" ? state.sort : "", dir: state.dir !== "asc" ? state.dir : "", page: state.page > 1 ? state.page : "", pageSize: state.pageSize !== 10 ? state.pageSize : "" });
    results.setAttribute("aria-busy", "true");
    if (!results.innerHTML) mount(results, skeletonTable(8, 6));
    try {
      const data = await api.get("/api/students", { ...filterParams(), sort: state.sort, dir: state.dir, page: state.page, pageSize: state.pageSize });
      if (id !== requestId || !isCurrent()) return;
      if (data.items.length === 0 && data.total > 0 && state.page > 1) {
        state.page = Math.ceil(data.total / state.pageSize);
        return load();
      }
      render(data);
    } catch (error) {
      if (id !== requestId) return;
      showError(error);
      mount(results, errorState(error));
      results.querySelector("[data-retry]").addEventListener("click", load);
    } finally {
      results.removeAttribute("aria-busy");
    }
  }

  function render(data) {
    const filtered = Object.values(filterParams()).some(Boolean);
    if (!data.items.length) {
      mount(results, filtered
        ? emptyState({ iconName: "search", title: "No students match these filters", text: "Try a different search or clear the filters.", action: html`<button class="btn btn-secondary" data-clear-empty>Clear filters</button>` })
        : emptyState({ iconName: "students", title: "No students registered yet", text: "Add your first student or import a CSV file.", action: html`<a class="btn btn-primary" href="/students/new">${icon("plus")}Add student</a>` }));
      results.querySelector("[data-clear-empty]")?.addEventListener("click", clearFilters);
      return;
    }

    mount(results, html`
      ${table({
        caption: "Students",
        sort: { key: state.sort, dir: state.dir },
        rowLink: (s) => `/students/${s.id}`,
        rows: data.items,
        columns: [
          { key: "full_name", label: "Student", sortable: true, className: "primary-cell", render: (s) => html`<a class="person" href="/students/${s.id}">${avatar(s)}<span class="person-text"><strong>${s.full_name}</strong><small>${s.email}</small></span></a>` },
          { key: "roll_no", label: "Roll no", sortable: true, render: (s) => html`<span class="mono">${s.roll_no}</span>` },
          { key: "department", label: "Dept", sortable: true, render: (s) => html`<span class="tag" title="${s.department_name}">${s.department_code}</span>` },
          { key: "semester", label: "Year / Sem", sortable: true, render: (s) => html`<span class="nowrap">Year ${s.year} · Sem ${s.semester}</span>` },
          { key: "attendance", label: "Attendance", sortable: true, render: (s) => progress(s.attendance_pct) },
          { key: "status", label: "Status", sortable: true, render: (s) => badge(s.status) },
          { key: "actions", label: "Actions", className: "right", render: (s) => html`<div class="row-actions">
            <a class="icon-btn sm" href="/students/${s.id}" aria-label="View ${s.full_name}" data-tip="View">${icon("eye")}</a>
            <a class="icon-btn sm" href="/students/${s.id}/edit" aria-label="Edit ${s.full_name}" data-tip="Edit">${icon("edit")}</a>
            ${isAdmin ? html`<button class="icon-btn sm danger" data-delete="${s.id}" data-name="${s.full_name}" data-roll="${s.roll_no}" aria-label="Delete ${s.full_name}" data-tip="Delete">${icon("trash")}</button>` : ""}
          </div>` }
        ]
      })}
      ${pagination(data)}`);
    results.querySelector("table").classList.add("stack");

    bindTable(results, {
      navigate,
      onSort: (key) => {
        state.dir = state.sort === key && state.dir === "asc" ? "desc" : "asc";
        state.sort = key;
        load();
      }
    });
    bindPagination(results, {
      onPage: (p) => { state.page = p; load(); },
      onPageSize: (n) => { state.pageSize = n; state.page = 1; load(); }
    });
    results.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => remove(btn)));
  }

  async function remove(btn) {
    const ok = await confirmDialog({
      title: "Delete student?",
      message: `${btn.dataset.name} (${btn.dataset.roll}) and all of their enrollments, attendance and marks will be permanently deleted. This cannot be undone.`,
      confirmText: "Delete student",
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/students/${btn.dataset.delete}`);
      toast(`${btn.dataset.name} was deleted.`);
      load();
    } catch (error) {
      showError(error);
    }
  }

  function clearFilters() {
    Object.assign(state, { q: "", department: "", course: "", semester: "", status: "", page: 1 });
    root.querySelector("[data-q]").value = "";
    root.querySelectorAll("[data-filter]").forEach((s) => (s.value = ""));
    load();
  }

  root.querySelector("[data-q]").addEventListener("input", debounce((e) => {
    state.q = e.target.value.trim();
    state.page = 1;
    load();
  }, 300));
  root.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", () => {
    state[select.dataset.filter] = select.value;
    state.page = 1;
    load();
  }));
  root.querySelector("[data-clear]").addEventListener("click", clearFilters);
  root.querySelector("[data-export]").addEventListener("click", () => {
    download("/api/students/export.csv", filterParams());
    toast("Your CSV export is downloading.", "info");
  });
  root.querySelector("[data-import]")?.addEventListener("click", () => importDialog().then((count) => { if (count) load(); }));

  await load();
}

function importDialog() {
  return modal({
    title: "Import students from CSV",
    size: "md",
    render(body, close) {
      mount(body, html`
        <div class="form">
          <div class="alert alert-info">${icon("info")}<div>
            <strong>Required columns:</strong> roll_no, full_name, email, department_code, year, semester, enrollment_date (YYYY-MM-DD).
            <br>Optional: phone, date_of_birth, gender, status. Use department codes such as CSE or ECE.
            Every row is checked first. If any row has a problem, nothing is imported.
          </div></div>
          <div class="field">
            <label for="csv-file">CSV file</label>
            <input id="csv-file" type="file" accept=".csv,text/csv">
          </div>
          <div data-import-errors></div>
          <footer class="modal-footer">
            <button class="btn btn-ghost" data-template>${icon("download")}Download template</button>
            <button class="btn btn-ghost" data-cancel>Cancel</button>
            <button class="btn btn-primary" data-run disabled>${icon("upload")}Import</button>
          </footer>
        </div>`);

      const input = body.querySelector("#csv-file");
      const run = body.querySelector("[data-run]");
      const errors = body.querySelector("[data-import-errors]");
      input.addEventListener("change", () => (run.disabled = !input.files.length));
      body.querySelector("[data-cancel]").addEventListener("click", () => close(0));
      body.querySelector("[data-template]").addEventListener("click", () => {
        const csv = "roll_no,full_name,email,phone,date_of_birth,gender,department_code,year,semester,enrollment_date,status\n" +
          "25CS001,Asha Verma,asha.verma@college.edu,9876500001,2007-04-12,Female,CSE,1,1,2025-08-04,active\n";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "students-template.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      });
      run.addEventListener("click", async () => {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return toast("The CSV file must be smaller than 2 MB.", "error");
        setBusy(run, true);
        mount(errors, "");
        try {
          const csv = await readFile(file, "text");
          const { imported } = await api.post("/api/students/import", { csv });
          toast(`${imported} student${imported === 1 ? "" : "s"} imported.`);
          close(imported);
        } catch (error) {
          showError(error);
          const rows = error.fields?.rows;
          if (rows) {
            mount(errors, html`<div class="alert alert-danger">${icon("alert")}<div><strong>Fix these rows and try again:</strong>
              <ul>${rows.map((r) => html`<li>Line ${r.line}: ${r.messages.join("; ")}</li>`)}</ul></div></div>`);
          }
        } finally {
          setBusy(run, false);
        }
      });
    }
  });
}
