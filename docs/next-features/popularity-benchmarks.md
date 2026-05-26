# Popularity Benchmarks

Status: future feature proposal.

Popularity Score currently reports an open-ended logarithmic score plus PU. It
does not claim a global rank. GitHub does not provide an official all-time rank
for this custom formula, and live global ranking would require maintaining or
querying a broader repository corpus.

## Proposed Direction

Use curated reference repositories as benchmark anchors. This keeps the feature
deterministic, understandable, and honest about its scope.

Gitpulse should not say:

```text
Top 2% of GitHub
```

Gitpulse can say:

```text
Popularity references
reference set: developer tools, refreshed 2026-05-26

Repository        Score          PU
small/tool        3.40       2.5k PU
your/repo         4.60      39.9k PU
mid/tool          5.10       126k PU
large/tool        6.20       1.6m PU
```

## Reference Sets

Reference sets should be small, explicit, and category-specific. Examples:

| Set | Purpose |
| --- | --- |
| `developer-tools` | CLIs, package managers, terminal tools, build tools. |
| `frameworks` | Web, mobile, and application frameworks. |
| `databases` | Databases, search engines, storage systems. |
| `libraries` | Popular dependency libraries across ecosystems. |

Each set should be stored as plain repository refs:

```text
cli/cli
BurntSushi/ripgrep
sharkdp/fd
sharkdp/bat
junegunn/fzf
```

## Refresh Model

Benchmarks should be refreshed deliberately, not live during normal report
rendering.

Possible command shape:

```bash
gitpulse benchmarks refresh developer-tools
gitpulse benchmarks list
```

The refreshed data should store:

- Repository ref.
- Fetched timestamp.
- Stars, forks, and watchers.
- PU.
- Popularity Score.

## Display Rules

Default repository reports should stay compact. If this feature is added, the
benchmark display should probably appear only in explanation mode:

```bash
gitpulse owner/name --explain
```

Suggested explanation block:

```text
Popularity references
reference set: developer-tools, refreshed 2026-05-26

Nearest lower   sharkdp/bat        4.55 (35.2k PU)
This repo       owner/name         4.60 (39.9k PU)
Nearest higher  junegunn/fzf       4.78 (60.1k PU)
```

For comparison reports, omit reference benchmarks by default. Comparison already
has direct side-by-side context, and adding external references would make the
scoreboard too wide.

## Caveats

- Reference sets are curated, not global GitHub rankings.
- Counts drift over time, so output must show the reference refresh date.
- Different ecosystems have different popularity scales; category-specific sets
  are more honest than one universal set.
- Benchmarks should not imply quality, security, maintenance health, or project
  fit.
