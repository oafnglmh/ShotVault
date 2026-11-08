// Copies dist/index.html to every route a visitor can open directly (QR links, /admin, a refresh),
// so the SPA loads even on static hosts that have no rewrite rule (e.g. Render without the dashboard
// "/* → /index.html" rewrite). Table routes come from the published public/config/venue.json, which is
// redeployed whenever tables change, so newly added tables get their pages on that same deploy.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const dist = "dist";
const index = join(dist, "index.html");

const ADMIN = ["", "tables", "cameras", "assign", "qr", "ezviz", "status"];
const TABLE = ["", "live", "recordings", "editor"];

let tableIds = [];
try {
  const venue = JSON.parse(readFileSync("public/config/venue.json", "utf8"));
  tableIds = (venue.tables ?? []).map((t) => t.id).filter((id) => /^[A-Z0-9_-]{2,32}$/.test(id));
} catch (e) {
  console.warn(`spa-fallback: could not read venue.json (${e.message}); only /admin and /scan get pages`);
}

const routes = [
  "scan",
  ...ADMIN.map((p) => join("admin", p)),
  ...tableIds.flatMap((id) => TABLE.map((p) => join("play", id, p))),
];

for (const route of routes) {
  const target = join(dist, route, "index.html");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(index, target);
}
// Many static hosts (Render included, when configured) serve 404.html for unknown paths.
copyFileSync(index, join(dist, "404.html"));

console.log(`spa-fallback: wrote ${routes.length + 1} entry pages (${tableIds.length} tables)`);
