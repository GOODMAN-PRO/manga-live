#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PAGE, loadScript, panelId, parseArgs, scriptSlug } from './lib/common.mjs';
import { createLayout } from './lib/layout.mjs';
import { centeredTextPath, loadFont, measureGlyphBounds, measureText, textPath, wrapText } from './lib/text-path.mjs';

// Inscribing factor per drawn shape: √2 for a plain ellipse, plus the shape's own inner-radius
// dip (shout spikes bottom out at 0.78 of the radius, cloud lobes at 0.86).
// Speech/whisper/shout are drawn as rounded or jagged RECTANGLES (standard manga lettering
// shapes) so a dense text block fits without ballooning; only the thought cloud stays curved
// and needs the √2 inscribing factor.
const SQRT2 = Math.SQRT2;
const CURVE_FACTORS = {
  speech: 1.06,
  whisper: 1.06,
  shout: 1.1,
  thought: SQRT2 / 0.86,
  narration: 1,
  monologue: 1,
};
const SHAPE_INSET = { speech: 16, whisper: 16, shout: 26, narration: 9, monologue: 6 };


const HELP = `Usage: node tools/compose.mjs story/chNN.json [options]

Options:
  --panels DIR     generated panel directory (default build/<script>/panels)
  --out DIR        page output directory (default pages/<script>)
  --font FILE      comic font (default tools/fonts/ComicNeue-Bold.ttf)
  --cover           compose build/<script>/cover-art.png to pages/<script>/cover.png
  --cover-art FILE  generated cover art override
  --jp-font FILE    Japanese title font (default tools/fonts/NotoSansJP-Variable.ttf)
  --pages RANGE     compose selected pages, e.g. 1-6,9,12-14
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
const isV2 = seriesSuffix !== '';
const buildRoot = `build${seriesSuffix}`;
const pagesRoot = `pages${seriesSuffix}`;
const panelsDir = path.resolve(flags.panels || path.join(repoRoot, buildRoot, slug, 'panels'));
const outputDir = path.resolve(flags.out || path.join(repoRoot, pagesRoot, slug));
const fontPath = path.resolve(flags.font || path.join(repoRoot, 'tools', 'fonts', 'ComicNeue-Bold.ttf'));
const jpFontPath = path.resolve(flags['jp-font'] || path.join(repoRoot, 'tools', 'fonts', 'NotoSansJP-Variable.ttf'));
const script = await loadScript(scriptPath);
const selectedPages = flags.pages ? parsePageSelection(flags.pages) : null;

if (!existsSync(fontPath)) throw new Error(`Comic font not found: ${fontPath}`);
const comicFont = await loadFont(fontPath);
// Comic Neue has no CJK or macron glyphs; fall back to Noto Sans JP (which also covers Latin)
// for any run containing a character Comic Neue cannot draw.
const jpFallbackFont = existsSync(jpFontPath) ? await loadFont(jpFontPath) : null;
function fontFor(text) {
  if (!jpFallbackFont) return comicFont;
  for (const ch of String(text)) {
    if (ch === ' ' || ch === '\n') continue;
    const glyph = comicFont.charToGlyph(ch);
    if (!glyph || glyph.index === 0 || glyph.name === '.notdef') return jpFallbackFont;
  }
  return comicFont;
}
await mkdir(outputDir, { recursive: true });

if (flags.cover) {
  const coverArtPath = path.resolve(flags['cover-art'] || path.join(repoRoot, buildRoot, slug, 'cover-art.png'));
  if (!existsSync(coverArtPath)) throw new Error(`Generated cover art not found: ${coverArtPath}`);
  if (!existsSync(jpFontPath)) throw new Error(`Japanese cover font not found: ${jpFontPath}`);
  const jpFont = await loadFont(jpFontPath);
  const art = await sharp(coverArtPath).resize(1000, 1500, { fit: 'cover', position: 'attention' }).png().toBuffer();
  const titleBand = coverTitleSvg(jpFont, comicFont, script.chapter, isV2);
  const pngPath = path.join(outputDir, 'cover.png');
  const webpPath = path.join(outputDir, 'cover.webp');
  const pngBuffer = await sharp(art).composite([{ input: titleBand, left: 0, top: 0 }]).png().toBuffer();
  await writeFile(pngPath, pngBuffer);
  await sharp(pngBuffer).webp({ quality: 82 }).toFile(webpPath);
  console.log(`[done] cover -> ${pngPath} (+ webp q82)`);
  process.exit(0);
}

const compositionTimings = [];
for (const page of script.pages) {
  if (selectedPages && !selectedPages.has(page.page)) continue;
  const pageStarted = performance.now();
  const pageName = `p${String(page.page).padStart(2, '0')}`;
  const layout = createLayout(page.panels);
  assertPanelLayout(layout, page.page);
  const canvas = sharp({
    create: { width: PAGE.width, height: PAGE.height, channels: 4, background: '#ffffff' },
  });
  const composites = [];
  const assertionReport = { page: page.page, panels: layout.length, bubbles: 0, sfx: 0, textRuns: 0, checks: [] };

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
    const bubbleResult = bubbleComposites(panel, inner, comicFont, id);
    composites.push(...bubbleResult.composites);
    assertionReport.bubbles += bubbleResult.assertions.length;
    assertionReport.textRuns += bubbleResult.assertions.reduce((sum, item) => sum + item.textRuns.length, 0);
    assertionReport.checks.push(...bubbleResult.assertions);
    const sfxResult = sfxComposites(panel, inner, comicFont, id);
    composites.push(...sfxResult.composites);
    assertionReport.sfx += sfxResult.assertions.length;
    assertionReport.textRuns += sfxResult.assertions.length;
    assertionReport.checks.push(...sfxResult.assertions);
  }

  const pngPath = path.join(outputDir, `${pageName}.png`);
  const webpPath = path.join(outputDir, `${pageName}.webp`);
  const pngBuffer = await canvas.composite(composites).png().toBuffer();
  await writeFile(pngPath, pngBuffer);
  await sharp(pngBuffer).webp({ quality: 82 }).toFile(webpPath);
  const composeSeconds = Number(((performance.now() - pageStarted) / 1000).toFixed(2));
  compositionTimings.push({ page: page.page, composeSeconds, png: path.relative(repoRoot, pngPath).replaceAll('\\', '/'), assertions: assertionReport });
  console.log(`[done] ${pageName} ${composeSeconds.toFixed(2)}s -> ${pngPath} (+ webp q82)`);
  console.log(`[assert] ${pageName} PASS panels=${assertionReport.panels} bubbles=${assertionReport.bubbles} sfx=${assertionReport.sfx} textRuns=${assertionReport.textRuns} pageBounds=PASS panelBounds=PASS textInsideShape=PASS collisions=PASS`);
}
const compositionPath = path.join(outputDir, 'composition.json');
let previousTimings = [];
if (selectedPages && existsSync(compositionPath)) {
  try {
    previousTimings = JSON.parse(await readFile(compositionPath, 'utf8')).pages || [];
  } catch {
    previousTimings = [];
  }
}
const timingsByPage = new Map(previousTimings.map((entry) => [entry.page, entry]));
compositionTimings.forEach((entry) => timingsByPage.set(entry.page, entry));
await writeFile(compositionPath, `${JSON.stringify({
  script: path.relative(repoRoot, scriptPath).replaceAll('\\', '/'),
  composedAt: new Date().toISOString(),
  pages: [...timingsByPage.values()].sort((a, b) => a.page - b.page),
}, null, 2)}\n`);

function assertPanelLayout(layout, pageNumber) {
  layout.forEach((box, index) => {
    if (!box || box.x < 0 || box.y < 0 || box.x + box.width > PAGE.width || box.y + box.height > PAGE.height) {
      throw new Error(`Page ${pageNumber} panel ${index + 1} is outside the page canvas: ${JSON.stringify(box)}`);
    }
  });
}

function borderSvg(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/></svg>`);
}

function coverTitleSvg(jpFont, comicFont, chapter, v2 = false) {
  const width = 1000;
  const height = 1500;
  const bandY = 1160;
  const title = v2 ? '余熱' : '湯あがり';
  const roman = v2 ? 'YONETSU' : 'YUAGARI';
  const chapterLabel = `CHAPTER ${String(chapter).padStart(2, '0')}`;
  const titleSize = 112;
  const romanSize = 42;
  const chapterSize = 25;
  const titlePath = centeredTextPath(jpFont, title, width / 2, bandY + 145, titleSize, { fill: '#fff' });
  const romanPath = centeredTextPath(comicFont, roman, width / 2, bandY + 210, romanSize, { fill: '#fff', 'letter-spacing': 5 });
  const chapterPath = centeredTextPath(comicFont, chapterLabel, width / 2, bandY + 270, chapterSize, { fill: '#fff' });
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101722" stop-opacity="0"/><stop offset="0.28" stop-color="#101722" stop-opacity="0.78"/><stop offset="1" stop-color="#080c12" stop-opacity="0.94"/></linearGradient></defs>
    <rect x="0" y="${bandY - 100}" width="1000" height="440" fill="url(#band)"/>
    <line x1="390" y1="${bandY + 228}" x2="610" y2="${bandY + 228}" stroke="#fff" stroke-width="2" opacity="0.7"/>
    ${titlePath}${romanPath}${chapterPath}
  </svg>`);
}

function bubbleComposites(panel, panelBox, font, panelIdValue) {
  const dialogues = panel.dialogue || [];
  if (!dialogues.length) return { composites: [], assertions: [] };
  const bleed = PAGE.gutter + PAGE.border;
  const box = {
    x: Math.max(PAGE.margin - bleed, panelBox.x - bleed),
    y: Math.max(PAGE.margin - bleed, panelBox.y - bleed),
    width: panelBox.width + bleed * 2,
    height: panelBox.height + bleed * 2,
  };
  const margin = dialogues.some((dialogue) => dialogue.type === 'monologue') ? 14 : 10;
  const gap = 12;
  const initialFontSize = Math.max(26, Math.min(32, Math.round(box.width / 30)));
  let packed;
  // Coverage target: lettering should take about a third of a panel. Relax step by step only
  // when a dense exchange genuinely will not fit, rather than failing the page.
  for (const relax of [{ cap: 0.34, band: 0.62, cols: 2, floor: 24 }, { cap: 0.42, band: 0.78, cols: 2, floor: 20 }, { cap: 0.55, band: 1, cols: 3, floor: 16 }, { cap: 0.7, band: 1, cols: 4, floor: 13 }]) {
    if (packed) break;
  for (let fontSize = initialFontSize; fontSize >= relax.floor && !packed; fontSize -= 2) {
    for (const widthRatio of [0.34, 0.30, 0.26, 0.44, 0.52]) {
      const maxBubbleWidth = Math.max(130, Math.min(box.width - margin * 2, Math.floor(box.width * widthRatio)));
      const minBubbleWidth = Math.min(maxBubbleWidth, 110);
      let items;
      try {
        items = dialogues.map((dialogue, index) => createBubbleLayout({
        dialogue,
        index,
        font: fontFor(dialogue.text),
        initialFontSize: fontSize,
        floorFontSize: Math.min(fontSize, relax.floor),
        maxBubbleWidth,
        minBubbleWidth,
        multiSpeaker: dialogues.length > 1 && (panel.chars || []).length > 1,
        }));
      } catch {
        continue; // this width does not hold the text; try the next one
      }
      packed = packBubbleColumns(items, box, margin, gap, panelBox, relax);
      if (packed) break;
    }
  }
  }
  if (!packed) throw new Error(`${panelIdValue}: ${dialogues.length} bubbles cannot fit at the 13px floor without collision.`);
  if (packed.some((item) => item.fontSize < 20)) {
    console.warn(`[warn] ${panelIdValue}: lettering dropped to ${Math.min(...packed.map((i) => i.fontSize))}px — panel is over its text budget`);
  }
  const placed = packed;
  const assertions = placed.map((item) => assertBubbleLayout(item, panelBox, panelIdValue));
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (rectsOverlap(placed[i], placed[j], gap)) throw new Error(`${panelIdValue}: bubbles ${i + 1} and ${j + 1} collide.`);
    }
  }
  return {
    composites: placed.map((item) => ({ input: bubbleSvg({ ...item, font: fontFor(item.dialogue.text) }), left: item.left, top: item.top })),
    assertions,
  };
}

function packBubbleColumns(items, box, margin, gap, panelBox = box, relax = { cap: 0.34, band: 0.62, cols: 2, floor: 24 }) {
  const usableWidth = box.width - margin * 2;
  const usableHeight = box.height - margin * 2;

  // Lettering must not swallow the drawing. Cap the ink and keep columns short so a long
  // exchange breaks into a second column at the opposite edge instead of running down the
  // middle of the panel, where the faces are.
  const panelArea = panelBox.width * panelBox.height;
  const bubbleArea = items.reduce((sum, item) => sum + item.width * item.height, 0);
  if (bubbleArea > panelArea * relax.cap) return null;
  const columnLimit = Math.min(usableHeight, Math.round(box.height * relax.band));

  const columns = [];
  let current = { width: 0, height: 0, items: [] };
  for (const item of items) {
    if (item.height > columnLimit && current.items.length) return null;
    if (current.items.length && current.height + gap + item.height > columnLimit) {
      columns.push(current);
      current = { width: 0, height: 0, items: [] };
    }
    item.columnY = current.height + (current.items.length ? gap : 0);
    current.height = item.columnY + item.height;
    current.width = Math.max(current.width, item.width);
    current.items.push(item);
  }
  if (current.items.length) columns.push(current);
  if (columns.length > relax.cols) return null;

  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0) + gap * Math.max(0, columns.length - 1);
  if (totalWidth > usableWidth || columns.some((column) => column.height > columnLimit)) return null;

  const placed = [];
  columns.forEach((column, columnIndex) => {
    // first column hugs the right edge (RTL reading order), second hugs the left edge
    const left = columnIndex === 0
      ? box.x + box.width - margin - column.width
      : columnIndex === 1
        ? box.x + margin
        : box.x + Math.round((box.width - column.width) / 2);
    const columnTop = box.y + margin;
    column.items.forEach((item) => {
      placed.push({ ...item, left: Math.round(left + column.width - item.width), top: Math.round(columnTop + item.columnY) });
    });
  });

  return placed;
}


function createBubbleLayout({ dialogue: rawDialogue, index, font, initialFontSize, floorFontSize = 20, maxBubbleWidth, minBubbleWidth, multiSpeaker }) {
  // Manga English lettering is set in caps.
  const dialogue = { ...rawDialogue, text: String(rawDialogue.text).toUpperCase() };
  const type = dialogue.type || 'speech';
  const isMonologue = type === 'monologue';
  const paddingX = isMonologue ? 26 : type === 'narration' ? 28 : type === 'shout' ? 34 : 28;
  const paddingTop = isMonologue ? 22 : type === 'narration' ? 24 : type === 'shout' ? 30 : 26;
  const paddingBottom = isMonologue ? 30 : type === 'narration' ? 32 : type === 'thought' ? 46 : 38;
  let fontSize = initialFontSize;
  let layout;
  while (fontSize >= floorFontSize) {
    // Wrap to whatever width survives the shape's inscribing factor — narrower + taller beats
    // overflowing. The 70px floor stops single long words from looping forever.
    const curveFactorForWrap = CURVE_FACTORS[type] || 1;
    const targetTextWidth = Math.max(70, Math.floor((maxBubbleWidth - paddingX * 2) / curveFactorForWrap));
    // Never hyphenate or break inside a word: if the longest word does not fit this width,
    // reject the width so the caller falls back to a wider bubble.
    const longestWord = Math.max(...dialogue.text.split(/\s+/).filter(Boolean)
      .map((word) => measureText(font, word, fontSize)));
    if (longestWord > targetTextWidth) {
      fontSize -= 2;
      continue;
    }
    const lines = wrapText(font, dialogue.text, targetTextWidth, fontSize);
    const lineMetrics = lines.map((line) => measureGlyphBounds(font, line, 0, 0, fontSize));
    const lineWidths = lineMetrics.map((bounds) => bounds.x2 - bounds.x1);
    // Curved shapes (ellipse/spiky/cloud) enclose far less area than their bounding box:
    // a centred text block only fits an ellipse if it is inscribed, so grow the box by the
    // inscribing factor for the shape actually drawn. Rectangular shapes keep the tight box.
    const curveFactor = CURVE_FACTORS[type] || 1;
    const rawTextWidth = Math.max(minBubbleWidth - paddingX * 2, ...lineWidths);
    const width = Math.ceil(rawTextWidth * curveFactor + paddingX * 2);
    const lineHeight = Math.ceil(fontSize * 1.28);
    const rawTextHeight = Math.max(...lineMetrics.map((bounds, lineIndex) => lineIndex * lineHeight + bounds.y2 - bounds.y1));
    const extraV = Math.ceil((rawTextHeight * curveFactor - rawTextHeight) / 2);
    const firstBaseline = paddingTop + extraV - Math.min(...lineMetrics.map((bounds) => bounds.y1));
    const baselines = lineMetrics.map((_, lineIndex) => firstBaseline + lineIndex * lineHeight);
    const contentBottom = Math.max(...lineMetrics.map((bounds, lineIndex) => baselines[lineIndex] + bounds.y2));
    const height = Math.ceil(contentBottom + extraV + paddingBottom);
    const lineXs = lineMetrics.map((bounds) => (width - (bounds.x2 - bounds.x1)) / 2 - bounds.x1);
    layout = { dialogue, type, lines, lineMetrics, lineWidths, lineXs, baselines, lineHeight, fontSize, width, height, paddingX, paddingTop, paddingBottom };
    if (width <= maxBubbleWidth) break;
    fontSize -= 2;
  }
  if (!layout || layout.width > maxBubbleWidth) throw new Error(`Bubble text cannot fit at the floor size: ${dialogue.text}`);
  return {
    ...layout,
    index,
    speakerDirection: multiSpeaker ? 'neutral' : index % 2 === 0 ? 'right' : 'left',
  };
}

function assertBubbleLayout(item, panelBox, panelIdValue) {
  const bubbleBounds = { x1: item.left, y1: item.top, x2: item.left + item.width, y2: item.top + item.height };
  const pageInside = bubbleBounds.x1 >= 0 && bubbleBounds.y1 >= 0 && bubbleBounds.x2 <= PAGE.width && bubbleBounds.y2 <= PAGE.height;
  // Bubbles are allowed to break the panel border and sit in the gutter (standard in print),
  // but must never leave the page.
  const bleed = PAGE.gutter + PAGE.border;
  const panelInside = bubbleBounds.x1 >= panelBox.x - bleed && bubbleBounds.y1 >= panelBox.y - bleed
    && bubbleBounds.x2 <= panelBox.x + panelBox.width + bleed && bubbleBounds.y2 <= panelBox.y + panelBox.height + bleed;
  if (!pageInside || !panelInside) throw new Error(`${panelIdValue}: bubble ${item.index + 1} is outside ${pageInside ? 'panel' : 'page'} bounds.`);
  const textRuns = measureBubbleTextRuns(item).map((bounds, lineIndex) => {
    const epsilon = 0.25;
    const inside = pointsInsideShape(bounds, item, epsilon);
    if (!inside) throw new Error(`${panelIdValue}: text line ${lineIndex + 1} overflows the drawn ${item.type} shape of bubble ${item.index + 1}: ${JSON.stringify({ bounds, width: item.width, height: item.height })}`);
    return { line: lineIndex + 1, ...bounds, inside: true };
  });
  return { panel: panelIdValue, bubble: item.index + 1, type: item.type, fontSize: item.fontSize, bounds: bubbleBounds, pageInside, panelInside, textRuns };
}

// Checks the four corners of a text line's bbox against the shape ACTUALLY drawn in bubbleSvg,
// not against the bounding rect — an ellipse leaves its corners empty and text used to spill there.
function pointsInsideShape(bounds, item, epsilon) {
  const { type, width, height } = item;
  if (type === 'thought') {
    const cx = width / 2;
    const cy = (height - 14) / 2;
    const rx = (width / 2 - 7) * 0.86 - epsilon;
    const ry = ((height - 14) / 2 - 5) * 0.86 - epsilon;
    if (rx <= 0 || ry <= 0) return false;
    const corners = [[bounds.x1, bounds.y1], [bounds.x2, bounds.y1], [bounds.x1, bounds.y2], [bounds.x2, bounds.y2]];
    return corners.every(([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  }
  // Inner rect of the shape actually drawn in bubbleSvg, per type.
  const area = type === 'narration' ? { x: 9, top: 9, bottom: height - 9 }
    : type === 'monologue' ? { x: 6, top: 6, bottom: height - 6 }
    : type === 'shout' ? { x: 17, top: 17, bottom: height - 37 }
    : { x: 19, top: 16, bottom: height - 30 };
  return bounds.x1 >= area.x - epsilon && bounds.x2 <= width - area.x + epsilon
    && bounds.y1 >= area.top - epsilon && bounds.y2 <= area.bottom + epsilon;
}

// Rectangular starburst: alternating spikes around a rect perimeter. Text lives in the inner rect.
function jaggedRectPoints(width, height, spike) {
  const pts = [];
  const inset = spike + 4;
  const stepsX = Math.max(6, Math.round((width - inset * 2) / 34));
  const stepsY = Math.max(4, Math.round((height - inset * 2) / 34));
  const push = (x, y) => pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  const lerp = (a, b, t) => a + (b - a) * t;
  for (let i = 0; i < stepsX; i += 1) {
    const t = i / stepsX;
    push(lerp(inset, width - inset, t), inset);
    push(lerp(inset, width - inset, t + 0.5 / stepsX), inset - spike);
  }
  for (let i = 0; i < stepsY; i += 1) {
    const t = i / stepsY;
    push(width - inset, lerp(inset, height - inset, t));
    push(width - inset + spike, lerp(inset, height - inset, t + 0.5 / stepsY));
  }
  for (let i = 0; i < stepsX; i += 1) {
    const t = i / stepsX;
    push(lerp(width - inset, inset, t), height - inset);
    push(lerp(width - inset, inset, t + 0.5 / stepsX), height - inset + spike);
  }
  for (let i = 0; i < stepsY; i += 1) {
    const t = i / stepsY;
    push(inset, lerp(height - inset, inset, t));
    push(inset - spike, lerp(height - inset, inset, t + 0.5 / stepsY));
  }
  return pts.join(' ');
}

function measureBubbleTextRuns(item) {
  return item.lines.map((line, index) => {
    return measureGlyphBounds(fontFor(item.dialogue.text), line, item.lineXs[index], item.baselines[index], item.fontSize);
  });
}

function rectsOverlap(a, b, gap = 0) {
  return a.left < b.left + b.width + gap && a.left + a.width + gap > b.left
    && a.top < b.top + b.height + gap && a.top + a.height + gap > b.top;
}

function sfxComposites(panel, box, font, panelIdValue) {
  const assertions = [];
  const composites = (panel.sfx || []).map((sfx, index) => {
    const font = fontFor(sfx.text);
    const fontSize = sfx.style === 'big' ? Math.max(52, Math.round(box.width / 8)) : Math.max(30, Math.round(box.width / 15));
    const width = Math.min(box.width - 40, Math.ceil(measureText(font, sfx.text, fontSize) + 30));
    const height = Math.ceil(fontSize * 1.35);
    const x = index % 2 === 0 ? box.x + 22 : box.x + box.width - width - 22;
    const y = box.y + box.height - height - 22 - index * (height + 6);
    const outlined = textPath(font, sfx.text, 12, fontSize, fontSize, { fill: '#111', stroke: '#fff', 'stroke-width': 12, 'paint-order': 'stroke' });
    const ink = textPath(font, sfx.text, 12, fontSize, fontSize, { fill: '#111', stroke: '#111', 'stroke-width': 3, 'paint-order': 'stroke' });
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <g transform="skewX(-12)">${outlined}${ink}</g>
    </svg>`;
    const left = Math.round(x);
    const top = Math.max(box.y + 12, Math.round(y));
    const bounds = { x1: left, y1: top, x2: left + width, y2: top + height };
    const inside = bounds.x1 >= box.x && bounds.y1 >= box.y && bounds.x2 <= box.x + box.width && bounds.y2 <= box.y + box.height;
    if (!inside) throw new Error(`${panelIdValue}: SFX ${index + 1} is outside its panel bounds.`);
    assertions.push({ panel: panelIdValue, sfx: index + 1, type: 'sfx', bounds, panelInside: true, pageInside: true });
    return { input: Buffer.from(svg), left, top };
  });
  return { composites, assertions };
}

function bubbleSvg({ type = 'speech', lines, width, height, fontSize, font, speakerDirection, lineXs, baselines }) {
  const stroke = 4;
  const cx = width / 2;
  const cy = (height - 14) / 2;
  const rx = width / 2 - 7;
  const ry = (height - 14) / 2 - 5;
  let shape;
  if (type === 'monologue') {
    shape = `<defs><linearGradient id="toneFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.92"/><stop offset="0.72" stop-color="#fff" stop-opacity="0.78"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#777" opacity="0.22"/></pattern></defs><rect x="0" y="4" width="${width}" height="${height - 8}" rx="18" fill="url(#toneFade)"/><rect x="0" y="4" width="${width}" height="${height - 8}" rx="18" fill="url(#dots)" opacity="0.45"/>`;
  } else if (type === 'narration') {
    shape = `<rect x="5" y="5" width="${width - 10}" height="${height - 10}" fill="#fff" stroke="#000" stroke-width="${stroke}"/>`;
  } else if (type === 'whisper') {
    shape = `<rect x="7" y="6" width="${width - 14}" height="${height - 26}" rx="${Math.min(26, (height - 26) / 2)}" fill="#fff" stroke="#000" stroke-width="3" stroke-dasharray="10 8"/>`;
  } else if (type === 'shout') {
    shape = `<polygon points="${jaggedRectPoints(width, height - 20, 9)}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/>`;
  } else if (type === 'thought') {
    shape = `<path d="${cloudPath(cx, cy, rx, ry, 18)}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/><circle cx="${speakerDirection === 'right' ? width - 20 : 20}" cy="${height - 13}" r="7" fill="#fff" stroke="#000" stroke-width="3"/><circle cx="${speakerDirection === 'right' ? width - 7 : 7}" cy="${height - 3}" r="4" fill="#fff" stroke="#000" stroke-width="2"/>`;
  } else {
    if (speakerDirection === 'neutral') {
      shape = `<rect x="7" y="6" width="${width - 14}" height="${height - 26}" rx="${Math.min(30, (height - 26) / 2)}" fill="#fff" stroke="#000" stroke-width="${stroke}"/><path d="M ${cx - 9} ${height - 19} L ${cx} ${height - 3} L ${cx + 9} ${height - 19}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/><path d="M ${cx - 6} ${height - 20} L ${cx + 6} ${height - 20}" stroke="#fff" stroke-width="7"/>`;
    } else {
      const tailX = speakerDirection === 'right' ? width - 18 : 18;
      const tipX = speakerDirection === 'right' ? width - 3 : 3;
      shape = `<rect x="7" y="6" width="${width - 14}" height="${height - 26}" rx="${Math.min(30, (height - 26) / 2)}" fill="#fff" stroke="#000" stroke-width="${stroke}"/><path d="M ${tailX - (speakerDirection === 'right' ? 14 : -14)} ${height - 25} L ${tipX} ${height - 2} L ${tailX} ${height - 35}" fill="#fff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/><path d="M ${tailX - (speakerDirection === 'right' ? 12 : -12)} ${height - 27} L ${tailX} ${height - 35}" stroke="#fff" stroke-width="7"/>`;
    }
  }
  const text = lines.map((line, index) => {
    const path = textPath(font, line, lineXs[index], baselines[index], fontSize, { fill: '#111' });
    return type === 'monologue' ? `<g transform="translate(${index * 2} 0)">${path}</g>` : path;
  }).join('');
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${shape}${text}</svg>`);
}

function parsePageSelection(value) {
  const pages = new Set();
  for (const part of String(value).split(',').map((item) => item.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`Invalid page range '${part}'.`);
      for (let page = start; page <= end; page += 1) pages.add(page);
    } else if (/^\d+$/.test(part)) pages.add(Number(part));
    else throw new Error(`Invalid page selection '${part}'.`);
  }
  return pages;
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
