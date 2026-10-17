// Application shell: session, routing, sidebar, top bar, global search and theme
import { api, setUnauthorizedHandler } from "./api.js";
import { html, mount, raw } from "./html.js";
import { icon } from "./icons.js";
import { initials, label } from "./format.js";
import { debounce, errorState, skeletonPage, toast, showError } from "./ui.js";

// Change these to your institution's name
export const APP_NAME = "Student Management System";
export const INSTITUTION = "University Administration";

const NAV = [
  { section: "Overview" },
  { path: "/", label: "Dashboard", icon: "dashboard" },
  { section: "Academics" },
  { path: "/students", label: "Students", icon: "students" },
  { path: "/departments", label: "Departments", icon: "building" },
  { path: "/courses", label: "Courses", icon: "book" },
  { path: "/faculty", label: "Faculty", icon: "faculty" },
  { section: "Operations" },
  { path: "/attendance", label: "Attendance", icon: "attendance" },
  { path: "/exams", label: "Examinations", icon: "exam" },
  { path: "/results", label: "Results", icon: "award" },
  { path: "/reports", label: "Reports", icon: "report" },
  { section: "Administration", admin: true },
  { path: "/users", label: "User accounts", icon: "users", admin: true },
  { path: "/activity", label: "Activity log", icon: "activity" }
];

// Route table. Pages are loaded on demand.
const ROUTES = [
  { path: "/login", page: () => import("./pages/login.js"), public: true },
  { path: "/", page: () => import("./pages/dashboard.js") },
  { path: "/students", page: () => import("./pages/students.js") },
  { path: "/students/new", page: () => import("./pages/student-form.js") },
  { path: "/students/:id/edit", page: () => import("./pages/student-form.js") },
  { path: "/students/:id", page: () => import("./pages/student-profile.js") },
  { path: "/departments", page: () => import("./pages/departments.js") },
  { path: "/departments/:id", page: () => import("./pages/department-detail.js") },
  { path: "/courses", page: () => import("./pages/courses.js") },
  { path: "/courses/:id", page: () => import("./pages/course-detail.js") },
  { path: "/faculty", page: () => import("./pages/faculty.js") },
  { path: "/attendance", page: () => import("./pages/attendance.js") },
  { path: "/exams", page: () => import("./pages/exams.js") },
  { path: "/exams/:id", page: () => import("./pages/exam-marks.js") },
  { path: "/results", page: () => import("./pages/results.js") },
  { path: "/reports", page: () => import("./pages/reports.js") },
  { path: "/users", page: () => import("./pages/users.js"), admin: true },
  { path: "/activity", page: () => import("./pages/activity.js") },
  { path: "/account", page: () => import("./pages/account.js") }
];

const state = { user: null, cleanup: null, renderId: 0 };
export const session = {
  get user() { return state.user; },
  get isAdmin() { return state.user?.role === "admin"; }
};

/* ---------- Theme ---------- */

function storedTheme() {
  try { return localStorage.getItem("sms-theme"); } catch { return null; }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("sms-theme", theme); } catch { /* storage unavailable */ }
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    mount(b, icon(theme === "dark" ? "sun" : "moon"));
    b.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    b.dataset.tip = theme === "dark" ? "Light theme" : "Dark theme";
  });
}

const currentTheme = () => document.documentElement.dataset.theme
  || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/* ---------- Routing ---------- */

function matchRoute(pathname) {
  for (const route of ROUTES) {
    const keys = [];
    const regex = new RegExp("^" + route.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
    const m = pathname.match(regex);
    if (m) return { route, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"]({}, "", to);
  render();
}

// Updates the query string without re-rendering (used by filters)
export function setQuery(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== "" && v !== null && v !== undefined) search.set(k, v);
  const s = search.toString();
  history.replaceState({}, "", location.pathname + (s ? `?${s}` : ""));
}

async function render() {
  const renderId = ++state.renderId;
  const found = matchRoute(location.pathname);

  if (found?.route.public) {
    if (state.user) return navigate("/", { replace: true });
    return renderPage(found, document.getElementById("app"), renderId, true);
  }
  if (!state.user) {
    const next = location.pathname + location.search;
    return navigate(`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`, { replace: true });
  }

  renderShell();
  const view = document.getElementById("view");
  if (!found) return renderNotFound(view);
  if (found.route.admin && !session.isAdmin) return renderForbidden(view);
  renderPage(found, view, renderId, false);
}

async function renderPage(found, container, renderId, isPublic) {
  state.cleanup?.();
  state.cleanup = null;
  if (!isPublic) {
    mount(container, skeletonPage());
    highlightNav();
  }
  try {
    const module = await found.route.page();
    if (renderId !== state.renderId) return;
    const ctx = {
      params: found.params,
      query: new URLSearchParams(location.search),
      user: state.user,
      isAdmin: session.isAdmin,
      root: container,
      setTitle: (title) => (document.title = `${title} · ${APP_NAME}`),
      setCrumbs,
      isCurrent: () => renderId === state.renderId
    };
    container.classList.remove("page-enter");
    void container.offsetWidth;
    container.classList.add("page-enter");
    state.cleanup = (await module.default(ctx)) || null;
    if (!isPublic) container.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  } catch (error) {
    if (renderId !== state.renderId) return;
    console.error(error);
    mount(container, errorState(error));
    container.querySelector("[data-retry]")?.addEventListener("click", render);
  }
}

function renderNotFound(view) {
  setCrumbs([{ label: "Not found" }]);
  document.title = `Page not found · ${APP_NAME}`;
  mount(view, html`<div class="state-page">
    <p class="state-code">404</p>
    <h1>This page could not be found</h1>
    <p class="muted">The address may be mistyped, or the record may have been removed.</p>
    <div class="state-actions">
      <a class="btn btn-primary" href="/">${icon("home")}Back to dashboard</a>
      <a class="btn btn-secondary" href="/students">${icon("students")}Browse students</a>
    </div>
  </div>`);
}

function renderForbidden(view) {
  setCrumbs([{ label: "Restricted" }]);
  mount(view, html`<div class="state-page">
    <p class="state-code">403</p>
    <h1>Administrator access required</h1>
    <p class="muted">Your account does not have permission to open this page.</p>
    <div class="state-actions"><a class="btn btn-primary" href="/">${icon("home")}Back to dashboard</a></div>
  </div>`);
}

/* ---------- Shell ---------- */

function sidebarCollapsed() {
  try { return localStorage.getItem("sms-sidebar") === "collapsed"; } catch { return false; }
}

function renderShell() {
  if (document.getElementById("view")) return;
  const user = state.user;
  const app = document.getElementById("app");
  app.classList.toggle("collapsed", sidebarCollapsed());
  mount(app, html`
    <a class="skip-link" href="#view">Skip to content</a>
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">${raw('<svg viewBox="0 0 32 32"><path d="M16 3 3 9.5 16 16l13-6.5L16 3Z" fill="currentColor"/><path d="M8 13v6.5c0 2.5 3.6 4.5 8 4.5s8-2 8-4.5V13l-8 4-8-4Z" fill="currentColor" opacity=".7"/><path d="M27 10v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>')}</span>
        <span class="brand-text"><strong>${APP_NAME}</strong><small>${INSTITUTION}</small></span>
      </div>
      <nav class="nav">
        ${NAV.filter((n) => !n.admin || session.isAdmin).map((n) => n.section
          ? html`<p class="nav-section">${n.section}</p>`
          : html`<a class="nav-link" href="${n.path}" data-nav="${n.path}" data-tip="${n.label}">${icon(n.icon)}<span>${n.label}</span></a>`)}
      </nav>
      <button class="collapse-btn" data-collapse aria-label="Collapse sidebar">${icon("panel")}<span>Collapse</span></button>
    </aside>
    <div class="sidebar-scrim" data-close-nav></div>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn mobile-only" data-open-nav aria-label="Open navigation">${icon("menu")}</button>
        <nav class="breadcrumbs" aria-label="Breadcrumb"></nav>
        <div class="search" role="search">
          ${icon("search")}
          <input type="search" placeholder="Search students, courses, faculty…" aria-label="Global search" autocomplete="off" data-global-search>
          <kbd>/</kbd>
          <div class="search-results" hidden></div>
        </div>
        <button class="icon-btn" data-theme-toggle></button>
        <div class="user-menu">
          <button class="user-btn" aria-haspopup="menu" aria-expanded="false" data-user-btn>
            <span class="avatar avatar-sm">${initials(user.full_name)}</span>
            <span class="user-meta"><strong>${user.full_name}</strong><small>${label(user.role)}</small></span>
            ${icon("chevronDown")}
          </button>
          <div class="menu" role="menu" hidden>
            <a role="menuitem" href="/account">${icon("key")}Change password</a>
            <button role="menuitem" data-logout>${icon("logout")}Sign out</button>
          </div>
        </div>
      </header>
      <main id="view" class="view" tabindex="-1"></main>
    </div>`);

  applyTheme(currentTheme());
  app.querySelector("[data-theme-toggle]").addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
  app.querySelector("[data-collapse]").addEventListener("click", () => {
    const collapsed = !app.classList.contains("collapsed");
    app.classList.toggle("collapsed", collapsed);
    try { localStorage.setItem("sms-sidebar", collapsed ? "collapsed" : "open"); } catch { /* ignore */ }
  });
  app.querySelector("[data-open-nav]").addEventListener("click", () => app.classList.add("nav-open"));
  app.querySelector("[data-close-nav]").addEventListener("click", () => app.classList.remove("nav-open"));

  const userBtn = app.querySelector("[data-user-btn]");
  const menu = app.querySelector(".menu");
  const toggleMenu = (open) => {
    menu.hidden = !open;
    userBtn.setAttribute("aria-expanded", String(open));
  };
  userBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener("click", () => toggleMenu(false));
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { toggleMenu(false); userBtn.focus(); } });
  app.querySelector("[data-logout]").addEventListener("click", logout);

  setupGlobalSearch(app.querySelector(".search"));
}

function highlightNav() {
  const path = location.pathname;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const target = a.dataset.nav;
    const active = target === "/" ? path === "/" : path === target || path.startsWith(target + "/");
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.getElementById("app").classList.remove("nav-open");
}

function setCrumbs(items) {
  const nav = document.querySelector(".breadcrumbs");
  if (!nav) return;
  const all = [{ label: "Home", href: "/" }, ...items];
  mount(nav, html`<ol>${all.map((c, i) => html`<li>
    ${c.href && i < all.length - 1 ? html`<a href="${c.href}">${c.label}</a>` : html`<span aria-current="${i === all.length - 1 ? "page" : "false"}">${c.label}</span>`}
  </li>`)}</ol>`);
}

/* ---------- Global search ---------- */

function setupGlobalSearch(box) {
  const input = box.querySelector("input");
  const panel = box.querySelector(".search-results");
  let items = [];
  let active = -1;

  const close = () => { panel.hidden = true; active = -1; };
  const highlight = () => panel.querySelectorAll("a").forEach((a, i) => a.classList.toggle("active", i === active));

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    try {
      const r = await api.get("/api/search", { q });
      if (input.value.trim() !== q) return;
      const groups = [
        ["Students", r.students.map((s) => ({ href: `/students/${s.id}`, title: s.full_name, meta: `${s.roll_no} · ${s.email}`, icon: "students" }))],
        ["Courses", r.courses.map((c) => ({ href: `/courses/${c.id}`, title: c.name, meta: c.code, icon: "book" }))],
        ["Faculty", r.faculty.map((f) => ({ href: `/faculty?q=${encodeURIComponent(f.full_name)}`, title: f.full_name, meta: `${f.employee_id} · ${f.designation}`, icon: "faculty" }))],
        ["Departments", r.departments.map((d) => ({ href: `/departments/${d.id}`, title: d.name, meta: d.code, icon: "building" }))]
      ].filter(([, list]) => list.length);
      items = groups.flatMap(([, list]) => list);
      active = -1;
      mount(panel, groups.length
        ? html`${groups.map(([title, list]) => html`<p class="search-group">${title}</p>${list.map((i) => html`
            <a href="${i.href}">${icon(i.icon)}<span><strong>${i.title}</strong><small>${i.meta}</small></span></a>`)}`)}`
        : html`<p class="search-empty">No matches for “${q}”</p>`);
      panel.hidden = false;
    } catch (error) {
      showError(error);
    }
  }, 220);

  input.addEventListener("input", run);
  input.addEventListener("focus", () => { if (panel.innerHTML && input.value.trim().length >= 2) panel.hidden = false; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      highlight();
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      navigate(items[active].href);
      input.value = "";
      close();
    } else if (e.key === "Escape") {
      close();
      input.blur();
    }
  });
  panel.addEventListener("click", (e) => { if (e.target.closest("a")) { input.value = ""; close(); } });
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (e.key === "/" && !typing && !document.body.classList.contains("modal-open")) {
      e.preventDefault();
      input.focus();
    }
  });
}

/* ---------- Session ---------- */

export function setUser(user) {
  state.user = user;
}

async function logout() {
  try {
    await api.post("/api/auth/logout");
  } catch { /* the session ends locally either way */ }
  state.user = null;
  mount(document.getElementById("app"), "");
  navigate("/login", { replace: true });
  toast("You have been signed out.", "info");
}

setUnauthorizedHandler(() => {
  if (!state.user) return;
  state.user = null;
  mount(document.getElementById("app"), "");
  toast("Your session has ended. Please sign in again.", "warning");
  const next = location.pathname + location.search;
  navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
});

// Intercept same-origin links so navigation stays inside the app
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target === "_blank" || a.hasAttribute("download")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (a.getAttribute("href").startsWith("#")) return;
  e.preventDefault();
  navigate(url.pathname + url.search);
});

window.addEventListener("popstate", render);

async function boot() {
  applyTheme(storedTheme() || currentTheme());
  try {
    const { user } = await api.get("/api/auth/me");
    state.user = user;
  } catch {
    state.user = null;
  }
  render();
}

boot();
