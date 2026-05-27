export function renderBashCompletionScript(commandName = "gitpulse"): string {
  return `# bash completion for ${commandName}
_gitpulse()
{
  local cur prev cmd
  local top_commands="docs web starred search user history cache config completions"
  local theme_values="tokyo-night catppuccin-mocha nord gruvbox-dark dracula"
  local shared_flags="--json --color --theme --refresh --offline --max-cache-hours --contributor-fetch-limit"
  local repo_flags="$shared_flags --explain"
  local starred_flags="--json --color --theme --refresh --offline --max-cache-hours --list --sort --direction"
  local search_flags="--json --color --theme --refresh --offline --max-cache-hours --list --lucky --sort --order --limit"
  local user_flags="--json --color --theme --refresh --offline --max-cache-hours"

  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  cmd="\${COMP_WORDS[1]}"

  case "$prev" in
    --color)
      COMPREPLY=( $(compgen -W "auto always never" -- "$cur") )
      return 0
      ;;
    --theme)
      COMPREPLY=( $(compgen -W "$theme_values" -- "$cur") )
      return 0
      ;;
    --sort)
      if [[ "$cmd" == "search" ]]; then
        COMPREPLY=( $(compgen -W "best-match stars forks help-wanted-issues updated" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "created updated" -- "$cur") )
      fi
      return 0
      ;;
    --direction)
      COMPREPLY=( $(compgen -W "asc desc" -- "$cur") )
      return 0
      ;;
    --order)
      COMPREPLY=( $(compgen -W "asc desc" -- "$cur") )
      return 0
      ;;
    --max-cache-hours|--contributor-fetch-limit|--limit)
      return 0
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    if [[ "$cmd" == "user" ]]; then
      COMPREPLY=( $(compgen -W "$user_flags" -- "$cur") )
    elif [[ "$cmd" == "starred" ]]; then
      COMPREPLY=( $(compgen -W "$starred_flags" -- "$cur") )
    elif [[ "$cmd" == "search" ]]; then
      COMPREPLY=( $(compgen -W "$search_flags" -- "$cur") )
    elif [[ "$cmd" == "docs" || "$cmd" == "web" ]]; then
      COMPREPLY=( $(compgen -W "$shared_flags" -- "$cur") )
    else
      COMPREPLY=( $(compgen -W "$repo_flags" -- "$cur") )
    fi
    return 0
  fi

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$top_commands" -- "$cur") )
    _gitpulse_complete_repos "$cur"
    return 0
  fi

  case "$cmd" in
    docs|web)
      _gitpulse_complete_repos "$cur"
      ;;
    user)
      if [[ $COMP_CWORD -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "web" -- "$cur") )
        _gitpulse_complete_users "$cur"
      elif [[ "\${COMP_WORDS[2]}" == "web" ]]; then
        _gitpulse_complete_users "$cur"
      fi
      ;;
    history)
      COMPREPLY=( $(compgen -W "clear" -- "$cur") )
      ;;
    cache)
      COMPREPLY=( $(compgen -W "clear" -- "$cur") )
      ;;
    config)
      COMPREPLY=( $(compgen -W "path reset" -- "$cur") )
      ;;
    completions)
      COMPREPLY=( $(compgen -W "bash" -- "$cur") )
      ;;
    starred)
      ;;
    search)
      ;;
    *)
      _gitpulse_complete_repos "$cur"
      ;;
  esac
}

_gitpulse_complete_repos()
{
  local current="$1"
  local gitpulse_cmd="\${COMP_WORDS[0]:-${commandName}}"
  local candidate

  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] && COMPREPLY+=( "$candidate" )
  done < <("$gitpulse_cmd" __complete repos --current "$current" 2>/dev/null)
}

_gitpulse_complete_users()
{
  local current="$1"
  local gitpulse_cmd="\${COMP_WORDS[0]:-${commandName}}"
  local candidate

  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] && COMPREPLY+=( "$candidate" )
  done < <("$gitpulse_cmd" __complete users --current "$current" 2>/dev/null)
}

complete -F _gitpulse ${commandName}
`;
}
