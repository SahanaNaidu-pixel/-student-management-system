// Marks entry for one examination, with live percentage and grade
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { formatDate, label, pct } from "../format.js";
import { pageHeader, table, emptyState, gradeBadge, toast, showError, setBusy, badge } from "../ui.js";
import { navigate } from "../app.js";
import { examModal, deleteExam } from "./exams.js";

// Same grading scale as the server (originally from the Student Result module)
function grade(percentage, passPercent) {
  if (percentage < passPercent) return "F";
  if (percentage >= 90) return "O";
  if (percentage >= 80) return "A+";
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "B+";
  if (percentage >= 50) return "B";
  return "C";
}

export default async function examMarks({ root, params, isAdmin, setTitle, setCrumbs, isCurrent }) {
  async function load() {
    const { exam: e, students, passPercent, isFuture } = await api.get(`/api/exams/${encodeURIComponent(params.id)}`);
    if (!isCurrent()) return;
    setTitle(`${e.course_code} ${e.name}`);
    setCrumbs([{ label: "Examinations", href: "/exams" }, { label: `${e.course_code} · ${e.name}` }]);

    mount(root, html`<div class="page">
      ${pageHeader({
        title: `${e.course_name} — ${e.name}`,
        subtitle: `${e.course_code} · ${label(e.exam_type)} · ${formatDate(e.exam_date)} · Maximum ${e.max_marks} marks · Pass mark ${passPercent}%`,
        actions: isAdmin ? html`<button class="btn btn-secondary" data-edit>${icon("edit")}Edit</button><button class="btn btn-danger" data-delete>${icon("trash")}Delete</button>` : ""
      })}
      ${isFuture ? html`<div class="alert alert-info">${icon("info")}<div>This exam is scheduled for <strong>${formatDate(e.exam_date)}</strong>. Marks can be entered once the exam date has passed.</div></div>` : ""}
      <section class="card">
        <div class="register-summary" data-summary></div>
        ${students.length ? html`<form novalidate data-form>
          ${table({
            rows: students,
            columns: [
              { key: "roll_no", label: "Roll no", render: (s) => html`<span class="mono">${s.roll_no}</span>` },
              { key: "full_name", label: "Student", className: "primary-cell", render: (s) => html`<a class="person" href="/students/${s.id}"><span class="person-text"><strong>${s.full_name}</strong>${s.status !== "active" ? html`<small>${label(s.status)}</small>` : ""}</span></a>` },
              { key: "marks", label: `Marks / ${e.max_marks}`, render: (s) => html`<div class="field" data-field="${s.id}" style="align-items:flex-start">
                <input class="marks-input" type="number" inputmode="decimal" min="0" max="${e.max_marks}" step="0.5" value="${s.marks ?? ""}" data-student="${s.id}" aria-label="Marks for ${s.full_name}" ${isFuture ? "disabled" : ""}>
                <p class="field-error" id="f-${s.id}-error"></p></div>` },
              { key: "pct", label: "%", className: "right", render: (s) => html`<span data-pct="${s.id}"></span>` },
              { key: "grade", label: "Grade", className: "right", render: (s) => html`<span data-grade="${s.id}"></span>` }
            ]
          })}
          ${isFuture ? "" : html`<footer class="form-actions">
            <span class="muted" style="margin-right:auto">Leave a box empty to clear that student's mark.</span>
            <button type="submit" class="btn btn-primary">${icon("check")}Save marks</button>
          </footer>`}
        </form>` : emptyState({ iconName: "students", title: "No students are enrolled in this course" })}
      </section>
    </div>`);

    root.querySelector("[data-edit]")?.addEventListener("click", async () => {
      const { items: courses } = await api.get("/api/courses");
      if (await examModal(e, courses)) { toast("Examination saved."); load(); }
    });
    root.querySelector("[data-delete]")?.addEventListener("click", async () => {
      if (await deleteExam(e)) navigate("/exams", { replace: true });
    });

    const form = root.querySelector("[data-form]");
    if (!form) return;
    const inputs = [...form.querySelectorAll("[data-student]")];

    const update = () => {
      let entered = 0, passed = 0, sum = 0;
      for (const input of inputs) {
        const id = input.dataset.student;
        const v = input.value === "" ? null : Number(input.value);
        const valid = v !== null && Number.isFinite(v) && v >= 0 && v <= e.max_marks;
        const wrapper = input.closest(".field");
        wrapper.classList.toggle("has-error", v !== null && !valid);
        wrapper.querySelector(".field-error").textContent = v !== null && !valid ? `0 – ${e.max_marks}` : "";
        const p = valid ? (v / e.max_marks) * 100 : null;
        mount(form.querySelector(`[data-pct="${id}"]`), p === null ? "—" : pct(p));
        mount(form.querySelector(`[data-grade="${id}"]`), p === null ? "" : gradeBadge(grade(p, passPercent)));
        if (valid) { entered++; sum += v; if (p >= passPercent) passed++; }
      }
      mount(root.querySelector("[data-summary]"), html`
        <span>Entered <strong>${entered} / ${inputs.length}</strong></span>
        <span>Average <strong>${entered ? (sum / entered).toFixed(1) : "—"}</strong></span>
        <span>Passed <strong>${passed}</strong></span>
        <span>Failed <strong>${entered - passed}</strong></span>
        ${entered === inputs.length && inputs.length ? badge("Complete", "success") : ""}`);
    };
    update();
    inputs.forEach((i) => {
      i.addEventListener("input", update);
      // Enter moves to the next student's box for quick keyboard entry
      i.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        const next = inputs[inputs.indexOf(i) + 1];
        if (next) next.focus();
        else form.querySelector('[type="submit"]')?.focus();
      });
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (form.querySelector(".has-error")) {
        toast(`Some marks are outside 0–${e.max_marks}.`, "error");
        form.querySelector(".has-error input").focus();
        return;
      }
      const button = form.querySelector('[type="submit"]');
      setBusy(button, true);
      try {
        const entries = inputs.map((i) => ({ student_id: Number(i.dataset.student), marks: i.value === "" ? null : Number(i.value) }));
        const { saved } = await api.put(`/api/exams/${e.id}/marks`, { entries });
        toast(`Marks saved for ${saved} students.`);
        load();
      } catch (error) {
        const fields = showError(error);
        for (const [id, message] of Object.entries(fields || {})) {
          const wrapper = form.querySelector(`[data-field="${id}"]`);
          wrapper?.classList.add("has-error");
          if (wrapper) wrapper.querySelector(".field-error").textContent = message;
        }
        setBusy(button, false);
      }
    });
  }
  await load();
}
