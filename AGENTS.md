# AGENTS.md

## Project Intent

Gitpulse is a CLI for taking the pulse of development projects. The initial focus is GitHub repositories, with room to support other forge platforms later.

The tool should help developers quickly understand whether a project is worth contributing to, relying on as a dependency or building block, or installing as tooling. Gitpulse should provide strong signals and context, not a verdict. The user remains responsible for the final decision.

## Product Direction

Gitpulse is not intended to become a replacement for `gh`. It should not duplicate broad GitHub workflows like managing issues, opening pull requests, or administering repositories.

Instead, it should gather project-health datapoints, organize them clearly, and present a useful story about a repository or a set of competing repositories. Examples include:

- Basic repository facts: stars, forks, creation date, license, default branch, primary language, topics, archive status.
- Project activity: recent commits, release cadence, issue and pull request activity, contributor distribution.
- Adoption and community signals: watchers, forks, stars over time when available, contributor count, bus-factor indicators.
- Documentation signals: README presence, changelog presence, release notes, contributing guide, code of conduct.
- Comparison views: side-by-side metrics for similar tools such as `yay` versus `paru`, or `gobuster` versus `ffuf`.

## Current Baseline

The repository currently contains a Bash script named `gitpulse` that fetches minimal repository information from the GitHub REST API and renders a terminal table.

Treat that script as the prototype, not as the long-term architecture. The first major implementation direction is to migrate the CLI to TypeScript while preserving the simple terminal-first usage.

## Phase Strategy

Phase 1 is deterministic and API-driven. It should focus on structured metrics from GitHub and clear terminal output. Avoid AI or subjective NLP features in this phase.

Phase 2 may add deeper textual analysis over READMEs, changelogs, release notes, issue templates, and other informational files. AI-assisted summaries can be explored then, but they should remain explainable and source-backed.

## Engineering Principles

- Prefer deterministic metrics before subjective interpretation.
- Show the source or meaning of a metric when the metric could be misunderstood.
- Separate data collection, metric computation, and presentation.
- Keep GitHub-specific implementation details behind interfaces so other forges can be added later.
- Make unauthenticated GitHub API usage work for basic commands, but support `GITHUB_TOKEN` for higher rate limits.
- Keep output useful in terminals and scripts. Human-readable tables should be default; machine-readable JSON should be available.
- Avoid hiding uncertainty. Missing data, API limits, archived repositories, and partial failures should be visible.

## Expected Commands

The long-term command shape should stay compact:

```bash
gitpulse repo owner/name
gitpulse compare owner/a owner/b [owner/c...]
```

Aliases or shorthand input may be added later, but the first implementation should keep parsing predictable.

## Documentation Map

- `docs/PROJECT_SPEC.md`: broader product vision, users, signals, and non-goals.
- `docs/PHASE_1_SPEC.md`: first implementation phase, TypeScript migration, command scope, data model, and acceptance criteria.

## Contributor Notes

- Keep changes scoped to the current phase unless the user explicitly asks for broader implementation.
- Update specs when behavior or command scope changes.
- Do not introduce AI dependencies into phase-1 work.
- Prefer small, testable modules over a single large CLI file.
- When adding metrics, document what the metric means and what it does not prove.
