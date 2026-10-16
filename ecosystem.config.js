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
 * After code changes:   cd frontend/<app> && bun run build
 *                       pm2 restart stellora-web stellora-admin
 *
 * Usage:
 *   pm2 start ecosystem.config.js     # start / restart everything
 *   pm2 status                        # live status table
 *   pm2 logs stellora-api             # stream one app's logs
 *   pm2 stop all | pm2 delete all     # teardown
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

function which(bin, fallback) {
  try {
    return execSync(`which ${bin}`).toString().trim();
  } catch {
    return fallback;
  }
}

const BUN = which("bun", "/usr/local/bin/bun");
const NODE = which("node", "/usr/bin/node");

module.exports = {
  apps: [
    {
      name: "stellora-api",
      cwd: path.join(__dirname, "backend"),
      script: "src/server.ts",
      interpreter: BUN,
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
      cwd: path.join(__dirname, "frontend/admin"),
      script: "./node_modules/next/dist/bin/next",
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
      cwd: path.join(__dirname, "frontend/client"),
      script: "./node_modules/next/dist/bin/next",
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
