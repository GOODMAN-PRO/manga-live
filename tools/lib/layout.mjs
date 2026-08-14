import { PAGE } from './common.mjs';

// Deterministic per-page variation: derived from the panel shape list itself so panelgen and
// compose always agree without threading a seed through both call sites.
function pageHash(panels) {
  const key = panels.map((panel) => panel.size || 'third').join('|') + panels.length;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

// Real manga rows are rarely equal thirds. These are the split ratios a row can take.
const SPLITS_2 = [[3, 2], [2, 3], [5, 3], [3, 5], [1, 1]];
const SPLITS_3 = [[4, 3, 3], [3, 3, 4], [3, 4, 3], [5, 4, 4]];

export function createLayout(panels) {
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const contentHeight = PAGE.height - PAGE.margin * 2;
  if (panels.length === 1) return [{ x: PAGE.margin, y: PAGE.margin, width: contentWidth, height: contentHeight }];
  const hash = pageHash(panels);
  const weights = { hero: 12, half: 6, third: 4, 'wide-strip': 3, tall: 6 };
  const rows = [];
  for (let index = 0; index < panels.length; index += 1) {
    if (panels[index].size === 'inset') continue;
    const size = panels[index].size;
    const nextSize = panels[index + 1]?.size;
    const thirdish = (value) => value === 'third' || value === 'wide-strip';
    // three-across rows appear on busier pages; two-across is the common case
    if (panels.length >= 5 && thirdish(size) && thirdish(nextSize) && thirdish(panels[index + 2]?.size) && ((hash >>> (rows.length % 24)) % 5) === 0) {
      rows.push({ indices: [index, index + 1, index + 2], weight: weights.third });
      index += 2;
    } else if (panels.length >= 4 && thirdish(size) && thirdish(nextSize)) {
      rows.push({ indices: [index, index + 1], weight: weights.third });
      index += 1;
    } else rows.push({ indices: [index], weight: weights[size] || 4 });
  }
  if (!rows.length) throw new Error('A page cannot contain only inset panels.');
  const verticalSpace = contentHeight - PAGE.gutter * (rows.length - 1);
  const weightTotal = rows.reduce((sum, row) => sum + row.weight, 0);
  const heights = rows.map((row) => Math.max(120, Math.round(verticalSpace * row.weight / weightTotal)));
  heights[heights.length - 1] += verticalSpace - heights.reduce((sum, value) => sum + value, 0);
  const result = Array(panels.length);
  let y = PAGE.margin;
  rows.forEach((row, rowIndex) => {
    const count = row.indices.length;
    const availableWidth = contentWidth - PAGE.gutter * (count - 1);
    let widths;
    if (count === 1) widths = [contentWidth];
    else {
      const table = count === 2 ? SPLITS_2 : SPLITS_3;
      const split = table[(hash >>> ((rowIndex * 3 + 1) % 24)) % table.length];
      widths = proportionalWidths(split, availableWidth);
    }
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
    // Prefer the panel before it; if the inset opens the page, anchor to the next one instead
    // of failing the build.
    let anchorIndex = index - 1;
    while (anchorIndex >= 0 && !result[anchorIndex]) anchorIndex -= 1;
    if (anchorIndex < 0) {
      anchorIndex = index + 1;
      while (anchorIndex < panels.length && !result[anchorIndex]) anchorIndex += 1;
    }
    if (anchorIndex >= panels.length || !result[anchorIndex]) throw new Error(`Inset panel ${index + 1} has no panel to anchor to.`);
    const anchor = result[anchorIndex];
    const size = Math.max(180, Math.round(anchor.width * 0.4));
    result[index] = { x: anchor.x + 18, y: anchor.y + anchor.height - size - 18, width: size, height: size };
  });
  return result;
}

export function generationDimensions(box, maxSide = 1536) {
  const innerWidth = Math.max(64, box.width - PAGE.border * 2);
  const innerHeight = Math.max(64, box.height - PAGE.border * 2);
  const scale = Math.min(1, maxSide / Math.max(innerWidth, innerHeight));
  return [roundToEight(innerWidth * scale), roundToEight(innerHeight * scale)];
}

function proportionalWidths(weights, total) {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => Math.round(total * weight / weightTotal));
  widths[widths.length - 1] += total - widths.reduce((sum, value) => sum + value, 0);
  return widths;
}

function roundToEight(value) {
  return Math.max(64, Math.round(value / 8) * 8);
}
