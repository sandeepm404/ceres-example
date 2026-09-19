/*
 * Which tax rows and tax columns a document shows.
 *
 * This is the single answer to that question. Before REF-25603 there were two, both in
 * invoiceTemplateNormalization.ts and disagreeing:
 *
 *   - the item-table column gate keyed off `taxType` + `invoiceType`
 *   - `mapped.visibility.showIgst` / `showCgstSgst` keyed off `taxName`, with no
 *     `invoiceType` term at all
 *
 * The second one is why the shipped fork's item table rendered CGST and SGST columns on a
 * quotation and on a Bill of Supply — documents that carry no tax.
 *
 * The rules match refrens.com's shared totals component
 * (lydia/src/components/widgets/invoice/balance.js), which is the behaviour customers
 * already see on 14 templates:
 *
 *   - Tax rows exist only on a tax document (`invoiceType === "INVOICE"`).
 *   - A CGST + SGST split happens only on a domestic Indian sale: the document is not
 *     inter-state and `taxType === "INDIA"` (defaulted to INDIA when absent). Everything
 *     else — inter-state, or any non-India tax type — shows the single combined row. That
 *     is exactly the reference's row gate, `!igstTax && taxType === TAX_TYPE.INDIA`
 *     (balance.js:323 for the flat rows, :448 for the aggregate rows).
 *
 *     Note what is NOT a term here: `taxName`. It appears on refrens.com only as the third
 *     argument to `getAggregateTaxTotals` (`igstTax || taxName !== 'GST'`), where it picks
 *     which bucket to read, not which rows render. Folding it into the split decision was
 *     tempting — the QA document on REF-25603 was an Indonesian PPN invoice printing CGST
 *     and SGST — but that document is `taxType: "GLOBAL"`, so the tax-type term alone
 *     fixes it. And `taxName` is a free-form, PATCH-whitelisted string
 *     (talos/src/invoices.js:478) while `taxType` is neither: gating structure on it means
 *     an Indian business that renames its tax label silently loses the CGST/SGST split on
 *     a real GST invoice. The word a row is *labelled* with is a separate decision, and it
 *     lives in ./taxRowLabels.
 *   - `hideTaxes` suppresses the rows.
 *   - An export without payment of tax (`supplyType === "EXPWOP"`) suppresses a tax row
 *     whose figure is also zero. A non-zero figure still renders — this is the only place
 *     an amount participates in the decision.
 *
 * The inter-state flag is `invoice.igst`, a boolean, NOT `invoice.isIgst`. Nothing writes
 * `isIgst` onto a document: lydia sets `igst: !!totalIgst`
 * (src/helpers/getInvoiceDataFromEntry.js), serana projects `igst`
 * (src/lib/app-invoice-response.js) and both balance.js and serana's report class rename it
 * locally (`igst: igstTax`, `igst: isIgst`). Reading `isIgst` meant the flag was always
 * undefined, so every inter-state invoice rendered a zero CGST and a zero SGST row and
 * dropped its IGST row entirely. `isIgst` stays as a fallback only for a host that was
 * built against the older ceres contract.
 *
 * Note what is deliberately absent: the row is NOT gated on the figure being non-zero. A
 * domestic tax invoice with a genuine zero CGST shows a zero CGST row, because the reader
 * needs to see that the tax was considered and came to nothing.
 *
 * Lives under widgets/shared because that is where cross-bundle logic already lives
 * (formatCurrency, amountInWords). Imported by both src/main and the subtotal widget, which
 * are separate webpack bundles.
 */

import { asFlag, asText, isRecord, toAmount } from "./payloadValues";
import type { UnknownRecord } from "./payloadValues";

export interface TaxVisibilityInput {
  invoiceType?: unknown;
  taxType?: unknown;
  /* The document's inter-state flag — `invoice.igst`, with `invoice.isIgst` as fallback. */
  isInterState?: unknown;
  supplyType?: unknown;
  hideTaxes?: unknown;
  /* Amounts off `finalTotal`, used only by the export-without-payment suppression. */
  cgst?: unknown;
  sgst?: unknown;
  igst?: unknown;
}

export interface TaxVisibilityOptions {
  /*
   * Off for the item-table columns, on for the totals rows. The column headers are a
   * property of the document's shape, so they stay put when a user toggles "hide taxes" or
   * when an export document happens to carry no tax; the totals rows are the thing those
   * two settings are about.
   */
  applySuppressions?: boolean;
}

export interface TaxVisibility {
  isTaxDocument: boolean;
  /* A domestic Indian GST sale — the only shape that splits its tax into CGST + SGST. */
  isSplitTaxSale: boolean;
  showCgstSgst: boolean;
  showIgst: boolean;
}

export const resolveTaxVisibility = (
  input: TaxVisibilityInput,
  options: TaxVisibilityOptions = {}
): TaxVisibility => {
  const isTaxDocument = asText(input.invoiceType) === "INVOICE";
  /*
   * `taxType` defaults to INDIA exactly as the reference destructure does
   * (balance.js:33, `taxType = TAX_TYPE.INDIA`, and talos's own schema default). Requiring
   * the literal meant a payload that lost the field — a host delta, a mapper that drops it —
   * printed a single IGST row on a domestic GST invoice.
   */
  const taxType = asText(input.taxType) || "INDIA";
  const isSplitTaxSale = !asFlag(input.isInterState) && taxType === "INDIA";

  if (!isTaxDocument) {
    return {
      isTaxDocument,
      isSplitTaxSale,
      showCgstSgst: false,
      showIgst: false,
    };
  }

  if (!options.applySuppressions) {
    return {
      isTaxDocument,
      isSplitTaxSale,
      showCgstSgst: isSplitTaxSale,
      showIgst: !isSplitTaxSale,
    };
  }

  if (asFlag(input.hideTaxes)) {
    return {
      isTaxDocument,
      isSplitTaxSale,
      showCgstSgst: false,
      showIgst: false,
    };
  }

  const isExportWithoutPayment = asText(input.supplyType) === "EXPWOP";

  if (isSplitTaxSale) {
    const emptyExport =
      isExportWithoutPayment && !toAmount(input.cgst) && !toAmount(input.sgst);
    return {
      isTaxDocument,
      isSplitTaxSale,
      showCgstSgst: !emptyExport,
      showIgst: false,
    };
  }

  const emptyExport = isExportWithoutPayment && !toAmount(input.igst);
  return {
    isTaxDocument,
    isSplitTaxSale,
    showCgstSgst: false,
    showIgst: !emptyExport,
  };
};

/*
 * The same decision, taken straight from a document instead of from named inputs.
 *
 * A template's root context is whatever its data mapper returns — either the wrapped
 * `{ invoice, mapped, ... }` shape or the flat payload — so this unwraps both, exactly as
 * computeSubtotalRows does. Use it anywhere a caller has the document but not the fields:
 * the tax-summary and HSN-summary tables need the same answer as the totals rows, and
 * feeding them the raw inter-state flag instead would draw CGST and SGST columns on a
 * Malaysian SST or an Indonesian PPN document, whose tax is a single combined figure.
 */
export const resolveDocumentTaxVisibility = (
  payload: unknown,
  options: TaxVisibilityOptions = {}
): TaxVisibility => {
  const record = isRecord(payload) ? payload : {};
  const invoice = isRecord(record.invoice)
    ? (record.invoice as UnknownRecord)
    : (record as UnknownRecord);
  const finalTotal = isRecord(invoice.finalTotal)
    ? (invoice.finalTotal as UnknownRecord)
    : {};

  return resolveTaxVisibility(
    {
      invoiceType: invoice.invoiceType,
      taxType: invoice.taxType,
      isInterState: invoice.igst === undefined ? invoice.isIgst : invoice.igst,
      supplyType: invoice.supplyType,
      /*
       * `hideTaxes` is deliberately not passed. It is a display setting the host toggles
       * live, so every consumer keeps its tax markup in the DOM and hides it with CSS —
       * computing it away here would make the toggle a no-op until the next render.
       */
      cgst: finalTotal.cgst,
      sgst: finalTotal.sgst,
      igst: finalTotal.igst,
    },
    options
  );
};

/* `utgst` is the document field; `isUtgst` is the deprecated ceres-only name. */
export const resolveDocumentUtgst = (payload: unknown): boolean => {
  const record = isRecord(payload) ? payload : {};
  const invoice = isRecord(record.invoice)
    ? (record.invoice as UnknownRecord)
    : (record as UnknownRecord);
  return asFlag(invoice.utgst === undefined ? invoice.isUtgst : invoice.utgst);
};

export default resolveTaxVisibility;
