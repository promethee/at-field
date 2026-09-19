import { execFileSync } from "node:child_process";

// Guards what `npm publish` would ship: the built CLI must be there, and
// tests/sources must not be. --ignore-scripts so this inspects the existing
// dist/ instead of rebuilding it.
//
// Run via `npm run check:pack`: npm sets npm_execpath, which lets us invoke
// npm without a shell (spawning npm.cmd directly is rejected on Windows).
const args = ["pack", "--dry-run", "--json", "--ignore-scripts"];
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Run this through `npm run check:pack`.");
  process.exit(1);
}
const out = execFileSync(process.execPath, [npmCli, ...args], { encoding: "utf8" });
const files = JSON.parse(out)[0].files.map((f) => f.path);

const problems = [];
if (!files.includes("dist/cli.js")) problems.push("dist/cli.js is missing (run `npm run build` first)");
for (const f of files) {
  if (/\.test\.js$/.test(f)) problems.push(`test file shipped: ${f}`);
  if (f.startsWith("src/")) problems.push(`source shipped: ${f}`);
}

if (problems.length > 0) {
  console.error(`Tarball check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Tarball OK (${files.length} files).`);
