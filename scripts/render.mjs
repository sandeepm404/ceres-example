/**
 * Headless render of a Ceres template — the feedback loop the build previously
 * relied on a human for.
 *
 * Boots the preview server against `dist/`, loads a template with a real
 * payload, waits for the render to settle, and writes four artifacts:
 *
 *   screen.png    full-page capture at A4 width, screen media
 *   print.pdf     real A4 pagination with print CSS applied — read this to
 *                 check page breaks, repeating headers, where content lands
 *   rendered.html the template's own output, unwrapped, for grepping
 *   report.json   the render lint (scripts/renderLint.mjs), plus a summary
 *
 * Usage:
 *   node scripts/render.mjs --template=saga-engineering
 *   node scripts/render.mjs --template=fitking --sample="Long invoice"
 *   node scripts/render.mjs --template=fitking --payload=./some-payload.json
 *   node scripts/render.mjs --template=fitking --record   # cache the live payload
 *   node scripts/render.mjs --template=fitking --all-samples
 *
 * The payload is fetched live the first time and cached to `payloads/<doc>.json`
 * at the repo root when `--record` is passed — one folder for every template,
 * keyed by the document the sample URL points at, so templates sharing a sample
 * share its cache. Once recorded, renders run offline and stop depending on a
 * token that expires. `--payload=payloads/<doc>.json` replays any of them
 * through any template.
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { AUDIT_FN, auditOptions, summarize } from "./renderLint.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(REPO, "dist");
/** One cache for every template — see payloadCacheFile below. */
const PAYLOADS = path.join(REPO, "payloads");

/** A4 at 96dpi. Templates are laid out for a page, so preview them at one. */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

const RENDER_TIMEOUT_MS = 45_000;

const parseArgs = (argv) => {
  const args = { sample: null, payload: null, record: false, allSamples: false };
  for (const raw of argv) {
    const [key, ...rest] = raw.replace(/^--/, "").split("=");
    const value = rest.join("=");
    switch (key) {
      case "template": args.template = value; break;
      case "sample": args.sample = value; break;
      case "payload": args.payload = value; break;
      case "out": args.out = value; break;
      case "width": args.width = Number(value); break;
      case "record": args.record = true; break;
      case "all-samples": args.allSamples = true; break;
      case "keep-open": args.keepOpen = true; break;
      default:
        if (raw.startsWith("--")) {
          console.warn(`Unknown flag: ${raw}`);
        }
    }
  }
  return args;
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const waitForServer = async (port, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/main-manifest.json`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`Preview server did not come up on port ${port}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
};

const startServer = async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(REPO, "scripts", "dev-server.mjs")], {
    // Bind 127.0.0.1 explicitly: the server's own default of "localhost"
    // resolves to ::1 first on macOS, which the v4 probe below never sees.
    // No live reload — the injected EventSource never settles, and a rebuild
    // mid-capture would reload the page out from under the screenshot.
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", CERES_NO_RELOAD: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(`[dev-server] ${d}`));
  await waitForServer(port);
  return { port, stop: () => child.kill() };
};

/** Chrome-generated PDFs carry the page total in the page-tree /Count. */
const pdfPageCount = (buffer) => {
  const text = buffer.toString("latin1");
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length) return Math.max(...counts);
  return [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length || null;
};

const readSamples = (templateDir) => {
  const file = path.join(templateDir, "samples.json");
  if (!fs.existsSync(file)) {
    throw new Error(`No samples.json in ${path.relative(REPO, templateDir)}`);
  }
  const samples = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = Object.keys(samples);
  if (!names.length) throw new Error(`samples.json is empty in ${templateDir}`);
  return samples;
};

/** Filesystem-safe slug for a sample's display name. */
const slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sample";

/**
 * Where a sample's recorded response is cached.
 *
 * Keyed by the *document* the sample URL points at, not by the template that
 * happens to reference it, and kept in one folder at the repo root. Five
 * templates naming the same Refrens invoice therefore share one file instead
 * of each caching its own copy, and `--payload=payloads/<id>.json` replays any
 * recorded document through any template.
 */
const payloadCacheFile = (apiEndpoint) => {
  let key = "";
  try {
    const segments = new URL(apiEndpoint).pathname.split("/").filter(Boolean);
    key = segments[segments.length - 1] || "";
  } catch {
    /* not a URL — fall through to the hash below */
  }
  key = key.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!key) key = crypto.createHash("sha1").update(apiEndpoint).digest("hex").slice(0, 12);
  return path.join(PAYLOADS, `${key}.json`);
};

const renderOne = async ({ browser, port, template, sampleName, encodedUrl, args }) => {
  const templateDir = path.join(REPO, "src", "templates", template);
  const sampleSlug = slug(sampleName);
  const outDir = path.join(args.out || path.join(REPO, ".ceres-render"), template, sampleSlug);
  fs.mkdirSync(outDir, { recursive: true });

  const apiEndpoint = Buffer.from(encodedUrl, "base64").toString("utf8");
  const cacheFile = args.payload
    ? path.resolve(REPO, args.payload)
    : payloadCacheFile(apiEndpoint);
  const cached = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : null;

  const apiPath = (() => {
    try {
      return new URL(apiEndpoint).pathname;
    } catch {
      return null;
    }
  })();

  const width = args.width || A4_WIDTH_PX;
  const context = await browser.newContext({
    viewport: { width, height: A4_HEIGHT_PX },
    // 2x so the PNG is legible when read back rather than a blur of grey.
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    const text = msg.text();
    // The bare "Failed to load resource" console line names no URL, which makes
    // it useless on its own — requestfailed/response below carry the URL.
    if (msg.type() === "error" && !text.startsWith("Failed to load resource")) {
      consoleErrors.push(text.slice(0, 300));
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err.message).slice(0, 300)));
  page.on("requestfailed", (req) => {
    if (!req.url().includes("favicon")) failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() < 400 || res.url().includes("favicon")) return;
    failedRequests.push(`${res.url()} — HTTP ${res.status()}`);
  });

  const isApiRequest = (url) => apiPath && url.includes(apiPath);

  let recorded = null;
  if (cached) {
    // Offline: serve the cached document instead of the live API. This is what
    // makes a render reproducible after the sample URL's token expires.
    await page.route((url) => isApiRequest(url.toString()), (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cached) })
    );
  } else {
    page.on("response", async (res) => {
      if (!isApiRequest(res.url()) || !res.ok()) return;
      try {
        recorded = await res.json();
      } catch {
        /* not JSON — leave it */
      }
    });
  }

  // The template param is base64 by contract (commonUtils.resolveTemplateManifestUrl
  // runs it through atob). A plain name usually survives because atob throws on
  // the hyphen and the decoder falls back to the raw string — but a name that is
  // coincidentally valid base64, like "fitking", decodes to garbage instead.
  // Encoding properly is both correct and immune to that.
  const encodedTemplate = Buffer.from(template, "utf8").toString("base64");
  const url = `http://127.0.0.1:${port}/?template=${encodeURIComponent(encodedTemplate)}&apiUrl=${encodeURIComponent(encodedUrl)}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // The renderer drops `loading-message` the moment it writes innerHTML —
  // before fonts and images settle — so that gate alone is not enough.
  await page.waitForFunction(
    () => {
      const el = document.getElementById("documentOutput");
      return Boolean(el) && !el.classList.contains("loading-message");
    },
    undefined,
    { timeout: RENDER_TIMEOUT_MS }
  );

  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => { img.onload = img.onerror = resolve; }))
    );
  });

  const screenReport = await page.evaluate(`(${AUDIT_FN})(${JSON.stringify(auditOptions)})`);

  await page.screenshot({ path: path.join(outDir, "screen.png"), fullPage: true });

  const html = await page.evaluate(() => document.getElementById("documentOutput")?.innerHTML ?? "");
  fs.writeFileSync(path.join(outDir, "rendered.html"), html);

  // Print media resolves the `@media print` custom-property overrides that a
  // screen DOM never exposes — this is where a broken font floor shows up.
  await page.emulateMedia({ media: "print" });
  const printReport = await page.evaluate(`(${AUDIT_FN})(${JSON.stringify(auditOptions)})`);

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  fs.writeFileSync(path.join(outDir, "print.pdf"), pdf);

  // print.pdf holds the real pagination, but nothing in a stock macOS/Linux dev
  // box rasterizes a PDF, so the pages also come out as PNGs by slicing the
  // print-media capture on an A4 grid. That grid ignores break rules, so it is
  // only trustworthy when its slice count agrees with the PDF's page count —
  // when it doesn't, Chrome pushed content across a break and the summary says
  // so rather than letting the slices quietly lie.
  const pageCount = pdfPageCount(pdf);
  const printHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const sliceCount = Math.max(1, Math.ceil(printHeight / A4_HEIGHT_PX));
  const pageSlicesTrustworthy = pageCount == null ? null : sliceCount === pageCount;

  for (let i = 0; i < sliceCount; i += 1) {
    const y = i * A4_HEIGHT_PX;
    await page.screenshot({
      path: path.join(outDir, `page-${i + 1}.png`),
      clip: { x: 0, y, width, height: Math.min(A4_HEIGHT_PX, printHeight - y) },
      fullPage: true,
    });
  }

  await page.emulateMedia({ media: "screen" });

  if (args.record && recorded) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(recorded, null, 2));
  }

  const summary = summarize({
    screen: screenReport,
    print: printReport,
    consoleErrors,
    pageErrors,
    failedRequests,
    pageCount,
    pageSlicesTrustworthy,
  });

  fs.writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(
      {
        template,
        sample: sampleName,
        payloadSource: cached ? path.relative(REPO, cacheFile) : "live api",
        viewportWidthPx: width,
        summary,
        screen: screenReport,
        print: printReport,
        consoleErrors,
        pageErrors,
        failedRequests,
      },
      null,
      2
    )
  );

  if (!args.keepOpen) await context.close();
  return { outDir, summary, sampleName };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (!args.template) {
    console.error("Usage: node scripts/render.mjs --template=<name> [--sample=<name>] [--record]");
    process.exit(2);
  }

  const templateDir = path.join(REPO, "src", "templates", args.template);
  if (!fs.existsSync(templateDir)) {
    console.error(`No such template: ${args.template}`);
    process.exit(2);
  }
  if (!fs.existsSync(path.join(DIST, "templates", args.template))) {
    console.error(
      `${args.template} is not built. Run: npm run build:template --template=${args.template}`
    );
    process.exit(2);
  }

  const samples = readSamples(templateDir);
  const names = Object.keys(samples);
  let selected;
  if (args.allSamples) {
    selected = names;
  } else if (args.sample) {
    if (!samples[args.sample]) {
      console.error(`No sample "${args.sample}". Available: ${names.join(", ")}`);
      process.exit(2);
    }
    selected = [args.sample];
  } else {
    selected = [names[0]];
  }

  const server = await startServer();
  // `channel: "chrome"` drives the installed browser, so there is no 130MB
  // download step for anyone cloning this repo.
  const browser = await chromium.launch({ channel: "chrome" });

  let failed = false;
  try {
    for (const sampleName of selected) {
      const result = await renderOne({
        browser,
        port: server.port,
        template: args.template,
        sampleName,
        encodedUrl: samples[sampleName],
        args,
      });

      const { summary, outDir } = result;
      const rel = path.relative(REPO, outDir);
      const status = summary.errorCount ? "FAIL" : summary.warnCount ? "WARN" : "OK";
      console.log(
        `\n${status}  ${args.template} — ${sampleName}  (${summary.pageCount ?? "?"} page${summary.pageCount === 1 ? "" : "s"})`
      );
      console.log(`  ${rel}/`);
      console.log(
        `    screen.png  print.pdf  report.json  rendered.html  ` +
          `page-1..${summary.pageCount ?? "?"}.png`
      );

      if (summary.problems.length) {
        console.log("");
        for (const p of summary.problems.slice(0, 40)) {
          console.log(`  ${p.severity === "error" ? "✗" : "•"} [${p.check}] ${p.detail}`);
        }
        if (summary.problems.length > 40) {
          console.log(`  … ${summary.problems.length - 40} more in report.json`);
        }
      }
      if (summary.errorCount) failed = true;
    }
  } finally {
    await browser.close();
    server.stop();
  }

  console.log("");
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
