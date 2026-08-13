import opentype from 'opentype.js';

export async function loadFont(fontPath) {
  return new Promise((resolve, reject) => {
    opentype.load(fontPath, (error, font) => error ? reject(error) : resolve(font));
  });
}

export function measureText(font, text, fontSize, options = {}) {
  return font.getAdvanceWidth(String(text), fontSize, { kerning: true, ...options });
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
  let current = words.shift();
  for (const word of words) {
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

function attributeString(attributes) {
  return Object.entries(attributes).map(([key, value]) => `${key}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ');
}
