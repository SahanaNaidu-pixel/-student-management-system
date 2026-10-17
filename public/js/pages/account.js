// Change your own password
import { api } from "../api.js";
import { html, mount } from "../html.js";
import { icon } from "../icons.js";
import { label } from "../format.js";
import { pageHeader, field, bindForm, runChecks, checks, toast } from "../ui.js";

export default function account({ root, user, setTitle, setCrumbs }) {
  setTitle("Account");
  setCrumbs([{ label: "Account" }]);
  mount(root, html`<div class="page">
    ${pageHeader({ title: "Your account", subtitle: `${user.full_name} · ${user.username} · ${label(user.role)}` })}
    <form class="card" novalidate style="max-width:640px">
      <section class="form-section">
        <h2>Change password</h2>
        <p>Changing your password signs out your other sessions.</p>
        <div class="form-grid">
          ${field({ name: "currentPassword", label: "Current password", type: "password", required: true, full: true, attrs: 'autocomplete="current-password"' })}
          ${field({ name: "newPassword", label: "New password", type: "password", required: true, hint: "At least 8 characters with letters and numbers.", attrs: 'autocomplete="new-password"' })}
          ${field({ name: "confirm", label: "Confirm new password", type: "password", required: true, attrs: 'autocomplete="new-password"' })}
        </div>
      </section>
      <footer class="form-actions"><button class="btn btn-primary" type="submit">${icon("key")}Update password</button></footer>
    </form>
  </div>`);

  const form = root.querySelector("form");
  bindForm(form, {
    validate: (v) => runChecks(v, {
      currentPassword: [checks.required],
      newPassword: [checks.required, (x) => (x.length < 8 ? "Use at least 8 characters" : !/[A-Za-z]/.test(x) || !/\d/.test(x) ? "Use both letters and numbers" : null)],
      confirm: [checks.required, (x, all) => (x !== all.newPassword ? "Passwords do not match" : null)]
    }),
    onSubmit: async ({ currentPassword, newPassword }) => {
      await api.post("/api/auth/password", { currentPassword, newPassword });
      form.reset();
      toast("Your password has been updated.");
    }
  });
}
