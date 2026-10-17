// Login, logout, current user and password change
import { db } from "../db.js";
import { HttpError, badRequest, PUBLIC, ANY_USER } from "../lib/http.js";
import { validate, v } from "../lib/validate.js";
import {
  verifyPassword, hashPassword, passwordProblem, createSession, destroySession, sessionCookie,
  clearedSessionCookie, readCookie, SESSION_COOKIE, loginLocked, recordFailedLogin, clearFailedLogins
} from "../lib/auth.js";
import { logActivity } from "../lib/activity.js";

export function register(router) {
  router.post("/api/auth/login", PUBLIC, (ctx) => {
    const input = validate(ctx.body, {
      username: v.string({ required: true, max: 50 }),
      password: v.string({ required: true, max: 128 })
    });
    const limitKey = `${input.username.toLowerCase()}|${ctx.req.socket.remoteAddress}`;
    if (loginLocked(limitKey)) {
      throw new HttpError(429, "Too many failed attempts. Please wait 15 minutes and try again.");
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").get(input.username);
    // Same message for unknown user and wrong password, so usernames cannot be guessed
    if (!user || !verifyPassword(ctx.body.password, user.password_hash)) {
      recordFailedLogin(limitKey);
      throw new HttpError(401, "Incorrect username or password.");
    }

    clearFailedLogins(limitKey);
    const token = createSession(user.id);
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    ctx.setHeader("Set-Cookie", sessionCookie(token));
    return { user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } };
  });

  router.post("/api/auth/logout", PUBLIC, (ctx) => {
    destroySession(readCookie(ctx.req, SESSION_COOKIE));
    ctx.setHeader("Set-Cookie", clearedSessionCookie());
    return { ok: true };
  });

  router.get("/api/auth/me", ANY_USER, (ctx) => ({ user: ctx.user }));

  router.post("/api/auth/password", ANY_USER, (ctx) => {
    const { currentPassword, newPassword } = ctx.body;
    const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(ctx.user.id);
    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, user.password_hash)) {
      throw badRequest("Please correct the highlighted fields.", { currentPassword: "Current password is incorrect" });
    }
    const problem = passwordProblem(newPassword);
    if (problem) throw badRequest("Please correct the highlighted fields.", { newPassword: problem });

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), ctx.user.id);
    // Sign out every other session for this user
    const current = readCookie(ctx.req, SESSION_COOKIE);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(ctx.user.id);
    destroySession(current);
    const token = createSession(ctx.user.id);
    ctx.setHeader("Set-Cookie", sessionCookie(token));
    logActivity(ctx.user, "update", "user", ctx.user.id, `${ctx.user.full_name} changed their password`);
    return { ok: true };
  });
}
