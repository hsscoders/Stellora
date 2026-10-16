#!/bin/bash
# Starts Stellora Next.js dev server detached, then exits (daemon orphaned to PID 1).
# Same pattern as start-db-fork.sh.
LOG="/home/z/my-project/stellora-repo/.dev-server.log"
cd /home/z/my-project/stellora-repo

export DATABASE_URL="mysql://stellora:stellora_dev_pw@127.0.0.1:33061/stellora"
export NODE_ENV="development"

nohup bunx next dev -p 3000 > "$LOG" 2>&1 &
disown
exit 0
