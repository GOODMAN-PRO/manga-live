import opentype from 'opentype.js';

export async function loadFont(fontPath) {
  return new Promise((resolve, reject) => {
    opentype.load(fontPath, (error, font) => error ? reject(error) : resolve(font));
  });
}

export function measureText(font, text, fontSize, options = {}) {
  return font.getAdvanceWidth(String(text), fontSize, { kerning: true, ...options });
}

export function measureGlyphBounds(font, text, x, baselineY, fontSize) {
  const glyphPath = font.getPath(String(text), x, baselineY, fontSize, { kerning: true });
  const bounds = glyphPath.getBoundingBox();
  return { x1: bounds.x1, y1: bounds.y1, x2: bounds.x2, y2: bounds.y2 };
}

export function textPath(font, text, x, y, fontSize, attributes = {}) {
  const path = font.getPath(String(text), x, y, fontSize, { kerning: true });
  return `<path d="${path.toPathData(2)}" ${attributeString(attributes)}/>`;
}

export function centeredTextPath(font, text, centerX, baselineY, fontSize, attributes = {}) {
  const width = measureText(font, text, fontSize);
  return textPath(font, text, centerX - width / 2, baselineY, fontSize, attributes);
}

export function wrapText(font, text, maxWidth, fontSize) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  const pieces = words.flatMap((word) => splitLongToken(font, word, maxWidth, fontSize));
  let current = pieces.shift();
  for (const word of pieces) {
    const candidate = `${current} ${word}`;
    if (measureText(font, candidate, fontSize) <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function splitLongToken(font, token, maxWidth, fontSize) {
  if (measureText(font, token, fontSize) <= maxWidth) return [token];
  const chunks = [];
  let current = '';
  for (const char of token) {
    const candidate = `${current}${char}`;
    if (current && measureText(font, candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = char;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}

function attributeString(attributes) {
  return Object.entries(attributes).map(([key, value]) => `${key}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ');
}
