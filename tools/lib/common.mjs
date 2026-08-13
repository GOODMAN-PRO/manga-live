import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const PAGE = Object.freeze({ width: 1500, height: 2100, margin: 40, gutter: 24, border: 6 });

export const PANEL_SIZES = Object.freeze({
  hero: [1420, 2020],
  half: [1420, 980],
  third: [1420, 630],
  'wide-strip': [1420, 480],
  tall: [690, 2020],
  inset: [560, 560],
});

export const POSITIVE_BASE = 'masterpiece, best quality, monochrome, greyscale, manga, screentone, halftone, clean lineart';
export const NEGATIVE_BASE = 'color, photorealistic, realistic, 3d, render, sketch, rough, messy lines, crosshatching, watermark, signature, text, speech bubble, blurry, extra fingers, bad hands, bad anatomy';

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const eq = item.indexOf('=');
    if (eq >= 0) {
      flags[item.slice(2, eq)] = item.slice(eq + 1);
      continue;
    }
    const name = item.slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[name] = argv[++i];
    else flags[name] = true;
  }
  return { positional, flags };
}

export function scriptSlug(scriptPath) {
  return path.basename(scriptPath, path.extname(scriptPath));
}

export async function loadScript(scriptPath) {
  const script = JSON.parse(await readFile(scriptPath, 'utf8'));
  if (!Number.isInteger(script.chapter) || !Array.isArray(script.pages)) {
    throw new Error(`${scriptPath} does not match story/FORMAT.md (chapter/pages missing)`);
  }
  for (const page of script.pages) {
    if (!Number.isInteger(page.page) || !Array.isArray(page.panels)) throw new Error(`Invalid page in ${scriptPath}`);
    page.panels.forEach((panel, index) => {
      if (!PANEL_SIZES[panel.size]) throw new Error(`Unsupported size '${panel.size}' at page ${page.page}, panel ${index + 1}`);
    });
  }
  return script;
}

export function panelId(pageNumber, panelIndex) {
  return `p${pageNumber}${String.fromCharCode(97 + panelIndex)}`;
}

export function deterministicSeed(...parts) {
  const hash = createHash('sha256').update(parts.join(':')).digest();
  // ComfyUI seeds are safe as unsigned 53-bit integers.
  return hash.readUIntBE(0, 6);
}

export function xmlEscape(value) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[char]);
}
