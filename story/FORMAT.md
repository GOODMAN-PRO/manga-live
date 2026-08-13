# Story Script Contract (v2)

Chapter scripts are JSON at `story/chNN.json`. The page factory consumes them mechanically — obey the schema exactly.

```json
{
  "chapter": 1,
  "title": "Chapter title",
  "cover": { "desc": "one-paragraph visual description for the color chapter cover", "chars": ["lead"] },
  "pages": [
    {
      "page": 1,
      "panels": [
        {
          "size": "hero | half | third | wide-strip | tall | inset",
          "shot": "establishing | wide | medium | closeup | extreme-closeup | pov | over-shoulder",
          "chars": [ { "name": "id", "expression": "...", "pose": "..." } ],
          "bg": "setting, tone-washed",
          "action": "what happens, one sentence",
          "dialogue": [ { "char": "id", "text": "...", "type": "speech | thought | shout | whisper | narration | monologue" } ],
          "sfx": [ { "text": "...", "style": "small | big" } ],
          "chibi": false,
          "silhouette": false,
          "beat": "comedy | warm | quiet | tension | gut-punch | action"
        }
      ]
    }
  ]
}
```

## DIALOGUE DENSITY — HARD REQUIREMENTS
Real manga is talky. Previous series ran ~20 words/page; that reads as an art book, not a manga.

- **70–130 words of dialogue + narration + monologue per page.** Count them.
- **At least 70% of panels on every page carry text.** A page may contain at most 1 fully silent panel; a fully silent PAGE is allowed at most once per chapter and only for a major beat.
- **Multi-bubble panels are normal**: 2–4 bubbles in a single panel for back-and-forth is standard manga grammar. Use it constantly.
- **`monologue` is a first-class type** — borderless tone-fade internal narration, the lead's running interior voice. This is the main density tool; a POV series should carry monologue on most pages.
- Bubbles: **max 16 words each**, split longer lines across consecutive bubbles in the same panel.
- Comedy pages should be the DENSEST — banter, interruptions, overlapping jokes, reaction lines.
- Silence still matters: use it as a deliberate *contrast* after a dense page, never as a default.

## Other rules
- 16–20 pages per chapter. **4–6 panels per page** (1 for hero/splash). More, smaller panels = more room for dialogue.
- `chars[].name` must match ids in `chars/tokens.md`.
- `chibi: true` for comedy/deflection beats — the register switch is the house style and should fire several times per chapter, including mid-scene.
- `silhouette: true` for emotional pivots/transitions (sparingly, a few per chapter).
- `beat` drives pacing QA. Every chapter needs at least one `warm` beat and ends on a hook.
- Characters do not name their feelings directly unless the story has earned it — but they TALK. Deflection, banter, technical talk, arguing about nothing: that's how the page fills.
