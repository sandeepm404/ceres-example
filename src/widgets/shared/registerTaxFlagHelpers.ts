import {
  resolveDocumentTaxVisibility,
  resolveDocumentUtgst,
} from "./taxVisibility";
import { resolveDocumentTaxLabel } from "./taxRowLabels";

/* The one method this file needs off the page's Handlebars instance. */
interface HelperRegistry {
  registerHelper: (
    name: string,
    helper: (...args: unknown[]) => unknown
  ) => void;
}

/*
 * Handlebars helpers that answer "does this document show one combined tax figure, or a
 * CGST/SGST split?" from the document itself.
 *
 * A template cannot answer that on its own. Reading the inter-state flag off the root only
 * works on a domestic Indian document: a Malaysian SST or an Indonesian PPN invoice has
 * that flag false and would draw CGST and SGST columns anyway, which is the tax-summary
 * half of the REF-25603 QA report. `showIgst` is the same predicate the totals rows use, so
 * the summary tables and the rows can never disagree.
 *
 * Registration only — the decision lives in ./taxVisibility, where a test can reach it.
 */
const registerTaxFlagHelpers = (HB: HelperRegistry | undefined): void => {
  if (!HB) return;

  HB.registerHelper(
    "showIgst",
    (payload: unknown) => resolveDocumentTaxVisibility(payload).showIgst
  );

  HB.registerHelper(
    "showCgstSgst",
    (payload: unknown) => resolveDocumentTaxVisibility(payload).showCgstSgst
  );

  HB.registerHelper("showUtgst", (payload: unknown) =>
    resolveDocumentUtgst(payload)
  );

  /* `{{taxLabel @root "igst"}}` — what this document calls the tax. */
  HB.registerHelper("taxLabel", (payload: unknown, key: unknown) =>
    resolveDocumentTaxLabel(payload, key)
  );
};

export default registerTaxFlagHelpers;
