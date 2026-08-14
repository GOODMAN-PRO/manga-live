// KARIMONO chapter validator. node story3/val3.cjs story3/ch01.json
const path = require('path');
const d = require(path.resolve(process.argv[2]));
const CAP = { hero: 8, half: 6, third: 4, 'wide-strip': 4, tall: 4, inset: 4 };
const CHARS = { hero: 260, half: 170, third: 90, 'wide-strip': 90, tall: 90, inset: 90 };
const err = [];
let tot = 0, txt = 0, chibi = 0, sil = 0, W = 0;
const rows = [];
if (d.pages.length !== 25) err.push(`PAGE COUNT ${d.pages.length} (need 25)`);
for (const p of d.pages) {
  let w = 0, silent = 0;
  if (p.panels.length < 4 || p.panels.length > 6) {
    if (p.panels.length !== 1) err.push(`p${p.page} panel count ${p.panels.length}`);
  }
  for (const pn of p.panels) {
    tot++;
    if (pn.chibi) chibi++;
    if (pn.silhouette) sil++;
    const dl = pn.dialogue || [];
    dl.length ? txt++ : silent++;
    const cap = CAP[pn.size];
    if (cap === undefined) err.push(`p${p.page} bad size "${pn.size}"`);
    else if (dl.length > cap) err.push(`p${p.page} ${pn.size}: ${dl.length} bubbles (cap ${cap})`);
    let ch = 0;
    for (const l of dl) {
      const n = l.text.trim().split(/\s+/).length;
      w += n;
      ch += l.text.trim().length;
      if (n > 14) err.push(`p${p.page} BUBBLE ${n}w: ${l.text}`);
    }
    const cb = CHARS[pn.size];
    if (cb !== undefined && ch > cb) err.push(`p${p.page} ${pn.size}: ${ch} chars (budget ${cb}) — split it`);
  }
  if (silent > 1) err.push(`p${p.page} ${silent} silent panels`);
  W += w;
  rows.push({ page: p.page, words: w, splash: p.panels.length === 1 });
}
// a 1-panel splash page is exempt from the word floor (char budget still applies)
for (const r of rows) {
  if (r.splash) { if (r.words > 130) err.push(`p${r.page} WORDS ${r.words}`); continue; }
  if (r.words < 70 || r.words > 130) err.push(`p${r.page} WORDS ${r.words}`);
}
const pct = Math.round(txt / tot * 100);
if (pct < 70) err.push(`text panels ${pct}% (need 70)`);
if (chibi < 3) err.push(`chibi ${chibi} (need several)`);
if (sil < 1 || sil > 4) err.push(`silhouette ${sil} (need 1-4)`);
console.log(`== ch${d.chapter} "${d.title}" ==`);
console.log(`pages ${d.pages.length} | panels ${tot} | chibi ${chibi} | silhouette ${sil}`);
console.log(`words ${W} | avg ${(W / d.pages.length).toFixed(1)} | range ${Math.min(...rows.map(r => r.words))}-${Math.max(...rows.map(r => r.words))} | text ${pct}%`);
console.log(err.length ? 'FAIL:\n  ' + err.join('\n  ') : 'PASS');
process.exit(err.length ? 1 : 0);
