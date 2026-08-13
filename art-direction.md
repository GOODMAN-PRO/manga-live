# Art Direction — LOCKED

Series art style. Every generated panel must conform. Do not drift.

## Base style
- Modern romcom manga: **clean line art, medium line weight, expressive large eyes** — faces in the neighborhood of SAO (abec) softness with Horimiya's simplicity and restraint.
- **Greyscale + screentone** shading. Flat tones, halftone dots for shadows/blush/mood. NOT high-detail seinen crosshatching, NOT painterly, NOT photorealistic, NOT 3D.
- Backgrounds: simple and clean; detailed only in establishing shots. Emotional beats often get abstract/screentone backgrounds (sparkle tone, speed lines, black void, flower tone) per manga convention.
- Chibi: comedy beats drop into full chibi style (tiny body, huge head, dot eyes, simplified everything).
- Covers: full color, flat anime coloring, soft light — think tankobon volume covers.

## Generation prompt template (Illustrious/Animagine-class SDXL, danbooru tags)
Positive base:
`masterpiece, best quality, monochrome, greyscale, manga, screentone, halftone, clean lineart, 2boys/1girl/etc, {character tokens}, {expression}, {pose/action}, {shot}, {background}`

Chibi variant: append `chibi, comedic, simplified, >_<`
Color cover variant: drop monochrome/greyscale/screentone → `anime coloring, flat color, soft lighting, cover art`

Negative base:
`color, photorealistic, realistic, 3d, render, sketch, rough, messy lines, crosshatching, watermark, signature, text, speech bubble, blurry, extra fingers, bad hands, bad anatomy`

**Never let the model draw text or bubbles** — all lettering is composited by tools/compose. Panels are generated art-only.

## Character tokens
Defined in `chars/tokens.md` after character sheets are approved (art director QA). Every panel prompt must use the exact locked token string for each character — consistency depends on it.

## Page spec
- Page canvas: **1500×2100 px** (B5-ish 5:7), white background, black gutters frame borders 6px, gutter 24px, outer margin 40px.
- Reading order: **right-to-left** within a page (authentic manga). Compositor handles placement; scripts specify panel order 1..n = RTL flow.
- Dialogue: typeset by compositor with an OFL comic font (e.g. Comic Neue Bold). Speech = ellipse bubble w/ tail; thought = cloud; shout = spiky; whisper = dashed ellipse; narration = rectangle box, corner.
- SFX: bold display text placed by compositor.
