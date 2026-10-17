// User account management (administrators only)
import { db, transaction } from "../db.js";
import { ADMIN, badRequest, conflict, notFound } from "../lib/http.js";
import { validate, v, parseId } from "../lib/validate.js";
import { hashPassword, passwordProblem } from "../lib/auth.js";
import { logActivity } from "../lib/activity.js";

const USERNAME = { required: true, min: 3, max: 30, pattern: /^[a-zA-Z0-9._-]+$/, patternMessage: "Use letters, numbers, dot, dash or underscore" };

const SELECT = "SELECT id, username, full_name, role, is_active, last_login_at, created_at FROM users";

function activeAdminCount(excludeId) {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?").get(excludeId).n;
}

export function register(router) {
  router.get("/api/users", ADMIN, () => ({ items: db.prepare(`${SELECT} ORDER BY full_name`).all() }));

  router.post("/api/users", ADMIN, (ctx) => {
    const input = validate(ctx.body, {
      username: v.string(USERNAME),
      full_name: v.string({ required: true, min: 2, max: 100 }),
      role: v.oneOf(["admin", "staff"], { required: true })
    });
    const problem = passwordProblem(ctx.body.password);
    if (problem) throw badRequest("Please correct the highlighted fields.", { password: problem });
    if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(input.username)) {
      throw conflict("That username is taken.", { username: "Already in use" });
    }
    const { lastInsertRowid } = db.prepare("INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)")
      .run(input.username, input.full_name, input.role, hashPassword(ctx.body.password));
    logActivity(ctx.user, "create", "user", Number(lastInsertRowid), `Created ${input.role} account ${input.username}`);
    ctx.status = 201;
    return db.prepare(`${SELECT} WHERE id = ?`).get(lastInsertRowid);
  });

  router.put("/api/users/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!existing) throw notFound("User");
    const input = validate(ctx.body, {
      full_name: v.string({ required: true, min: 2, max: 100 }),
      role: v.oneOf(["admin", "staff"], { required: true }),
      is_active: v.bool()
    });
    const losingAdmin = existing.role === "admin" && (input.role !== "admin" || !input.is_active);
    if (losingAdmin && activeAdminCount(id) === 0) {
      throw badRequest("At least one active administrator is required.");
    }
    const newPassword = ctx.body.password || null;
    if (newPassword) {
      const problem = passwordProblem(newPassword);
      if (problem) throw badRequest("Please correct the highlighted fields.", { password: problem });
    }

    transaction(() => {
      db.prepare("UPDATE users SET full_name = ?, role = ?, is_active = ? WHERE id = ?")
        .run(input.full_name, input.role, input.is_active ? 1 : 0, id);
      if (newPassword) {
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), id);
      }
      // Role, status or password changes sign the user out everywhere
      if (newPassword || !input.is_active || input.role !== existing.role) {
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      }
    });
    logActivity(ctx.user, "update", "user", id, `Updated account ${existing.username}`);
    return db.prepare(`${SELECT} WHERE id = ?`).get(id);
  });

  router.delete("/api/users/:id", ADMIN, (ctx) => {
    const id = parseId(ctx.params.id);
    if (id === ctx.user.id) throw badRequest("You cannot delete your own account.");
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!existing) throw notFound("User");
    if (existing.role === "admin" && activeAdminCount(id) === 0) {
      throw badRequest("At least one active administrator is required.");
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    logActivity(ctx.user, "delete", "user", id, `Deleted account ${existing.username}`);
    return { ok: true };
  });
}
