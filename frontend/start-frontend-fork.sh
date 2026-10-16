#!/bin/bash
# Starts the Stellora frontend (Next.js) detached on port 3000.
LOG="/home/z/my-project/stellora-repo/frontend/.frontend.log"
cd /home/z/my-project/stellora-repo/frontend
nohup bunx next dev -p 3000 > "$LOG" 2>&1 &
disown
exit 0
