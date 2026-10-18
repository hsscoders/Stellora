/**
 * Stellora storefront — cPanel "Setup Node.js App" (Phusion Passenger) startup file.
 *
 * Application root: stellora/frontend/client
 * Startup file:     passenger.js
 * Serves the whole site; /api and /admin-console are proxied internally to
 * BACKEND_URL / ADMIN_URL (set as environment variables in the cPanel app).
 * Requires a production build: `npm run build` from the repo root.
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
