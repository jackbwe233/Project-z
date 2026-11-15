/**
 * Repair only unambiguous, non-destructive local asset/link typos in checked-in HTML.
 * This does not use AI, alter auth, access tokens, application data, or execute user input.
 */
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const ignored = new Set(["node_modules", ".git", ".github", "research-e4b", "test-results", "playwright-report"]);
function collect(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    if (entry.isDirectory()) { if (!ignored.has(entry.name)) collect(path.join(dir, entry.name), files); }
    else files.push(path.relative(cwd, path.join(dir, entry.name)).replaceAll(path.sep, "/"));
  }
  return files;
}
function resolveFile(file, href) {
  const bare = href.split(/[?#]/, 1)[0];
  if (!bare.startsWith("./") || !bare || bare.includes("\\") || bare.includes("%") || bare.includes("..")) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), bare));
}
export function recoverLinks(source, file, knownFiles) {
  let changes = 0;
  const notes = [];
  const present = new Set(knownFiles);
  const fixed = source.replace(/\b(href|src)=(["'])(\.\/[^"']+)\2/g, (match, attribute, quote, value) => {
    const target = resolveFile(file, value);
    if (!target || present.has(target)) return match;
    const extension = path.posix.extname(target);
    const candidates = [...present].filter(candidate => {
      if (candidate.includes("..") || candidate.startsWith(".github/")) return false;
      if (candidate.toLowerCase() === target.toLowerCase()) return true; // case-only typo
      if (extension) return false;
      return [".html", ".js", ".css"].some(ext => candidate === target + ext);
    });
    if (candidates.length !== 1) return match;
    const corrected = "./" + path.posix.relative(path.posix.dirname(file), candidates[0]);
    // Reject surprising path changes, including a script reference becoming an HTML file.
    if (attribute === "src" && !/\.(js|css|svg|png|jpg|jpeg|webp|gif)$/i.test(corrected)) return match;
    changes++;
    notes.push(file + ": " + value + " -> " + corrected);
    return attribute + "=" + quote + corrected + value.slice(value.split(/[?#]/, 1)[0].length) + quote;
  });
  return { fixed, changes, notes };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const files = collect(cwd);
  const pages = files.filter(file => /^[^/]+\.html$/.test(file));
  let changes = 0;
  const notes = [];
  for (const file of pages) {
    const original = fs.readFileSync(file, "utf8");
    const result = recoverLinks(original, file, files);
    if (!result.changes) continue;
    fs.writeFileSync(file, result.fixed);
    changes += result.changes;
    notes.push(...result.notes);
  }
  const summary = { fixed: changes, files: notes };
  fs.mkdirSync("health-reports", { recursive: true });
  fs.writeFileSync("health-reports/repair.json", JSON.stringify(summary, null, 2) + "\n");
  console.log("Z safe automatic repairs:", JSON.stringify(summary));
  // Report only; validation and push happen in CI after tests pass.
}
