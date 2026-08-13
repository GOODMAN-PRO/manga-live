#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScript, parseArgs, scriptSlug } from './lib/common.mjs';

const HELP = `Usage: node tools/publish.mjs story/chNN.json --go [options]

This command changes manifest.json, commits, and pushes. It refuses to run without --go.

Options:
  --pages DIR       composed page directory (default pages/<script>)
  --cover PATH      cover image path relative to repo root
  --ongoing BOOL    ongoing flag (default true)
  --message TEXT    git commit message
  --go              required explicit publishing confirmation
`;

const { positional, flags } = parseArgs(process.argv.slice(2));
if (!positional[0] || flags.help) {
  console.log(HELP);
  process.exit(positional[0] ? 0 : 1);
}
if (!flags.go) {
  console.error('Refusing to publish without explicit --go confirmation. QA the composed pages first.');
  process.exit(2);
}

const repoRoot = path.resolve(import.meta.dirname, '..');
const scriptPath = path.resolve(positional[0]);
const slug = scriptSlug(scriptPath);
const pagesDir = path.resolve(flags.pages || path.join(repoRoot, 'pages', slug));
const manifestPath = path.join(repoRoot, 'manifest.json');
const script = await loadScript(scriptPath);
if (!existsSync(pagesDir)) throw new Error(`Page directory does not exist: ${pagesDir}`);

const pageNames = (await readdir(pagesDir)).filter((name) => /^p\d+\.png$/i.test(name)).sort(new Intl.Collator(undefined, { numeric: true }).compare);
if (!pageNames.length) throw new Error(`No PNG pages found in ${pagesDir}`);
const toRepoPath = (absolutePath) => path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
const id = `ch${String(script.chapter).padStart(2, '0')}`;
const cover = flags.cover ? String(flags.cover).replaceAll('\\', '/') : null;
if (cover && !existsSync(path.join(repoRoot, cover))) throw new Error(`Cover does not exist: ${cover}`);
const ongoing = flags.ongoing === undefined ? true : !['false', '0', 'no'].includes(String(flags.ongoing).toLowerCase());

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = {
  id,
  title: script.title,
  cover,
  pages: pageNames.map((name) => `${toRepoPath(pagesDir)}/${name}`),
  ongoing,
};
const existing = manifest.chapters.findIndex((chapter) => chapter.id === id);
if (existing >= 0) manifest.chapters[existing] = entry;
else manifest.chapters.push(entry);
manifest.chapters.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
manifest.updated = new Date().toISOString();
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, stdio: 'inherit' });
git('add', '--', 'manifest.json', toRepoPath(pagesDir));
if (cover) git('add', '--', cover);
git('commit', '-m', String(flags.message || `Publish ${id}: ${script.title}`));
git('push');
console.log(`Published ${id} with ${pageNames.length} page(s).`);
