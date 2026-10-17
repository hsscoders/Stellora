/**
 * Stellora — PM2 process management for the full stack (PRODUCTION mode).
 *
 *   stellora-api   Express + Mongoose backend (MongoDB Atlas)  -> :4000
 *   stellora-admin Next.js admin console (next start)          -> :3001
 *   stellora-web   Next.js customer storefront (next start)    -> :3000
 *
 * The frontends run in production mode (`next build` + `next start`):
 * pre-compiled pages, optimized images (sharp), real caching — this is what
 * keeps the site fast and memory-stable instead of the dev server's
 * compile-on-request slowness and OOM crashes.
 *
 * The API runs TypeScript directly via tsx (Node) — no Bun required.
 * Binaries are resolved from BOTH supported install layouts:
 *   - npm workspaces install (root node_modules, hoisted)  [recommended]
 *   - per-app installs (frontend/<app>/node_modules)
 *
 * After code changes:   npm run build
 *                       pm2 restart stellora-web stellora-admin
 *
 * Usage:
 *   pm2 start ecosystem.config.js     # start / restart everything
 *   pm2 status                        # live status table
 *   pm2 logs stellora-api             # stream one app's logs
 *   pm2 stop all | pm2 delete all     # teardown
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function which(bin, fallback) {
  try {
    return execSync(`which ${bin}`).toString().trim();
  } catch {
    return fallback;
  }
}

/** First path that exists — supports hoisted (npm workspaces) and per-app installs. */
function firstExisting(...candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    "Could not locate a required binary. Run `npm install` at the repository root first."
  );
}

const NODE = which("node", "/usr/bin/node");

const clientDir = path.join(__dirname, "frontend/client");
const adminDir = path.join(__dirname, "frontend/admin");
const backendDir = path.join(__dirname, "backend");

const nextBin = (appDir) =>
  firstExisting(
    path.join(appDir, "node_modules/next/dist/bin/next"),
    path.join(__dirname, "node_modules/next/dist/bin/next")
  );

const tsxCli = firstExisting(
  path.join(backendDir, "node_modules/tsx/dist/cli.mjs"),
  path.join(__dirname, "node_modules/tsx/dist/cli.mjs")
);

module.exports = {
  apps: [
    {
      name: "stellora-api",
      cwd: backendDir,
      script: tsxCli,
      args: "src/server.ts",
      interpreter: NODE,
      env: { NODE_ENV: "production", PORT: "4000" },
      out_file: ".backend.log",
      error_file: ".backend-error.log",
      time: true,
      max_restarts: 20,
      restart_delay: 2000,
      max_memory_restart: "600M",
    },
    {
      name: "stellora-admin",
      cwd: adminDir,
      script: nextBin(adminDir),
      args: "start -p 3001",
      interpreter: NODE,
      env: { NODE_ENV: "production", BACKEND_URL: "http://127.0.0.1:4000" },
      out_file: ".admin.log",
      error_file: ".admin-error.log",
      time: true,
      kill_timeout: 8000,
      max_restarts: 20,
      restart_delay: 2000,
      max_memory_restart: "700M",
    },
    {
      name: "stellora-web",
      cwd: clientDir,
      script: nextBin(clientDir),
      args: "start -p 3000",
      interpreter: NODE,
      env: { NODE_ENV: "production", BACKEND_URL: "http://127.0.0.1:4000" },
      out_file: ".frontend.log",
      error_file: ".frontend-error.log",
      time: true,
      kill_timeout: 8000,
      max_restarts: 20,
      restart_delay: 2000,
      max_memory_restart: "700M",
    },
  ],
};
