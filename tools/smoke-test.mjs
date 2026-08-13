#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NEGATIVE_BASE, POSITIVE_BASE, parseArgs } from './lib/common.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const comfy = String(flags.comfy || process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const checkpoint = String(flags.checkpoint || process.env.COMFY_CHECKPOINT || 'animagine-xl-4.0-opt.safetensors');
const outputPath = path.resolve(flags.out || path.join(import.meta.dirname, '..', 'tmp', 'test-panel.png'));
const positive = `${POSITIVE_BASE}, 1girl, school uniform, expressive large eyes, gentle curious expression, standing with one hand holding a school bag strap, medium shot, simple school hallway background`;
const workflow = {
  1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
  2: { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['1', 1] } },
  3: { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE_BASE, clip: ['1', 1] } },
  4: { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } },
  5: { class_type: 'KSampler', inputs: { seed: 50902026, steps: 28, cfg: 5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
  8: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  9: { class_type: 'SaveImage', inputs: { filename_prefix: 'manga-live/smoke-test', images: ['8', 0] } },
};

const stats = await getJson(`${comfy}/system_stats`);
if (!stats.devices?.some((device) => device.type === 'cuda')) throw new Error('No CUDA device is active; refusing CPU smoke test.');
const started = performance.now();
const queued = await getJson(`${comfy}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }) });
if (!queued.prompt_id) throw new Error(`ComfyUI rejected workflow: ${JSON.stringify(queued)}`);

let image;
while (!image) {
  const history = await getJson(`${comfy}/history/${queued.prompt_id}`);
  const entry = history[queued.prompt_id];
  const failure = entry?.status?.messages?.find((message) => message[0] === 'execution_error');
  if (failure) throw new Error(`ComfyUI smoke test failed: ${JSON.stringify(failure)}`);
  image = entry?.outputs?.['9']?.images?.[0];
  if (!image) await new Promise((resolve) => setTimeout(resolve, 1000));
}
const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
const response = await fetch(`${comfy}/view?${query}`);
if (!response.ok) throw new Error(`Could not fetch smoke-test image: HTTP ${response.status}`);
await mkdir(path.dirname(outputPath), { recursive: true });
await sharp(Buffer.from(await response.arrayBuffer())).greyscale().png().toFile(outputPath);
console.log(JSON.stringify({ output: outputPath, width: 832, height: 1216, seconds: Number(((performance.now() - started) / 1000).toFixed(2)), checkpoint, positive, negative: NEGATIVE_BASE }, null, 2));

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${await response.text()}`);
  return response.json();
}
