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

// ─── Print Layout Fix ─────────────────────────────────────────────────────────
// On web preview, the template flows continuously without forced page breaks,
// ensuring the footer appears right after the totals block without awkward gaps.
//
// But on print, we want the template divided neatly into A4 pages, with the
// line-item table stretching to the bottom of the last page so that the footer
// is snapped perfectly to the bottom.
//
// This listens to standard print events (which Lydia's bridge triggers) and 
// forces the `.dt-spacer-row` inside the table to fill the remaining gap 
// up to the next A4 page boundary.
// ─────────────────────────────────────────────────────────────────────────────

const A4_HEIGHT_PX = 1123; // A4 at 96 dpi  (210 mm × 297 mm)

function applyPrintPaginationFix(): void {
  const page = document.querySelector(".dt-page") as HTMLElement | null;
  const spacerRow = document.querySelector(".dt-spacer-row") as HTMLElement | null;
  const spacerCell = document.querySelector(".dt-spacer-row td") as HTMLElement | null;
  
  if (!page || !spacerRow || !spacerCell) return;

  // Temporarily reset height to measure natural content accurately
  spacerRow.style.height = "auto";
  spacerCell.style.height = "auto";
  
  // Force a layout flush so scrollHeight is up to date
  page.getBoundingClientRect();

  const naturalHeight = page.scrollHeight;
  if (naturalHeight <= 0) return;

  const numPages = Math.ceil(naturalHeight / A4_HEIGHT_PX);
  const targetHeight = numPages * A4_HEIGHT_PX;
  const gap = targetHeight - naturalHeight;

  // If there's a gap, force the table spacer row to fill it
  if (gap > 0) {
    spacerRow.style.height = `${gap}px`;
    spacerCell.style.height = `${gap}px`;
  }
}

function removePrintPaginationFix(): void {
  const spacerRow = document.querySelector(".dt-spacer-row") as HTMLElement | null;
  const spacerCell = document.querySelector(".dt-spacer-row td") as HTMLElement | null;
  
  // Revert back to CSS-driven layout for web preview
  if (spacerRow) spacerRow.style.height = "";
  if (spacerCell) spacerCell.style.height = "";
}

window.addEventListener("beforeprint", applyPrintPaginationFix);
window.addEventListener("afterprint", removePrintPaginationFix);

// ─────────────────────────────────────────────────────────────────────────────

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
