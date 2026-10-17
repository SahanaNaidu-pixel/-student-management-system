// Password hashing, login sessions and login rate limiting
import crypto from "node:crypto";
import { db } from "../db.js";
import { config } from "../config.js";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
export const SESSION_COOKIE = "sms_session";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

// Password policy shared by user creation and password changes
export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 8) return "Use at least 8 characters";
  if (password.length > 128) return "Use at most 128 characters";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers";
  return null;
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// Creates a session and returns the raw token. Only its hash is stored.
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  return token;
}

export function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export function userForToken(token) {
  if (!token) return null;
  const user = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
  `).get(sha256(token), new Date().toISOString());
  return user ? { ...user } : null;
}

export function sessionCookie(token) {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${config.sessionTtlHours * 3600}`];
  if (config.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Allows 5 failed logins per username+IP every 15 minutes
const failedLogins = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function loginLocked(key) {
  const entry = failedLogins.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failedLogins.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailedLogin(key) {
  const entry = failedLogins.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failedLogins.set(key, { count: 1, first: Date.now() });
  else entry.count++;
}

export function clearFailedLogins(key) {
  failedLogins.delete(key);
}
