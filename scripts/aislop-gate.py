#!/usr/bin/env python3
# Strict aislop gate. `aislop ci` alone exits 0 on warnings, so this fails on
# any diagnostic not recorded in .aislop/ci-baseline.json, matched on
# (rule, file). Stale baseline entries are harmless; prune them with
# `pnpx aislop baseline prune` when a baselined finding is fixed.
#
# Usage: scripts/aislop-gate.py <ci-report.json>     (from `aislop ci --format json`)

import json
import sys

with open(sys.argv[1]) as f:
    report = json.load(f)

with open(".aislop/ci-baseline.json") as f:
    baseline = json.load(f)
accepted = {(e["rule"], e["file"]) for e in baseline.get("entries", [])}

new = [
    d
    for d in report.get("diagnostics", [])
    if (d.get("rule"), d.get("filePath")) not in accepted
]
if new:
    for d in new:
        print(
            f"{d.get('filePath')}:{d.get('line')}: [{d.get('rule')}] {d.get('message')}"
        )
    sys.exit(f"{len(new)} new aislop finding(s), none in .aislop/ci-baseline.json")

print(
    f"aislop strict gate passed ({len(report.get('diagnostics', []))} baselined finding(s))"
)
