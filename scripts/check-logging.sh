#!/usr/bin/env bash
# Logging convention checks. Grep-based on purpose: clippy has no rule for log
# levels, and a rule nobody runs decays.
#
# Log-macro invocations are extracted whole, balancing parens and skipping string
# literals, so a call spread over ten lines is judged as one call.
#
# Usage: scripts/check-logging.sh [src-dir]     (default: src)

set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-$root/src}"
fail=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
note() { printf '\033[2m%s\033[0m\n' "$*"; }

# --- extract -----------------------------------------------------------------
# Emits:  file:line <TAB> level!(body)
extract_calls() {
  find "$target" -name '*.rs' -print0 | sort -z | xargs -0 awk -f "$root/scripts/log_calls.awk"
}

# --- rule 1: error! must name a cause ----------------------------------------
# A cause is `error` (a value), `reason` (known cause, not an error value) or
# `fault` (an invariant already broken, so there is no Err to report). Never
# invent an io::Error to satisfy this check.
missing_cause="$(extract_calls |
  awk -F'\t' '$2 ~ /^error!/ && $2 !~ /(^|[ (])(error|reason|fault)[[:space:]]*=/ { print $1 }')"

if [[ -n "$missing_cause" ]]; then
  while IFS= read -r loc; do
    red "error! without a cause: ${loc#"$root"/}"
  done <<< "$missing_cause"
  note "  add error = (a value), reason = (known cause), or fault = (broken invariant)."
  note "  Do not invent an io::Error to pass this."
  fail=1
fi

# --- rule 2: no interpolation into the message --------------------------------
# { } inside the message string defeats field queries. Exempt the formatting
# macros, where the braces belong to the format specifier, not the message.
#
# The leading class is load-bearing. Without it `xformat!` matches, and with a bare
# `[a-z_]+!` the exemption matches `trace!` and `info!` themselves, which drops
# every single-literal log call and hides the violation this rule exists to catch.
interpolated="$(extract_calls |
  awk -F'\t' '
    {
      body = $2
      gsub(/(^|[^[:alnum:]_])(format|print|println|eprint|eprintln|panic|todo|unreachable|unimplemented|assert|assert_eq|assert_ne|debug_assert|debug_assert_eq|debug_assert_ne|write|writeln)!\("[^"]*"/, "\\1\\2!(", body)
      if (body ~ /"[^"]*\{[^"]*"/) print $1
    }')"

if [[ -n "$interpolated" ]]; then
  while IFS= read -r loc; do
    red "interpolation in message: ${loc#"$root"/}"
  done <<< "$interpolated"
  note "  move the value into a field, see docs/logging.md"
  fail=1
fi

# --- rule 3: #[instrument(err)] double-logs -----------------------------------
# The attribute logs the error on the way out and so does the boundary. Drop one.
# Multiline, because the attribute usually wraps and err sits on its own line.
#
# The class before `err` has to include `(`, not only whitespace and a comma: the single-line
# `#[instrument(err)]` puts the paren there, and omitting it misses the commonest form of all.
# The class after it accepts `= true` too, since that is the same argument spelled out.
# Known limit: `skip(err)` naming a variable called err would match. Nothing in the tree does.
instrument_err="$(rg -U -n --no-heading '#\[(tracing::)?instrument\([^]]*?[,[:space:]]?err[[:space:]]*(=[^],)]*)?[,)]' -g '*.rs' "$target" |
  awk '/#\[(tracing::)?instrument\(/ { sub(/#\[(tracing::)?instrument\(.*/, "#[instrument("); print }' || true)"
if [[ -n "$instrument_err" ]]; then
  while IFS= read -r line; do
    red "#[instrument(err)] double-logs: ${line#"$root"/}"
  done <<< "$instrument_err"
  fail=1
fi

# --- rule 4: info! and warn! budget per file ----------------------------------
# info! is the operator timeline. A file that logs it per message is a flood.
# warn! gets the same treatment for the reason the doc gives for error!: a level people are
# trained to skim stops being read. A file carrying a dozen-and-a-half is where that starts.
# audit.rs is exempt: it holds one function per audited event and every one of them is an
# action taken, which is what info! is for.
#
# This is a ratchet, not a diagnosis. Count per file tracks how chatty a file is, not how often
# it fires, and the two do not agree: every file over the warn! budget is a worker on a timer or
# a rare-event handler, while the handlers that run per message all sit under it. It catches
# growth, not floods. The rule that would catch a flood is a warn! naming something you can query.
budget_over() {
  local level="$1" limit="$2"
  extract_calls |
    awk -F'\t' -v re="^${level}!" -v b="$limit" '
      $2 ~ re {
        split($1, p, ":")
        if (p[1] ~ /audit\.rs$/) next
        count[p[1]]++
      }
      END { for (f in count) if (count[f] > b) print count[f] "\t" f }' |
    sort -rn
}

for spec in "info:${INFO_BUDGET:-8}" "warn:${WARN_BUDGET:-13}"; do
  level="${spec%%:*}"
  limit="${spec##*:}"
  over="$(budget_over "$level" "$limit")"
  if [[ -n "$over" ]]; then
    while IFS=$'\t' read -r n f; do
      red "over ${level}! budget ($limit): $n in ${f#"$root"/}"
    done <<< "$over"
    note "  raise it with ${level^^}_BUDGET if the file is genuinely that busy."
    fail=1
  fi
done

# --- rule 5: level( is not level!( ----------------------------------------------
# `debug("x")` binds to `tracing::field::debug`, the field constructor, not the macro. It
# compiles to a discarded expression and logs nothing, so the line reads as correct and is not.
# The awk extractor only matches `level!(`, so without this rule the mistake is invisible.
# `pub async fn info(` and friends are not calls, so a definition is not a hit.
not_macro="$(rg -n --no-heading -P '(?<![\w:!.])(trace|debug|info|warn|error)\(' \
  -g '*.rs' "$target" |
  rg -v -P '^\S+:\d+:\s*(pub |pub\(crate\) |pub\(super\) )?(async )?fn \w' |
  rg -v -P '\b(warn|error|info|debug|trace)_(span|event|level)\b' || true)"
if [[ -n "$not_macro" ]]; then
  while IFS= read -r line; do
    red "level( is not level!( : ${line#*:}"
  done <<< "$not_macro"
  note "  a bare level( binds to tracing::field::level and logs nothing."
  fail=1
fi

if [[ $fail -eq 0 ]]; then
  note "logging checks passed"
fi
exit $fail
