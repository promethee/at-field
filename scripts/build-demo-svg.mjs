// Builds docs/demo.svg: an animated replay of two real runs. The text comes
// from examples/demo-output-*.txt (captured stdout); only the typing and the
// timing are animated. The model wait and the report path are trimmed, and
// the picture says so. Run: node scripts/build-demo-svg.mjs
import fs from "node:fs";

const CW = 7.8; // character cell width in px, enforced with textLength
const LH = 21; // line height
const FS = 13; // font size
const PAD_X = 20;
const PAD_TOP = 18;
const W = 740;
const T = 20; // loop length in seconds
const HOLD_UNTIL = 19; // everything fades out here

const C = { bg: "#14191b", fg: "#d5dfdb", dim: "#7f908a", acc: "#5fd0b8" };

// Default-output lines of a captured run (stdout and stderr together): everything
// before the "Written:" path line, which is trimmed because it is a local path.
function capture(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const end = lines.findIndex((l) => l.startsWith("Written:"));
  const block = lines.slice(0, end < 0 ? lines.length : end);
  while (block.length && block[block.length - 1].trim() === "") block.pop();
  if (!block.some((l) => l.startsWith("Saturation ["))) throw new Error(`no result found in ${file}`);
  return block;
}

const lexic = capture("examples/demo-output-lexic.txt");
const model = capture("examples/demo-output-model.txt");

// Split a line into colored segments.
function segments(line, kind) {
  if (kind === "cmd") return [["$ ", C.dim], [line.slice(2), C.fg]];
  if (kind === "dim" || line.startsWith("Notes:")) return [[line, C.dim]];
  const out = [];
  for (const part of line.split(/([█]+|[░]+)/).filter(Boolean)) {
    if (part.startsWith("█")) out.push([part, C.acc]);
    else if (part.startsWith("░")) out.push([part, C.dim]);
    else if (/^[\d\s]+$/.test(part) && line.includes("█") && !line.startsWith("Saturation")) out.push([part, C.dim]);
    else out.push([part, C.fg]);
  }
  return out;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cmd1 = '$ at-field examples/gettysburg.txt --theme "religion" --lexic examples/religion-words.txt';
const cmd2 = '$ at-field examples/gettysburg.txt --theme "religion"';

// Each entry: text, kind, start (s), and typed (seconds to type it) or 0.
const items = [];
items.push({ text: cmd1, kind: "cmd", start: 0.4, typed: 2.6 });
lexic.forEach((text, i) => items.push({ text, kind: "out", start: 3.3 + i * 0.25, typed: 0 }));
const cmd2Start = 3.3 + lexic.length * 0.25 + 2.6;
items.push({ text: "", kind: "gap", start: 0, typed: 0 });
items.push({ text: cmd2, kind: "cmd", start: cmd2Start, typed: 1.8 });
let t = cmd2Start + 1.8 + 0.3;
for (const text of model) {
  items.push({ text, kind: "out", start: t, typed: 0 });
  if (text.startsWith("Expanding")) {
    t += 0.6;
    items.push({ text: "(model wait shortened)", kind: "dim", start: t, typed: 0 });
    t += 1.6;
  } else {
    t += 0.3;
  }
}
if (t > HOLD_UNTIL - 2) throw new Error(`timeline too long: ${t.toFixed(1)}s`);

const H = PAD_TOP * 2 + items.length * LH;
const pct = (s) => ((s / T) * 100).toFixed(3);

let css = "";
let body = "";
items.forEach((it, i) => {
  if (it.kind === "gap") return;
  const y = PAD_TOP + (i + 1) * LH - 6;
  const width = it.text.length * CW;
  const a = it.start;
  const showFrames =
    `@keyframes v${i}{0%,${pct(a)}%{opacity:0}${pct(a + 0.05)}%,${pct(HOLD_UNTIL)}%{opacity:1}` +
    `${pct(HOLD_UNTIL + 0.6)}%,100%{opacity:0}}`;
  css += showFrames;
  const tspans = segments(it.text, it.kind)
    .map(([t, fill]) => `<tspan fill="${fill}">${esc(t)}</tspan>`)
    .join("");
  body +=
    `<text class="ln" x="${PAD_X}" y="${y}" textLength="${width.toFixed(1)}" lengthAdjust="spacing" ` +
    `style="animation:v${i} ${T}s linear infinite">${tspans}</text>\n`;
  if (it.typed > 0) {
    const steps = it.text.length;
    css +=
      `@keyframes c${i}{0%,${pct(a)}%{transform:translateX(0);animation-timing-function:steps(${steps},end)}` +
      `${pct(a + it.typed)}%,100%{transform:translateX(${(width + 4).toFixed(1)}px)}}`;
    body +=
      `<rect class="cover" x="${PAD_X - 1}" y="${y - FS - 2}" width="${(width + 3).toFixed(1)}" height="${LH}" ` +
      `fill="${C.bg}" style="animation:c${i} ${T}s linear infinite"/>\n`;
  }
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">at-field terminal replay</title>
<desc id="d">Two real runs of at-field on the Gettysburg Address for the theme religion. The first uses a wordlist and finds 5 of 12 words, 42 percent. The second lets the model propose 25 words and finds 1, 4 percent. The model wait and the report path are trimmed.</desc>
<style>
text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:${FS}px;white-space:pre}
.cover{transform:translateX(2000px)}
${css}
@media (prefers-reduced-motion:reduce){.ln{animation:none!important}.cover{display:none}}
</style>
<rect width="${W}" height="${H}" rx="10" fill="${C.bg}"/>
${body}</svg>
`;

fs.writeFileSync("docs/demo.svg", svg);
console.log(`wrote docs/demo.svg (${svg.length} bytes, ${items.length} lines, ${W}x${H})`);
