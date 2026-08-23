# Contributing to gitpulse

Gitpulse is an AI-native project. All of the code is AI-generated, and contributions written the same way are welcome.

## Setup

Gitpulse uses Bun for development. Install it, then:

```bash
git clone https://github.com/shbernal/gitpulse.git
cd gitpulse
bun install
bun run dev -- cli/cli
```

`bun run dev` runs `src/bin.ts` straight from the working tree. To get a `gitpulse` command on your `PATH` that always tracks the checkout, drop a wrapper in `~/.local/bin`:

```bash
#!/usr/bin/env bash
set -euo pipefail

exec bun run /path/to/gitpulse/src/bin.ts "$@"
```

Invoking the entrypoint by absolute path keeps the caller's working directory, which zero-argument repository inference needs.

Set `GITHUB_TOKEN` before working on anything that refreshes data. Unauthenticated rate limits run out fast when several endpoints are called per repository.

## Commands

```bash
bun test
bun run typecheck
bun run build         # src/bin.ts -> dist/cli.js, the published entrypoint
bun run build:bin     # standalone executable at dist/gitpulse
bun run visuals       # render human-readable output to artifacts/
```

Run `bun test` and `bun run typecheck` before committing.

## Layout

```text
src/bin.ts        entrypoint
src/cli.ts        command wiring (commander)
src/github/       GitHub API collection
src/metrics/      metric and composite computation
src/render/       terminal and JSON output
src/cache/        snapshot cache, history, local shorthand
scripts/          visual rendering helpers
tests/            bun test suites
docs/             durable specs, one per command or subject
```

Collection, computation, and presentation stay separate. A renderer never calls GitHub, and a collector never formats a number for display.

## Conventions

- Keep GitHub specifics behind the interfaces in `src/github/` so another forge can be added later.
- Basic commands must work unauthenticated. `GITHUB_TOKEN` raises the rate limit, it is not a requirement.
- Never hide uncertainty. Missing fields, rate limits, archived repositories, stale cache, and partial failures belong in the output.
- Prefer a deterministic metric over an interpretation. When a metric can be misread, say in the output what it means.
- When you add a metric, document what it proves and what it does not.
- Prefer small modules over growing `cli.ts`.
- Human-readable output is the default, `--json` is the scripted path. Both stay useful.

## Documentation

Durable documentation lives in `docs/`. Top-level `docs/*.md` files describe the implementation as it currently is. Proposals, deferred features, and exploratory notes go under `docs/next-features/`.

Update the relevant spec in the same commit that changes behavior.

## Terminal output

Changing anything human-readable means running `bun run visuals` and looking at the generated artifacts. Color, spacing, emphasis, and alignment are part of the change, not a side effect of it. See [docs/VISUAL_OUTPUT.md](docs/VISUAL_OUTPUT.md).

## Commits

One independent change per commit. A behavior change and its spec update belong together, a rename and a new feature do not.

## Compatibility

Gitpulse does not preserve backwards compatibility. Deprecation cycles are not worth it at this size: when a command shape or JSON envelope should change, change it and update the docs.

## Issues and pull requests

Fully AI-generated issues and pull requests are welcome. Disclose it: name the harness and the model you used, in the issue or pull request body.

Anything you report should say what you ran, what you got, and what you expected. `--json` output pasted into the issue helps more than a screenshot.
