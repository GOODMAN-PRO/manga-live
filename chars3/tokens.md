# Character Tokens — KARIMONO (借り物競走)

Exact token strings for panel prompts. Monochrome manga: **never use colour words for hair** — specify greyscale value. Style base + negatives come from `art-direction.md`.

## Prompt-assembly rules (panelgen MUST apply)
- Exactly one character in panel → prepend `solo`.
- Count tags (`1girl`, `1boy`, `1boy, 1girl`, `2girls`, `4boys`…) computed from cast, before character tokens.
- 2-character panels → negative `3people, third person, crowd`. 3+ → allow crowd.
- `chibi: false` → negative `chibi, super deformed`. `chibi: true` → deformed template, negative `realistic proportions, detailed background`.
- `silhouette: true` → silhouette template; drop face/eye tokens.
- Pit/dungeon scenes: append `dungeon interior, dramatic lighting, dust`. School/stadium: append `school, tone-washed background, daylight, crowd stands`.

## VALUE LOCK (critical, greyscale)
| Character | Hair value | Never |
|---|---|---|
| **hibiki** | **SOLID BLACK**, big spiked wedge clumps, hard white highlight bands — darkest mass on the page | never grey, never light |
| **sumire** | **BLOWN-OUT WHITE**, contour line only, faintest tone — the photographic negative of Hibiki | never black, never mid-grey |
If these two converge in value, the panel fails QA.

---

### hibiki (Kusaka Hibiki, 15) — lead
- **base**: `kusaka hibiki, 1boy, black hair, solid black hair, short spiky hair, large spiked hair, hair sticking up, bandaid on nose, round eyes, large iris, big catchlights, bright expression, open mouth, short boy, small build, wiry`
- **day** (school): base + `dark school blazer worn open, untucked shirt, loose crooked necktie, sleeves pushed to elbows, bare forearms, sneakers`
- **race**: base + `dark sports jersey, white piping, number 0, bare hands, palms open, energetic pose`
- **chibi**: `chibi kusaka hibiki, black spiked hair, bandaid on nose, >_<, tiny body, huge head`

### sumire (Anzai Sumire, 15) — heroine, club ace
- **base**: `anzai sumire, 1girl, white hair, blown out white hair, very pale hair, long hair, high ponytail, blunt bangs, sharp hair clumps, pale eyes, light iris, single catchlight, cool expression, level gaze, tall girl, long limbs, straight posture`
- **day**: base + `high collared shirt buttoned to the throat, dark blazer, long sleeves, tape on the backs of her hands, no skin below the jaw`
- **race**: base + `dark sports jersey worn over high collar, long sleeves pulled over thumbs, taped hands, serious, shouting`
- **chibi**: `chibi anzai sumire, white hair, high ponytail, dot eyes, deadpan, tiny body`
- **HARD RULE:** never draw her forearms, hands or neck bare. Collar always closed, sleeves always long, hands always taped. No exceptions in any panel, any weather.

## The club ("The Nine")
- **tetsu** — `ogami tetsuji, 1boy, huge muscular teenage boy, enormous shoulders, buzz cut, missing eyebrow, scar, torn off jersey sleeves, thick arms, immovable stance, third year`
- **koharu** — `manaka koharu, 1girl, very small girl, round glasses, glasses flash, twin buns, dark hair, holding an oversized clipboard, serious`
- **gaku** — `hozumi gaku, 1boy, very tall thin boy, slouching posture, half-closed eyes, bangs over one eye, dark grey hair, bored expression, long arms`
- **rui** — `sakaki rui, 1boy, immaculate styled hair, buttoned blazer, camera on a neck strap, posing, confident smirk, light grey hair`
- **bin** — `numata bin, 1boy, round chubby boy, headphones around neck, flat expression, short dark hair, deadpan`
- **momo** — `kirin momo, 1girl, short muscular girl, tan skin, high ponytail, dark hair, athletic shorts, chewing, grinning, energetic`
- **shiho** — `uwabami shiho, 1girl, tall girl, very long braid, oval glasses, hands folded, polite smile, dark hair, third year`
- **rai** — `domeki rai, 1boy, bleached undercut hair, light hair dark undercut, jacket hanging off both shoulders, chin up, cocky, glowing right hand`
- **hebihara** — `hebihara kaoru, 1woman, adult woman, forties, tracksuit, sunglasses on head, unlit cigarette, dark hair, tired sharp expression, coach`
- **ayame** — `kujo ayame, 1girl, elegant girl, long straight dark hair, calm unreadable smile, immaculate uniform, gloves, poised`

## Generic bit parts
`announcer`, `crowd`, `student`, `judge`, `diver_a`, `diver_b` → plain descriptive tags from the panel's `expression`/`pose` fields plus setting context. `narration` is never drawn.
