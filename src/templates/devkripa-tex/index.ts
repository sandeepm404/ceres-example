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

// ─── DOM Pagination ──────────────────────────────────────────────────────────
// To provide a true "PDF Viewer" experience on the web where the user sees
// discrete A4 pages, we must physically paginate the DOM. 
// This script runs once the template is rendered and splits the table rows 
// across multiple `.dt-page` containers.
// ─────────────────────────────────────────────────────────────────────────────

function paginateTable(): void {
  const shell = document.querySelector(".dt-shell");
  const originalPage = document.querySelector(".dt-page") as HTMLElement;
  if (!shell || !originalPage) return;

  const bottomContent = originalPage.querySelector(".dt-bottom-content");
  if (bottomContent) bottomContent.remove();

  const itemsBody = originalPage.querySelector(".dt-items-body");
  if (!itemsBody) return;

  // Remove spacer row during measurement
  const spacerRow = originalPage.querySelector(".dt-spacer-row");
  if (spacerRow) spacerRow.remove();

  const rows = Array.from(itemsBody.querySelectorAll("tr"));
  itemsBody.innerHTML = "";

  let currentPage = originalPage;
  let currentItemsBody = itemsBody;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    currentItemsBody.appendChild(row);

    // If page overflows and we have at least 1 row on this page
    if (currentPage.scrollHeight > currentPage.clientHeight && currentItemsBody.children.length > 1) {
      // Remove the row that caused overflow
      row.remove();
      
      // Create a new page clone
      const newPage = originalPage.cloneNode(true) as HTMLElement;
      
      // Strip out the company header & info row to save space on subsequent pages
      newPage.querySelector(".dt-company-header")?.remove();
      newPage.querySelector(".dt-info-row")?.remove();
      newPage.querySelector(".dt-invoice-title-bar")?.remove();
      
      // Clear the cloned table body
      const newItemsBody = newPage.querySelector(".dt-items-body") as HTMLElement;
      if (newItemsBody) newItemsBody.innerHTML = "";
      
      // Insert the new page before the letterhead footer
      const footer = document.querySelector(".dt-letterhead-footer");
      if (footer) {
        shell.insertBefore(newPage, footer);
      } else {
        shell.appendChild(newPage);
      }
      
      currentPage = newPage;
      currentItemsBody = newItemsBody;
      
      // Append the overflowed row to the new page
      currentItemsBody.appendChild(row);
    }
  }

  // Append bottom content to the last page
  if (bottomContent) {
    currentPage.appendChild(bottomContent);
    
    // Check if bottom content caused an overflow
    if (currentPage.scrollHeight > currentPage.clientHeight) {
      bottomContent.remove();
      
      const newPage = originalPage.cloneNode(true) as HTMLElement;
      newPage.querySelector(".dt-company-header")?.remove();
      newPage.querySelector(".dt-info-row")?.remove();
      newPage.querySelector(".dt-invoice-title-bar")?.remove();
      
      const newItemsBody = newPage.querySelector(".dt-items-body") as HTMLElement;
      if (newItemsBody) newItemsBody.innerHTML = "";
      
      newPage.appendChild(bottomContent);
      
      const footer = document.querySelector(".dt-letterhead-footer");
      if (footer) {
        shell.insertBefore(newPage, footer);
      } else {
        shell.appendChild(newPage);
      }
      currentPage = newPage;
    }
  }

  // Restore the spacer row to all pages so the table stretches cleanly
  if (spacerRow) {
    const allPages = document.querySelectorAll(".dt-page");
    allPages.forEach(page => {
      const body = page.querySelector(".dt-items-body");
      if (body) {
        body.appendChild(spacerRow.cloneNode(true));
      }
    });
  }
}

/**
 * Run pagination after fonts load to ensure height calculations are accurate.
 */
function schedulePagination(): void {
  const fontsReady: Promise<void> =
    "fonts" in document && document.fonts?.ready
      ? (document.fonts.ready as unknown as Promise<void>)
      : Promise.resolve();

  fontsReady.then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(paginateTable);
    });
  });
}

schedulePagination();

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
