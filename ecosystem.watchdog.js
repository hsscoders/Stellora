/**
 * Stellora Watchdog — PM2-managed self-healing loop.
 *
 * Har 5 minute check karta hai: api/web/admin online hain ya nahi.
 * Koi process down ho to khud restart/build karke restore karta hai.
 * PM2 khud is watchdog ko crash hone par restart karta hai — double safety.
 *
 * Start:  pm2 start ecosystem.watchdog.js
 * Logs:   pm2 logs stellora-watchdog   |   tail /tmp/stellora-watchdog.log
 */
module.exports = {
  apps: [
    {
      name: "stellora-watchdog",
      script: "scripts/watchdog.sh",
      args: "--daemon",
      interpreter: "bash",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000,
      out_file: "/tmp/stellora-watchdog-pm2.log",
      error_file: "/tmp/stellora-watchdog-pm2-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
