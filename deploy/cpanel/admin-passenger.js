/**
 * Stellora admin console — Phusion Passenger / cPanel "Application Manager" startup file.
 *
 * Setup (cPanel → Setup Node.js App):
 *   Application root:   <path to>/frontend/admin
 *   Application URL:    admin.yourdomain.com (subdomain)
 *   Startup file:       passenger.js
 *   Run "Install Dependencies" from the REPOSITORY ROOT (npm workspaces),
 *   then build from the repository root:  npm run build
 *
 * Environment variables (set in the cPanel app's "Environment variables"):
 *   BACKEND_URL = https://api.yourdomain.com  (public URL of the API app)
 *   NODE_ENV    = production
 *
 * Passenger sets PORT automatically. The admin app serves under its basePath
 * /admin-console (configured in next.config.mjs) — open admin.yourdomain.com/admin-console.
 */
process.chdir(__dirname);

const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3001;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`[stellora-admin] ready on port ${port}`);
  });
});
