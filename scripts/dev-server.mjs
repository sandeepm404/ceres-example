/**
 * Static file server for local template preview.
 *
 * Serves the built `dist/` folder so the renderer can load its manifests over
 * http (opening dist/index.html via file:// fails — fetch() rejects file URLs).
 *
 * Two things make `webpack --watch` actually show up in the browser:
 *
 *   1. Version rewriting. The dev bridge pins the template URL to a versioned
 *      manifest path (…/templates/fitking/1.0.9/manifest.json), and every old
 *      version folder stays on disk — so a rebuilt 1.0.10 would never be loaded
 *      by an already-open tab. Requests for a stale version are redirected to
 *      whatever templates/<name>/manifest.json currently points at.
 *   2. Live reload. dist/ is watched; when a rebuild lands, every open page is
 *      told to reload via SSE.
 *
 *   node scripts/dev-server.mjs            # http://localhost:4000
 *   PORT=5000 node scripts/dev-server.mjs
 *   CERES_PIN_VERSION=1 node …            # serve the exact version requested
 *   CERES_NO_RELOAD=1 node …              # no live reload, no injected script
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "localhost";
const PIN_VERSION = Boolean(process.env.CERES_PIN_VERSION);
const LIVE_RELOAD = !process.env.CERES_NO_RELOAD;

const EVENTS_PATH = "/__ceres-dev/events";
const VERSIONED_ASSET = /^\/templates\/([^/]+)\/(\d+\.\d+\.\d+)\/(.+)$/;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const RELOAD_SNIPPET = `
<script>
  (function () {
    if (!window.EventSource) return;
    var source = new EventSource(${JSON.stringify(EVENTS_PATH)});
    source.addEventListener("rebuild", function () {
      console.log("[ceres-dev] rebuild detected, reloading");
      window.location.reload();
    });
  })();
</script>
`;

const listTemplates = () => {
  try {
    return fs
      .readdirSync(path.join(ROOT, "templates"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const currentVersion = (templateName) => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "templates", templateName, "manifest.json"), "utf8")
    );
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
};

/** Point a pinned/stale version path at the newest build of that template. */
const resolveLatestVersion = (requestPath) => {
  if (PIN_VERSION) return requestPath;

  const match = requestPath.match(VERSIONED_ASSET);
  if (!match) return requestPath;

  const [, templateName, requestedVersion, asset] = match;
  const latest = currentVersion(templateName);
  if (!latest || latest === requestedVersion) return requestPath;

  const rewritten = `/templates/${templateName}/${latest}/${asset}`;
  if (!fs.existsSync(path.join(ROOT, rewritten))) return requestPath;

  console.log(`  ${templateName} ${requestedVersion} -> ${latest}  (${asset})`);
  return rewritten;
};

const clients = new Set();

const broadcastRebuild = () => {
  for (const client of clients) {
    client.write("event: rebuild\ndata: {}\n\n");
  }
  if (clients.size) {
    console.log(`  rebuild -> reloading ${clients.size} page(s)`);
  }
};

const watchDist = () => {
  if (!LIVE_RELOAD || !fs.existsSync(ROOT)) return;

  let timer = null;
  try {
    fs.watch(ROOT, { recursive: true }, () => {
      // webpack writes many files per build; collapse them into one reload
      clearTimeout(timer);
      timer = setTimeout(broadcastRebuild, 400);
    });
  } catch (error) {
    console.warn(`Live reload unavailable (${error.message}) — refresh manually after a rebuild.`);
  }
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Cache-Control": "no-store, must-revalidate",
    ...headers,
  });
  res.end(body);
};

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);

  if (requestPath === EVENTS_PATH) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let filePath = path.join(ROOT, resolveLatestVersion(requestPath));

  // Never serve anything outside dist/
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    send(res, 404, `Not found: ${requestPath}\n\nHas the project been built yet? Run: npm run build`, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";

  if (extension === ".html" && LIVE_RELOAD) {
    const html = fs.readFileSync(filePath, "utf8");
    const injected = html.includes("</body>")
      ? html.replace("</body>", `${RELOAD_SNIPPET}</body>`)
      : html + RELOAD_SNIPPET;
    send(res, 200, injected, { "Content-Type": contentType });
    return;
  }

  send(res, 200, fs.readFileSync(filePath), { "Content-Type": contentType });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try: PORT=${PORT + 1} npm run serve`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;

  if (!fs.existsSync(ROOT)) {
    console.log(`dist/ does not exist yet — run "npm run build" before loading a page.\n`);
  }

  console.log(`Ceres preview server running at ${base}`);
  console.log(
    LIVE_RELOAD
      ? "Live reload on, stale template versions redirect to the newest build.\n"
      : "Live reload off.\n"
  );

  const templates = listTemplates();
  if (templates.length) {
    console.log("Templates (first sample in samples.json loads automatically):");
    for (const name of templates) {
      console.log(`  ${name.padEnd(22)} ${base}/?devMode=1&template=${name}`);
    }
    console.log(
      "\nUse the picker in the bottom-right corner to switch template or sample,\nor append &apiUrl=<base64-encoded-api-url> to load a specific document.\n"
    );
  }

  watchDist();
});
