# Stellora — Render par Live Karne ki Guide (Hinglish)

Repo me **`render.yaml` (root)** ready hai — isse Render pe deploy karna
almost one-click ho jata hai. Neeche dono tarike (Option A recommended).

---

## Option A — Single Service (RECOMMENDED, free tier friendly)

Ek hi Render web service me **backend + storefront + admin** saath chalte
hain. Browser ko sirf storefront dikhta hai; API aur admin internally
proxy hote hain (same-origin, cookies bina CORS jhanjhat). Free tier ke
750 hours/month me ek service pura mahina chal sakti hai.

### Steps

1. **Code GitHub par push karo**
   ```bash
   git add render.yaml DEPLOY_RENDER.md scripts/
   git commit -m "Render deploy setup"
   git push
   ```

2. **Render Blueprint deploy**
   - https://dashboard.render.com kholo → **New +** → **Blueprint**
   - Apna GitHub account connect karo → repo `hsscoders/Stellora` select karo
   - Render `render.yaml` padhkar services detect kar lega
   - Jo env vars `sync: false` hain unki values daalo (MySQL edition):
     - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` → apna external MySQL
       (PlanetScale / Aiven / Railway MySQL / apna server — Render free me
       managed MySQL nahi hai; sirf Postgres hai, isliye external MySQL lo)
     - `ADMIN_BOOTSTRAP_PASSWORD` → strong password
     - `DEMO_CUSTOMER_PASSWORD` → strong password
   - **Apply** dabao → build + deploy shuru (5-8 min)

3. **URL set karo**
   - Deploy ke baad Render jo URL dega (e.g. `https://stellora.onrender.com`)
     wahi `APP_URL` env var me daalna render.yaml me likhe URL ki jagah
     (ya dashboard → Environment → `APP_URL` edit karke redeploy)

4. **Verify**
   ```
   https://<tumhara-app>.onrender.com/                  → storefront
   https://<tumhara-app>.onrender.com/admin/login       → admin login
   https://<tumhara-app>.onrender.com/api/health        → {"status":"healthy",...}
   ```

5. **Schema + data:** `preDeployCommand` har deploy pe `prisma migrate deploy`
   chalata hai. Data ke liye: pehli baar Mongo se import karna ho to Render
   Shell me `MIGRATE_MONGODB_URI=... npm run db:migrate:mongo`, fresh start to
   `npx tsx src/seed.ts`.

### Logins (wahi jo sandbox me hain)
- Admin: `admin@stellora.local` / `Admin@12345` → `/admin/login`
- Customer: `customer@stellora.local` / `Customer@12345`

---

## Option B — 3 Alag Services (better isolation, zyada hours khayegi)

Free tier **750 hrs/month total** hain; 3 services sada chalengi to
~10 din me limit khatam ho jayegi. Phir bhi karna ho to:

Render dashboard → **New +** → **Web Service** (3 baar, same repo):

| Service | Root Directory | Build Command | Start Command |
|---|---|---|---|
| `stellora-api` | `backend` | `npm install` | `npm run start` |
| `stellora-web` | `frontend/client` | `npm install && npm run build` | `npx next start -p $PORT` |
| `stellora-admin` | `frontend/admin` | `npm install && npm run build` | `npx next start -p $PORT` |

### Env vars

**stellora-api (MySQL edition):**
```
DB_HOST=<mysql-host>
DB_PORT=3306
DB_NAME=Stellora
DB_USER=Stellora
DB_PASSWORD=<real-password>
APP_URL=https://stellora-web.onrender.com
ORIGIN_SUFFIXES=.onrender.com
ADMIN_BOOTSTRAP_EMAIL=admin@stellora.local
ADMIN_BOOTSTRAP_PASSWORD=Admin@12345
DEMO_CUSTOMER_EMAIL=customer@stellora.local
DEMO_CUSTOMER_PASSWORD=Customer@12345
PAYMENT_DEMO_SECRET=stellora_demo_secret_2026
NODE_VERSION=22.11.0
```

**stellora-web:**
```
BACKEND_URL=https://stellora-api.onrender.com
ADMIN_URL=https://stellora-admin.onrender.com
APP_URL=https://stellora-web.onrender.com
NODE_VERSION=22.11.0
```

**stellora-admin:**
```
BACKEND_URL=https://stellora-api.onrender.com
NODE_VERSION=22.11.0
```

> **Note:** `ADMIN_URL` isliye zaroori hai kyunki storefront ke rewrites
> `/admin-console/*` ko admin service par bhejte hain — is tarah admin
> bhi same-origin (storefront ke domain) se hi khulega, cookies chalengi.

---

## Important baatein

1. **Free tier spin-down:** 15 min inactive hone par service so jati hai
   (pehli request ~50s late). Hamesha jagi rakhni ho to apne live URLs
   `scripts/keepalive-urls.txt` me daal do (Render wali commented lines
   uncomment karo) — local keepalive unhe bhi ping karega. **Lekin
   dhyan rahe:** Render free hours 750/month hain, keepalive se hours
   jaldi khatam honge — Option A (single service) use karo to safe hai.

2. **CSRF/Origin:** Backend `ORIGIN_SUFFIXES=.onrender.com` set hai
   render.yaml me — preview/admin sab origins pass honge.

3. **MySQL network access:** external MySQL (PlanetScale/Aiven) me Render ke
   IPs allow karo. Apne VPS ka MySQL use karna ho to 3306 public MAT kholo —
   SSH tunnel ya provider private network use karo.

4. **`PORT` env var:** Render khud `PORT` set karta hai (default 10000).
   Start commands `$PORT` use karte hain, isliye koi conflict nahi.

5. **Payments:** Demo gateway by default on hai (fake card checkout).
   Razorpay live karna ho to dashboard → Environment me
   `PAYMENTS_ENABLED=true`, `PAYMENT_PROVIDER=razorpay` + real keys daalo.

6. **Build OOM aaye** (free tier 512MB RAM): render.yaml me
   `NODE_OPTIONS=--max-old-space-size=460` already set hai. Phir bhi
   build fail ho to build locally karke `npm run start` test karo, ya
   Starter plan ($7/mo) lo.
