// Declarative input validation. Each rule returns [cleanValue, errorMessage].
import { HttpError } from "./http.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// Today as YYYY-MM-DD in the server's local time zone (matches what users see)
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isValidDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const v = {
  string({ required = false, min = 0, max = 200, pattern, patternMessage, transform } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      if (typeof value !== "string" && typeof value !== "number") return [null, "Must be text"];
      let s = String(value).trim().replace(/\s+/g, " ");
      if (transform) s = transform(s);
      if (s.length < min) return [null, `Must be at least ${min} characters`];
      if (s.length > max) return [null, `Must be at most ${max} characters`];
      if (pattern && !pattern.test(s)) return [null, patternMessage || "Invalid format"];
      return [s, null];
    };
  },

  email({ required = false } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      const s = String(value).trim().toLowerCase();
      if (s.length > 254 || !EMAIL.test(s)) return [null, "Enter a valid email address"];
      return [s, null];
    };
  },

  phone({ required = false } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      const s = String(value).replace(/[\s-]/g, "");
      if (!/^\+?\d{10,15}$/.test(s)) return [null, "Enter a 10–15 digit phone number"];
      return [s, null];
    };
  },

  int({ required = false, min = -Infinity, max = Infinity } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      const n = Number(value);
      if (!Number.isInteger(n)) return [null, "Must be a whole number"];
      if (n < min || n > max) return [null, `Must be between ${min} and ${max}`];
      return [n, null];
    };
  },

  number({ required = false, min = -Infinity, max = Infinity } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      const n = Number(value);
      if (!Number.isFinite(n)) return [null, "Must be a number"];
      if (n < min || n > max) return [null, `Must be between ${min} and ${max}`];
      return [Math.round(n * 100) / 100, null];
    };
  },

  date({ required = false, notFuture = false } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      const s = String(value).trim();
      if (!isValidDate(s)) return [null, "Enter a valid date (YYYY-MM-DD)"];
      if (notFuture && s > localToday()) return [null, "Date cannot be in the future"];
      return [s, null];
    };
  },

  oneOf(options, { required = false } = {}) {
    return (value) => {
      if (isBlank(value)) return [null, required ? "This field is required" : null];
      if (!options.includes(value)) return [null, `Must be one of: ${options.join(", ")}`];
      return [value, null];
    };
  },

  bool() {
    return (value) => [value === true || value === "true" || value === 1, null];
  }
};

// Validates input against rules; throws a 422 with per-field messages on failure
export function validate(input, rules) {
  const value = {};
  const fields = {};
  for (const [key, rule] of Object.entries(rules)) {
    const [clean, error] = rule(input[key]);
    if (error) fields[key] = error;
    else value[key] = clean;
  }
  if (Object.keys(fields).length) {
    throw new HttpError(422, "Please correct the highlighted fields.", fields);
  }
  return value;
}

export function parseId(value, what = "ID") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${what}.`);
  return n;
}

// Reads ?page=&pageSize= with safe bounds
export function pagination(query, defaultSize = 10) {
  const page = Math.max(1, Number.parseInt(query.get("page"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.get("pageSize"), 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Returns a whitelisted ORDER BY clause from ?sort=&dir=
export function sorting(query, allowed, fallback) {
  const key = query.get("sort");
  const column = allowed[key] || allowed[fallback];
  const dir = query.get("dir") === "desc" ? "DESC" : "ASC";
  return `${column} ${dir}`;
}

// Escapes LIKE wildcards in user input and wraps it in %...% (use with ESCAPE '\')
export function likePattern(text) {
  return "%" + String(text).replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
}
