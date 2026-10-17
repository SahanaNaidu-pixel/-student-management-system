// SQLite connection, migrations and transaction helper
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config, ROOT } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");

// Runs fn inside a transaction; rolls back if it throws
export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Applies every migrations/*.sql file that has not been applied yet, in name order
export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const dir = path.join(ROOT, "server", "migrations");
  const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name));
  const pending = fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();

  for (const name of pending) {
    transaction(() => {
      db.exec(fs.readFileSync(path.join(dir, name), "utf8"));
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
    });
    console.log(`Applied migration ${name}`);
  }
  return pending;
}
