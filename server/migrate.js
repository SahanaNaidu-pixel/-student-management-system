// npm run migrate - brings the database schema up to date
import { migrate } from "./db.js";

const applied = migrate();
console.log(applied.length ? `${applied.length} migration(s) applied.` : "Database schema is up to date.");
