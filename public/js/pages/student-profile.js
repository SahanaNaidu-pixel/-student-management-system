// Student profile: header with photo, tabs for overview, courses, attendance and results
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate, pct, label } from "../format.js";
import {
  avatar, badge, gradeBadge, progress, tabs, bindTabs, table, emptyState, confirmDialog, toast, showError,
  modal, readFile, setBusy
} from "../ui.js";
import { navigate, setQuery } from "../app.js";

export default async function studentProfile({ root, params, query, isAdmin, setTitle, setCrumbs, isCurrent }) {
  let data = await api.get(`/api/students/${encodeURIComponent(params.id)}`);
  if (!isCurrent()) return;
  let active = query.get("tab") || "overview";
  let photoVersion = Date.now();

  async function reload() {
    data = await api.get(`/api/students/${data.student.id}`);
    if (isCurrent()) draw();
  }

  function draw() {
    const { student: s, courses, attendance, results } = data;
    setTitle(s.full_name);
    setCrumbs([{ label: "Students", href: "/students" }, { label: s.full_name }]);
    const latest = results[0];

    mount(root, html`<div class="page">
      <section class="card">
        <div class="profile-header">
          <div class="profile-photo">
            ${avatar({ ...s, photo_version: photoVersion }, "xl")}
            <div class="photo-actions">
              <button class="icon-btn" data-photo aria-label="Upload photo" data-tip="Upload photo">${icon("camera")}</button>
              ${s.has_photo ? html`<button class="icon-btn danger" data-remove-photo aria-label="Remove photo" data-tip="Remove photo">${icon("trash")}</button>` : ""}
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp" data-photo-input hidden>
          </div>
          <div class="profile-main">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h1>${s.full_name}</h1>${badge(s.status)}</div>
            <div class="profile-meta">
              <span>${icon("students")}<span class="mono">${s.roll_no}</span></span>
              <span>${icon("building")}${s.department_name}</span>
              <span>${icon("calendar")}Year ${s.year} · Semester ${s.semester}</span>
              <span>${icon("mail")}<a href="mailto:${s.email}">${s.email}</a></span>
              ${s.phone ? html`<span>${icon("phone")}${s.phone}</span>` : ""}
            </div>
          </div>
          <div class="profile-actions">
            <a class="btn btn-secondary" href="/students/${s.id}/edit">${icon("edit")}Edit</a>
            ${isAdmin ? html`<button class="btn btn-danger" data-delete>${icon("trash")}Delete</button>` : ""}
          </div>
        </div>
        <div class="stat-strip">
          <div><small>Overall attendance</small><strong>${pct(s.attendance_pct)}</strong></div>
          <div><small>Classes recorded</small><strong>${attendance.classes || 0}</strong></div>
          <div><small>Enrolled courses</small><strong>${courses.length}</strong></div>
          <div><small>Latest result</small><strong>${latest ? html`${pct(latest.percentage)} ${gradeBadge(latest.grade)}` : "—"}</strong></div>
        </div>
      </section>

      <section class="card">
        ${tabs([
          { key: "overview", label: "Overview", icon: "user" },
          { key: "courses", label: "Courses", icon: "book", count: courses.length },
          { key: "attendance", label: "Attendance", icon: "attendance" },
          { key: "results", label: "Results", icon: "award", count: results.length }
        ], active)}
        <div data-tab-body></div>
      </section>
    </div>`);

    bindTabs(root, (key) => {
      active = key;
      setQuery(key === "overview" ? {} : { tab: key });
      draw();
    });
    drawTab(root.querySelector("[data-tab-body]"));

    root.querySelector("[data-delete]")?.addEventListener("click", remove);
    const input = root.querySelector("[data-photo-input]");
    root.querySelector("[data-photo]").addEventListener("click", () => input.click());
    input.addEventListener("change", () => uploadPhoto(input.files[0]));
    root.querySelector("[data-remove-photo]")?.addEventListener("click", removePhoto);
  }

  function drawTab(body) {
    const { student: s, courses, attendance, recentAttendance, marks, results } = data;

    if (active === "overview") {
      mount(body, html`<div class="card-body"><div class="grid grid-2">
        <dl class="details">
          <div><dt>Full name</dt><dd>${s.full_name}</dd></div>
          <div><dt>Roll number</dt><dd class="mono">${s.roll_no}</dd></div>
          <div><dt>Date of birth</dt><dd>${formatDate(s.date_of_birth)}</dd></div>
          <div><dt>Gender</dt><dd>${s.gender || "—"}</dd></div>
          <div><dt>Email</dt><dd>${s.email}</dd></div>
          <div><dt>Phone</dt><dd>${s.phone || "—"}</dd></div>
          <div><dt>Department</dt><dd>${s.department_name} (${s.department_code})</dd></div>
          <div><dt>Year / Semester</dt><dd>Year ${s.year} · Semester ${s.semester}</dd></div>
          <div><dt>Enrollment date</dt><dd>${formatDate(s.enrollment_date)}</dd></div>
          <div><dt>Status</dt><dd>${badge(s.status)}</dd></div>
          <div><dt>Record created</dt><dd>${formatDate(s.created_at)}</dd></div>
          <div><dt>Last updated</dt><dd>${formatDate(s.updated_at)}</dd></div>
        </dl>
        <div>
          <h3 style="margin-bottom:12px">Attendance by course</h3>
          ${courses.length ? html`<ul class="list">${courses.map((c) => html`<li class="list-item">
            <div class="grow"><strong>${c.code}</strong> <span class="muted">${c.name}</span></div>
            ${progress(c.attendance_pct)}
          </li>`)}</ul>` : emptyState({ iconName: "book", title: "Not enrolled in any course" })}
        </div>
      </div></div>`);
      return;
    }

    if (active === "courses") {
      mount(body, html`
        <div class="card-header"><div><h2>Enrolled courses</h2><p>Attendance and marks can only be recorded for enrolled courses.</p></div>
          <button class="btn btn-secondary btn-sm" data-manage>${icon("edit")}Manage enrollment</button></div>
        <div class="card-body">${courses.length ? table({
          rows: courses,
          rowLink: (c) => `/courses/${c.id}`,
          columns: [
            { key: "code", label: "Code", render: (c) => html`<span class="tag">${c.code}</span>` },
            { key: "name", label: "Course", render: (c) => html`<strong>${c.name}</strong>` },
            { key: "semester", label: "Semester" },
            { key: "credits", label: "Credits" },
            { key: "faculty_name", label: "Faculty", render: (c) => c.faculty_name || html`<span class="muted">Unassigned</span>` },
            { key: "attendance_pct", label: "Attendance", render: (c) => progress(c.attendance_pct) }
          ]
        }) : emptyState({ iconName: "book", title: "Not enrolled in any course", text: "Use “Manage enrollment” to add courses." })}</div>`);
      body.querySelector("[data-manage]").addEventListener("click", manageEnrollment);
      body.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => navigate(tr.dataset.href)));
      return;
    }

    if (active === "attendance") {
      mount(body, html`<div class="card-body">
        <div class="kpis" style="margin-bottom:22px">
          ${[["Present", attendance.present, "success"], ["Late", attendance.late, "warning"], ["Absent", attendance.absent, "danger"], ["Total classes", attendance.classes, "neutral"]]
            .map(([l, v, tone]) => html`<div class="card kpi"><div class="kpi-top"><span>${l}</span>${tone !== "neutral" ? badge(l, tone) : ""}</div><div class="kpi-value">${v || 0}</div></div>`)}
        </div>
        <h3 style="margin-bottom:12px">Most recent classes</h3>
        ${recentAttendance.length ? table({
          rows: recentAttendance,
          columns: [
            { key: "date", label: "Date", render: (a) => formatDate(a.date) },
            { key: "course_code", label: "Course", render: (a) => html`<strong>${a.course_code}</strong> <span class="muted">${a.course_name}</span>` },
            { key: "status", label: "Status", render: (a) => badge(a.status) }
          ]
        }) : emptyState({ iconName: "attendance", title: "No attendance recorded yet" })}
        <p style="margin-top:14px"><a class="card-link" href="/attendance?tab=records&student=${s.id}">See full attendance history ${icon("chevronRight")}</a></p>
      </div>`);
      return;
    }

    mount(body, html`<div class="card-body">
      ${results.length ? results.map((r) => html`<div class="card semester-block">
        <div class="semester-head">
          <h3>Semester ${r.semester}</h3>
          <div class="summary"><span>Total <strong>${r.total} / ${r.max}</strong></span><span>Percentage <strong>${pct(r.percentage, 2)}</strong></span>${gradeBadge(r.grade)}${badge(r.passed ? "pass" : "fail")}</div>
        </div>
        ${table({
          rows: r.subjects,
          columns: [
            { key: "course_code", label: "Code", render: (x) => html`<span class="tag">${x.course_code}</span>` },
            { key: "course_name", label: "Subject" },
            { key: "marks", label: "Marks", className: "right", render: (x) => html`<span class="mono">${x.marks} / ${x.max_marks}</span>` },
            { key: "percentage", label: "%", className: "right", render: (x) => pct(x.percentage) },
            { key: "grade", label: "Grade", className: "right", render: (x) => gradeBadge(x.grade) }
          ]
        })}
      </div>`) : emptyState({ iconName: "award", title: "No semester results yet", text: "Results appear once end-semester marks are entered." })}
      ${marks.length ? html`<h3 style="margin:26px 0 12px">All assessments</h3>${table({
        rows: marks,
        rowLink: (m) => `/exams/${m.exam_id}`,
        columns: [
          { key: "exam_date", label: "Date", render: (m) => formatDate(m.exam_date) },
          { key: "course_code", label: "Course", render: (m) => html`<strong>${m.course_code}</strong> <span class="muted">${m.course_name}</span>` },
          { key: "exam_name", label: "Assessment", render: (m) => html`${m.exam_name} <span class="tag">${label(m.exam_type)}</span>` },
          { key: "marks", label: "Marks", className: "right", render: (m) => html`<span class="mono">${m.marks} / ${m.max_marks}</span>` }
        ]
      })}` : ""}
    </div>`);
    body.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => navigate(tr.dataset.href)));
  }

  async function remove() {
    const s = data.student;
    const ok = await confirmDialog({
      title: "Delete student?",
      message: `${s.full_name} (${s.roll_no}) and all of their enrollments, attendance and marks will be permanently deleted. This cannot be undone.`,
      confirmText: "Delete student",
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/api/students/${s.id}`);
      toast(`${s.full_name} was deleted.`);
      navigate("/students", { replace: true });
    } catch (error) {
      showError(error);
    }
  }

  async function uploadPhoto(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return toast("Choose a PNG, JPEG or WebP image.", "error");
    if (file.size > 2 * 1024 * 1024) return toast("The photo must be 2 MB or smaller.", "error");
    const button = root.querySelector("[data-photo]");
    setBusy(button, true);
    try {
      await api.post(`/api/students/${data.student.id}/photo`, { dataUrl: await readFile(file) });
      photoVersion = Date.now();
      toast("Profile photo updated.");
      await reload();
    } catch (error) {
      showError(error);
      setBusy(button, false);
    }
  }

  async function removePhoto() {
    const ok = await confirmDialog({ title: "Remove photo?", message: "The profile photo will be deleted.", confirmText: "Remove", danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/students/${data.student.id}/photo`);
      toast("Profile photo removed.");
      await reload();
    } catch (error) {
      showError(error);
    }
  }

  async function manageEnrollment() {
    const { items: all } = await api.get("/api/courses").catch((e) => (showError(e), { items: null }));
    if (!all) return;
    const enrolled = new Set(data.courses.map((c) => c.id));
    const s = data.student;
    const saved = await modal({
      title: "Manage course enrollment",
      size: "lg",
      render(body, close) {
        const sorted = [...all].sort((a, b) =>
          (b.department_id === s.department_id) - (a.department_id === s.department_id) || a.semester - b.semester || a.code.localeCompare(b.code));
        mount(body, html`
          <p class="muted" style="margin-bottom:14px">Removing a course also removes its attendance and marks for this student.</p>
          <div class="table-wrap" style="max-height:420px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius)">
            <table class="table"><thead><tr><th></th><th>Code</th><th>Course</th><th>Dept</th><th>Sem</th></tr></thead>
            <tbody>${sorted.map((c) => html`<tr>
              <td><input type="checkbox" value="${c.id}" id="en-${c.id}" ${enrolled.has(c.id) ? "checked" : ""} aria-label="Enroll in ${c.code}"></td>
              <td><label for="en-${c.id}"><span class="tag">${c.code}</span></label></td><td><label for="en-${c.id}">${c.name}</label></td>
              <td>${c.department_code}</td><td>${c.semester}</td></tr>`)}</tbody></table>
          </div>
          <footer class="modal-footer" style="margin-top:16px">
            <button class="btn btn-ghost" data-cancel>Cancel</button>
            <button class="btn btn-primary" data-save>${icon("check")}Save enrollment</button>
          </footer>`);
        body.querySelector("[data-cancel]").addEventListener("click", () => close(false));
        body.querySelector("[data-save]").addEventListener("click", async (e) => {
          const ids = [...body.querySelectorAll("input[type=checkbox]:checked")].map((c) => Number(c.value));
          const removed = [...enrolled].filter((id) => !ids.includes(id));
          if (removed.length && !(await confirmDialog({ title: "Remove courses?", message: `${removed.length} course(s) will be removed along with their attendance and marks for ${s.full_name}.`, confirmText: "Remove and save", danger: true }))) return;
          setBusy(e.currentTarget, true);
          try {
            await api.put(`/api/students/${s.id}/enrollments`, { courseIds: ids });
            close(true);
          } catch (error) {
            showError(error);
            setBusy(e.currentTarget, false);
          }
        });
      }
    });
    if (saved) {
      toast("Enrollment updated.");
      await reload();
    }
  }

  draw();
}
