#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title AI Journal
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📔
# @raycast.packageName AI Journal

# Documentation:
# @raycast.description Starts the AI Journal app and opens it in Brave.
# @raycast.author Sascha Metzger

# Raycast uses a minimal shell, so make sure bun (and brew) are on PATH
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

start_mlx_server

cd /Users/saschametzger/Projects/ai-journal || exit 1

# Free the port if something is already listening on it
lsof -ti:32841 | xargs kill -9 2>/dev/null || true

# Start the server fully detached so it survives Raycast's script exiting
nohup bun run start >/tmp/ai-journal.log 2>&1 &
disown

sleep 2
open -a "Brave Browser" http://localhost:32841
