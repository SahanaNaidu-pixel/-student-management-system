// Sign-in page
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { bindForm, field, runChecks, checks } from "../ui.js";
import { navigate, setUser, APP_NAME, INSTITUTION } from "../app.js";

export default function login({ root, query, setTitle }) {
  setTitle("Sign in");
  const theme = document.documentElement.dataset.theme;
  mount(root, html`
    <div class="login">
      <section class="login-art" aria-hidden="true">
        <div class="brand">
          <span class="brand-mark">${icon("students")}</span>
          <span class="brand-text"><strong>${APP_NAME}</strong><small>${INSTITUTION}</small></span>
        </div>
        <div>
          <p class="eyebrow">Academic administration</p>
          <h1>Every student record, <em>beautifully organised</em>.</h1>
          <p>Admissions, attendance, examinations and results, all in one place and always up to date.</p>
          <ul class="login-features">
            <li>${icon("shield")}Role-based access for administrators and staff</li>
            <li>${icon("attendance")}Attendance registers with live percentages</li>
            <li>${icon("award")}Automatic grading and semester results</li>
          </ul>
        </div>
        <small>© ${new Date().getFullYear()} ${INSTITUTION}</small>
      </section>
      <section class="login-panel">
        <button class="icon-btn theme-corner" data-toggle-theme aria-label="Toggle theme">${icon(theme === "dark" ? "sun" : "moon")}</button>
        <div class="login-card">
          <p class="eyebrow">Welcome back</p>
          <h2>Sign in to your account</h2>
          <p class="subtitle">Use the credentials issued by your administrator.</p>
          <form class="form" novalidate>
            ${field({ name: "username", label: "Username", required: true, autofocus: true, attrs: 'autocomplete="username" autocapitalize="none" spellcheck="false"' })}
            <div class="field" data-field="password">
              <label for="f-password">Password<span class="req" aria-hidden="true">*</span></label>
              <div class="password-wrap">
                <input id="f-password" name="password" type="password" autocomplete="current-password" required>
                <button type="button" class="icon-btn sm" data-reveal aria-label="Show password">${icon("eye")}</button>
              </div>
              <p class="field-error" id="f-password-error" role="alert"></p>
            </div>
            <button class="btn btn-primary" type="submit">Sign in</button>
          </form>
          <p class="login-note">Demo accounts are listed in the README and the <code>.env</code> file.</p>
        </div>
      </section>
    </div>`);

  const form = root.querySelector("form");
  const password = root.querySelector("#f-password");
  root.querySelector("[data-reveal]").addEventListener("click", (e) => {
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  root.querySelector("[data-toggle-theme]").addEventListener("click", (e) => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sms-theme", next); } catch { /* ignore */ }
    mount(e.currentTarget, icon(next === "dark" ? "sun" : "moon"));
  });

  bindForm(form, {
    validate: (v) => runChecks(v, { username: [checks.required], password: [checks.required] }),
    onSubmit: async (values) => {
      const { user } = await api.post("/api/auth/login", values);
      setUser(user);
      const next = query.get("next");
      // Only follow local paths after sign-in
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    }
  });
}
