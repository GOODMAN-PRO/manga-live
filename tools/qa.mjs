#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PAGE, loadScript, panelId, parseArgs, scriptSlug } from './lib/common.mjs';
import { createLayout } from './lib/layout.mjs';

const HELP = `Usage: node tools/qa.mjs story/chNN.json [options]

Options:
  --pages DIR       composed page directory (default pages<seriesSuffix>/<script>)
  --bubble-max N    bubble coverage flag threshold, 0-1 fraction of panel area (default 0.34)
  --blank-min N     near-white fraction that marks a panel blank (default 0.92)
  --edge-min N      edge-pixel fraction below which a panel has "almost no edges" (default 0.015)
  --dup-max N       histogram distance below which two panels count as near-duplicate (default 0.04)
`;

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || flags.help) {
  console.log(HELP);
  process.exit(positional[0] ? 0 : 1);
}

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.resolve(positional[0]);
const slug = scriptSlug(scriptPath);
const storyDir = path.basename(path.dirname(scriptPath)).toLowerCase();
const seriesSuffix = (storyDir.match(/^story(\d*)$/) || [, ''])[1] || '';
const pagesRoot = `pages${seriesSuffix}`;
const pagesDir = path.resolve(flags.pages || path.join(repoRoot, pagesRoot, slug));

const BUBBLE_MAX = Number(flags['bubble-max'] || 0.34);
const BLANK_MIN = Number(flags['blank-min'] || 0.92);
const EDGE_MIN = Number(flags['edge-min'] || 0.015);
const DUP_MAX = Number(flags['dup-max'] || 0.04);
const NEAR_WHITE = 235;

const script = await loadScript(scriptPath);

let composition = null;
const compositionPath = path.join(pagesDir, 'composition.json');
if (existsSync(compositionPath)) {
  try {
    composition = JSON.parse(await readFile(compositionPath, 'utf8'));
  } catch {
    composition = null;
  }
}
const compositionByPage = new Map((composition?.pages || []).map((entry) => [entry.page, entry]));

const defects = [];
function defect(page, id, reason) {
  defects.push(`${slug} p${String(page).padStart(2, '0')} ${id}: ${reason}`);
}

for (const page of script.pages) {
  const pageName = `p${String(page.page).padStart(2, '0')}`;
  const pngPath = path.join(pagesDir, `${pageName}.png`);
  if (!existsSync(pngPath)) {
    defect(page.page, pageName, 'page PNG is missing');
    continue;
  }

  let metadata;
  try {
    metadata = await sharp(pngPath).metadata();
  } catch (error) {
    defect(page.page, pageName, `PNG is corrupt or unreadable (${error.message})`);
    continue;
  }
  if (metadata.width !== PAGE.width || metadata.height !== PAGE.height) {
    defect(page.page, pageName, `page is ${metadata.width}x${metadata.height}, expected ${PAGE.width}x${PAGE.height}`);
    continue;
  }

  const compositionEntry = compositionByPage.get(page.page);
  if (compositionEntry && compositionEntry.assertions?.panels !== page.panels.length) {
    defect(page.page, pageName, `composed panel count ${compositionEntry.assertions?.panels} does not match script panel count ${page.panels.length}`);
  }

  // Bubble coverage and face occlusion are measured from the exact bubble boxes compose.mjs
  // already recorded in composition.json, not from near-white pixel counting: manga screentone/
  // backgrounds run legitimately bright, so pixel-color thresholding can't tell "white bubble"
  // from "light art".
  const bubblesByPanel = new Map();
  for (const check of compositionEntry?.assertions?.checks || []) {
    if (typeof check.bubble !== 'number') continue; // skip sfx entries
    if (!bubblesByPanel.has(check.panel)) bubblesByPanel.set(check.panel, []);
    bubblesByPanel.get(check.panel).push(check);
  }

  const layout = createLayout(page.panels);
  const stats = [];
  for (let index = 0; index < page.panels.length; index += 1) {
    const id = panelId(page.page, index);
    const box = layout[index];
    const panelStats = await analyzePanel(pngPath, box);
    stats.push({ id, ...panelStats });

    // Blank/failed-render requires BOTH signals together: a legitimately bright panel (snow,
    // a blown-out sky) can be near-white without also being edge-empty.
    if (panelStats.nearWhite > BLANK_MIN && panelStats.edges < EDGE_MIN) {
      defect(page.page, id, `looks like a failed render (${(panelStats.nearWhite * 100).toFixed(0)}% near-white, edge density ${(panelStats.edges * 100).toFixed(1)}%)`);
      continue;
    }
    if (!compositionEntry) continue;
    const bubbles = bubblesByPanel.get(id) || [];
    const bubbleArea = bubbles.reduce((sum, b) => sum + Math.max(0, b.bounds.x2 - b.bounds.x1) * Math.max(0, b.bounds.y2 - b.bounds.y1), 0);
    const bubbleCoverage = bubbleArea / (box.width * box.height);
    if (bubbleCoverage > BUBBLE_MAX) {
      defect(page.page, id, `bubble coverage is ${(bubbleCoverage * 100).toFixed(0)}% of the panel area — art is being swallowed`);
    }
    // "Sits over" the centre means the bubble's own centre falls in that box, not merely
    // grazing it — any-overlap fired on 3 out of 4 bubbles (columns hug the panel edges but
    // are wide enough to reach past centre), which drowned the real face-covering cases.
    const center = { x1: box.x + box.width * 0.25, y1: box.y + box.height * 0.25, x2: box.x + box.width * 0.75, y2: box.y + box.height * 0.75 };
    for (const bubble of bubbles) {
      const midX = (bubble.bounds.x1 + bubble.bounds.x2) / 2;
      const midY = (bubble.bounds.y1 + bubble.bounds.y2) / 2;
      if (midX >= center.x1 && midX <= center.x2 && midY >= center.y1 && midY <= center.y2) {
        defect(page.page, id, `bubble ${bubble.bubble} sits over the panel centre — likely covers a character's face`);
      }
    }
  }

  for (let i = 0; i < stats.length; i += 1) {
    for (let j = i + 1; j < stats.length; j += 1) {
      const distance = histogramDistance(stats[i].histogram, stats[j].histogram);
      if (distance < DUP_MAX) {
        defect(page.page, `${stats[i].id}+${stats[j].id}`, `near-duplicate panels (histogram distance ${distance.toFixed(3)}) — model may be repeating itself`);
      }
    }
  }
}

for (const line of defects) console.log(line);
console.log(`\n${defects.length} defect(s) found across ${script.pages.length} page(s).`);
process.exit(defects.length ? 1 : 0);

// ponytail: panel region = the full layout box (border included), not the bleed area bubbles
// are allowed to spill into. Close enough for a coverage estimate; exact bleed accounting isn't
// worth the complexity for a QA heuristic.
async function analyzePanel(pngPath, box) {
  const medium = await sharp(pngPath)
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .greyscale()
    .resize({ width: 480, height: 480, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const nearWhite = countAbove(medium.data, NEAR_WHITE) / medium.data.length;
  const edges = edgeDensity(medium.data, medium.info.width, medium.info.height);

  const tiny = await sharp(pngPath)
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .greyscale()
    .resize(24, 24, { fit: 'fill' })
    .raw()
    .toBuffer();

  return { nearWhite, edges, histogram: histogramOf(tiny) };
}

function countAbove(buffer, threshold) {
  let count = 0;
  for (const value of buffer) if (value >= threshold) count += 1;
  return count;
}

function edgeDensity(data, width, height, threshold = 24) {
  let edgePixels = 0;
  let total = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = data[idx + 1] - data[idx - 1];
      const gy = data[idx + width] - data[idx - width];
      if (Math.abs(gx) + Math.abs(gy) > threshold) edgePixels += 1;
      total += 1;
    }
  }
  return total ? edgePixels / total : 0;
}

function histogramOf(buffer, bins = 16) {
  const hist = new Array(bins).fill(0);
  for (const value of buffer) hist[Math.min(bins - 1, Math.floor(value / (256 / bins)))] += 1;
  return hist.map((count) => count / buffer.length);
}

function histogramDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / 2;
}
