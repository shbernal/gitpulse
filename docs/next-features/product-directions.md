# Product Directions

Status: future and exploratory feature notes.

This file holds product directions that are not part of the current
implementation contract documented by top-level `docs/*.md` files.

## Possible Later Phases

- AI-assisted README, changelog, and release-note summaries.
- Package registry signals for ecosystems such as npm, crates.io, PyPI, Go,
  RubyGems, and Arch/AUR.
- Security and supply-chain signals.
- Local repository analysis.
- Organization-level project comparison.
- Historical trend charts.
- Configurable scoring profiles for different decision contexts, such as
  `dependency`, `CLI install`, or `contribution target`.

## Specific Deferred Notes

- Source size and line-of-code analysis is tracked in
  [LOC Analysis](loc-analysis.md).
- A tooling-based maintenance metric is tracked in
  [Maintenance Tooling Analysis](maintenance-tooling.md).
- Popularity reference sets are tracked in
  [Popularity Benchmarks](popularity-benchmarks.md).
- `gitpulse starred` could add an explicit `gh auth` authentication source if
  that proves useful.
- The starred selector could add richer preview panes while preserving the
  current `owner/name` selection flow.
- Completion could add a compact local index if reading cache/history on demand
  becomes slow with large local state.

## Open Product Questions

- Should Gitpulse keep grouped composite metrics only, or introduce
  scenario-specific scoring profiles?
- How should metrics differ for libraries, CLIs, frameworks, and applications?
- Should Gitpulse eventually include deterministic comparison summary language,
  and how can it avoid becoming prescriptive?
- Should Gitpulse support a config file for custom metric weighting?
- How much historical data can be collected without making the CLI slow or
  rate-limit prone?
