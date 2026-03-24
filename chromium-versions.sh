#!/usr/bin/env bash
# Show Chromium build for each Playwright release branch from 1.40 to 1.55

printf "%-12s %-12s %s\n" "Branch" "Revision" "Chromium Version"
printf "%-12s %-12s %s\n" "------" "--------" "----------------"

for minor in $(seq 40 55); do
  branch="origin/release-1.${minor}"
  json=$(git show "${branch}:packages/playwright-core/browsers.json" 2>/dev/null)
  if [ -z "$json" ]; then
    printf "%-12s %s\n" "1.${minor}" "(branch not found)"
    continue
  fi
  read -r revision version < <(echo "$json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for b in data['browsers']:
    if b['name'] == 'chromium':
        print(b.get('revision', 'N/A'), b.get('browserVersion', 'N/A'))
        break
")
  printf "%-12s %-12s %s\n" "1.${minor}" "${revision}" "${version}"
done
