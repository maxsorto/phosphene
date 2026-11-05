#!/bin/zsh
# Serves phosphene on localhost (needed for mic and tab-audio permissions, and for Song ID) and opens it in Chrome.
cd "$(dirname "$0")"
if ! lsof -ti tcp:8765 >/dev/null; then
  if command -v node >/dev/null; then (node serve.mjs 8765 >/dev/null 2>&1 &)
  else (python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &); echo "Node not found: running without Song ID"; fi
fi
sleep 0.6
open -a "Google Chrome" "http://127.0.0.1:8765/"
