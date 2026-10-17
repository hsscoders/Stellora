# Stellora — Sandbox Reset Recovery Guide

## Problem
Sandbox (VM) kabhi bhi reset ho sakta hai — repo, node_modules, PM2 sab gayab.

## Solution — ONE COMMAND RECOVERY

Sandbox reset hone ke baad bas ye ek command chalao:

```bash
git clone https://github.com/hsscoders/Stellora.git && cd Stellora && bash scripts/bootstrap.sh
```

Bas. 3-5 minute mein poora stack restore:
- Storefront : http://localhost:3000
- Admin POS  : http://localhost:3001/admin-console/admin/pos (login: demo@gmail.com / 123456)
- API        : http://localhost:4000/api/health

## Ye script kya karta hai (idempotent — baar baar chala sakte ho)

| Step | Kaam | Skip condition |
|------|------|----------------|
| 1 | node/bun/pm2 install | already present |
| 2 | `backend/.env` recreate | file exists |
| 3 | `bun install` | node_modules present |
| 4 | client + admin builds | `.next/BUILD_ID` present |
| 5 | PM2 start (4 procs) | already running → restart |
| 6 | Health checks (API/WEB/ADMIN/AUTH/POS) | — |

Flags:
- `--force-build` — fresh rebuild
- `--no-build` — build skip, sirf start

## Watchdog (crash self-healing)

`bootstrap.sh` ek 4th PM2 process bhi start karta hai: **stellora-watchdog**

- Har 5 minute teeno services ka health check karta hai
- Koi process down → khud restart (build missing ho to pehle build)
- PM2 daemon down → resurrect
- `backend/.env` missing → bootstrap auto-run

Logs: `tail -f /tmp/stellora-watchdog.log` ya `pm2 logs stellora-watchdog`

⚠️ **Note**: Watchdog sirf process crashes handle karta hai. Full VM reset
(death of sandbox) se kuch nahi bach sakta — us case mein upar wali
one-command recovery chalani hogi.

## Agar manual kuch karna pade

```bash
pm2 ls                              # status
pm2 logs stellora-api --lines 50    # backend logs
pm2 restart stellora-web            # ek process restart
pm2 delete all && bash scripts/bootstrap.sh   # full reset
bash scripts/bootstrap.sh --force-build       # fresh build ke saath
```
