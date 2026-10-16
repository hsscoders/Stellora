#!/bin/bash
# Starts the Stellora frontend (Next.js) detached on port 3000.
LOG="/home/z/my-project/stellora-repo/frontend/client/.frontend.log"
cd /home/z/my-project/stellora-repo/frontend/client
nohup bunx next dev -p 3000 > "$LOG" 2>&1 &
disown
exit 0
