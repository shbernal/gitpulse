# AI project guidelines

`gitpulse`: terminal CLI that collects deterministic GitHub repository signals and renders them as a compact project-health report.

- Key commands
  - `bun test`
  - `bun run typecheck`
  - `bun run dev -- owner/repo` (working-tree entrypoint, same as the published CLI)
  - `bun run visuals` after any change to human-readable output, then inspect the artifacts

- Key documentation
  - [CONTRIBUTING.md](CONTRIBUTING.md): workflow, layout, conventions
  - [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md): scope, phases, signals, non-goals
  - [docs/COMPOSITE_METRICS.md](docs/COMPOSITE_METRICS.md): composite formulas and caveats
  - [docs/COMPLETIONS.md](docs/COMPLETIONS.md), [docs/SEARCH.md](docs/SEARCH.md), [docs/STARRED.md](docs/STARRED.md), [docs/DOCS_COMMAND.md](docs/DOCS_COMMAND.md), [docs/FORKS.md](docs/FORKS.md): per-command contracts
  - [docs/THEMES.md](docs/THEMES.md), [docs/VISUAL_OUTPUT.md](docs/VISUAL_OUTPUT.md): terminal output

- Hard contracts
  - Bare repository shorthand stays local-only and exact. The root command never searches GitHub for an unknown word, with or without `--lucky`. It fails and asks for `owner/name`. Remote discovery lives under `gitpulse search`. Zero-argument inference reads local Git remotes only and never resolves fork parents through the API. Push back on any proposal that erodes this.
  - Phase 1 stays deterministic and API-driven. No AI dependency, no subjective NLP.
  - Reserved command words (`docs`, `web`, `star`, `unstar`, `starred`, `search`, `user`, `forks`, `history`, `cache`, `config`, `completions`) are commands, never shorthand.
  - `gitpulse star` and `gitpulse unstar` are the only writes to GitHub. Keep the write surface at the caller's own star; issues, pull requests, releases and repository settings stay with `gh`.
  - Top-level `docs/*.md` describe the shipped implementation. Proposals and deferred ideas go under `docs/next-features/`.
  - No backwards compatibility. Prefer the cleaner command contract and delete the old one.

- Iron Laws
  - Tokens are expensive, state of the art models need minimal guidance, don't repeat yourself, don't babysit, don't be over-specific.
  - AI-native project. All code is AI-generated.
  - Minimal attention when model implements without errors, we document in more detail when model struggles.
  - Do not expect the user to have read each line, don't lose him on the internals, give visibility on a higher-architectural level.
  - No journaling: code comments / documentation describe current state, they don't carry a log of their own edit history.
