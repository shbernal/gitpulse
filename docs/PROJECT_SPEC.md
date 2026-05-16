# Gitpulse Project Spec

## Summary

Gitpulse is a terminal-first project intelligence CLI. It collects public development signals from source repositories and turns them into a compact, inspectable story for developers evaluating a project.

The initial target is GitHub. The broader product should remain forge-aware rather than GitHub-only, so future support for GitLab, Codeberg, Forgejo, or self-hosted sources remains possible.

## Problem

Developers often need to judge unfamiliar projects quickly:

- Should I install this CLI or tool?
- Should I depend on this library?
- Should I contribute to this project?
- Which of several competing projects looks healthier or more likely to last?
- Is this repository active, maintained, abandoned, experimental, or mature?

The raw signals exist across repository pages, releases, issues, pull requests, documentation files, package registries, and community activity. Gitpulse should collect the first layer of these signals and present them in a way that is fast to read without pretending to make the decision for the user.

## Product Positioning

Gitpulse is not `gh` with another interface. It should not focus on managing GitHub objects.

Gitpulse should be closer to a due-diligence lens for developers: a quick way to understand a repository's state, trajectory, and reliability signals before using it, comparing it, or investing time in it.

## Target Users

Primary users:

- Developers choosing between competing tools.
- Developers evaluating whether to add a project as a dependency.
- Developers deciding whether a project is worth contributing to.
- Technical users checking whether a CLI or developer tool looks maintained before installing it.

Secondary users:

- Maintainers who want a quick external view of how their repository appears.
- Teams standardizing dependencies or tooling choices.
- Security-minded users looking for maintenance and ownership signals before adoption.

## Core Use Cases

### Repository Snapshot

Given `owner/repo`, Gitpulse should display the main repository facts and health signals:

- Creation date and age.
- Stars, forks, watchers, open issues, open pull requests.
- Primary language and language distribution.
- License.
- Latest release and release cadence.
- Recent commit activity.
- Contributor count and concentration.
- Archived, disabled, fork, template, or mirror status.
- README and documentation file presence.

### Evaluation Lenses

Gitpulse should organize raw datapoints into a few practical lenses. These lenses should guide output structure and future metric design:

- Adoption: stars, forks, watchers, downstream interest, and ecosystem presence where available.
- Dynamism: recent commits, releases, issue activity, pull request activity, and contributor movement.
- Reliability: release habits, maintenance recency, documentation presence, license clarity, and warning states.
- Maturity: project age, version history, contributor base, topic clarity, and stability indicators.
- Long-term viability: maintainer distribution, community participation, recent activity, and signs that the project is still moving.

These lenses should not become hard claims. They are ways to group evidence so the user can inspect the story quickly.

### Repository Comparison

Given two or more repositories, Gitpulse should show comparable metrics side by side.

The comparison should help answer questions such as:

- Which project appears more active?
- Which project appears more mature?
- Which project has broader adoption?
- Which project has more recent maintenance?
- Which project has stronger release habits?
- Are there warning signs such as archival, very low maintainer activity, or stale releases?

Example comparisons:

```bash
gitpulse compare Jguer/yay Morganamilo/paru
gitpulse compare OJ/gobuster ffuf/ffuf
```

### Decision Support, Not Decision Replacement

Gitpulse should avoid declaring one project as "best" or "safe." Instead, it should present evidence and explain tradeoffs.

Good output:

```text
paru has a newer latest release and more recent commits. yay has more stars and forks. Both projects have recent activity.
```

Bad output:

```text
Use paru.
```

## Signal Categories

### Repository Facts

These are direct GitHub fields:

- Full name.
- Description.
- URL.
- Creation date.
- Last push date.
- Last update date.
- Default branch.
- Primary language.
- License.
- Star count.
- Fork count.
- Watcher count.
- Open issue count.
- Topics.
- Repository size.
- Archived status.
- Fork status.

### Activity Signals

These describe recent project movement:

- Latest commit date on the default branch.
- Commit count over recent windows when available.
- Latest release date.
- Release count.
- Recent issue activity.
- Recent pull request activity.
- Time since last meaningful repository event.

### Community Signals

These describe participation and adoption:

- Contributor count.
- Top contributor concentration.
- Forks relative to stars.
- Open issues relative to stars.
- Pull request participation from non-maintainers where available.

### Documentation Signals

These describe how easy the project is to evaluate:

- README presence.
- License presence.
- Changelog presence.
- Contributing guide presence.
- Code of conduct presence.
- Security policy presence.
- Release notes presence.

Phase 1 should only detect presence and basic metadata. Deeper content analysis belongs to a later phase.

## Metric Philosophy

Metrics should be useful but humble. A high star count can indicate adoption or hype. A low issue count can mean quality, inactivity, or disabled issue tracking. Recent commits can mean active maintenance or churn.

Gitpulse should make metrics easier to inspect, not overclaim what they prove.

Composite metrics may be added, but they must be explainable. If Gitpulse computes an "activity score" or "maintenance score," the output and docs should describe the inputs and weighting.

## Output Philosophy

Default output should be optimized for humans in a terminal:

- Compact reports with grouped sections.
- Score bars or similarly scannable presentations for explainable composite metrics.
- Consistent labels.
- Clear missing-data indicators.
- Dates shown in understandable absolute form.
- Relative age where helpful, such as "18 days ago."
- Light color usage when supported.

Comparison output should include a short deterministic summary when enough data is available. The summary should describe observable differences, not prescribe a choice.

Machine-readable output should be available:

```bash
gitpulse repo owner/name --json
gitpulse compare owner/a owner/b --json
```

JSON output should remain stable enough to support scripts.
It should use an explicit envelope with a schema version and command name so the scripting surface can evolve deliberately.

## Non-Goals

Gitpulse should not:

- Replace `gh`.
- Manage GitHub issues, pull requests, releases, or repository settings.
- Make final adoption decisions for users.
- Present AI-generated claims without source data.
- Require authentication for basic public repository checks.
- Depend on terminal UI features for core functionality.

## Future Directions

Possible later phases:

- AI-assisted README, changelog, and release-note summaries.
- Package registry signals for ecosystems such as npm, crates.io, PyPI, Go, RubyGems, and Arch/AUR.
- Security and supply-chain signals.
- Local repository analysis.
- Source size and line-of-code analysis as a later source-inspection feature, not a near-term API-only metric. See [Future LOC Analysis](FUTURE_LOC_ANALYSIS.md).
- Organization-level project comparison.
- Historical trend charts.
- Configurable scoring profiles for different decision contexts, such as "dependency," "CLI install," or "contribution target."

## Open Product Questions

- Should Gitpulse eventually include a normalized score, or only grouped metrics?
- How should metrics differ for libraries, CLIs, frameworks, and applications?
- Which comparison summary language is helpful without becoming prescriptive?
- Should Gitpulse support a config file for custom metric weighting?
- How much historical data can be collected without making the CLI slow or rate-limit prone?
