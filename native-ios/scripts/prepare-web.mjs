/**
 * Copy Project Z's static site into Capacitor's local www bundle.
 * Run from native-ios with: npm run prepare:web
 *
 * Keep the web app and iOS app reading the same source files without
 * changing the public GitHub Pages deployment or bundling tests/secrets.
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../..");
const output = resolve(here, "../www");

const ignoreDirectories = new Set([
  ".git", ".github", ".vscode", "node_modules", "native-ios", "tests",
  "test", "e2e", "coverage", "playwright-report", "test-results", "docs",
  ".next", "dist", "build", "scripts",
]);
const allowedExtensions = new Set([
  ".html", ".css", ".js", ".mjs", ".json", ".svg", ".png", ".jpg", ".jpeg",
  ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf",
  ".wasm", ".webmanifest", ".txt",
]);

let copied = 0;
async function copyStatic(source) {
  for (const item of await readdir(source, { withFileTypes: true })) {
    const from = join(source, item.name);
    if (item.name.startsWith(".") || item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      if (ignoreDirectories.has(item.name)) continue;
      await copyStatic(from);
    } else if (item.isFile() && allowedExtensions.has(extname(item.name).toLowerCase())) {
      const to = join(output, relative(projectRoot, from));
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to);
      copied++;
    }
  }
}
await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });
await copyStatic(projectRoot);
if (!(await stat(join(output, "index.html")).catch(() => null)) ||
    !(await stat(join(output, "app.js")).catch(() => null))) {
  throw new Error("Project Z's index.html or app.js is missing; aborting native preparation");
}
console.log(`Prepared ${copied} static files for private iOS app at ${output}`);
