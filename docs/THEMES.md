# Terminal Themes

Gitpulse human-readable output uses semantic color roles instead of hardcoded
colors at each render site. A theme maps those roles to a terminal palette.

The default theme is `tokyo-night`.

## Themes

Supported theme names:

- `tokyo-night`
- `catppuccin-mocha`
- `nord`
- `gruvbox-dark`
- `dracula`

Use `--theme` to choose a theme for one command:

```bash
gitpulse owner/name --theme nord
gitpulse owner/a owner/b --theme gruvbox-dark
gitpulse user octocat --theme catppuccin-mocha
gitpulse docs owner/name --theme dracula
```

`--color` still controls whether ANSI color is emitted:

```bash
gitpulse owner/name --color never --theme nord
gitpulse owner/name --color always --theme tokyo-night
```

When color is disabled, the theme is ignored because no ANSI color is emitted.

## Config

The local config file can set defaults:

```json
{
  "cache": {
    "enabled": true,
    "maxCacheHours": 168,
    "staleIfError": true
  },
  "contributors": {
    "fetchLimit": 100
  },
  "output": {
    "color": "auto",
    "theme": "tokyo-night"
  }
}
```

Precedence is:

```text
CLI flags > config.json > built-in defaults
```

For example, if `config.json` sets `output.theme` to `nord`, this command still
uses `gruvbox-dark`:

```bash
gitpulse owner/name --theme gruvbox-dark
```

## Role Mapping

Themes map these semantic roles:

- `repo`: repository and login identities.
- `section`: section headers.
- `label`: row and field labels.
- `value`: emphasized values.
- `muted`: URLs, missing low-priority text, and secondary metadata.
- `footer`: provenance footer heading.
- `good`, `warn`, `bad`, `info`: score bands, states, and activity tone.

Language-specific colors remain enabled for known programming languages in
human-readable output. JSON output is unaffected by themes.

## Visual Review

Run:

```bash
bun run visuals
```

The visual harness generates theme preview artifacts named:

```text
theme-tokyo-night
theme-catppuccin-mocha
theme-nord
theme-gruvbox-dark
theme-dracula
```

Use those artifacts to compare palette readability before changing the default.
