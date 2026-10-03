#!/usr/bin/env node
// Local stand-in for the dibella PDF service, to check print pagination.
//
// Loads a template from a running dev server with a cached payload, hides
// `.no-dibella` (as dibella does), draws the payload's letterhead and footer
// images in 200px top/bottom bands on every page (dibella's behaviour when the
// "Show only on first/last page" boxes are off), and writes an A4 PDF.
//
//   node .agent/skills/print-page-fit/dibella-sim.cjs \
//     --template=sami-contracting --payload=/path/payload.json \
//     --items=40 --out=/path/out.pdf [--flags] [--no-emulate] [--port=1337]
//
// --items=N    repeat the first line item N times (build a multi-page document)
// --flags      letterHeadOnFirstPage + footerOnLastPage on: no bands, the
//              template prints its own letterhead/footer in the flow
// --no-emulate print straight to PDF; default switches media to print first.
//              Dibella's order is unknown, so test both.
const { createRequire } = require("module");
const path = require("path");
const fs = require("fs");

const repo = path.resolve(__dirname, "../../..");
const { chromium } = createRequire(path.join(repo, "package.json"))(
  "playwright-core"
);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const BAND = 200;

(async () => {
  if (!args.template || !args.payload || !args.out) {
    console.error("Usage: --template=<name> --payload=<file> --out=<pdf> [--items=N] [--flags] [--no-emulate]");
    process.exit(2);
  }
  const doc = JSON.parse(fs.readFileSync(args.payload, "utf8"));
  if (args.flags) {
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      Object.keys(o).forEach((k) => {
        if (k === "pdfOptions" && o[k] && typeof o[k] === "object") {
          o[k].letterHeadOnFirstPage = true;
          o[k].footerOnLastPage = true;
        } else walk(o[k]);
      });
    };
    walk(doc);
  }
  if (args.items && Array.isArray(doc.items) && doc.items.length) {
    const first = JSON.stringify(doc.items[0]);
    doc.items = Array.from({ length: Number(args.items) }, (_, i) => ({
      ...JSON.parse(first),
      _id: `sim-item-${i}`,
    }));
  }

  const toDataUrl = async (url) => {
    if (!url) return "";
    const res = await fetch(url);
    const type = res.headers.get("content-type") || "image/png";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  };
  const band = (src) =>
    src
      ? `<div style="width:100%;margin:0 4mm;-webkit-print-color-adjust:exact"><img src="${src}" style="width:100%;max-height:${BAND - 10}px;object-fit:contain;display:block"/></div>`
      : "<span></span>";

  const api = "https://api.example.test/invoices/sim";
  const b64 = (s) => encodeURIComponent(Buffer.from(s).toString("base64"));
  const url = `http://localhost:${args.port || 1337}/?template=${b64(args.template)}&apiUrl=${b64(api)}&isDibellaMode=1`;

  const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  const page = await (
    await browser.newContext({
      // Dibella's viewport is taken to be the printable area (page less bands).
      viewport: { width: 794, height: args.flags ? 1123 : 1123 - 2 * BAND },
    })
  ).newPage();
  await page.route(
    (u) => u.toString().startsWith(api),
    (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(doc) })
  );
  await page.goto(url);
  await page.waitForFunction(
    () => {
      const el = document.getElementById("documentOutput");
      return el && !el.classList.contains("loading-message");
    },
    undefined,
    { timeout: 60000 }
  );
  await page.addStyleTag({ content: ".no-dibella{display:none !important}" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; }))
    );
  });
  if (!args["no-emulate"]) await page.emulateMedia({ media: "print" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: !args.flags,
    headerTemplate: band(await toDataUrl(doc.letterHead)),
    footerTemplate: band(await toDataUrl(doc.letterHeadFooter)),
    margin: args.flags
      ? { top: "0", bottom: "0", left: "4mm", right: "4mm" }
      : { top: `${BAND}px`, bottom: `${BAND}px`, left: "4mm", right: "4mm" },
  });
  fs.writeFileSync(args.out, pdf);
  await browser.close();
  console.log(`wrote ${args.out}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
