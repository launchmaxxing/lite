#!/usr/bin/env node
// Checks one case from evals.json against a saved reply. Zero dependencies, Node 18+.
// Run it from the scratch copy the case ran in, so the files the skill wrote are there.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `check: score one eval case

Usage:
  node evals/check.mjs <case id> <reply file> [--cwd DIR] [--transcript FILE]

  <reply file>        the skill's final reply, saved as text
  --cwd DIR           folder the case ran in (default: current folder)
  --transcript FILE   stream-json transcript (claude -p --output-format stream-json --verbose),
                      needed only for skill_triggered
  --list              print the case ids

Exit codes: 0 all passed, 1 a check failed, 2 usage error. Checks that need a missing input
print SKIP and don't fail the case.
`;

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, "evals.json"), "utf8"));
const args = process.argv.slice(2);
const pos = [];
let cwd = process.cwd(), transcript = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") {
    process.stdout.write(HELP);
    process.exit(0);
  } else if (a === "--list") {
    for (const e of spec.evals) console.log(`${e.id}  (${e.skill})`);
    process.exit(0);
  } else if (a === "--cwd") cwd = resolve(args[++i]);
  else if (a === "--transcript") transcript = args[++i];
  else pos.push(a);
}
const [id, replyPath] = pos;
if (!id || !replyPath) usage("give a case id and a reply file");
const c = spec.evals.find((e) => e.id === id);
if (!c) usage(`no case "${id}", try --list`);

function usage(msg) {
  console.error(`check: ${msg}. Try --help`);
  process.exit(2);
}

const reply = readFileSync(replyPath, "utf8").replace(/\s+$/, "");
const lintScript = join(here, "..", "scripts", "slop-lint.mjs");

// Patterns may start with (?i), which JavaScript doesn't support inline.
const re = (p) => (p.startsWith("(?i)") ? new RegExp(p.slice(4), "i") : new RegExp(p));

function files(dir = cwd, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (e.isFile()) out.push(relative(cwd, p).split("\\").join("/"));
  }
  return out;
}
const globRe = (g) => new RegExp("^" + g.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
const glob = (g) => files().filter((f) => globRe(g).test(f));
const read = (f) => readFileSync(join(cwd, f), "utf8");
const numbers = (t) => new Set((t.match(/\d+(?:[.,]\d+)*k?/gi) || []).map((n) => n.replace(/,/g, "").toLowerCase()));
const DASH = /[\u2013\u2014]/;

const checks = {
  reply_matches: (a) => re(a.pattern).test(reply) || `no match for /${a.pattern}/`,
  reply_not_matches: (a) => !re(a.pattern).test(reply) || `matched /${a.pattern}/`,
  last_line_equals: (a) => reply.split("\n").pop().trim() === a.text || `last line is "${reply.split("\n").pop().trim()}"`,
  no_dashes: () => !DASH.test(reply) || "reply has an em or en dash",
  file_exists: (a) => glob(a.glob).length > 0 || `nothing matches ${a.glob}`,
  no_file: (a) => glob(a.glob).length === 0 || `found ${glob(a.glob).join(", ")}`,
  file_contains: (a) => {
    const m = glob(a.glob);
    if (!m.length) return `nothing matches ${a.glob}`;
    return m.every((f) => read(f).includes(a.text)) || `"${a.text}" missing`;
  },
  slop_lint_clean: (a) => {
    const m = glob(a.glob);
    if (!m.length) return `nothing matches ${a.glob}`;
    const res = spawnSync(process.execPath, [lintScript, ...m.map((f) => join(cwd, f))], { encoding: "utf8" });
    return res.status === 0 || res.stdout.trim().split("\n").slice(-1)[0];
  },
  no_new_numbers: (a) => {
    const m = glob(a.glob);
    if (!m.length) return `nothing matches ${a.glob}`;
    const allowed = numbers(readFileSync(join(cwd, a.source), "utf8"));
    const extra = [...new Set(m.flatMap((f) => [...numbers(read(f))]))].filter((n) => !allowed.has(n));
    return extra.length === 0 || `new numbers: ${extra.join(", ")}`;
  },
  fixed_is_lowercase: (a) => {
    const m = glob(a.glob);
    if (!m.length) return `nothing matches ${a.glob}`;
    const bad = m.flatMap((f) => read(f).split("\n").filter((l) => /(^|[.!?]\s+)[A-Z]/.test(l.trim()) || /\bI\b/.test(l)));
    return bad.length === 0 || `capitalised: "${bad[0].trim()}"`;
  },
  saved_draft_equals: (a) => {
    const want = readFileSync(join(cwd, a.source), "utf8").trim();
    const saved = glob(".launchmaxxing-lite/drafts/*.md").filter((f) => !f.endsWith("-fixed.md"));
    return saved.some((f) => read(f).trim() === want) || "no saved draft matches the paste exactly";
  },
  same_as_git_head: (a) => {
    const res = spawnSync("git", ["-C", cwd, "show", `HEAD:${a.path}`], { encoding: "utf8" });
    if (res.status !== 0) return "SKIP: not a git checkout";
    return res.stdout === read(a.path) || `${a.path} was changed`;
  },
  skill_triggered: (a) => {
    if (!transcript) return "SKIP: needs --transcript";
    const used = readFileSync(transcript, "utf8").split("\n").filter(Boolean).some((l) => {
      const m = JSON.parse(l);
      return m.type === "assistant" && m.message.content.some((x) => x.type === "tool_use" && x.name === "Skill" && String(x.input.skill).endsWith(a.skill.split(":").pop()));
    });
    return used || `${a.skill} was not invoked`;
  },
};

let failed = 0;
for (const a of c.assertions) {
  const fn = checks[a.type];
  const r = fn ? fn(a) : `unknown assertion type ${a.type}`;
  const skip = typeof r === "string" && r.startsWith("SKIP");
  if (r !== true && !skip) failed++;
  const label = `${a.type}${a.pattern ? ` /${a.pattern}/` : a.glob ? ` ${a.glob}` : a.path ? ` ${a.path}` : ""}`;
  console.log(`${r === true ? "PASS" : skip ? "SKIP" : "FAIL"}  ${label}${r === true ? "" : `  ${skip ? r.slice(6) : r}`}`);
}
console.log(`\n${c.id}: ${c.assertions.length - failed}/${c.assertions.length} passed`);
process.exit(failed ? 1 : 0);
