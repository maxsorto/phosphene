#!/bin/zsh
# Serves phosphene on localhost (needed for mic and tab-audio permissions) and opens it in Chrome.
cd "$(dirname "$0")"
lsof -ti tcp:8765 >/dev/null || (python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &)
sleep 0.5
open -a "Google Chrome" "http://127.0.0.1:8765/"
