/**
 * Stellora — single-app cPanel deployment (ONE domain, ONE Node.js app).
 *
 * cPanel → Setup Node.js App:
 *   Application root:   stellora          (repository root)
 *   Application URL:    stellora.voterx.xyz
 *   Startup file:       passenger.js
 *
 * This one process runs the entire stack:
 *   - backend Express API on internal :4000  (backend/dist/server.js)
 *   - admin Next.js app on internal :3001    (serves /admin-console)
 *   - storefront Next.js app on Passenger's PORT — it internally proxies
 *     /api/*, /uploads/* and /admin-console/* to the two processes above,
 *     so the browser only ever talks to ONE origin. No subdomains needed.
 *
 * Before first start (Terminal):
 *   cd ~/stellora
 *   npm install
 *   npm run build          # both frontends (.next)
 *   npm run build:backend  # backend dist/
 *
 * Environment variables (cPanel app UI or backend/.env):
 *   MONGODB_URI, APP_URL=https://stellora.voterx.xyz, NODE_ENV=production
 */
process.chdir(__dirname);

const { spawn } = require("child_process");
const { createServer } = require("http");
const path = require("path");

const ROOT = __dirname;
const BACKEND_PORT = 4000;
const ADMIN_PORT = 3001;
const PORT = process.env.PORT || 3000;

// --- 1) Backend API as a child process (Express reads PORT=4000) ----------
const backend = spawn(process.execPath, [path.join(ROOT, "backend", "dist", "server.js")], {
  cwd: path.join(ROOT, "backend"),
  env: { ...process.env, PORT: String(BACKEND_PORT) },
  stdio: ["ignore", "inherit", "inherit"],
});
backend.on("exit", (code) => console.log(`[stellora-api] exited with code ${code}`));

// --- 2) Admin console (Next.js, basePath /admin-console) on :3001 ---------
const next = require("next");

const adminApp = next({ dev: false, dir: path.join(ROOT, "frontend", "admin") });
const adminHandle = adminApp.getRequestHandler();

// --- 3) Storefront on Passenger's PORT, proxying to 1) and 2) -------------
const webApp = next({ dev: false, dir: path.join(ROOT, "frontend", "client") });
const webHandle = webApp.getRequestHandler();

Promise.all([adminApp.prepare(), webApp.prepare()])
  .then(() => {
    createServer((req, res) => adminHandle(req, res)).listen(ADMIN_PORT, () => {
      console.log(`[stellora-admin] internal port ${ADMIN_PORT}`);
    });
    createServer((req, res) => webHandle(req, res)).listen(PORT, () => {
      console.log(`[stellora-web] serving everything on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[stellora] failed to start:", err);
    process.exit(1);
  });

// Passenger sends SIGTERM on stop/restart — take the child down cleanly.
process.on("SIGTERM", () => {
  backend.kill("SIGTERM");
  process.exit(0);
});
