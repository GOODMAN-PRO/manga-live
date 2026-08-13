#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  NEGATIVE_BASE,
  PANEL_SIZES,
  POSITIVE_BASE,
  deterministicSeed,
  loadScript,
  panelId,
  parseArgs,
  scriptSlug,
} from './lib/common.mjs';

const HELP = `Usage: node tools/panelgen.mjs story/chNN.json [options]

Options:
  --comfy URL          ComfyUI base URL (default http://127.0.0.1:8188)
  --checkpoint NAME    checkpoint filename (default animagine-xl-4.0-opt.safetensors)
  --out DIR            panel output directory (default build/<script>/panels)
  --batch N            prompts kept in flight (default 2)
  --steps N            sampling steps (default 28)
  --cfg N              classifier-free guidance (default 5)
  --redo PANEL_ID      regenerate one panel with a fresh persisted seed, e.g. p3b
  --force              regenerate every panel with its current deterministic seed
`;

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || flags.help) {
  console.log(HELP);
  process.exit(positional[0] ? 0 : 1);
}

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.resolve(positional[0]);
const slug = scriptSlug(scriptPath);
const outputDir = path.resolve(flags.out || path.join(repoRoot, 'build', slug, 'panels'));
const comfy = String(flags.comfy || process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const checkpoint = String(flags.checkpoint || process.env.COMFY_CHECKPOINT || 'animagine-xl-4.0-opt.safetensors');
const concurrency = Math.max(1, Number(flags.batch || 2));
const steps = Math.max(1, Number(flags.steps || 28));
const cfg = Number(flags.cfg || 5);
const redo = flags.redo ? String(flags.redo).toLowerCase() : null;

const script = await loadScript(scriptPath);
await mkdir(outputDir, { recursive: true });

const tokenPath = path.join(repoRoot, 'chars', 'tokens.md');
const tokens = existsSync(tokenPath) ? parseTokens(await readFile(tokenPath, 'utf8')) : new Map();
if (!existsSync(tokenPath)) console.warn('chars/tokens.md not found; using character ids until locked tokens exist.');

const seedPath = path.join(path.dirname(outputDir), 'seeds.json');
let seedOverrides = {};
if (existsSync(seedPath)) seedOverrides = JSON.parse(await readFile(seedPath, 'utf8'));

const jobs = [];
for (const page of script.pages) {
  page.panels.forEach((panel, index) => {
    const id = panelId(page.page, index);
    if (redo && redo !== id) return;
    const baseSeed = deterministicSeed(script.chapter, page.page, id);
    if (redo === id) seedOverrides[id] = deterministicSeed(script.chapter, page.page, id, 'redo', Date.now(), randomUUID());
    const outputPath = path.join(outputDir, `${id}.png`);
    if (!flags.force && !redo && existsSync(outputPath)) {
      console.log(`[skip] ${id} already exists`);
      return;
    }
    jobs.push({
      id,
      page: page.page,
      panel,
      outputPath,
      seed: seedOverrides[id] ?? baseSeed,
      prompt: buildPrompt(panel, tokens),
    });
  });
}

if (redo && jobs.length === 0) throw new Error(`Panel '${redo}' was not found in ${scriptPath}`);
await writeFile(seedPath, `${JSON.stringify(seedOverrides, null, 2)}\n`);

await assertComfyReady(comfy, checkpoint);
console.log(`Generating ${jobs.length} panel(s) with ${checkpoint} via ${comfy}`);

const timings = [];
let nextJob = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (nextJob < jobs.length) {
    const job = jobs[nextJob++];
    const started = performance.now();
    await generatePanel(job);
    const seconds = (performance.now() - started) / 1000;
    timings.push({ id: job.id, seconds: Number(seconds.toFixed(2)), seed: job.seed });
    console.log(`[done] ${job.id} ${seconds.toFixed(1)}s seed=${job.seed} -> ${job.outputPath}`);
  }
}));

const metadata = {
  script: path.relative(repoRoot, scriptPath).replaceAll('\\', '/'),
  checkpoint,
  generatedAt: new Date().toISOString(),
  panels: jobs.map((job) => ({
    id: job.id,
    page: job.page,
    size: job.panel.size,
    seed: job.seed,
    prompt: job.prompt,
    negative: NEGATIVE_BASE,
    timingSeconds: timings.find((item) => item.id === job.id)?.seconds,
  })),
};
await writeFile(path.join(path.dirname(outputDir), 'generation.json'), `${JSON.stringify(metadata, null, 2)}\n`);

async function generatePanel(job) {
  const [targetWidth, targetHeight] = PANEL_SIZES[job.panel.size];
  const width = Math.ceil(targetWidth / 8) * 8;
  const height = Math.ceil(targetHeight / 8) * 8;
  const workflow = createWorkflow({ width, height, seed: job.seed, positive: job.prompt, checkpoint });
  const response = await fetchJson(`${comfy}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  });
  if (!response.prompt_id) throw new Error(`ComfyUI did not return a prompt id for ${job.id}`);
  const image = await waitForImage(response.prompt_id);
  const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
  const imageResponse = await fetch(`${comfy}/view?${query}`);
  if (!imageResponse.ok) throw new Error(`Failed to fetch ComfyUI output for ${job.id}: HTTP ${imageResponse.status}`);
  const data = Buffer.from(await imageResponse.arrayBuffer());
  await sharp(data).resize(targetWidth, targetHeight, { fit: 'cover', position: 'attention' }).png().toFile(job.outputPath);
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
    if (images?.length) return images[0];
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

function createWorkflow({ width, height, seed, positive, checkpoint: checkpointName }) {
  return {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpointName } },
    2: { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['1', 1] } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE_BASE, clip: ['1', 1] } },
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

function buildPrompt(panel, tokenMap) {
  const characterTokens = (panel.chars || []).flatMap((character) => {
    const locked = tokenMap.get(String(character.name).toLowerCase());
    return [locked || character.name, character.expression, character.pose].filter(Boolean);
  });
  const countTag = inferCountTag(panel.chars || [], characterTokens);
  const parts = [
    POSITIVE_BASE,
    countTag,
    ...characterTokens,
    panel.action,
    `${panel.shot} shot`,
    panel.bg,
  ];
  if (panel.chibi) parts.push('chibi', 'comedic', 'simplified', '>_<');
  return parts.filter(Boolean).join(', ');
}

function inferCountTag(characters, characterTokens) {
  const text = characterTokens.join(', ').toLowerCase();
  const girls = characters.filter((character) => /girl|woman|female/.test(`${character.name} ${text}`)).length;
  const boys = characters.filter((character) => /boy|man|male/.test(`${character.name} ${text}`)).length;
  if (girls && !boys) return `${girls}girl${girls === 1 ? '' : 's'}`;
  if (boys && !girls) return `${boys}boy${boys === 1 ? '' : 's'}`;
  return `${Math.max(1, characters.length)}people`;
}

function parseTokens(markdown) {
  const result = new Map();
  let heading = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^#{1,6}\s+([\w-]+)\s*$/);
    if (headingMatch) {
      heading = headingMatch[1].toLowerCase();
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
