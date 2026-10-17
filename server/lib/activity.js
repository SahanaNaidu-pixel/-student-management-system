// Audit trail shown as "Recent activity" on the dashboard
import { db } from "../db.js";

export function logActivity(user, action, entity, entityId, summary) {
  db.prepare("INSERT INTO activity_log (user_id, action, entity, entity_id, summary) VALUES (?, ?, ?, ?, ?)")
    .run(user ? user.id : null, action, entity, entityId ?? null, summary);
}
