// Fetch wrapper for the JSON API

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, url, body) {
  const options = { method, headers: { Accept: "application/json" }, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that it is running and try again.");
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/login")) onUnauthorized();
    throw new ApiError(res.status, data?.error || `Request failed (${res.status}).`, data?.fields);
  }
  return data;
}

// Builds "?a=1&b=2" from an object, skipping empty values
export function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: (url, params) => request("GET", url + qs(params)),
  post: (url, body = {}) => request("POST", url, body),
  put: (url, body = {}) => request("PUT", url, body),
  del: (url) => request("DELETE", url)
};

// Downloads a CSV export through the browser (the session cookie authorizes it)
export function download(url, params) {
  const a = document.createElement("a");
  a.href = url + qs(params);
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
