export function renderBashCompletionScript(commandName = "gitpulse"): string {
  return `# bash completion for ${commandName}
_gitpulse()
{
  local cur prev cmd
  local top_commands="docs user history cache config completions"
  local shared_flags="--json --color --refresh --offline --max-cache-hours --contributor-fetch-limit"
  local user_flags="--json --color --refresh --offline --max-cache-hours"

  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    --color)
      COMPREPLY=( $(compgen -W "auto always never" -- "$cur") )
      return 0
      ;;
    --max-cache-hours|--contributor-fetch-limit)
      return 0
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    cmd="\${COMP_WORDS[1]}"
    if [[ "$cmd" == "user" ]]; then
      COMPREPLY=( $(compgen -W "$user_flags" -- "$cur") )
    else
      COMPREPLY=( $(compgen -W "$shared_flags" -- "$cur") )
    fi
    return 0
  fi

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "$top_commands" -- "$cur") )
    _gitpulse_complete_repos "$cur"
    return 0
  fi

  cmd="\${COMP_WORDS[1]}"

  case "$cmd" in
    docs)
      _gitpulse_complete_repos "$cur"
      ;;
    user)
      _gitpulse_complete_users "$cur"
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
