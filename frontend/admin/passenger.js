/**
 * Stellora admin console — cPanel "Setup Node.js App" (Phusion Passenger) startup file.
 *
 * Application root: stellora/frontend/admin
 * Startup file:     passenger.js
 * Serves under its basePath /admin-console — open ADMIN_URL/admin-console.
 * Requires a production build: `npm run build` from the repo root.
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
