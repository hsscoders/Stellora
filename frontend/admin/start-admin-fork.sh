#!/bin/bash
# Starts the Stellora admin console (Next.js) detached on port 3001.
LOG="/home/z/my-project/stellora-repo/frontend/admin/.admin.log"
cd /home/z/my-project/stellora-repo/frontend/admin
nohup bunx next dev -p 3001 > "$LOG" 2>&1 &
disown
exit 0
