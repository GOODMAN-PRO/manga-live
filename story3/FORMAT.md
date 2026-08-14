# Story Script Contract v3 — KARIMONO

Chapter scripts are JSON at `story3/chNN.json`. The page factory consumes them mechanically.

```json
{
  "chapter": 1,
  "title": "Chapter title",
  "cover": { "desc": "one-paragraph visual description for the color chapter cover", "chars": ["hibiki"] },
  "pages": [
    { "page": 1, "panels": [
      { "size": "hero | half | third | wide-strip | tall | inset",
        "shot": "establishing | wide | medium | closeup | extreme-closeup | pov | over-shoulder",
        "chars": [ { "name": "hibiki", "expression": "...", "pose": "..." } ],
        "bg": "setting",
        "action": "what happens, one sentence",
        "dialogue": [ { "char": "hibiki", "text": "...", "type": "speech | thought | shout | whisper | narration | monologue" } ],
        "sfx": [ { "text": "DON", "style": "small | big" } ],
        "chibi": false, "silhouette": false,
        "beat": "comedy | warm | quiet | tension | gut-punch | action" } ] }
  ]
}
```

## HARD REQUIREMENTS (validated in code before any art is made)
- **25 pages per chapter.** Not 18. Twenty-five.
- **4–6 panels per page** (1 for a hero/splash page). 5 is the norm.
- **70–130 words of dialogue per page.** Count them.
- **No bubble over 14 words.** Split across consecutive bubbles instead.
- **Max 4 bubbles in a third/wide-strip/tall/inset panel; 6 in a half; 8 in a hero.**
- **TEXT BUDGET PER PANEL — total characters across all bubbles in one panel:**
  | panel size | max characters |
  |---|---|
  | third / wide-strip / tall / inset | **90** |
  | half | **170** |
  | hero | **260** |
  This is the hard one. The compositor aims to keep lettering under a third of a panel's area; when a panel is over budget it has to shrink the type and stack bubbles over the drawing, which is exactly the complaint that killed the last series. If a panel needs more words than its budget, **split it into two panels** — that is always the right move and it makes the page read faster, not slower.
- ≥70% of panels carry text. At most one fully silent panel per page.
- `chibi: true` several times per chapter — the rendered↔chibi register switch is the house style.
- `silhouette: true` 1–4 times per chapter for pivots.

## SERIES RULES (KARIMONO)
- **Tone is LOUD, BRIGHT, FUNNY.** This is a sports-shounen romcom, not a melancholy drama. Comedy first; the feeling sneaks in under it.
- **Episodic engine:** most chapters are self-contained — a new opponent, a new borrowed ability, a new problem — inside a running arc. A reader can pick up any chapter.
- **Every chapter must contain at least one fight, contest, or physical set piece.** Even the quiet ones.
- **Every chapter ends on a hook**: a challenge, an arrival, a reveal, or a line.
- Romance is a slow burn under the comedy. No confessions before ch.40.
- Keep an eye on the ability rules — they are the series' logic and must never be broken (see bible).
