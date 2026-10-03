#!/usr/bin/env node
// Rasterize every page of a PDF to PNG.
//
//   node .agent/skills/print-page-fit/pdf2png.cjs in.pdf out/prefix [--scale=1.5]
//   -> out/prefix-1.png, out/prefix-2.png, …   (prints the page count)
//
// Renders with pdf.js inside the Chromium the repo already drives through
// playwright-core, so nothing new is installed. pdf.js itself is loaded from
// the jsDelivr CDN, so this needs network access.
const { createRequire } = require("module");
const path = require("path");
const fs = require("fs");

const repo = path.resolve(__dirname, "../../..");
const { chromium } = createRequire(path.join(repo, "package.json"))(
  "playwright-core"
);

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build";

(async () => {
  const [input, prefix] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const scaleArg = process.argv.find((a) => a.startsWith("--scale="));
  const scale = scaleArg ? Number(scaleArg.split("=")[1]) : 1.5;
  if (!input || !prefix) {
    console.error("usage: pdf2png.cjs <in.pdf> <out-prefix> [--scale=1.5]");
    process.exit(2);
  }

  const data = fs.readFileSync(input).toString("base64");
  const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  const page = await browser.newPage();
  // A real origin, so the module import and its worker are allowed.
  await page.goto("about:blank");
  const pages = await page.evaluate(
    async ({ base, b64, s }) => {
      const pdfjs = await import(`${base}/pdf.min.mjs`);
      pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      const out = [];
      for (let n = 1; n <= doc.numPages; n += 1) {
        // eslint-disable-next-line no-await-in-loop
        const pdfPage = await doc.getPage(n);
        const viewport = pdfPage.getViewport({ scale: s });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // eslint-disable-next-line no-await-in-loop
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        out.push(canvas.toDataURL("image/png").split(",")[1]);
      }
      return out;
    },
    { base: PDFJS, b64: data, s: scale }
  );
  pages.forEach((png, i) => {
    fs.writeFileSync(`${prefix}-${i + 1}.png`, Buffer.from(png, "base64"));
  });
  await browser.close();
  console.log(pages.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
