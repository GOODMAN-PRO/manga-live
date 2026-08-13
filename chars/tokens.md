# Character Tokens — LOCKED (panelgen source of truth)

Danbooru-tag token strings for the generation model. `panelgen` substitutes `{char tokens}` with the exact string for each character in the panel. Multiple chars: join with `, ` and prefix count tags (`1girl, 1boy` etc) computed from the panel's cast.

## Leads

### nagi (Shirakawa Nagi, 17)
- **base**: `shirakawa nagi, 1girl, very long hair, black hair, straight hair, center part, half-closed eyes, downturned eyes, tsurime, long eyelashes, dark eyes, tall female, slender, pale skin, straight posture`
- **day** (school): base + `navy blazer, white shirt, buttoned to neck, neck ribbon, grey pleated skirt, black kneehighs, long sleeves past wrists, low ponytail`
- **night** (bathhouse): base + `hair clip, messy updo, damp hair, happi coat, kanji print, white t-shirt, samue pants, rolled sleeves, towel around neck, sandals, wet forearms`
- Notes: sleeves ALWAYS cover hands in day scenes. Eyes widen only when script says so. Cracked knuckles only in extreme-closeup hand panels: `chapped hands, cracked knuckles`.

### itsuki (Nomura Itsuki, 17)
- **base**: `nomura itsuki, 1boy, messy hair, medium hair, brown hair, hair between eyes, cowlick, ahoge, round eyes, bright eyes, thick eyelashes, light grey eyes, tall male, lean, slouching`
- **day** (school): base + `school uniform, open blazer, loose necktie, sleeves rolled up, track jacket over shirt, green trim, sneakers`
- **night**: base + `track jacket, green trim, sweatpants, canvas tote bag, hood`
- Props (script may request): `hair tie on wrist`, `bandaid on finger`
- Eyes: default `smiling, closed eyes crescents, large catchlights`; the "tell" panel: `flat stare, small pupils, no catchlights`

## Side cast

- **fusae** (78): `1girl, old woman, elderly, short grey hair, bun, kind eyes, wrinkles, cardigan, sitting, milk bottle`
- **ban** (60s): `1boy, old man, elderly, buzz cut, grey hair, thick eyebrows, stern, apron, work clothes, muscular for age`
- **mio** (13): `1girl, short hair, dark brown hair, straight bangs, sharp eyes, jitome, school uniform serafuku, deadpan`
- **sota** (6): `1boy, child, male child, short spiky hair, big eyes, round face, pajamas`
- **gonda** (17): `1boy, short black hair, thick eyebrows, wide grin, school uniform, sturdy build`
- **aya** (17): `1girl, medium hair, wavy hair, light brown hair, side ponytail, cheerful, school uniform, navy blazer, pleated skirt`

## Generic bit parts (no consistency needed)
- **sensei**: `1boy, adult male, teacher, glasses, tired expression, shirt and tie, attendance book`
- **student_a / student_b**: `school uniform, background character` + improvise per panel; keep faces simple/undetailed.
- **narration**: no character, no token — text box only, never generate a person for it.

## Chibi variant (any character)
Use character's base hair/eye tags + `chibi, super deformed, comedic, simplified, blank background` — drop clothing detail tags to essentials.

## Hard policy — bath scenes
NO nudity, ever. This is a story about labour and silence, not fanservice. Bath-hall panels are: post-closing cleaning, clothed characters, feet-in-water with rolled trousers, or customers shoulders-up in heavy steam / towel-wrapped. Prompts must never contain nudity terms; negative prompt always includes `nude, nsfw, cleavage, swimsuit`.
