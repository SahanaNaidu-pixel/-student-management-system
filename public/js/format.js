// Display formatting for dates, numbers and labels

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" });

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"; plain dates are "YYYY-MM-DD"
function parse(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + "T00:00:00");
  return new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
}

export const formatDate = (v) => (v ? dateFmt.format(parse(v)) : "—");
export const formatShortDate = (v) => (v ? shortDateFmt.format(parse(v)) : "—");
export const formatMonth = (yyyyMm) => monthFmt.format(new Date(yyyyMm + "-01T00:00:00"));

export function timeAgo(value) {
  const date = parse(value);
  if (!date) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${unit}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function daysUntil(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parse(isoDate) - today) / 86400000);
}

export const pct = (v, digits = 1) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(digits).replace(/\.0+$/, "")}%`);
export const num = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-IN"));
export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
export const label = (s) => capitalize(String(s || "").replace(/-/g, " "));

export function initials(name) {
  return String(name || "?").replace(/^Dr\.\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
