// Lightweight SVG charts drawn from real data. Colours come from CSS variables.
import { html, raw, escapeHtml } from "./html.js";

const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
export const seriesColor = (i) => SERIES[i % SERIES.length];

const round = (n) => Math.round(n * 10) / 10;

function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

const emptyChart = (text) => html`<div class="chart-empty">${text}</div>`;

// Vertical bar chart. data: [{ label, value, title }]
export function barChart(data, { height = 230, max, unit = "", ariaLabel = "Bar chart", colorByIndex = false } = {}) {
  if (!data.length) return emptyChart("No data for this period");
  const width = 460;
  const pad = { top: 16, right: 8, bottom: 34, left: 36 };
  const highest = Math.max(...data.map((d) => d.value));
  // Whole-number data (counts) gets whole-number gridlines
  const integers = data.every((d) => Number.isInteger(d.value));
  const top = max ?? (integers ? Math.max(1, Math.ceil(highest / 4)) * 4 : niceMax(highest));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(46, slot * 0.6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);

  const grid = ticks.map((t) => {
    const y = pad.top + innerH - (t / top) * innerH;
    return `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}"/>
      <text class="axis" x="${pad.left - 8}" y="${y + 4}" text-anchor="end">${round(t)}${unit}</text>`;
  }).join("");

  const bars = data.map((d, i) => {
    const h = (d.value / top) * innerH;
    const x = pad.left + slot * i + (slot - barW) / 2;
    const y = pad.top + innerH - h;
    const fill = d.color || (colorByIndex ? seriesColor(i) : "var(--chart-1)");
    return `<g class="bar">
      <title>${escapeHtml(d.title || `${d.label}: ${d.value}${unit}`)}</title>
      <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 0)}" rx="5" fill="${fill}"/>
      <text class="value" x="${x + barW / 2}" y="${y - 6}" text-anchor="middle">${round(d.value)}${unit}</text>
      <text class="axis" x="${x + barW / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(d.label)}</text>
    </g>`;
  }).join("");

  return raw(`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>`);
}

// Line/area chart. points: [{ label, value, title }]
export function lineChart(points, { height = 250, min = 0, max = 100, unit = "", ariaLabel = "Line chart" } = {}) {
  if (!points.length) return emptyChart("No records for this period");
  const width = 560;
  const pad = { top: 16, right: 16, bottom: 34, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - ((v - min) / (max - min)) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const grid = ticks.map((t) => `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${pad.left - 8}" y="${y(t) + 4}" text-anchor="end">${round(t)}${unit}</text>`).join("");

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const every = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % every === 0 || i === points.length - 1)
    ? `<text class="axis" x="${x(i)}" y="${height - 12}" text-anchor="middle">${escapeHtml(p.label)}</text>` : "").join("");
  const dots = points.map((p, i) => `<g class="dot"><title>${escapeHtml(p.title || `${p.label}: ${p.value}${unit}`)}</title>
    <circle cx="${x(i)}" cy="${y(p.value)}" r="9" class="hit"/><circle cx="${x(i)}" cy="${y(p.value)}" r="3.5"/></g>`).join("");

  return raw(`<svg class="chart chart-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="var(--chart-2)" stop-opacity="0.28"/><stop offset="100%" stop-color="var(--chart-2)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}<path class="area" d="${area}" fill="url(#area-fill)"/><path class="line" d="${line}"/>${dots}${labels}</svg>`);
}

// Donut chart with legend. segments: [{ label, value }]
export function donutChart(segments, { centerLabel = "", centerValue = "", ariaLabel = "Donut chart" } = {}) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (!total) return emptyChart("No data yet");
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((d, i) => {
    const len = (d.value / total) * c;
    const arc = `<circle class="arc" r="${r}" cx="100" cy="100" fill="none" stroke="${seriesColor(i)}" stroke-width="26"
      stroke-dasharray="${Math.max(len - 2, 0)} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)">
      <title>${escapeHtml(`${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`)}</title></circle>`;
    offset += len;
    return arc;
  }).join("");

  return html`<div class="donut">
    ${raw(`<svg viewBox="0 0 200 200" role="img" aria-label="${escapeHtml(ariaLabel)}">${arcs}
      <text x="100" y="98" text-anchor="middle" class="donut-value">${escapeHtml(centerValue)}</text>
      <text x="100" y="120" text-anchor="middle" class="donut-label">${escapeHtml(centerLabel)}</text></svg>`)}
    <ul class="legend">
      ${segments.map((d, i) => html`<li><span class="swatch" style="background:${seriesColor(i)}"></span>
        <span class="legend-label">${d.label}</span><strong>${d.value}</strong>
        <span class="muted">${Math.round((d.value / total) * 100)}%</span></li>`)}
    </ul>
  </div>`;
}

// Horizontal bars, used for rankings and distributions. data: [{ label, value, suffix }]
export function hBars(data, { max, unit = "" } = {}) {
  if (!data.length) return emptyChart("No data yet");
  const top = max ?? Math.max(...data.map((d) => d.value), 1);
  return html`<ul class="hbars">
    ${data.map((d, i) => html`<li>
      <span class="hbar-label">${d.label}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(d.value / top) * 100}%;background:${d.color || seriesColor(i)}"></span></span>
      <strong>${d.value}${unit}</strong>
    </li>`)}
  </ul>`;
}
