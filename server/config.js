// Application configuration, read from environment variables and an optional .env file
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader: KEY=VALUE lines, # comments. Real environment variables win.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) {
      process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

loadEnvFile(path.join(ROOT, ".env"));

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || "127.0.0.1",
  dbPath: path.resolve(ROOT, env.DB_PATH || "data/sms.db"),
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || "data/uploads"),
  publicDir: path.join(ROOT, "public"),
  sessionTtlHours: Number(env.SESSION_TTL_HOURS || 8),
  cookieSecure: env.COOKIE_SECURE === "true",
  maxPhotoBytes: 2 * 1024 * 1024
};
