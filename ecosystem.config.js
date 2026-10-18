/**
 * Stellora — PM2 process manager config (production).
 *
 * Usage:
 *   npm run build          # build both Next.js apps first
 *   npm run build:backend  # compile backend TS to dist/
 *   pm2 start ecosystem.config.js
 *   pm2 logs               # unified logs
 *   pm2 reload ecosystem.config.js   # zero-downtime restart after updates
 *
 * All three apps run from the compiled/dev sources with auto-restart.
 * Ports: api 4000 · storefront 3000 · admin 3001 (proxied through the storefront).
 */
module.exports = {
  apps: [
    {
      name: "stellora-api",
      cwd: __dirname + "/backend",
      // Use compiled output when available (npm run build:backend), else tsx dev runner.
      script: __dirname + "/backend/dist/server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      out_file: "./logs/pm2-api.out.log",
      error_file: "./logs/pm2-api.err.log",
      time: true,
    },
    {
      name: "stellora-web",
      cwd: __dirname + "/frontend/client",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      out_file: "./logs/pm2-web.out.log",
      error_file: "./logs/pm2-web.err.log",
      time: true,
    },
    {
      name: "stellora-admin",
      cwd: __dirname + "/frontend/admin",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      out_file: "./logs/pm2-admin.out.log",
      error_file: "./logs/pm2-admin.err.log",
      time: true,
    },
  ],
};
