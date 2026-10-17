/**
 * Stellora storefront — Phusion Passenger / cPanel "Application Manager" startup file.
 *
 * Setup (cPanel → Setup Node.js App):
 *   Application root:   <path to>/frontend/client
 *   Application URL:    yourdomain.com (primary domain or subdomain)
 *   Startup file:       passenger.js
 *   Run "Install Dependencies" from the REPOSITORY ROOT (npm workspaces),
 *   then build from the repository root:  npm run build
 *
 * Environment variables (set in the cPanel app's "Environment variables"):
 *   BACKEND_URL  = https://api.yourdomain.com   (public URL of the API app)
 *   ADMIN_URL    = https://admin.yourdomain.com (public URL of the admin app)
 *   NODE_ENV     = production
 *
 * Passenger sets PORT automatically. This custom server is the standard
 * Next.js production pattern — identical behaviour to `next start`.
 */
process.chdir(__dirname);

const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`[stellora-web] ready on port ${port}`);
  });
});
