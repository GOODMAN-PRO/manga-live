#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  COVER_NEGATIVE_BASE,
  COVER_POSITIVE_BASE,
  DEFORMED_POSITIVE,
  NEGATIVE_BASE,
  PANEL_SIZES,
  POSITIVE_BASE,
  SILHOUETTE_POSITIVE,
  deterministicSeed,
  loadScript,
  panelId,
  parseArgs,
  scriptSlug,
} from './lib/common.mjs';
import { createLayout, generationDimensions } from './lib/layout.mjs';

const HELP = `Usage: node tools/panelgen.mjs story/chNN.json [options]

Options:
  --comfy URL          ComfyUI base URL (default http://127.0.0.1:8188)
  --checkpoint NAME    checkpoint filename (default animagine-xl-4.0-opt.safetensors)
  --out DIR            panel output directory (story2 defaults to build2/<script>/panels)
  --batch N            prompts kept in flight (default 2; RTX 5090 measured safe max: 3)
  --pages RANGE         generate selected pages, e.g. 1-6,9,12-14
  --steps N            sampling steps (default 28)
  --cfg N              classifier-free guidance (default 5)
  --redo PANEL_ID      regenerate one panel with a fresh persisted seed, e.g. p3b
                       accepts comma-separated ids
  --overrides FILE     promptOverride sidecar (default story/<script>-overrides.json when present)
  --force              regenerate every panel with its current deterministic seed
  --cover              generate the chapter cover art to build/<script>/cover-art.png
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
const outputDir = path.resolve(flags.out || path.join(repoRoot, buildRoot, slug, 'panels'));
const comfy = String(flags.comfy || process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const checkpoint = String(flags.checkpoint || process.env.COMFY_CHECKPOINT || 'animagine-xl-4.0-opt.safetensors');
const concurrency = Math.max(1, Number(flags.batch || (isV2 ? 3 : 2)));
const steps = Math.max(1, Number(flags.steps || 28));
const cfg = Number(flags.cfg || 5);
const redoIds = new Set(flags.redo ? String(flags.redo).split(',').map(normalizePanelId).filter(Boolean) : []);
const redo = redoIds.size ? [...redoIds][0] : null;
const selectedPages = flags.pages ? parsePageSelection(flags.pages) : null;

const script = await loadScript(scriptPath);
await mkdir(outputDir, { recursive: true });

const tokenPath = path.join(repoRoot, 'chars' + seriesSuffix, 'tokens.md');
const tokens = existsSync(tokenPath) ? parseTokens(await readFile(tokenPath, 'utf8')) : new Map();
if (!existsSync(tokenPath)) console.warn('chars/tokens.md not found; using character ids until locked tokens exist.');
const defaultOverridesPath = path.join(path.dirname(scriptPath), `${slug}-overrides.json`);
const overridesPath = flags.overrides ? path.resolve(String(flags.overrides)) : defaultOverridesPath;
const rawPromptOverrides = existsSync(overridesPath)
  ? JSON.parse(await readFile(overridesPath, 'utf8')).overrides || {}
  : {};
const promptOverrides = Object.fromEntries(
  Object.entries(rawPromptOverrides).map(([id, prompt]) => [normalizePanelId(id), prompt]),
);

if (flags.cover) {
  if (!script.cover?.desc || !Array.isArray(script.cover.chars)) throw new Error(`${scriptPath} has no valid cover object.`);
  const coverPath = path.resolve(flags.out || path.join(repoRoot, buildRoot, slug, 'cover-art.png'));
  await mkdir(path.dirname(coverPath), { recursive: true });
  await assertComfyReady(comfy, checkpoint);
  const started = performance.now();
  const coverSeed = redo === 'cover'
    ? deterministicSeed(script.chapter, 'cover', 'redo', Date.now(), randomUUID())
    : deterministicSeed(script.chapter, 'cover');
  const coverPrompt = buildCoverPrompt(script.cover, tokens);
  const coverNegative = isV2
    ? `${COVER_NEGATIVE_BASE}, 2girls, two girls, black hair on girl, dark hair on girl, hair bun on girl, short hair on girl`
    : `${COVER_NEGATIVE_BASE}, green happi, green coat on girl, blonde girl, white-haired girl, necktie on girl`;
  const executionSeconds = await generateImage({
    id: 'cover',
    outputPath: coverPath,
    seed: coverSeed,
    prompt: coverPrompt,
    negative: coverNegative,
    targetWidth: 1000,
    targetHeight: 1500,
    greyscale: false,
  });
  await writeFile(path.join(path.dirname(coverPath), 'cover-generation.json'), `${JSON.stringify({
    script: path.relative(repoRoot, scriptPath).replaceAll('\\', '/'),
    checkpoint,
    generatedAt: new Date().toISOString(),
    seed: coverSeed,
    prompt: coverPrompt,
    negative: coverNegative,
    timingSeconds: executionSeconds,
  }, null, 2)}\n`);
  console.log(`[done] cover ${executionSeconds.toFixed(1)}s GPU (${((performance.now() - started) / 1000).toFixed(1)}s wall) -> ${coverPath}`);
  process.exit(0);
}

const artifactDir = flags.out ? outputDir : path.dirname(outputDir);
const seedPath = path.join(artifactDir, 'seeds.json');
const metadataPath = path.join(artifactDir, 'generation.json');
let seedOverrides = {};
if (existsSync(seedPath)) seedOverrides = JSON.parse(await readFile(seedPath, 'utf8'));

const jobs = [];
for (const page of script.pages) {
  if (selectedPages && !selectedPages.has(page.page)) continue;
  const layout = createLayout(page.panels);
  page.panels.forEach((panel, index) => {
    const id = panelId(page.page, index);
    if (redoIds.size && !redoIds.has(id)) return;
    const baseSeed = deterministicSeed(script.chapter, page.page, id);
    if (redoIds.has(id)) seedOverrides[id] = deterministicSeed(script.chapter, page.page, id, 'redo', Date.now(), randomUUID());
    const outputPath = path.join(outputDir, `${id}.png`);
    if (!flags.force && !redo && existsSync(outputPath)) {
      console.log(`[skip] ${id} already exists`);
      return;
    }
    jobs.push({
      id,
      page: page.page,
      panel,
      dimensions: generationDimensions(layout[index]),
      outputPath,
      seed: seedOverrides[id] ?? baseSeed,
      prompt: buildPrompt(panel, tokens, promptOverrides[id]),
      negative: buildNegative(panel),
    });
  });
}

if (redoIds.size && jobs.length !== redoIds.size) {
  const found = new Set(jobs.map((job) => job.id));
  const missing = [...redoIds].filter((id) => !found.has(id));
  throw new Error(`Panel override ids not found in ${scriptPath}: ${missing.join(', ')}`);
}
if (jobs.length === 0) {
  console.log('No panels need generation; existing generation metadata was preserved.');
  process.exit(0);
}
await writeFile(seedPath, `${JSON.stringify(seedOverrides, null, 2)}\n`);

await assertComfyReady(comfy, checkpoint);
console.log(`Generating ${jobs.length} panel(s) with ${checkpoint} via ${comfy}`);

const timings = [];
let nextJob = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (nextJob < jobs.length) {
    const job = jobs[nextJob++];
    const started = performance.now();
    const executionSeconds = await generatePanel(job);
    const wallSeconds = (performance.now() - started) / 1000;
    timings.push({ id: job.id, executionSeconds, wallSeconds: Number(wallSeconds.toFixed(2)), seed: job.seed });
    console.log(`[done] ${job.id} ${executionSeconds.toFixed(1)}s GPU (${wallSeconds.toFixed(1)}s wall) seed=${job.seed} -> ${job.outputPath}`);
  }
}));

const generatedPanels = jobs.map((job) => ({
  id: job.id,
  page: job.page,
  size: job.panel.size,
  seed: job.seed,
  prompt: job.prompt,
  negative: job.negative,
  timingSeconds: timings.find((item) => item.id === job.id)?.executionSeconds,
  wallSeconds: timings.find((item) => item.id === job.id)?.wallSeconds,
}));
let previousPanels = [];
if (existsSync(metadataPath) && !flags.force) {
  try {
    previousPanels = JSON.parse(await readFile(metadataPath, 'utf8')).panels || [];
  } catch {
    previousPanels = [];
  }
}
const mergedPanels = new Map(previousPanels.map((panel) => [panel.id, panel]));
generatedPanels.forEach((panel) => mergedPanels.set(panel.id, panel));
const metadata = {
  script: path.relative(repoRoot, scriptPath).replaceAll('\\', '/'),
  checkpoint,
  generatedAt: new Date().toISOString(),
  panels: [...mergedPanels.values()].sort((a, b) => a.page - b.page || a.id.localeCompare(b.id)),
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

async function generatePanel(job) {
  const [targetWidth, targetHeight] = job.dimensions || PANEL_SIZES[job.panel.size];
  return generateImage({ ...job, targetWidth, targetHeight, greyscale: true });
}

async function generateImage({ id, outputPath, seed, prompt, negative, targetWidth, targetHeight, greyscale }) {
  const width = Math.ceil(targetWidth / 8) * 8;
  const height = Math.ceil(targetHeight / 8) * 8;
  const workflow = createWorkflow({ width, height, seed, positive: prompt, negative, checkpoint });
  const response = await fetchJson(`${comfy}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  });
  if (!response.prompt_id) throw new Error(`ComfyUI did not return a prompt id for ${id}`);
  const { image, executionSeconds } = await waitForImage(response.prompt_id);
  const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
  const imageResponse = await fetch(`${comfy}/view?${query}`);
  if (!imageResponse.ok) throw new Error(`Failed to fetch ComfyUI output for ${id}: HTTP ${imageResponse.status}`);
  const data = Buffer.from(await imageResponse.arrayBuffer());
  let pipeline = sharp(data).resize(targetWidth, targetHeight, { fit: 'cover', position: 'attention' });
  if (greyscale) pipeline = pipeline.greyscale();
  await pipeline.png().toFile(outputPath);
  return executionSeconds;
}

async function waitForImage(promptId) {
  const timeoutAt = Date.now() + 30 * 60_000;
  while (Date.now() < timeoutAt) {
    const history = await fetchJson(`${comfy}/history/${promptId}`);
    const entry = history[promptId];
    if (entry?.status?.status_str === 'error' || entry?.status?.completed === false && entry?.status?.messages?.some((m) => m[0] === 'execution_error')) {
      throw new Error(`ComfyUI generation failed: ${JSON.stringify(entry.status.messages)}`);
    }
    const images = entry?.outputs?.['9']?.images;
    if (images?.length) {
      const start = entry.status?.messages?.find((message) => message[0] === 'execution_start')?.[1]?.timestamp;
      const success = entry.status?.messages?.find((message) => message[0] === 'execution_success')?.[1]?.timestamp;
      const executionSeconds = start && success ? Number(((success - start) / 1000).toFixed(2)) : 0;
      return { image: images[0], executionSeconds };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ComfyUI prompt ${promptId}`);
}

async function assertComfyReady(baseUrl, requestedCheckpoint) {
  let stats;
  try {
    stats = await fetchJson(`${baseUrl}/system_stats`);
  } catch (error) {
    throw new Error(`ComfyUI is not reachable at ${baseUrl}: ${error.message}`);
  }
  const gpu = stats.devices?.find((device) => String(device.type).toLowerCase().includes('cuda'));
  if (!gpu) throw new Error('ComfyUI is reachable but no CUDA device is active; refusing CPU generation.');
  const objectInfo = await fetchJson(`${baseUrl}/object_info/CheckpointLoaderSimple`);
  const available = objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
  if (!available.includes(requestedCheckpoint)) {
    throw new Error(`Checkpoint '${requestedCheckpoint}' is not available. Found: ${available.join(', ') || '(none)'}`);
  }
  console.log(`CUDA device: ${gpu.name || gpu.type}`);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${await response.text()}`);
  return response.json();
}

function createWorkflow({ width, height, seed, positive, negative, checkpoint: checkpointName }) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpointName } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
    4: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    5: {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    8: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: `manga-live/${Date.now()}`, images: ['8', 0] } },
  };
}

function buildPrompt(panel, tokenMap, promptOverride) {
  const castNames = (panel.chars || []).map((character) => String(character.name).toLowerCase());
  const hasKou = castNames.includes('kou');
  const hasKanade = castNames.includes('kanade');
  const characterTokens = panel.silhouette ? [] : (panel.chars || []).flatMap((character) => {
    const locked = resolveToken(tokenMap, character.name, panel);
    const continuity = isV2 && character.name === 'kou' ? 'left forearm bandages' : null;
    const valueLock = isV2 && character.name === 'kanade'
      ? 'white hair, pale grey hair, light colored hair, silver hair, black core shadow, white sheen band'
      : isV2 && character.name === 'kou' ? 'solid black hair, darkest hair mass, hard white highlight band' : null;
    return [valueLock, locked || character.name, continuity, character.expression, character.pose].filter(Boolean);
  });
  const countTag = inferCountTag(panel.chars || [], tokenMap);
  const positiveBase = panel.chibi
    ? `masterpiece, best quality, monochrome, greyscale, manga, screentone, ${DEFORMED_POSITIVE}`
    : panel.silhouette
      ? `masterpiece, best quality, monochrome, greyscale, manga, screentone, clean lineart, ${SILHOUETTE_POSITIVE}`
      : POSITIVE_BASE;
  const boundValueLock = isV2 && hasKou && hasKanade ? '1boy with solid black hair, 1girl with white hair' : null;
  const parts = promptOverride
    ? [positiveBase, boundValueLock, promptOverride]
    : [positiveBase, panel.chars?.length === 1 ? 'solo' : null, countTag, boundValueLock, ...characterTokens, panel.action, `${panel.shot} shot`, panel.bg];
  if (isV2 && !panel.chibi && !panel.silhouette) {
    const context = `${panel.bg || ''} ${panel.action || ''}`.toLowerCase();
    if (/tower|layer|dungeon|cathedral|stone|void/.test(context)) parts.push('dark fantasy interior', 'dramatic lighting', 'dungeon');
    else if (/academy|school|classroom|campus/.test(context)) parts.push('school', 'tone-washed background', 'daylight');
  }
  if (panel.size === 'tall') parts.push('full body', 'head to toe', 'standing');
  if (panel.chars?.length) {
    if (['closeup', 'extreme-closeup'].includes(panel.shot)) parts.push('upper body', 'head fully in frame');
    else parts.push('full body', 'head fully in frame');
  }
  return parts.filter(Boolean).join(', ');
}

function normalizePanelId(value) {
  const match = String(value ?? '').trim().toLowerCase().match(/^p0*(\d+)([a-z])$/);
  return match ? `p${Number(match[1])}${match[2]}` : String(value ?? '').trim().toLowerCase();
}

function buildNegative(panel) {
  const parts = [NEGATIVE_BASE];
  if (panel.chibi) parts.push('realistic proportions, detailed background');
  else parts.push('chibi, super deformed');
  if (panel.chars?.length === 2) parts.push('3people, third person, extra person, crowd');
  if (panel.chars?.length) parts.push('head out of frame, cropped head');
  if (isV2) {
    const names = (panel.chars || []).map((character) => String(character.name).toLowerCase());
    if (names.includes('kanade') && !names.includes('kou')) parts.push('black hair, dark hair');
  }
  return parts.join(', ');
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

function buildCoverPrompt(cover, tokenMap) {
  const characters = cover.chars.map((name) => resolveCoverToken(tokenMap, name, cover.desc) || name);
  const yonetsuLock = isV2
    ? 'exactly 1boy and 1girl, male hazama kou with solid black short hair and hard white highlight band, female ariake kanade with white hair, pale silver hair, very long hair down, no hair bun, clearly different hair values, boy left, girl right'
    : null;
  return [COVER_POSITIVE_BASE, yonetsuLock, inferCountTag(cover.chars.map((name) => ({ name })), tokenMap), ...characters, cover.desc].filter(Boolean).join(', ');
}

function coverEnvironmentTags(description) {
  const text = String(description).toLowerCase();
  const rules = [
    [/night|midnight|indigo/, 'night, dark blue night palette'],
    [/rain/, 'raining, rain streaks, wet clothes'],
    [/bathhouse|sentō|sento|noren/, 'Japanese bathhouse entrance, indigo noren curtain'],
    [/warm interior|warm light|backlit/, 'warm interior backlighting, glowing doorway'],
    [/wet asphalt|reflection/, 'wet asphalt, puddle reflection'],
    [/steam/, 'steam, atmospheric haze'],
    [/hose/, 'holding a water hose'],
    [/shopping street/, 'shuttered Japanese shopping street'],
    [/silver/, 'silver rain highlights'],
  ];
  return rules.filter(([pattern]) => pattern.test(text)).map(([, tag]) => tag);
}

function resolveCoverToken(tokenMap, name, description) {
  const entry = tokenMap.get(String(name).toLowerCase());
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  const aliases = [String(name).toLowerCase()];
  const properName = entry.base?.match(/^([^,]+)/)?.[1]?.toLowerCase();
  if (properName) aliases.push(...properName.split(/\s+/), properName);
  const sentences = String(description).split(/(?<=[.!?])\s+/);
  const localContext = sentences.find((sentence) => aliases.some((alias) => alias.length > 2 && sentence.toLowerCase().includes(alias))) || description;
  const variant = isV2 && String(name).toLowerCase() === 'kanade' && /tower figure|hair fully down|wild/.test(String(description).toLowerCase()) ? 'tower'
    : /school|uniform|jersey|blazer|necktie|academy/.test(localContext.toLowerCase()) ? 'day'
    : /bath|sento|onsen|happi|hair clipped|towel|cleaning/.test(localContext.toLowerCase()) ? 'night'
      : /night|steam|rain/.test(String(description).toLowerCase()) ? 'night' : 'day';
  return [entry.base, entry[variant]].filter(Boolean).join(', ') || null;
}

function inferCountTag(characters, tokenMap) {
  if (!characters.length) return null;
  let girls = 0;
  let boys = 0;
  let unknown = 0;
  for (const character of characters) {
    const entry = tokenMap.get(String(character.name).toLowerCase());
    const descriptor = `${character.name} ${typeof entry === 'string' ? entry : Object.values(entry || {}).join(', ')}`.toLowerCase();
    if (/\b(girl|woman|female)\b/.test(descriptor)) girls += 1;
    else if (/\b(boy|man|male)\b/.test(descriptor)) boys += 1;
    else unknown += 1;
  }
  if (!unknown && girls && boys) return `${girls}girl${girls === 1 ? '' : 's'}, ${boys}boy${boys === 1 ? '' : 's'}`;
  if (!unknown && girls) return `${girls}girl${girls === 1 ? '' : 's'}`;
  if (!unknown && boys) return `${boys}boy${boys === 1 ? '' : 's'}`;
  return `${Math.max(1, characters.length)}people`;
}

function parseTokens(markdown) {
  const result = new Map();
  let heading = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^###\s+([\w-]+)(?:\s|\(|$)/);
    if (headingMatch) {
      heading = headingMatch[1].toLowerCase();
      if (!result.has(heading)) result.set(heading, {});
      continue;
    }
    const variantMatch = line.match(/^-\s+\*\*(base|day|night|tower|chibi)\*\*[^:]*:\s*(?:base\s*\+\s*)?`([^`]+)`/i);
    if (variantMatch && heading) {
      const entry = result.get(heading);
      entry[variantMatch[1].toLowerCase()] = variantMatch[2].trim();
      continue;
    }
    const inlineCharacter = line.match(/^-\s+\*\*([\w-]+(?:\s*\/\s*[\w-]+)*)\*\*(?:\s*\([^)]*\))?\s*:\s*`([^`]+)`/);
    if (inlineCharacter) {
      for (const id of inlineCharacter[1].split('/').map((value) => value.trim().toLowerCase())) result.set(id, inlineCharacter[2].trim());
      continue;
    }
    const tableMatch = line.match(/^\|\s*([\w-]+)\s*\|\s*([^|]+?)\s*\|/);
    if (tableMatch && !/^id|name|character$/i.test(tableMatch[1])) {
      result.set(tableMatch[1].toLowerCase(), tableMatch[2].replaceAll('`', '').trim());
      continue;
    }
    const keyValue = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (keyValue) result.set(keyValue[1].toLowerCase(), keyValue[2].replaceAll('`', '').trim());
    else if (heading) {
      const token = line.match(/^`([^`]+)`$/);
      if (token) result.set(heading, token[1].trim());
    }
  }
  return result;
}

function resolveToken(tokenMap, name, panel) {
  const entry = tokenMap.get(String(name).toLowerCase());
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (panel.chibi) return entry.chibi || entry.base || entry.day || entry.tower || entry.night || null;
  const context = `${panel.bg || ''} ${panel.action || ''} ${(panel.chars || []).map((character) => character.pose || '').join(' ')}`.toLowerCase();
  const variant = isV2
    ? (/tower|layer|dungeon|cathedral|stone|void|gate/.test(context) ? 'tower' : 'day')
    : (/bath|sento|onsen|night|closing|steam|happi|cleaning/.test(context) ? 'night' : 'day');
  return [entry.base, entry[variant]].filter(Boolean).join(', ') || null;
}
