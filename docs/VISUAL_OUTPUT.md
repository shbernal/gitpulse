# Visual Output Review

Gitpulse human-readable output is part of the product surface. The visual review
harness generates deterministic terminal artifacts so spacing, color, emphasis,
and information hierarchy can be inspected without making live GitHub requests.

Run:

```bash
bun run visuals
```

The command writes generated files under `artifacts/visual-output/`:

- `.ansi` files contain the raw terminal output with ANSI escape codes.
- `.svg` files render that output into a dark terminal-like frame.
- `.png` files are also generated when `rsvg-convert` or ImageMagick's `magick`
  command is available locally.
- `manifest.json` records each case, output paths, the configured column guide,
  and maximum visible line length.

Generated artifacts are ignored by git by default. They are meant for local
inspection while changing `src/render/*`, terminal colors, section placement, or
the human-readable command surface.

The SVG renderer draws a vertical guide at the configured terminal width. Orange
guides indicate that at least one line exceeds the configured width. The
`repo-explain` and `repo-long-content` cases are intentionally allowed to
overflow so explanation detail, truncation, and layout pressure remain visible
during review.

Keep this workflow separate from JSON output. Visual review can change color,
spacing, labels, and emphasis in terminal reports, but machine-readable JSON
should remain plain, stable, and covered by normal tests.
