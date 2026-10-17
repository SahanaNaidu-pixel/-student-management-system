// HTTP server: serves the web app from public/ and the JSON API under /api
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { migrate, db } from "./db.js";
import { createRouter, sendJson, readJsonBody, HttpError, fromDbError, unauthorized, forbidden, PUBLIC } from "./lib/http.js";
import { userForToken, readCookie, SESSION_COOKIE } from "./lib/auth.js";
import * as auth from "./routes/auth.js";
import * as users from "./routes/users.js";
import * as students from "./routes/students.js";
import * as departments from "./routes/departments.js";
import * as faculty from "./routes/faculty.js";
import * as courses from "./routes/courses.js";
import * as attendance from "./routes/attendance.js";
import * as exams from "./routes/exams.js";
import * as dashboard from "./routes/dashboard.js";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2"
};

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY"
};

const router = createRouter();
for (const module of [auth, users, students, departments, faculty, courses, attendance, exams, dashboard]) {
  module.register(router);
}

// Used by the hosting platform to check that the app and database respond
router.get("/api/health", PUBLIC, () => {
  db.prepare("SELECT 1").get();
  return { ok: true };
});

// Over HTTPS, tell browsers to always use HTTPS for this site
if (config.cookieSecure) SECURITY_HEADERS["Strict-Transport-Security"] = "max-age=15552000";

function log(req, status, started) {
  const ms = (performance.now() - started).toFixed(1);
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${status} ${ms}ms`);
}

async function handleApi(req, res, url) {
  const found = router.match(req.method, url.pathname);
  if (!found) throw new HttpError(404, "API endpoint not found.");
  if (found.methodNotAllowed) throw new HttpError(405, "Method not allowed.");
  const { route, params } = found;

  const user = userForToken(readCookie(req, SESSION_COOKIE));
  if (route.roles) {
    if (!user) throw unauthorized();
    if (!route.roles.includes(user.role)) throw forbidden();
  }

  const headers = {};
  const ctx = {
    req, res, params, user, status: 200,
    query: url.searchParams,
    body: ["POST", "PUT", "DELETE"].includes(req.method) ? await readJsonBody(req, MAX_BODY_BYTES) : {},
    setHeader: (name, value) => (headers[name] = value)
  };
  const result = await route.handler(ctx);
  // Handlers that stream a file or CSV write the response themselves
  if (!res.headersSent) sendJson(res, ctx.status, result, headers);
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = "/";
  }
  const file = path.normalize(path.join(config.publicDir, pathname));
  const insidePublic = file.startsWith(config.publicDir + path.sep);
  const isAsset = path.extname(pathname) !== "";

  if (insidePublic && isAsset && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
    return 200;
  }
  // Anything that resolves outside public/ (e.g. "/..%2f.env") is refused outright
  if (isAsset || !insidePublic) {
    res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/plain" });
    res.end("Not found");
    return 404;
  }
  // Every page route is handled by the single-page app
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
  fs.createReadStream(path.join(config.publicDir, "index.html")).pipe(res);
  return 200;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const started = performance.now();
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
      }
      log(req, serveStatic(req, res, url), started);
      return;
    }

    try {
      await handleApi(req, res, url);
      log(req, res.statusCode, started);
    } catch (error) {
      const known = error instanceof HttpError ? error : fromDbError(error);
      if (known) {
        sendJson(res, known.status, { error: known.message, fields: known.fields });
      } else {
        // Unexpected problems are logged in full but reported to the client without details
        console.error(`${new Date().toISOString()} ERROR ${req.method} ${req.url}\n`, error);
        if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong on the server. Please try again." });
        else res.end();
      }
      log(req, res.statusCode, started);
    }
  });
}

// Start only when run directly (tests import createServer instead)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate();
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount === 0) {
    console.warn("No user accounts exist yet. Run `npm run seed` to create the demo accounts and data.");
  }
  const server = createServer().listen(config.port, config.host, () => {
    console.log(`Student Management System running at http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
  });

  // On redeploy the platform sends SIGTERM: finish open requests, then close the database cleanly
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      console.log(`${signal} received, shutting down…`);
      server.close(() => {
        db.close();
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 10000).unref();
    });
  }
}
