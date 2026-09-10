#!/usr/bin/env bash
# Claude Code status line — shows all available fields

input=$(cat)

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // "unknown model"')

# --- Version ---
version=$(echo "$input" | jq -r '.version // ""')

# --- Current directory (shortened) ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
short_cwd=$(basename "$cwd")

# --- Git branch (fast, no locks) ---
git_branch=""
if [ -n "$cwd" ]; then
  git_branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
fi

# --- Git worktree ---
git_worktree=$(echo "$input" | jq -r '.workspace.git_worktree // ""')

# --- Session name ---
session_name=$(echo "$input" | jq -r '.session_name // ""')

# --- Output style ---
output_style=$(echo "$input" | jq -r '.output_style.name // ""')

# --- Vim mode ---
vim_mode=$(echo "$input" | jq -r '.vim.mode // ""')

# --- Agent ---
agent_name=$(echo "$input" | jq -r '.agent.name // ""')

# --- Worktree branch ---
worktree_branch=$(echo "$input" | jq -r '.worktree.branch // ""')

# --- Context window ---
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
remaining_pct=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')
ctx_window_size=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
total_in=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')
total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // empty')

# --- Rate limits ---
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
seven_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

# ---- Build output ----

# Section 1: model + version
printf "\033[1;36m%s\033[0m" "$model"
[ -n "$version" ] && printf " \033[2mv%s\033[0m" "$version"

# Section 2: directory + git branch
printf "  \033[1;33m%s\033[0m" "$short_cwd"
[ -n "$git_branch" ] && printf " \033[35m(%s)\033[0m" "$git_branch"
[ -n "$git_worktree" ] && printf " \033[35m[wt:%s]\033[0m" "$git_worktree"
[ -n "$worktree_branch" ] && [ "$worktree_branch" != "$git_branch" ] && printf " \033[35m{%s}\033[0m" "$worktree_branch"

# Section 3: session name
[ -n "$session_name" ] && printf "  \033[2msession:%s\033[0m" "$session_name"

# Section 4: output style
[ -n "$output_style" ] && [ "$output_style" != "default" ] && printf "  \033[2mstyle:%s\033[0m" "$output_style"

# Section 5: agent
[ -n "$agent_name" ] && printf "  \033[1;31magent:%s\033[0m" "$agent_name"

# Section 6: vim mode
[ -n "$vim_mode" ] && printf "  \033[1;32m[%s]\033[0m" "$vim_mode"

# Section 7: context window usage
if [ -n "$used_pct" ]; then
  used_int=$(printf "%.0f" "$used_pct")
  remaining_int=0
  [ -n "$remaining_pct" ] && remaining_int=$(printf "%.0f" "$remaining_pct")

  if [ "$used_int" -ge 80 ]; then
    ctx_color="\033[1;31m"
  elif [ "$used_int" -ge 50 ]; then
    ctx_color="\033[1;33m"
  else
    ctx_color="\033[1;32m"
  fi

  printf "  ${ctx_color}ctx:%d%%\033[0m" "$used_int"

  if [ -n "$ctx_window_size" ] && [ -n "$total_in" ]; then
    printf " \033[2m(%s/%s tokens)\033[0m" "$total_in" "$ctx_window_size"
  fi
fi

# Section 8: cumulative tokens
if [ -n "$total_in" ] && [ -n "$total_out" ] && [ -z "$used_pct" ]; then
  printf "  \033[2mtokens in:%s out:%s\033[0m" "$total_in" "$total_out"
fi

# Section 9: rate limits
if [ -n "$five_pct" ] || [ -n "$seven_pct" ]; then
  printf "  \033[2m"
  [ -n "$five_pct" ] && printf "5h:$(printf '%.0f' "$five_pct")%%"
  [ -n "$seven_pct" ] && printf " 7d:$(printf '%.0f' "$seven_pct")%%"
  printf "\033[0m"
fi

printf "\n"
