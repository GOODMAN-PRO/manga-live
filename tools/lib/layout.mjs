import { PAGE } from './common.mjs';

export function createLayout(panels) {
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const contentHeight = PAGE.height - PAGE.margin * 2;
  if (panels.length === 1) return [{ x: PAGE.margin, y: PAGE.margin, width: contentWidth, height: contentHeight }];
  const weights = { hero: 12, half: 6, third: 4, 'wide-strip': 3, tall: 6 };
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
