// @ts-ignore - compiled via handlebars-loader
import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import "./styles.css";

// Register widgets
import "../../widgets/invoice-status";
import "../../widgets/demo-badge";
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";

// Register custom helpers
declare const Handlebars: any;
Handlebars.registerHelper("increment", function (value: number) {
  return value + 1;
});

// ─── Last-page footer snap ────────────────────────────────────────────────────
//
// After the template is rendered, the `.dt-footer-spacer` div is expanded so
// that the footer block (Terms + Bank + Notice) is always pinned to the very
// bottom of the last A4 page, with the line-item table filling the gap.
//
// How it works:
//  1. Measure the natural rendered height of .dt-page with spacer at 0.
//  2. Round up to the next A4-page boundary (multiples of A4_HEIGHT_PX).
//  3. Set the spacer height = difference → footer snaps to the bottom.
// ─────────────────────────────────────────────────────────────────────────────

const A4_HEIGHT_PX = 1123; // A4 at 96 dpi  (210 mm × 297 mm)

function snapFooterToLastPage(): void {
  const page = document.querySelector(".dt-page") as HTMLElement | null;
  const spacer = document.querySelector(
    ".dt-footer-spacer"
  ) as HTMLElement | null;
  if (!page || !spacer) return;

  // Reset spacer so we measure the natural content height
  spacer.style.height = "0px";

  const naturalHeight = page.scrollHeight;
  if (naturalHeight <= 0) return;

  const numPages = Math.ceil(naturalHeight / A4_HEIGHT_PX);
  const targetHeight = numPages * A4_HEIGHT_PX;
  const gap = targetHeight - naturalHeight;

  if (gap > 0) {
    spacer.style.height = `${gap}px`;
  }
}

/**
 * Watches the DOM for `.dt-footer-spacer` to appear (set by the renderer
 * after it calls window.CeresTemplate and injects the HTML), then waits for
 * fonts to be ready before running the layout fix.
 */
function scheduleLayoutFix(): void {
  const observer = new MutationObserver((_mutations, obs) => {
    if (!document.querySelector(".dt-footer-spacer")) return;
    obs.disconnect();

    const fontsReady: Promise<void> =
      "fonts" in document && document.fonts?.ready
        ? (document.fonts.ready as unknown as Promise<void>)
        : Promise.resolve();

    fontsReady.then(() => {
      // Two rAF passes: first lets the browser flush layout, second measures
      requestAnimationFrame(() => {
        requestAnimationFrame(snapFooterToLastPage);
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

scheduleLayoutFix();

// ─────────────────────────────────────────────────────────────────────────────

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
