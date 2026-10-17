// Small HTTP toolkit: errors, router, JSON bodies and responses

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new HttpError(400, message, fields);
export const notFound = (what = "Record") => new HttpError(404, `${what} not found.`);
export const conflict = (message, fields) => new HttpError(409, message, fields);
export const forbidden = () => new HttpError(403, "You do not have permission to do that.");
export const unauthorized = () => new HttpError(401, "Please sign in to continue.");

// Converts SQLite constraint failures into friendly HTTP errors
export function fromDbError(error) {
  const message = String(error.message || "");
  const unique = message.match(/UNIQUE constraint failed: \w+\.(\w+)/);
  if (unique) {
    const field = unique[1];
    return conflict(`Another record already uses this ${field.replace(/_/g, " ")}.`, { [field]: "Already in use" });
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    return conflict("This record is linked to other records, so it cannot be changed or deleted.");
  }
  if (message.includes("CHECK constraint failed")) {
    return badRequest("One of the values is outside the allowed range.");
  }
  return null;
}

export function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(payload);
}

export function readJsonBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const type = req.headers["content-type"] || "";
    const hasBody = Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"];
    if (!hasBody) return resolve({});
    // Requiring JSON blocks cross-site HTML form submissions (CSRF)
    if (!type.startsWith("application/json")) {
      return reject(new HttpError(415, "Requests must be sent as JSON."));
    }
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, "The request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        resolve(parsed);
      } catch {
        reject(badRequest("The request body is not valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

// Router with :param placeholders. Each route lists the roles allowed to use it.
export function createRouter() {
  const routes = [];

  function add(method, pattern, roles, handler) {
    const keys = [];
    const regex = new RegExp(
      "^" + pattern.replace(/:(\w+)/g, (_, key) => (keys.push(key), "([^/]+)")) + "/?$"
    );
    routes.push({ method, regex, keys, roles, handler });
  }

  function match(method, pathname) {
    let pathMatched = false;
    for (const route of routes) {
      const m = pathname.match(route.regex);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((key, i) => (params[key] = decodeURIComponent(m[i + 1])));
      return { route, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }

  return {
    get: (p, roles, h) => add("GET", p, roles, h),
    post: (p, roles, h) => add("POST", p, roles, h),
    put: (p, roles, h) => add("PUT", p, roles, h),
    delete: (p, roles, h) => add("DELETE", p, roles, h),
    match
  };
}

// Role sets used when registering routes
export const PUBLIC = null;
export const ANY_USER = ["admin", "staff"];
export const ADMIN = ["admin"];
