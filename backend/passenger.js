/**
 * Stellora backend — cPanel "Setup Node.js App" (Phusion Passenger) startup file.
 *
 * Application root: stellora/backend
 * Startup file:     passenger.js
 * Passenger injects PORT automatically; the Express server reads it via env.ts.
 * Requires `npm run build` first (compiles TypeScript to dist/).
 */
process.chdir(__dirname);
require("./dist/server.js");
