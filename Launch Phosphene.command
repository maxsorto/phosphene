#!/bin/zsh
# Serves phosphene on localhost (needed for mic and tab-audio permissions, and for Song ID) and opens it in Chrome.
# Uses the first port from 8765 up that is already serving phosphene or is free.
cd "$(dirname "$0")"
for port in {8765..8779}; do
  if curl -sf "http://127.0.0.1:$port/src/scenes.js" 2>/dev/null | grep -q "SCENES"; then break; fi   # already running
  if ! lsof -ti tcp:$port >/dev/null; then
    if command -v node >/dev/null; then (node serve.mjs $port >/dev/null 2>&1 &)
    else (python3 -m http.server $port --bind 127.0.0.1 >/dev/null 2>&1 &); echo "Node not found: running without Song ID"; fi
    sleep 0.7; break
  fi
done
open -a "Google Chrome" "http://127.0.0.1:$port/"
