/**
 * Stellora — PM2 process management for the full stack.
 *
 *   stellora-api   Express + Mongoose backend (MongoDB Atlas)  -> :4000
 *   stellora-admin Next.js admin console (dev)                  -> :3001
 *   stellora-web   Next.js customer storefront (dev)            -> :3000
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
      env: { NODE_ENV: "development", PORT: "4000" },
      out_file: ".backend.log",
      error_file: ".backend-error.log",
      time: true,
      max_restarts: 20,
      restart_delay: 2000,
    },
    {
      name: "stellora-admin",
      cwd: path.join(__dirname, "frontend/admin"),
      script: "./node_modules/next/dist/bin/next",
      args: "dev -p 3001",
      interpreter: NODE,
      env: { NODE_ENV: "development", BACKEND_URL: "http://127.0.0.1:4000" },
      out_file: ".admin.log",
      error_file: ".admin-error.log",
      time: true,
      kill_timeout: 8000,
      max_restarts: 20,
      restart_delay: 2000,
    },
    {
      name: "stellora-web",
      cwd: path.join(__dirname, "frontend/client"),
      script: "./node_modules/next/dist/bin/next",
      args: "dev -p 3000",
      interpreter: NODE,
      env: { NODE_ENV: "development", BACKEND_URL: "http://127.0.0.1:4000" },
      out_file: ".frontend.log",
      error_file: ".frontend-error.log",
      time: true,
      kill_timeout: 8000,
      max_restarts: 20,
      restart_delay: 2000,
    },
  ],
};
