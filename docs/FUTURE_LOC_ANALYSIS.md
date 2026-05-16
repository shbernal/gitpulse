# Future LOC Analysis

Line-of-code analysis may be useful later as a rough source-size and complexity signal, but it is not a near-term feature.

## Scope

This feature would report source size from repository contents, not from GitHub's repository metadata alone.

GitHub's language endpoint reports bytes by language, not actual lines of code. It can support language distribution, but it should not be presented as LOC.

## Requirements For Actual LOC

A real LOC count would require Gitpulse to:

- Resolve the repository to a specific ref or commit SHA.
- Download or check out the repository contents for that ref.
- Run a source counter such as `tokei`, `scc`, or `cloc`.
- Report the counting tool and version.
- Separate code lines, comment lines, and blank lines when the selected tool supports it.
- Document inclusion and exclusion rules.

## Counting Rules To Define

Any future implementation should decide and document how it treats:

- Generated files.
- Vendored dependencies.
- Lockfiles.
- Minified assets.
- Fixtures and test data.
- Documentation files.
- Tests.
- Submodules.

Different counters and language detectors can disagree, so the output should make the method visible instead of implying a universal truth.

## Output Principles

LOC should be presented as context, not as a quality, maintainability, or project-health verdict.

Future output should make counts reproducible by showing:

- The repository ref or commit SHA.
- The counter name and version.
- The counting mode and exclusion rules.
- The meaning of each number shown.

Example shape:

```text
Source size:
  Code lines: 2,431
  Comment lines: 318
  Blank lines: 402
  Counted at: main@abc1234 using tokei 13.0.0
  Excludes: generated files, vendored dependencies, lockfiles
```

