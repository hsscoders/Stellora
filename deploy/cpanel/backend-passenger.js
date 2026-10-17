/**
 * Stellora backend — Phusion Passenger / cPanel "Application Manager" startup file.
 *
 * Setup (cPanel → Setup Node.js App):
 *   Application root:   <path to>/backend
 *   Application URL:    api.yourdomain.com (subdomain)
 *   Startup file:       passenger.js
 *   Run "Install Dependencies" (npm) in the app root, then:
 *     source /home/<user>/nodevenv/<app>/20/bin/activate && cd <app root>
 *     npm run build          # compiles TypeScript to dist/
 *
 * Passenger sets PORT automatically — the Express server reads it via env.ts.
 */
process.chdir(__dirname);
require("./dist/server.js");
