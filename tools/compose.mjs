#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PAGE, loadScript, panelId, parseArgs, scriptSlug, xmlEscape } from './lib/common.mjs';

const HELP = `Usage: node tools/compose.mjs story/chNN.json [options]

Options:
  --panels DIR     generated panel directory (default build/<script>/panels)
  --out DIR        page output directory (default pages/<script>)
  --font FILE      comic font (default tools/fonts/ComicNeue-Bold.ttf)
`;

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || flags.help) {
  console.log(HELP);
  process.exit(positional[0] ? 0 : 1);
}

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.resolve(positional[0]);
const slug = scriptSlug(scriptPath);
const panelsDir = path.resolve(flags.panels || path.join(repoRoot, 'build', slug, 'panels'));
const outputDir = path.resolve(flags.out || path.join(repoRoot, 'pages', slug));
const fontPath = path.resolve(flags.font || path.join(repoRoot, 'tools', 'fonts', 'ComicNeue-Bold.ttf'));
const script = await loadScript(scriptPath);

if (!existsSync(fontPath)) throw new Error(`Comic font not found: ${fontPath}`);
const fontData = (await readFile(fontPath)).toString('base64');
await mkdir(outputDir, { recursive: true });

for (const page of script.pages) {
  const pageName = `p${String(page.page).padStart(2, '0')}`;
  const layout = createLayout(page.panels);
  const canvas = sharp({
    create: { width: PAGE.width, height: PAGE.height, channels: 4, background: '#ffffff' },
  });
  const composites = [];

  for (let index = 0; index < page.panels.length; index += 1) {
    const panel = page.panels[index];
    const id = panelId(page.page, index);
    const panelPath = path.join(panelsDir, `${id}.png`);
    if (!existsSync(panelPath)) throw new Error(`Missing generated panel: ${panelPath}`);
    const box = layout[index];
    composites.push({ input: borderSvg(box.width, box.height), left: box.x, top: box.y });
    const inner = {
      x: box.x + PAGE.border,
      y: box.y + PAGE.border,
      width: box.width - PAGE.border * 2,
      height: box.height - PAGE.border * 2,
    };
    const panelImage = await sharp(panelPath).resize(inner.width, inner.height, { fit: 'cover', position: 'attention' }).png().toBuffer();
    composites.push({ input: panelImage, left: inner.x, top: inner.y });
    composites.push(...bubbleComposites(panel, inner, fontData));
    composites.push(...sfxComposites(panel, inner, fontData));
  }

  const pngPath = path.join(outputDir, `${pageName}.png`);
  const webpPath = path.join(outputDir, `${pageName}.webp`);
  const pngBuffer = await canvas.composite(composites).png().toBuffer();
  await writeFile(pngPath, pngBuffer);
  await sharp(pngBuffer).webp({ quality: 82 }).toFile(webpPath);
  console.log(`[done] ${pageName} -> ${pngPath} (+ webp q82)`);
}

function createLayout(panels) {
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const contentHeight = PAGE.height - PAGE.margin * 2;
  if (panels.length === 1) return [{ x: PAGE.margin, y: PAGE.margin, width: contentWidth, height: contentHeight }];
  if (panels.some((panel) => panel.size === 'hero')) throw new Error('A hero panel must be the only panel on its page.');

  const weights = { half: 6, third: 4, 'wide-strip': 3, tall: 6 };
  const rows = [];
  for (let index = 0; index < panels.length; index += 1) {
    if (panels[index].size === 'inset') continue;
    if (panels.length >= 4 && panels[index].size === 'third' && panels[index + 1]?.size === 'third') {
      rows.push({ indices: [index, index + 1], weight: weights.third });
      index += 1;
    } else rows.push({ indices: [index], weight: weights[panels[index].size] || 4 });
  }
  if (!rows.length) throw new Error('A page cannot contain only inset panels.');

  const verticalSpace = contentHeight - PAGE.gutter * (rows.length - 1);
  const weightTotal = rows.reduce((sum, row) => sum + row.weight, 0);
  const heights = rows.map((row) => Math.max(120, Math.round(verticalSpace * row.weight / weightTotal)));
  heights[heights.length - 1] += verticalSpace - heights.reduce((sum, value) => sum + value, 0);

  const result = Array(panels.length);
  let y = PAGE.margin;
  rows.forEach((row, rowIndex) => {
    const availableWidth = contentWidth - PAGE.gutter * (row.indices.length - 1);
    const widths = row.indices.length === 1 ? [contentWidth] : proportionalWidths(row.indices.map(() => 1), availableWidth);
    let right = PAGE.width - PAGE.margin;
    row.indices.forEach((panelIndex, position) => {
      const width = widths[position];
      const x = right - width;
      result[panelIndex] = { x, y, width, height: heights[rowIndex] };
      right = x - PAGE.gutter;
    });
    y += heights[rowIndex] + PAGE.gutter;
  });
  panels.forEach((panel, index) => {
    if (panel.size !== 'inset') return;
    let anchorIndex = index - 1;
    while (anchorIndex >= 0 && !result[anchorIndex]) anchorIndex -= 1;
    if (anchorIndex < 0) throw new Error(`Inset panel ${index + 1} has no preceding panel to anchor to.`);
    const anchor = result[anchorIndex];
    const size = Math.max(180, Math.round(anchor.width * 0.4));
    result[index] = {
      x: anchor.x + 18,
      y: anchor.y + anchor.height - size - 18,
      width: size,
      height: size,
    };
  });
  return result;
}

function proportionalWidths(weights, total) {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => Math.round(total * weight / weightTotal));
  widths[widths.length - 1] += total - widths.reduce((sum, value) => sum + value, 0);
  return widths;
}

function borderSvg(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/></svg>`);
}

function bubbleComposites(panel, box, fontBase64) {
  const dialogues = panel.dialogue || [];
  if (!dialogues.length) return [];
  const items = [];
  let right = box.x + box.width - 18;
  let top = box.y + 16;
  let rowHeight = 0;
  dialogues.forEach((dialogue, index) => {
    const maxWidth = Math.max(150, Math.floor(box.width * 0.45));
    const fontSize = Math.max(22, Math.min(32, Math.round(box.width / 27)));
    const horizontalPadding = 80;
    const wrapped = wrapText(dialogue.text, maxWidth - horizontalPadding, fontSize);
    const textWidth = Math.min(maxWidth - horizontalPadding, Math.max(70, ...wrapped.map((line) => estimateTextWidth(line, fontSize))));
    const width = Math.ceil(textWidth + horizontalPadding);
    const height = Math.ceil(wrapped.length * fontSize * 1.18 + 60 + (dialogue.type === 'thought' ? 10 : 0));
    if (right - width < box.x + 16) {
      right = box.x + box.width - 18;
      top += rowHeight + 12;
      rowHeight = 0;
    }
    const left = Math.round(right - width);
    const speakerDirection = index % 2 === 0 ? 'right' : 'left';
    items.push({
      input: bubbleSvg({ type: dialogue.type, lines: wrapped, width, height, fontSize, fontBase64, speakerDirection }),
      left,
      top: Math.round(top),
    });
    right = left - 12;
    rowHeight = Math.max(rowHeight, height);
  });
  return items;
}

function sfxComposites(panel, box, fontBase64) {
  return (panel.sfx || []).map((sfx, index) => {
    const fontSize = sfx.style === 'big' ? Math.max(52, Math.round(box.width / 8)) : Math.max(30, Math.round(box.width / 15));
    const width = Math.min(box.width - 40, Math.ceil(estimateTextWidth(sfx.text, fontSize) + 30));
    const height = Math.ceil(fontSize * 1.35);
    const x = index % 2 === 0 ? box.x + 22 : box.x + box.width - width - 22;
    const y = box.y + box.height - height - 22 - index * (height + 6);
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${fontStyle(fontBase64)}
      <g transform="skewX(-12)"><text x="12" y="${fontSize}" font-family="ComicNeue" font-size="${fontSize}" font-weight="700" fill="#111" stroke="#fff" stroke-width="12" paint-order="stroke">${xmlEscape(sfx.text)}</text><text x="12" y="${fontSize}" font-family="ComicNeue" font-size="${fontSize}" font-weight="700" fill="#111" stroke="#111" stroke-width="3" paint-order="stroke">${xmlEscape(sfx.text)}</text></g>
    </svg>`;
    return { input: Buffer.from(svg), left: Math.round(x), top: Math.max(box.y + 12, Math.round(y)) };
  });
}

function bubbleSvg({ type = 'speech', lines, width, height, fontSize, fontBase64, speakerDirection }) {
  const stroke = 4;
  const cx = width / 2;
  const cy = (height - 14) / 2;
  const rx = width / 2 - 7;
  const ry = (height - 14) / 2 - 5;
  let shape;
  if (type === 'narration') {
    shape = `<rect x="5" y="5" width="${width - 10}" height="${height - 10}" fill="#fff" stroke="#000" stroke-width="${stroke}"/>`;
  } else if (type === 'whisper') {
    shape = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="3" stroke-dasharray="10 8"/>`;
  } else if (type === 'shout') {
    shape = `<polygon points="${radialPoints(cx, cy, rx, ry, 22)}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/>`;
  } else if (type === 'thought') {
    shape = `<path d="${cloudPath(cx, cy, rx, ry, 18)}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/><circle cx="${speakerDirection === 'right' ? width - 20 : 20}" cy="${height - 13}" r="7" fill="#fff" stroke="#000" stroke-width="3"/><circle cx="${speakerDirection === 'right' ? width - 7 : 7}" cy="${height - 3}" r="4" fill="#fff" stroke="#000" stroke-width="2"/>`;
  } else {
    const tailX = speakerDirection === 'right' ? width - 18 : 18;
    const tipX = speakerDirection === 'right' ? width - 3 : 3;
    shape = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="${stroke}"/><path d="M ${tailX - (speakerDirection === 'right' ? 14 : -14)} ${height - 25} L ${tipX} ${height - 2} L ${tailX} ${height - 35}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/><path d="M ${tailX - (speakerDirection === 'right' ? 12 : -12)} ${height - 27} L ${tailX} ${height - 35}" stroke="#fff" stroke-width="7"/>`;
  }
  const lineHeight = fontSize * 1.18;
  const textHeight = lines.length * lineHeight;
  const startY = (height - textHeight) / 2 + fontSize * 0.82 - (type === 'thought' ? 2 : 0);
  const text = lines.map((line, index) => `<text x="${cx}" y="${startY + index * lineHeight}" text-anchor="middle" font-family="ComicNeue" font-size="${fontSize}" font-weight="700" fill="#111">${xmlEscape(line)}</text>`).join('');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${fontStyle(fontBase64)}${shape}${text}</svg>`);
}

function fontStyle(fontBase64) {
  return `<style>@font-face{font-family:ComicNeue;src:url(data:font/ttf;base64,${fontBase64}) format('truetype');font-weight:700}</style>`;
}

function wrapText(text, maxWidth, fontSize) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = words.shift();
  for (const word of words) {
    const candidate = `${current} ${word}`;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function estimateTextWidth(text, fontSize) {
  return [...String(text)].reduce((sum, char) => sum + (/\s/.test(char) ? 0.32 : /[MW@#]/.test(char) ? 0.94 : /[ilI.,'!]/.test(char) ? 0.34 : 0.68) * fontSize, 0);
}

function radialPoints(cx, cy, rx, ry, spikes) {
  const points = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? 1 : 0.78;
    const angle = -Math.PI / 2 + Math.PI * i / spikes;
    points.push(`${cx + Math.cos(angle) * rx * radius},${cy + Math.sin(angle) * ry * radius}`);
  }
  return points.join(' ');
}

function cloudPath(cx, cy, rx, ry, lobes) {
  const points = [];
  for (let i = 0; i < lobes; i += 1) {
    const angle = Math.PI * 2 * i / lobes;
    const bump = i % 2 === 0 ? 1 : 0.86;
    points.push([cx + Math.cos(angle) * rx * bump, cy + Math.sin(angle) * ry * bump]);
  }
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = midpoint(points.at(-1), points[0]);
  let result = `M ${start[0]} ${start[1]}`;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    const mid = midpoint(points[i], next);
    result += ` Q ${points[i][0]} ${points[i][1]} ${mid[0]} ${mid[1]}`;
  }
  return `${result} Z`;
}
