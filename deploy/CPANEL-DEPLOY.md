# Stellora — cPanel Deployment (Luveedu Cloud 3, EK domain)

Domain: **stellora.voterx.xyz** · Host: cPanel (Git™ Version Control +
Setup Node.js App + Terminal)

Sab kuch EK hi domain + EK hi Node.js app pe chalta hai:

```
https://stellora.voterx.xyz
 ├── /api/*           → backend Express   (internal :4000)
 ├── /uploads/*       → backend media     (internal :4000)
 ├── /admin-console/* → admin Next app    (internal :3001)
 └── baaki sab        → storefront Next   (Passenger ka PORT)
```

Repo root ka `passenger.js` teeno ko ek process me chalata hai. Koi subdomain
nahi, koi extra SSL nahi.

---

## Step 1 — Code laao (cPanel → Git™ Version Control)

1. Local machine se latest code push karo:
   ```bash
   git push origin main
   ```
2. cPanel → Git™ Version Control → Create → repo URL daalo → Clone.
   Default me `~/repos/Stellora` me clone hota hai. Terminal me copy karo:
   ```bash
   cp -r ~/repos/Stellora ~/stellora
   cd ~/stellora
   ```

> Tip: `node_modules` repo me nahi hai — step 3 me install hoga.

## Step 2 — Environment file (Terminal)

```bash
cd ~/stellora
cp backend/.env.example backend/.env
nano backend/.env
```

Ye values set karo:

```env
MONGODB_URI="mongodb+srv://hsscoders_db_user:...@cluster0.../stellora?retryWrites=true&w=majority"
PORT=4000
APP_URL="https://stellora.voterx.xyz"
ADMIN_BOOTSTRAP_EMAIL="admin@stellora.local"
ADMIN_BOOTSTRAP_PASSWORD="<strong-password-set-karo>"
PAYMENT_DEMO_SECRET="<koi-random-string>"
```

> **MongoDB Atlas:** Network Access me `0.0.0.0/0` (Allow from anywhere)
> add karo — cPanel server ka IP fixed nahi hota. Bina iske backend connect
> nahi hoga.

## Step 3 — Install + Build + Seed (Terminal)

```bash
cd ~/stellora
npm install                # sab dependencies (npm workspaces)
npm run build              # dono frontends (.next/)
npm run build:backend      # backend TypeScript → dist/
npm run seed               # sirf PEHLI baar (sample data)
```

Agar seed env load na kare to:
`cd backend && MONGODB_URI="<uri>" npx tsx src/seed.ts`

## Step 4 — Node.js App banao (cPanel → Setup Node.js App → Create)

| Field | Value |
|---|---|
| Node.js version | 20.x ya usse upar |
| Application mode | Production |
| Application root | `stellora` (repo root — `backend`/`frontend` Nahi) |
| Application URL | `stellora.voterx.xyz` |
| Application startup file | `passenger.js` |

### Environment variables (usi screen pe add karo):

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://...(wahi jo .env me)
APP_URL=https://stellora.voterx.xyz
ADMIN_BOOTSTRAP_PASSWORD=<wahi password>
PAYMENT_DEMO_SECRET=<random string>
```

(.env file bhi rakho — dotenv use karta hai; UI vars backup hain agar
Passenger working directory issue kare.)

Phir **Create / Restart** dabao.

## Step 5 — SSL (zaroori)

cPanel → SSL/TLS Status → **Run AutoSSL** — `stellora.voterx.xyz` ke liye
certificate lag jayega. HTTPS ke bina cookies/login nahi chalenge.

---

## Verify

1. `https://stellora.voterx.xyz/api/health` →
   `{"status":"healthy","database":"connected"}`
2. `https://stellora.voterx.xyz` → storefront products ke saath khule
3. `https://stellora.voterx.xyz/admin-console/admin` → admin console
   (login: `admin@stellora.local` + `ADMIN_BOOTSTRAP_PASSWORD`)

## Naya code deploy karna (updates)

```bash
# Local:
git push origin main
# cPanel Git™ Version Control → Pull/Deploy, phir Terminal:
cd ~/stellora && git pull
npm install && npm run build && npm run build:backend
```

Phir Setup Node.js App → **Restart**.

## Troubleshooting

- **503 / App not running** → Terminal me seedha chala ke error dekho:
  `cd ~/stellora && node passenger.js` (output me reason aayega — aam
  causes: `dist/` missing (build:backend skip hua), RAM kam, Atlas IP block).
- **`database` disconnected** → Atlas Network Access check karo (0.0.0.0/0).
- **Pehla request slow (5–15 sec)** → Passenger idle pe app band kar deta
  hai; normal shared-hosting behaviour, error nahi.
- **Admin 404** → `/admin-console` basePath ke saath kholo; `stellora.voterx.xyz/admin`
  se login hota hai jo storefront serve karta hai.
- **Login/cookie issue** → URL hamesha HTTPS ke saath, `APP_URL` exact match.
- **RAM** — teen apps ek process me ~1 GB+ maangte hain; Cloud 3 me theek
  chalega, agar OOM ho to Terminal me `free -m` se check karo.
