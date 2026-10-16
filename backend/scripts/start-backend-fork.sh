#!/bin/bash
# Starts the Stellora Express backend detached, then exits (daemon orphaned to PID 1).
LOG="/home/z/my-project/stellora-repo/backend/.backend.log"
cd /home/z/my-project/stellora-repo/backend
nohup bun src/server.ts > "$LOG" 2>&1 &
disown
exit 0
