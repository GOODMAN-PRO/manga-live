# Manga page factory

The factory reads the mechanical schema in `story/FORMAT.md` and the locked visual contract in `art-direction.md`.

```powershell
npm install
npm run panelgen -- story/ch01.json
npm run panelgen -- story/ch01.json --redo p3b
npm run compose -- story/ch01.json
```

Environment variables `COMFY_URL` and `COMFY_CHECKPOINT` override the default local engine and checkpoint. `panelgen` writes deterministic seed and prompt metadata beside its panel output. Existing panels are skipped unless `--force` or `--redo` is given.

`publish` is intentionally guarded because it edits the live manifest, commits, and pushes:

```powershell
npm run publish -- story/ch01.json --go --ongoing true
```

Do not invoke it until page QA is complete and the owner has explicitly approved publishing.
