# Art Direction — LOCKED (v2)

Derived from `C:\Users\User\art-style.md`. Production target = **Layer 2, the serialized manga redraw**. Layer 3 (anime) supplies the color-cover palette and one sanctioned special device. Layer 1 (webcomic minimalism) is the deformed/gag register.

## The core formal device — REGISTER SWITCH
Two drawing modes on the same page, cut between with no transition:

| Mode | Used for | Look |
|---|---|---|
| **Rendered** (`chibi: false`) | Romance, vulnerability, combat, quiet beats | Full eye rendering, careful anatomy, tone atmosphere, soft light, floral/bokeh overlays |
| **Deformed** (`chibi: true`) | Comedy, bickering, embarrassment, deflection | Dot eyes, squiggle mouths, `>_<`, sweat drops, collapsed proportions |

The abruptness IS the point — a character retreats into cartoon when a moment gets too sincere, then snaps back. Deformed panels are *frequent and short* (a beat, not a scene). Unlike the previous series there is **no chibi-free zone**; the switch is the house style.

## Linework & value
- Confident clean inking, **modulated weight**: heavy outer silhouette contour → progressively thinner interior lines (folds, hair strands, features). Tapered strokes, clean entry/exit.
- **No cross-hatching.** All value is screentone. Pages stay bright and graphic, never dense.
- Skin/mood/depth = gradient screentone. Emotional beats get overlay motifs: sparkle tone, bokeh circles, petals, soft radial focus lines (never shounen impact lines except in combat).

## Hair (the signature)
Large **clumped masses with sharp wedge tips** — shape first, texture second. Three or four interior lines describe a whole clump. Value: either solid black with **hard-edged white highlight bands**, or mid-tone screentone with solid black core shadow + blown-out white sheen band. The male lead's hair is solid black and large: he is the **graphic anchor**, the darkest mass on every page he's in.

## Faces
Between shoujo and seinen: eyes larger than realistic but short of shoujo-maximalism, small mouths, defined jawline, long neck, ~7 heads tall. Eye construction: thick solid upper lash line tapering outward, thin/absent lower lid, large iris with tone gradient (dark top → light bottom), small dark pupil, **one large catchlight + one small secondary**. Blush = diagonal hatch or stipple across cheeks and nose bridge, density calibrated to embarrassment.

## Backgrounds
**Tone-washed, not architecturally drawn.** A few perspective lines plus tone. Attention stays on figures. Interiors are suggested, not rendered. Full architectural detail only for establishing shots and tower/dungeon reveals.

## Framing
Medium shots and close-ups dominate. Full-body is rare — reserved for establishing, costume, combat, or physical comedy. Generous white gutters, conventional readable grid. **Borderless panels with tone fade-out** for internal monologue and memory (standard shoujo grammar).

## Sanctioned special device — SILHOUETTE ABSTRACTION
Panel type `silhouette`: character collapses to a **solid single-color silhouette against a flat tone field**, used at emotional pivots, transitions, internal monologue, montage. Thematically load-bearing: it renders a person as "the shape other people see." Use sparingly — a few per chapter maximum.

## Generation prompt templates (Illustrious/Animagine-class SDXL, danbooru tags)

**Rendered positive base:**
`masterpiece, best quality, monochrome, greyscale, manga, screentone, halftone, clean lineart, modulated line weight, no hatching, tone-washed background, glossy eyes, detailed eyes, catchlight, {count tags}, {character tokens}, {expression}, {pose}, {shot}, {background}`

**Deformed (`chibi: true`) positive:** replace figure tags with
`chibi, super deformed, simplified, dot eyes, squiggle mouth, sweatdrop, exaggerated expression, gag manga, thick simple lineart, blank background`

**Silhouette panel:** `solid silhouette, backlit, featureless, flat tone background, graphic, high contrast, no facial features`

**Color cover (Layer 3 palette):** drop monochrome/greyscale/screentone →
`anime coloring, flat color, cel shading, minimal shading, hard-edged shadows, pastel palette, colored lineart, soft light, cover art, negative space`

**Negative base (all panels):**
`color, photorealistic, realistic, 3d, render, sketch, rough, messy lines, crosshatching, watermark, signature, text, english text, japanese text, kanji, speech bubble, blurry, extra fingers, bad hands, bad anatomy, collage, photo frames, multiple views, reference sheet, duplicate character, clone, extra heads, halo, nude, nsfw`

Rules: `solo` prepended when a panel has exactly one character. Cast-count tags computed from the panel cast. When 2 characters: add negative `3people, third person, crowd`. Non-chibi panels add negative `chibi, super deformed`. Chibi panels add negative `realistic proportions, detailed background`.

## Page spec
- Canvas **1500×2100**, white, 6px panel borders, 24px gutters, 40px outer margin. Right-to-left panel flow.
- Dialogue typeset by the compositor — **models never draw text.**
- **TEXT MUST NEVER CLIP.** Bubbles auto-size to their text; if a bubble would exceed its panel, the compositor shrinks the type (floor 26px) and then grows the bubble toward available panel space. A clipped or overflowing bubble is a build failure, not a style choice.
