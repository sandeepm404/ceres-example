/**
 * The in-page audit that `scripts/render.mjs` runs against a rendered document.
 *
 * Everything here is stringified and evaluated inside the browser, so it must
 * stay self-contained: no imports, no closure over module scope. It runs twice
 * per render — once under screen media, once under print — because the two
 * disagree in exactly the places that matter. Print-only custom properties
 * (`--tpl-font-size-*` redefined inside `@media print`) never appear as resolved
 * declarations in a screen DOM, which is why a snapshot test cannot see a
 * template breaking the 10px floor and this can.
 */

/** Minimum legible font size in px, screen or print. See design-to-template §4a. */
export const FONT_SIZE_FLOOR = 10;

/** Text that means a binding resolved to nothing rather than to a value. */
const PLACEHOLDER_PATTERN =
  /(^|[\s>(\[:,])(undefined|NaN|\[object Object\])([\s<)\]:,.]|$)/;

export const AUDIT_FN = /* js */ `(options) => {
  const FLOOR = options.fontSizeFloor;
  const PLACEHOLDER = new RegExp(options.placeholderPattern);
  const root = document.getElementById("documentOutput");

  const MAX_PER_CHECK = 25;

  /** Short, human-readable path — enough to find the node, not a full selector. */
  const describe = (el) => {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node !== root && depth < 3; depth += 1) {
      const cls = (node.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean);
      parts.unshift(node.tagName.toLowerCase() + (cls.length ? "." + cls[0] : ""));
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const snippet = (text) => {
    const flat = String(text).replace(/\\s+/g, " ").trim();
    return flat.length > 90 ? flat.slice(0, 90) + "…" : flat;
  };

  /** Text owned directly by this element, not by its descendants. */
  const ownText = (el) => {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue;
    }
    return out.trim();
  };

  if (!root) {
    return { fatal: "No #documentOutput element on the page." };
  }

  const errorEl = root.querySelector(".error-message");

  /* ---- placeholders: a binding that resolved to nothing ------------------ */
  const placeholders = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    if (!text || !text.trim()) continue;
    if (!PLACEHOLDER.test(text)) continue;
    if (placeholders.length >= MAX_PER_CHECK) break;
    placeholders.push({
      where: describe(n.parentElement),
      text: snippet(text),
    });
  }

  /* ---- attributes carrying the same rot (src="undefined", etc.) ---------- */
  const badAttributes = [];
  for (const el of root.querySelectorAll("[src], [href], [style]")) {
    for (const name of ["src", "href", "style"]) {
      const value = el.getAttribute(name);
      if (!value || !PLACEHOLDER.test(value)) continue;
      if (badAttributes.length >= MAX_PER_CHECK) break;
      badAttributes.push({ where: describe(el), attribute: name, value: snippet(value) });
    }
  }

  /* ---- images that did not load ----------------------------------------- */
  /* Only ones the reader can actually see. Templates routinely emit an <img>
     with no src inside a letterhead slot and hide the slot with .is-empty when
     the account has no letterhead — that is the design, not a defect.
     (No backticks anywhere in this function: it lives in a template literal.) */
  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const brokenImages = [];
  for (const img of root.querySelectorAll("img")) {
    if (img.complete && img.naturalWidth > 0) continue;
    if (!isVisible(img)) continue;
    if (brokenImages.length >= MAX_PER_CHECK) break;
    const src = img.getAttribute("src") || "";
    brokenImages.push({
      where: describe(img),
      src: src.startsWith("data:") ? src.slice(0, 40) + "… (data URI)" : snippet(src),
    });
  }

  /* ---- type below the legibility floor ----------------------------------- */
  const tinyText = [];
  const seenTiny = new Set();
  for (const el of root.querySelectorAll("*")) {
    const text = ownText(el);
    if (!text) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (!(size < FLOOR)) continue;
    const key = describe(el) + "|" + size;
    if (seenTiny.has(key)) continue;
    seenTiny.add(key);
    if (tinyText.length >= MAX_PER_CHECK) break;
    tinyText.push({ where: describe(el), fontSizePx: Math.round(size * 100) / 100, text: snippet(text) });
  }

  /* ---- content escaping the page box ------------------------------------- */
  const shell = root.firstElementChild;
  const shellRect = shell ? shell.getBoundingClientRect() : null;
  const overflow = [];
  if (shellRect) {
    for (const el of root.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const spill = Math.round(rect.right - shellRect.right);
      if (spill <= 1) continue;
      if (overflow.length >= MAX_PER_CHECK) break;
      overflow.push({ where: describe(el), spillPx: spill, text: snippet(ownText(el)) });
    }
  }

  /* ---- bordered boxes a gate emptied out --------------------------------- */
  /* A block that lost its rows to a visibility gate but kept its frame reads
     as a rendering bug on the page even though the markup is "correct".
     Table cells are excluded: an empty ruled <td> is the normal way to hold a
     column open (spacer rows, an unlabelled serial header), and including them
     buried the real findings under a dozen false positives. */
  const BLOCK_TAGS = new Set(["DIV", "SECTION", "ASIDE", "HEADER", "FOOTER", "TABLE", "P", "UL", "OL"]);
  const emptyBorderedBlocks = [];
  for (const el of root.querySelectorAll("*")) {
    if (!BLOCK_TAGS.has(el.tagName)) continue;
    const style = getComputedStyle(el);
    const borders = [
      style.borderTopWidth, style.borderRightWidth,
      style.borderBottomWidth, style.borderLeftWidth,
    ].map(parseFloat);
    if (!borders.some((w) => w > 0)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (el.textContent.trim()) continue;
    if (el.querySelector("img, svg, canvas")) continue;
    if (emptyBorderedBlocks.length >= MAX_PER_CHECK) break;
    emptyBorderedBlocks.push({
      where: describe(el),
      boxPx: Math.round(rect.width) + "x" + Math.round(rect.height),
    });
  }

  return {
    fatal: null,
    renderError: errorEl ? snippet(errorEl.textContent) : null,
    documentHeightPx: Math.round(root.scrollHeight),
    shellWidthPx: shellRect ? Math.round(shellRect.width) : null,
    placeholders,
    badAttributes,
    brokenImages,
    tinyText,
    overflow,
    emptyBorderedBlocks,
  };
}`;

export const auditOptions = {
  fontSizeFloor: FONT_SIZE_FLOOR,
  placeholderPattern: PLACEHOLDER_PATTERN.source,
};

/**
 * Checks that only make sense once, plus the per-media ones keyed by media.
 * `screen` and `print` findings are kept apart because a template legitimately
 * differs between them — merging would hide which one is broken.
 */
export const summarize = ({
  screen, print, consoleErrors, pageErrors, failedRequests, pageCount, pageSlicesTrustworthy,
}) => {
  const problems = [];
  const note = (severity, check, detail) => problems.push({ severity, check, detail });

  if (screen.fatal) note("error", "render", screen.fatal);
  if (screen.renderError) note("error", "render", screen.renderError);

  for (const err of pageErrors) note("error", "page-error", err);
  for (const err of consoleErrors) note("error", "console", err);
  for (const req of failedRequests) note("error", "request-failed", req);

  if (pageSlicesTrustworthy === false) {
    note(
      "warn",
      "pagination",
      "Chrome moved content across page breaks, so page-*.png slices are approximate — open print.pdf for the real breaks."
    );
  }

  const perMedia = { screen, print };
  for (const [media, report] of Object.entries(perMedia)) {
    if (!report || report.fatal) continue;
    for (const p of report.placeholders) {
      if (media === "print") continue; // same DOM text; only report once
      note("error", "placeholder", `${p.where} — "${p.text}"`);
    }
    for (const a of report.badAttributes) {
      if (media === "print") continue;
      note("error", "placeholder-attr", `${a.where} [${a.attribute}="${a.value}"]`);
    }
    for (const i of report.brokenImages) {
      if (media === "print") continue;
      note("error", "broken-image", `${i.where} — ${i.src}`);
    }
    for (const t of report.tinyText) {
      note("error", `font-floor:${media}`, `${t.where} — ${t.fontSizePx}px — "${t.text}"`);
    }
    for (const o of report.overflow) {
      note("warn", `overflow:${media}`, `${o.where} — +${o.spillPx}px past the page box`);
    }
    for (const b of report.emptyBorderedBlocks) {
      note("warn", `empty-box:${media}`, `${b.where} — ${b.boxPx}`);
    }
  }

  return {
    pageCount,
    errorCount: problems.filter((p) => p.severity === "error").length,
    warnCount: problems.filter((p) => p.severity === "warn").length,
    problems,
  };
};
