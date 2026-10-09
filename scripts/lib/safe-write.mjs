// Writes the kit's files into .launchmaxxing/ without following symlinks. Zero dependencies, Node 18+.
// 1. Every folder from .launchmaxxing/ down to the output folder must be a real folder, not a
//    symlink, so a link someone committed can't send the output somewhere else.
// 2. Files go to a fresh random temp name opened with O_EXCL ("wx"), which never follows a link,
//    and are then renamed over the target. rename() replaces a symlink instead of writing through it.

import { lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

export const ROOT = ".launchmaxxing";

// Path check only, touches nothing: `dir` must resolve inside ./.launchmaxxing. Returns the absolute path.
export function insideState(dir, fail) {
  const out = resolve(dir || ROOT);
  const rel = relative(resolve(ROOT), out);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`--out must be inside ${ROOT}/ in this folder`);
  return out;
}

// Makes the folder, refusing any symlink or non-folder on the way down from .launchmaxxing/.
export function stateDir(dir, fail) {
  const out = insideState(dir, fail);
  const rel = relative(resolve(ROOT), out);
  let cur = resolve(ROOT);
  for (const part of ["", ...(rel ? rel.split(sep) : [])]) {
    if (part) cur = join(cur, part);
    let st;
    try {
      st = lstatSync(cur);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      mkdirSync(cur);
      continue;
    }
    if (st.isSymbolicLink() || !st.isDirectory()) fail(`${relative(process.cwd(), cur)} is a symlink or not a folder. Refusing to write through it`);
  }
  return out;
}

// A name nobody can have planted in advance.
export function tempPath(dir, ext = ".tmp") {
  return join(dir, `.${randomBytes(6).toString("hex")}${ext}`);
}

// Never half-written, never written through a symlink at `file`.
export function safeWrite(file, data) {
  const tmp = tempPath(dirname(file));
  writeFileSync(tmp, data, { flag: "wx", mode: 0o644 });
  try {
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
