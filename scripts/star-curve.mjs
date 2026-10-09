#!/usr/bin/env node
// Star history for a GitHub repo as an SVG chart and a CSV. Zero dependencies, Node 18+.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { insideState, safeWrite, stateDir, tempPath } from "./lib/safe-write.mjs";

const HELP = `star-curve: draw a repo's star history as SVG + CSV

Usage:
  node star-curve.mjs <owner/repo> [options]

Options:
  --bucket day|hour       Group stars per UTC day (default) or hour
  --since YYYY-MM-DD      Start of the chart (UTC). Earlier stars still count toward the total
  --until YYYY-MM-DD      End of the chart (UTC, exclusive)
  --mark "DATE=Label"     Draw a marker line. DATE is YYYY-MM-DD or a full ISO time. Repeatable
  --title "Text"          Chart title (default: owner/repo)
  --theme auto|light|dark Colors. auto follows the viewer's system theme (default)
  --width N --height N    Size in px (default 960 x 480)
  --from-file PATH        Read starred_at timestamps (one per line) instead of calling GitHub
  --out DIR               Output folder inside .launchmaxxing/ (default .launchmaxxing/receipts)
  --stdout svg|csv        Print one output to stdout and write nothing
  --card                  Draw a 1200x675 share card (<name>-card.svg) instead of the chart.
                          Always dark, so --theme, --width and --height are ignored
  --no-mark               Leave the small launchmaxxing.co mark off the card
  --png                   Also save a PNG at 2x (X and most sites don't take SVG). Uses a
                          converter you already have: rsvg-convert, ImageMagick, or
                          Chrome, Chromium, Brave or Edge in headless mode
  -h, --help              Show this help

Needs the GitHub CLI (gh), logged in. Times are UTC.

Examples:
  node star-curve.mjs xevrion/breakscale --since 2026-08-27 --until 2026-09-10 \\
    --mark "2026-08-29=X launch post"
  node star-curve.mjs xevrion/breakscale --since 2026-08-28 --until 2026-09-06 \\
    --bucket hour --mark "2026-08-28T17:25:00Z=my post" --card
`;

function fail(msg) {
  console.error(`star-curve: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { marks: [], bucket: "day", theme: "auto", width: 960, height: 480 };
  const takesValue = new Set(["bucket", "since", "until", "mark", "title", "theme", "width", "height", "from-file", "out", "stdout"]);
  const flags = new Set(["card", "no-mark", "png"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg.startsWith("--")) {
      const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
      if (flags.has(key)) {
        if (inline !== undefined) fail(`--${key} takes no value`);
        opts[key] = true;
        continue;
      }
      if (!takesValue.has(key)) fail(`unknown option --${key}. Try --help`);
      const value = inline ?? argv[++i];
      if (value === undefined) fail(`--${key} needs a value`);
      if (key === "mark") opts.marks.push(value);
      else opts[key] = value;
    } else if (!opts.repo) opts.repo = arg;
    else fail(`unexpected argument "${arg}"`);
  }
  return opts;
}

function parseDate(text, what) {
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(t)) fail(`${what} "${text}" is not a date. Use YYYY-MM-DD or an ISO time`);
  return t;
}

function fetchStars(repo) {
  const probe = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (probe.error) fail("the GitHub CLI (gh) is not installed. Get it from https://cli.github.com, then run `gh auth login`");
  const res = spawnSync(
    "gh",
    ["api", "-H", "Accept: application/vnd.github.star+json", `repos/${repo}/stargazers`, "--paginate", "--jq", ".[].starred_at"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    const err = (res.stderr || "").trim();
    // As of 2026-10-09 GitHub returns 404 on the stargazer list of repos you don't own,
    // so check whether the repo itself exists before blaming the name.
    if (/404/.test(err) && spawnSync("gh", ["api", `repos/${repo}`, "--silent"]).status === 0) {
      fail(`GitHub only lists stargazers with dates to the repo's owner. Run this as the owner of ${repo}, or pass a saved list with --from-file.`);
    }
    fail(`gh api failed for ${repo}:\n${err}\nIs the name right, and are you logged in (gh auth status)?`);
  }
  return res.stdout.split("\n").filter(Boolean);
}

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

const fmt = new Intl.NumberFormat("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (t) => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildSeries(times, { bucket, since, until }) {
  const size = bucket === "hour" ? 3_600_000 : 86_400_000;
  const sorted = times.map((s) => Date.parse(s)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
  if (sorted.length === 0) fail("no stars found");
  const floor = (t) => Math.floor(t / size) * size;
  const start = floor(since ?? sorted[0]);
  const end = until ?? floor(sorted[sorted.length - 1]) + size;
  if (end <= start) fail("--until must be after --since");

  let before = 0;
  const counts = new Map();
  for (const t of sorted) {
    if (t < start) before++;
    else if (t < end) counts.set(floor(t), (counts.get(floor(t)) ?? 0) + 1);
  }
  const rows = [];
  let total = before;
  for (let b = start; b < end; b += size) {
    const added = counts.get(b) ?? 0;
    total += added;
    rows.push({ start: b, added, total });
  }
  return { rows, before, start, end, size };
}

function spanLabel({ rows, size }) {
  const span = rows.length * size;
  return span >= 2 * 86_400_000 ? `${Math.round(span / 86_400_000)} days` : `${Math.round(span / 3_600_000)} hours`;
}

function parseMarks(marks, start, end) {
  return marks.map((m) => {
    const [when, label = ""] = m.split(/=(.*)/s, 2);
    const t = parseDate(when, "--mark date");
    if (t < start || t > end) fail(`--mark ${when} is outside the chart range`);
    return { t, label };
  });
}

function renderSvg(series, opts) {
  const { rows, before, start, end, size } = series;
  const W = Number(opts.width), H = Number(opts.height);
  const pad = { top: 72, right: 72, bottom: 44, left: 64 };
  const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
  const last = rows[rows.length - 1].total;
  const yStep = niceStep(Math.max(last, 1) / 4);
  const yMax = Math.ceil(Math.max(last, 1) / yStep) * yStep;
  const x = (t) => pad.left + ((t - start) / (end - start)) * plotW;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const r = (n) => Math.round(n * 10) / 10;

  const pts = [[x(start), y(before)], ...rows.map((row) => [x(row.start + size), y(row.total)])];
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${r(px)} ${r(py)}`).join(" ");
  const area = `${line} L${r(x(end))} ${r(y(0))} L${r(x(start))} ${r(y(0))} Z`;

  const grid = [];
  for (let v = 0; v <= yMax; v += yStep) {
    grid.push(`<line class="grid" x1="${pad.left}" x2="${pad.left + plotW}" y1="${r(y(v))}" y2="${r(y(v))}"/>`);
    grid.push(`<text class="tick" x="${pad.left - 10}" y="${r(y(v)) + 4}" text-anchor="end">${fmt.format(v)}</text>`);
  }

  const day = 86_400_000;
  const days = Math.ceil((end - start) / day);
  const every = Math.max(1, Math.ceil(days / 8));
  const firstDay = Math.ceil(start / day) * day;
  for (let t = firstDay, i = 0; t <= end; t += day, i++) {
    if (i % every) continue;
    grid.push(`<text class="tick" x="${r(x(t))}" y="${pad.top + plotH + 24}" text-anchor="middle">${dayLabel(t)}</text>`);
  }

  const marks = parseMarks(opts.marks, start, end).map(({ t, label }, i) => {
    const mx = r(x(t));
    // Labels sit inside the plot next to their line, one row per marker so they never collide.
    // Past the middle they flip to the left side of the line to stay on the canvas.
    const ly = pad.top + 14 + i * 20;
    const left = mx > pad.left + plotW * 0.6;
    return `<line class="mark" x1="${mx}" x2="${mx}" y1="${pad.top}" y2="${pad.top + plotH}"/>` +
      `<text class="mark-label" x="${left ? mx - 8 : mx + 8}" y="${ly}" text-anchor="${left ? "end" : "start"}">${esc(label)}</text>`;
  });

  const [ex, ey] = pts[pts.length - 1];
  const gained = last - before;
  const spanText = spanLabel(series);
  const title = esc(opts.title ?? opts.repo);

  const light = { bg: "#ffffff", fg: "#0b0b0c", muted: "#6b6b70", grid: "#ececef", line: "#111113", area: "rgba(17,17,19,0.06)", mark: "#e5484d" };
  const dark = { bg: "#0b0b0c", fg: "#f4f4f5", muted: "#8b8b92", grid: "#202024", line: "#f4f4f5", area: "rgba(244,244,245,0.08)", mark: "#ff6369" };
  // Plain colors, no CSS variables: rsvg-convert and some image pipelines ignore var().
  const colors = (c) => `text{fill:${c.fg}}.bg{fill:${c.bg}}.grid{stroke:${c.grid}}.tick,.sub{fill:${c.muted}}` +
    `.area{fill:${c.area}}.line{stroke:${c.line}}.end-dot{fill:${c.line}}.mark{stroke:${c.mark}}.mark-label{fill:${c.mark}}`;
  const themeCss = opts.theme === "dark" ? colors(dark) : opts.theme === "light" ? colors(light)
    : `${colors(light)}@media (prefers-color-scheme: dark){${colors(dark)}}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}: ${fmt.format(last)} stars, +${fmt.format(gained)} over ${spanText}">
<style>
text{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.grid{stroke-width:1}.tick{font-size:12px;font-variant-numeric:tabular-nums}
.title{font-size:18px;font-weight:600}.sub{font-size:13px}
.line{fill:none;stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round}
.mark{stroke-width:1.25;stroke-dasharray:3 4}.mark-label{font-size:12px;font-weight:500}
.end-label{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
${themeCss}</style>
<rect class="bg" width="${W}" height="${H}"/>
<text class="title" x="${pad.left}" y="30">${title}</text>
<text class="sub" x="${pad.left}" y="50">+${fmt.format(gained)} stars in ${spanText} · ${fmt.format(last)} total · UTC</text>
${grid.join("\n")}
<path class="area" d="${area}"/>
<path class="line" d="${line}"/>
${marks.join("\n")}
<circle class="end-dot" cx="${r(ex)}" cy="${r(ey)}" r="4"/>
<text class="end-label" x="${r(ex) + 10}" y="${r(ey) + 5}">${fmt.format(last)}</text>
</svg>
`;
}

// A fixed 1200x675 (16:9) card for posting, always on the Launchmaxxing dark palette.
// SVG can't measure text, so the headline numbers are monospace and laid out at 0.6em per glyph.
function renderCard(series, opts) {
  const { rows, before, start, end, size } = series;
  const W = 1200, H = 675;
  const c = { bg: "#0C0C0D", fg: "#EDEDEA", muted: "#8A8A85", faint: "#1E1E20", accent: "#FF6600" };
  const plot = { left: 64, right: W - 64, top: 340, bottom: 574 };
  const last = rows[rows.length - 1].total;
  const yMax = Math.max(last, 1) * 1.04;
  const x = (t) => plot.left + ((t - start) / (end - start)) * (plot.right - plot.left);
  const y = (v) => plot.bottom - (v / yMax) * (plot.bottom - plot.top);
  const r = (n) => Math.round(n * 10) / 10;

  const pts = [[x(start), y(before)], ...rows.map((row) => [x(row.start + size), y(row.total)])];
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${r(px)} ${r(py)}`).join(" ");
  const area = `${line} L${r(x(end))} ${plot.bottom} L${r(x(start))} ${plot.bottom} Z`;
  // Curve height at any time, read off the drawn points, so marker dots sit on the line.
  const yAt = (px) => {
    const k = pts.findIndex(([qx]) => qx >= px);
    if (k <= 0) return pts[Math.max(k, 0)][1];
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    return x1 === x0 ? y1 : y0 + ((px - x0) / (x1 - x0)) * (y1 - y0);
  };

  const grid = [], ticks = [];
  const yStep = niceStep(Math.max(last, 1) / 3);
  for (let v = yStep; v < yMax; v += yStep) {
    grid.push(`<line class="grid" x1="${plot.left}" x2="${plot.right}" y1="${r(y(v))}" y2="${r(y(v))}"/>`);
    ticks.push(`<text class="tick num" x="${plot.left}" y="${r(y(v)) - 8}">${fmt.format(v)}</text>`);
  }

  // Labels share one row above the plot and only drop to a second row when they would overlap.
  // Widths are estimated (SVG can't measure text), about 0.55em per character at 17px.
  const rowEnds = [-Infinity, -Infinity];
  const marks = parseMarks(opts.marks, start, end).sort((a, b) => a.t - b.t).map(({ t, label }) => {
    const mx = r(x(t));
    const left = mx > plot.left + (plot.right - plot.left) * 0.6;
    const w = label.length * 17 * 0.55;
    const [x0, x1] = left ? [mx - w, mx] : [mx, mx + w];
    let row = rowEnds.findIndex((endX) => endX + 14 < x0);
    if (row < 0) row = rowEnds.indexOf(Math.min(...rowEnds));
    rowEnds[row] = x1;
    const ly = plot.top - 14 - row * 20;
    return `<line class="mark" x1="${mx}" x2="${mx}" y1="${ly + 8}" y2="${plot.bottom}"/>` +
      `<circle class="mark-dot" cx="${mx}" cy="${r(yAt(mx))}" r="5"/>` +
      `<text class="mark-label" x="${mx}" y="${ly}" text-anchor="${left ? "end" : "start"}">${esc(label)}</text>`;
  });

  // Headline: "8 [arrow] 1,051 stars". The arrow is a path, never a text glyph.
  // Tracking is pulled in a little so the full-width monospace comma doesn't leave a hole.
  const NUM = 104, track = -0.05 * NUM, adv = 0.6 * NUM + track, base = 230;
  const from = fmt.format(before), to = fmt.format(last);
  const ax1 = plot.left + from.length * adv + 30, ax2 = ax1 + 80, ay = base - 0.36 * NUM;
  const toX = ax2 + 30, starsX = toX + to.length * adv + 22;
  const arrow = `M${r(ax1)} ${r(ay)} H${r(ax2)} M${r(ax2 - 22)} ${r(ay - 22)} L${r(ax2)} ${r(ay)} L${r(ax2 - 22)} ${r(ay + 22)}`;

  const [owner, name] = opts.repo.split("/");
  const heading = opts.title ? esc(opts.title) : `<tspan class="dim">${esc(owner)}/</tspan>${esc(name)}`;
  const spanText = spanLabel(series);
  const lastDay = new Date(end - 1), firstDay = new Date(start);
  const sameYear = firstDay.getUTCFullYear() === lastDay.getUTCFullYear();
  const range = dayLabel(start) === dayLabel(end - 1) && sameYear
    ? `${dayLabel(start)}, ${lastDay.getUTCFullYear()}`
    : `${dayLabel(start)}${sameYear ? "" : `, ${firstDay.getUTCFullYear()}`} to ${dayLabel(end - 1)}, ${lastDay.getUTCFullYear()}`;
  const [ex, ey] = pts[pts.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.title ?? opts.repo)}: ${from} to ${to} stars in ${spanText}">
<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.accent}" stop-opacity="0.30"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></linearGradient></defs>
<style>
text{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;fill:${c.fg}}
.num{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"JetBrains Mono","DejaVu Sans Mono",monospace;font-variant-numeric:tabular-nums}
.repo{font-size:30px;font-weight:600}.dim,.tick,.foot,.stars{fill:${c.muted}}
.big{font-size:${NUM}px;font-weight:600;letter-spacing:${r(track)}px}.stars{font-size:44px;font-weight:500}.window{font-size:30px}
.arrow{fill:none;stroke:${c.accent};stroke-width:8;stroke-linecap:round;stroke-linejoin:round}
.grid{stroke:${c.faint};stroke-width:1}.base{stroke:#2C2C2F;stroke-width:1.5}
.tick{font-size:14px;paint-order:stroke;stroke:${c.bg};stroke-width:6px;stroke-linejoin:round}
.line{fill:none;stroke:${c.accent};stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.mark{stroke:${c.muted};stroke-width:1.25;stroke-dasharray:3 5}.mark-dot{fill:${c.fg};stroke:${c.bg};stroke-width:3}
.mark-label{font-size:17px;font-weight:500}.foot{font-size:17px}
</style>
<rect width="${W}" height="${H}" fill="${c.bg}"/>
<text class="repo" x="${plot.left}" y="92">${heading}</text>
<text class="big num" x="${plot.left}" y="${base}">${from}</text>
<path class="arrow" d="${arrow}"/>
<text class="big num" x="${r(toX)}" y="${base}">${to}</text>
<text class="stars" x="${r(starsX)}" y="${base}">stars</text>
<text class="window" x="${plot.left}" y="${base + 52}">in ${spanText}</text>
${grid.join("\n")}
<path d="${area}" fill="url(#fade)"/>
<line class="base" x1="${plot.left}" x2="${plot.right}" y1="${plot.bottom}" y2="${plot.bottom}"/>
<path class="line" d="${line}"/>
${marks.join("\n")}
${ticks.join("\n")}
<circle cx="${r(ex)}" cy="${r(ey)}" r="12" fill="${c.accent}" fill-opacity="0.22"/>
<circle cx="${r(ex)}" cy="${r(ey)}" r="6" fill="${c.accent}"/>
<text class="foot num" x="${plot.left}" y="628">${range} · UTC</text>
${opts["no-mark"] ? "" : `<text class="foot" x="${plot.right}" y="628" text-anchor="end">launchmaxxing.co</text>\n`}</svg>
`;
}

function renderCsv(series) {
  const lines = ["bucket_start_utc,new_stars,total_stars"];
  for (const row of series.rows) lines.push(`${new Date(row.start).toISOString()},${row.added},${row.total}`);
  return lines.join("\n") + "\n";
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
// A part made only of dots ("..") would turn repos/<owner>/<repo> into a different API path.
if (!opts.repo || !/^[\w.-]+\/[\w.-]+$/.test(opts.repo) || opts.repo.split("/").some((p) => /^\.+$/.test(p))) fail("give the repo as owner/repo. Try --help");
if (!["day", "hour"].includes(opts.bucket)) fail("--bucket must be day or hour");
if (!["auto", "light", "dark"].includes(opts.theme)) fail("--theme must be auto, light or dark");
if (opts.stdout && !["svg", "csv"].includes(opts.stdout)) fail("--stdout must be svg or csv");
for (const k of ["width", "height"]) if (!(Number(opts[k]) >= 200)) fail(`--${k} must be a number of at least 200`);

const outArg = opts.out ?? join(".launchmaxxing", "receipts");
if (!opts.stdout) insideState(outArg, fail);

let times;
if (opts["from-file"]) {
  try {
    times = readFileSync(opts["from-file"], "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    fail(`cannot read ${opts["from-file"]}: ${e.message}`);
  }
} else times = fetchStars(opts.repo);

const series = buildSeries(times, {
  bucket: opts.bucket,
  since: opts.since ? parseDate(opts.since, "--since") : undefined,
  until: opts.until ? parseDate(opts.until, "--until") : undefined,
});
const svg = opts.card ? renderCard(series, opts) : renderSvg(series, opts);
const csv = renderCsv(series);

if (opts.stdout) {
  process.stdout.write(opts.stdout === "svg" ? svg : csv);
} else {
  const out = stateDir(outArg, fail);
  const base = `star-curve-${opts.repo.replace("/", "-")}-${new Date().toISOString().slice(0, 10)}`;
  const svgName = opts.card ? `${base}-card.svg` : `${base}.svg`;
  safeWrite(join(out, svgName), svg);
  safeWrite(join(out, `${base}.csv`), csv);
  const last = series.rows[series.rows.length - 1].total;
  console.log(`${opts.repo}: ${fmt.format(last)} stars, +${fmt.format(last - series.before)} in range`);
  console.log(`wrote ${relative(process.cwd(), join(out, svgName))} and ${relative(process.cwd(), join(out, base))}.csv`);
  if (opts.png) {
    const svgPath = join(out, svgName), pngPath = svgPath.replace(/\.svg$/, ".png");
    const [w, h] = opts.card ? [1200, 675] : [Number(opts.width), Number(opts.height)];
    const used = toPng(svgPath, pngPath, w, h);
    if (used) console.log(`wrote ${relative(process.cwd(), pngPath)} (with ${used})`);
    else console.error("star-curve: no converter found for --png. Install librsvg (rsvg-convert) or ImageMagick, or open the SVG in a browser and take a screenshot.");
  }
}

// Tries converters the buyer may already have, so the kit stays dependency-free.
// They write to a fresh temp name that is then renamed over pngPath, so a symlink planted at
// pngPath gets replaced instead of written through.
function toPng(svgPath, pngPath, w, h) {
  const tmp = tempPath(dirname(pngPath), ".png");
  const ok = (cmd, args) => {
    rmSync(tmp, { force: true });
    const res = spawnSync(cmd, args, { stdio: "ignore", timeout: 30_000 });
    return !res.error && res.status === 0 && existsSync(tmp);
  };
  try {
    const used = firstConverter(ok, svgPath, tmp, w, h);
    if (used) renameSync(tmp, pngPath);
    else rmSync(pngPath, { force: true });
    return used;
  } finally {
    rmSync(tmp, { force: true });
  }
}

function firstConverter(ok, svgPath, pngPath, w, h) {
  if (ok("rsvg-convert", ["-z", "2", svgPath, "-o", pngPath])) return "rsvg-convert";
  if (ok("magick", ["-density", "192", "-background", "none", svgPath, pngPath])) return "ImageMagick";
  const browsers = [
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave-browser", "microsoft-edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const url = `file://${resolve(svgPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1:")}`;
  for (const b of browsers) {
    if (ok(b, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", `--window-size=${w},${h}`, `--screenshot=${resolve(pngPath)}`, url])) return b.split(/[\\/]/).pop();
  }
  return null;
}
