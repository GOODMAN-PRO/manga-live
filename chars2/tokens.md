# Character Tokens — YONETSU (余熱)

Exact token strings for panel prompts. Monochrome manga: **never use color words for hair** — specify greyscale value instead. Style base + negatives come from `art-direction.md`.

## Prompt-assembly rules (panelgen MUST apply)
- Exactly one character in panel → prepend `solo`.
- Count tags (`1girl`, `1boy`, `1boy, 1girl`, `2girls`…) computed from cast, before character tokens.
- 2-character panels → negative `3people, third person, crowd`.
- `chibi: false` → negative `chibi, super deformed`. `chibi: true` → use the deformed template, negative `realistic proportions, detailed background`.
- `silhouette: true` → silhouette template; drop face/eye tokens entirely.
- Tower scenes: append `dark fantasy interior, dramatic lighting, dungeon`. Academy scenes: append `school, tone-washed background, daylight`.

## VALUE LOCK (critical, greyscale)
| Character | Hair value | Never |
|---|---|---|
| **kou** | **SOLID BLACK**, large clumps, hard white highlight bands — the darkest mass on the page | never grey, never light |
| **kanade** | **PALE / light mid-tone**, black core shadow + blown white sheen band | never solid black |
If these two converge in value, the panel fails QA.

---

### kou (Hazama Kou, 17) — male lead, no magic, swordsman
- **base**: `hazama kou, 1boy, black hair, solid black hair, short messy hair, thick blunt bangs, hair between eyes, sharp hair clumps, dark grey eyes, half-closed eyes, calm expression, lean build, tall boy, slouching slightly`
- **day** (academy): base + `dark school uniform, buttoned collar, frayed cuffs, plain blank pin, carrying a long cloth-wrapped bundle`
- **tower** (NULL): base + `black high-collared long coat, bound sleeves, forearm bandages, hood up shadowing eyes, single straight sword at hip, no ornament, serious, eyes fully open`
- **chibi**: `chibi hazama kou, black hair, dot eyes, flat expression, tiny body`

### kanade (Ariake Kanade, 17) — female lead, top-ranked prodigy
- **base**: `ariake kanade, 1girl, light hair, pale grey hair, long hair, large clumped hair, light grey eyes, large eyes, double catchlight, beautiful, straight posture`
- **day** (academy): base + `hair up, low twisted bun, neat hairstyle, immaculate school uniform, white gloves, ribbon, gold rank pin, gentle closed-eye smile, elegant`
- **tower** (KETTLE): base + `very long hair, hair down, loose messy hair, dark short coat, bare hands, boots, grinning, wild expression, relaxed slouch` — the hair-state swap is the identity tell; NEVER draw her with the bun in the tower.
- **chibi**: `chibi ariake kanade, light hair, >_<, comedic fury, tiny body`

### shizu (Hazama Shizu, 19) — Kou's sister, calibration tech
`hazama shizu, 1girl, black hair, very long straight hair, low ponytail, flat expression, empty eyes, no emotion, tall, white lab coat over uniform, holding a clipboard, tired`

### gen (Ōkubo Gen, 17) — Kou's friend
`okubo gen, 1boy, dark grey hair, short spiky hair, thick eyebrows, big grin, broad build, heavyset, school uniform, carrying too many bags, cheerful`

### riko (Mizusawa Riko, 17) — Kanade's roommate/handler
`mizusawa riko, 1girl, dark hair, twin braids, round glasses, small girl, short, school uniform, holding a tablet, suspicious expression, sharp`

### pike (Kirisu Wataru, 20) — veteran front-liner
`kirisu wataru, 1boy, light grey hair, messy medium hair, eyepatch, one eye covered, lean, hunched posture, hands in pockets, lazy grin, diver coat, older teen`

### nabari (Instructor Nabari, 40s) — tower supervisor
`instructor nabari, 1man, mature male, short dark hair, stubble, tired eyes, rumpled suit, holding a folder, weary, adult`

### tsubame (Amasaki Tsubame, 17) — class centre of gravity
`amasaki tsubame, 1girl, dark hair, very long high ponytail, sharp eyes, confident smile, immaculate school uniform, slender, poised`

## Generic bit parts (no consistency needed)
`student_a`, `student_b`, `diver_a`, `diver_b`, `announcer` → plain descriptive tags from the panel's `chars[].expression`/`pose` fields, plus uniform/diver-coat context. `narration` is never drawn.
