# Story Script Contract

Chapter scripts are JSON at `story/chNN.json`. The page factory consumes them mechanically — obey the schema exactly.

```json
{
  "chapter": 1,
  "title": "Chapter title",
  "cover": { "desc": "one-paragraph visual description for the color chapter cover", "chars": ["aoi"] },
  "pages": [
    {
      "page": 1,
      "panels": [
        {
          "size": "hero | half | third | wide-strip | tall | inset",
          "shot": "establishing | wide | medium | closeup | extreme-closeup | pov | over-shoulder",
          "chars": [ { "name": "aoi", "expression": "soft surprise, parted lips", "pose": "clutching bag strap, turned back" } ],
          "bg": "shopping street at dusk, lanterns",
          "action": "what happens in this panel, one sentence",
          "dialogue": [ { "char": "aoi", "text": "...", "type": "speech | thought | shout | whisper | narration" } ],
          "sfx": [ { "text": "clatter", "style": "small | big" } ],
          "chibi": false,
          "beat": "comedy | warm | quiet | tension | gut-punch"
        }
      ]
    }
  ]
}
```

Rules:
- 14–20 pages per chapter. 2–6 panels per page (1 for hero/splash pages).
- `chars[].name` must match ids in the series bible / `chars/tokens.md`.
- Dialogue max ~14 words per bubble; split long lines across bubbles. Emotional beats get SPACE — silent panels are encouraged (Horimiya breathes; so do we).
- `beat` drives pacing QA: every page needs intent; every chapter needs at least one `warm` and ends on a hook.
- Chibi panels for comedy spikes, never during sincere beats.
