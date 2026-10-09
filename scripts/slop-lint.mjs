#!/usr/bin/env node
// Flags AI-sounding writing in drafts. Zero dependencies, Node 18+. Exit 1 on any hit.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `slop-lint: catch AI-sounding lines in drafts before anyone reads them

Usage:
  node slop-lint.mjs <file...> [options]

Checks:
  phrase          a phrase from data/slop-phrases.txt (game-changer, unlock, delve...)
  dash            an em dash or en dash
  spaced-hyphen   " - " or " -- " used as a dash inside a sentence
  long-sentence   a sentence over the word limit (default 30)
  exclamations    more than 2 exclamation marks in one file
  emoji-wall      3 or more emoji on one line, or more than 5 in one file
  reused          a line sharing 6 words in a row with an --against file (copied examples or hooks)

Fenced blocks tagged with a code language (\`\`\`sh, \`\`\`bash, \`\`\`json, \`\`\`js...) are skipped.
Untagged fences and \`\`\`text, \`\`\`md or \`\`\`markdown fences hold post text, so they are linted.

Options:
  --max-words N     Sentence word limit (default 30)
  --phrases PATH    Use another phrase list
  --against PATH    Reference file or folder the drafts must not copy from. Folders are
                    searched for .md, .json and .txt; for .json only string values count.
                    Case and punctuation are ignored. Repeatable
  --json            Print hits as JSON
  --count           Don't lint. Print the length of every post fence (untagged, text or md)
                    the way X counts it (each link is 23, each emoji is 2), flagging posts
                    over 280. A file with no post fences is counted as one post
  -h, --help        Show this help

Exit codes: 0 clean, 1 hits found, 2 usage error. --count always exits 0.
`;

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const files = [], against = [];
let maxWords = 30, phrasesPath = join(here, "..", "data", "slop-phrases.txt"), json = false, countOnly = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") {
    process.stdout.write(HELP);
    process.exit(0);
  } else if (a === "--json") json = true;
  else if (a === "--count") countOnly = true;
  else if (a === "--max-words") maxWords = Number(args[++i]);
  else if (a === "--phrases") phrasesPath = args[++i];
  else if (a === "--against") {
    if (args[i + 1] === undefined) usage("--against needs a file or folder");
    against.push(args[++i]);
  } else if (a.startsWith("--")) usage(`unknown option ${a}`);
  else files.push(a);
}
if (!files.length) usage("give at least one file");
if (!(maxWords > 0)) usage("--max-words needs a positive number");

function usage(msg) {
  console.error(`slop-lint: ${msg}. Try --help`);
  process.exit(2);
}

// Drafts keep each post in its own fence, so fences can't simply be skipped: that would skip the
// post text. A fence is code only when its info string names a language; untagged, text and md
// fences are posts. Each line gets a kind: "marker" (a fence line), "code", "post" or "text".
const PROSE_TAGS = new Set(["text", "txt", "plain", "plaintext", "md", "markdown", "post", "tweet"]);

function classify(lines) {
  const kinds = [];
  let open = null; // { ch, len, code } while inside a fence
  for (const line of lines) {
    if (!open) {
      const m = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
      if (!m) {
        kinds.push("text");
        continue;
      }
      const tag = m[2].replace(/^\{\.?|\}$/g, "").toLowerCase();
      open = { ch: m[1][0], len: m[1].length, code: tag !== "" && !PROSE_TAGS.has(tag) };
      kinds.push("marker");
      continue;
    }
    // A closing fence uses the same character, at least as many of them, and nothing after.
    const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    if (close && close[1][0] === open.ch && close[1].length >= open.len) {
      open = null;
      kinds.push("marker");
    } else kinds.push(open.code ? "code" : "post");
  }
  return kinds;
}

// X counts every link as 23 characters and most emoji as 2, so a plain length check lies.
if (countOnly) {
  for (const file of files) {
    let lines;
    try {
      lines = readFileSync(file, "utf8").split("\n");
    } catch (e) {
      usage(`cannot read ${file}: ${e.message}`);
    }
    const kinds = classify(lines);
    const report = (where, text) => {
      text = text.replace(/https?:\/\/\S+/g, "x".repeat(23));
      const n = [...text].length + (text.match(/\p{Extended_Pictographic}/gu) || []).length;
      console.log(`${where}  ${n} chars${n > 280 ? "  OVER 280 (fine only with X Premium)" : ""}`);
    };
    let start = -1, block = [], posts = 0;
    const flush = () => {
      if (start < 0) return;
      report(`${file}:${start + 1}`, block.join("\n"));
      posts++;
      start = -1;
    };
    lines.forEach((line, idx) => {
      if (kinds[idx] === "post") {
        if (start < 0) [start, block] = [idx, []];
        block.push(line);
      } else if (kinds[idx] === "marker") flush();
    });
    flush();
    // A plain post file with no post fences is one post: count all of it.
    if (!posts) report(file, lines.join("\n").trim());
  }
  process.exit(0);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let phrases;
try {
  phrases = readFileSync(phrasesPath, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((p) => {
      // Word boundaries only where the phrase starts or ends with a letter, so emoji entries still match.
      const pre = /^[\p{L}\p{N}]/u.test(p) ? "(?<![\\p{L}\\p{N}])" : "";
      const post = /[\p{L}\p{N}]$/u.test(p) ? "(?![\\p{L}\\p{N}])" : "";
      return { phrase: p, re: new RegExp(pre + escapeRe(p).replace(/'/g, "['’]") + post, "giu") };
    });
} catch (e) {
  usage(`cannot read phrase list ${phrasesPath}: ${e.message}`);
}

// --against: every run of 6 words in the reference texts, lowercased with punctuation dropped,
// mapped to the first file it came from. A draft line sharing any of them copied that file.
const GRAM = 6;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const norm = (w) => w.toLowerCase().replace(/['’]/g, "");
const refGrams = new Map();
const draftPaths = new Set(files.map((f) => resolve(f)));

function addRef(text, file) {
  const words = Array.from(text.matchAll(WORD), (m) => norm(m[0]));
  for (let i = 0; i + GRAM <= words.length; i++) {
    const gram = words.slice(i, i + GRAM).join(" ");
    if (!refGrams.has(gram)) refGrams.set(gram, file);
  }
}

const jsonStrings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (v && typeof v === "object") for (const x of Object.values(v)) jsonStrings(x, out);
  return out;
};

function loadRef(path, named) {
  // Files named on the command line count whatever their extension; folders only give .md/.json/.txt.
  if (!named && !/\.(md|json|txt)$/i.test(path)) return;
  if (draftPaths.has(resolve(path))) return;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    usage(`cannot read ${path}: ${e.message}`);
  }
  if (!/\.json$/i.test(path)) return addRef(text, path);
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    usage(`cannot parse ${path} as JSON: ${e.message}`);
  }
  // Each string on its own, so a 6-word run never spans two fields.
  for (const s of jsonStrings(data)) addRef(s, path);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.isDirectory()) walk(join(dir, entry.name));
    else if (entry.isFile()) loadRef(join(dir, entry.name), false);
  }
}

for (const path of against) {
  let isDir;
  try {
    isDir = statSync(path).isDirectory();
  } catch (e) {
    usage(`cannot read --against ${path}: ${e.message}`);
  }
  if (isDir) walk(path);
  else loadRef(path, true);
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const hits = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    usage(`cannot read ${file}: ${e.message}`);
  }
  let bangs = 0, emojiTotal = 0;
  const add = (line, col, rule, detail) => hits.push({ file, line, col, rule, detail });
  const lines = text.split("\n");
  const kinds = classify(lines);

  lines.forEach((raw, idx) => {
    const n = idx + 1;
    // Fence lines are syntax; code fences hold commands and data, not text anyone reads as a post.
    if (kinds[idx] === "marker" || kinds[idx] === "code") return;
    // Link targets stop at "]" and allow one level of parentheses, so the match is linear even on
    // a long line of unclosed "](" (the old [^)]* rescanned to the end of the line from each one).
    const line = raw.replace(/`[^`]*`/g, (m) => " ".repeat(m.length)).replace(/\]\((?:[^()\]]|\([^()\]]*\))*\)/g, (m) => "]" + " ".repeat(m.length - 1));

    for (const { phrase, re } of phrases) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) add(n, m.index + 1, "phrase", `"${m[0]}" (${phrase})`);
    }
    for (const m of line.matchAll(/[\u2014\u2013]/g)) add(n, m.index + 1, "dash", `"${m[0]}" use a comma, a period or a second sentence`);
    for (const m of line.matchAll(/\S(\s--?\s)\S/g)) add(n, m.index + 2, "spaced-hyphen", `"${m[1].trim()}" used as a dash`);

    let offset = 0;
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const words = sentence.replace(/^[\s>*#\-\d.)]+/, "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
      if (words.length > maxWords) add(n, offset + 1, "long-sentence", `${words.length} words, limit ${maxWords}`);
      offset += sentence.length + 1;
    }

    // Markdown images (![alt]), HTML comments (<!--) and != are syntax, not exclamations.
    bangs += (line.replace(/!\[|<!--|!=/g, "").match(/!/g) || []).length;
    const emoji = line.match(EMOJI) || [];
    emojiTotal += emoji.length;
    if (emoji.length >= 3) add(n, 1, "emoji-wall", `${emoji.length} emoji on one line`);

    if (refGrams.size) {
      const toks = Array.from(line.matchAll(WORD), (m) => ({ w: norm(m[0]), at: m.index, end: m.index + m[0].length }));
      // Overlapping shared runs merge, so a copied sentence is one hit with the whole phrase.
      let first = -1, last = -1, from;
      const flush = () => {
        if (first >= 0) add(n, toks[first].at + 1, "reused", `"${line.slice(toks[first].at, toks[last].end)}" also in ${from}`);
      };
      for (let i = 0; i + GRAM <= toks.length; i++) {
        const src = refGrams.get(toks.slice(i, i + GRAM).map((t) => t.w).join(" "));
        if (src === undefined) continue;
        if (first >= 0 && i <= last) {
          last = i + GRAM - 1;
          continue;
        }
        flush();
        [first, last, from] = [i, i + GRAM - 1, src];
      }
      flush();
    }
  });

  if (bangs > 2) add(0, 0, "exclamations", `${bangs} exclamation marks, keep it to 2 or fewer`);
  if (emojiTotal > 5) add(0, 0, "emoji-wall", `${emojiTotal} emoji in the file, keep it to 5 or fewer`);
}

hits.sort((a, b) => files.indexOf(a.file) - files.indexOf(b.file) || a.line - b.line || a.col - b.col);

if (json) console.log(JSON.stringify(hits, null, 2));
else if (hits.length) {
  for (const h of hits) console.log(`${h.line ? `${h.file}:${h.line}:${h.col}` : h.file}  ${h.rule.padEnd(13)}  ${h.detail}`);
  console.log(`\n${hits.length} hit${hits.length === 1 ? "" : "s"} in ${new Set(hits.map((h) => h.file)).size} file(s)`);
} else console.log(`clean: ${files.length} file(s)`);

process.exit(hits.length ? 1 : 0);
