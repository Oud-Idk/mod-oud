# Emits one TSV record per log-macro invocation:  file:line <TAB> level!(body)
#
# Calls are read whole, balancing parens and ignoring string literals, so a call
# spread over several lines is judged as one call rather than a fragment.
# Invoked by scripts/check-logging.sh.
BEGIN { in_call = 0; depth = 0; in_str = 0; esc = 0 }

{
  line = $0
  i = 1
  len = length(line)

  while (i <= len) {
    if (!in_call) {
      rest = substr(line, i)
      if (match(rest, /[ \t]*(error|warn|info|debug|trace)!\(/)) {
        rs = RSTART; rl = RLENGTH   # the match() below clobbers RSTART/RLENGTH
        m = substr(rest, rs, rl)
        lead = match(m, /[^ \t]/) - 1
        # A macro name straight after an identifier char is not a log macro:
        # my_error!, to_warn!, and friends.
        before = (rs + lead > 1) ? substr(rest, rs + lead - 1, 1) : ""
        if (before ~ /[[:alnum:]_]/) { i++; continue }
        level = substr(m, lead + 1, rl - lead - 2)
        body = ""
        in_call = 1; depth = 0; in_str = 0; esc = 0; start = FNR
        i = i + rs + rl - 2
        continue
      }
      break
    }

    c = substr(line, i, 1)
    if (in_str) {
      if (esc) { esc = 0 }
      else if (c == "\\") { esc = 1 }
      else if (c == "\"") { in_str = 0 }
    } else if (c == "\"") {
      in_str = 1
    } else if (c == "(") {
      depth++
    } else if (c == ")") {
      depth--
    }

    body = body c
    i++

    if (depth == 0) {
      printf "%s:%d\t%s!%s\n", FILENAME, start, level, body
      in_call = 0; body = ""; level = ""
    }
  }

  if (in_call) { body = body " " }
}

# An unterminated call would otherwise swallow the rest of the file.
END { if (in_call) printf "%s:%d\tTRUNCATED %s\n", FILENAME, start, body }
