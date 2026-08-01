// Handlebars helpers for the saga-engineering template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.
//
// Currency formatting is intentionally NOT duplicated here — index.ts registers
// the shared `registerFormatCurrencyHelper` (src/widgets/shared) directly, and
// template.hbs passes `invoice.currency`/`invoice.subUnitLength`/
// `invoice.customCurrencySymbol` positionally since this template's root nests
// the document under `invoice`, not at the top level the shared helper defaults to.

/* eslint-disable @typescript-eslint/no-explicit-any */

import formatPhoneNumberIntl from "../../widgets/phone-number";

export function registerSagaEngineeringTemplateHelpers(HB: any): void {
  HB.registerHelper("increment", function (value: number) {
    return value + 1;
  });

  HB.registerHelper("eq", function (a: any, b: any) {
    return a === b;
  });

  // Reimplements only the slice of the app's status-badge logic that is
  // actually marked "shown in PDF" (per the confirmed frontend spec). Most
  // badge states (Draft, Won/Lost/Rejected, email-tracking, "Created"
  // fallback, Pending, Overdue, reminders, ...) are web-app-only UI and never
  // print, so PDF-visible statuses are narrower than the web app shows:
  //   - invoice-type docs (INVOICE/PROFORMAINV/DEBITNOTE/PAYMENTRECEIPT):
  //     only PAID -> "Paid" and PARTIAL -> "Part Paid" print.
  //   - every other billType (QUOTATION included): only CANCELED/CANCELLED
  //     -> "Canceled" prints.
  // Everything else renders no badge at all, matching the real PDF exactly
  // rather than falling back to a payment-status word that never applies to
  // a quotation (the shared InvoiceStatus widget's "Unpaid" default).
  // Scoped to this template rather than the shared widget, which other
  // templates rely on for actual invoices.
  const INVOICE_TYPE_BILL_TYPES = [
    "INVOICE",
    "PROFORMAINV",
    "DEBITNOTE",
    "PAYMENTRECEIPT",
  ];

  HB.registerHelper("computePrintStatus", function (invoice: any) {
    const billType = String(invoice?.billType || "").toUpperCase();
    const status = String(invoice?.status || "").toUpperCase();
    const isInvoiceTypeDoc = INVOICE_TYPE_BILL_TYPES.includes(billType);

    let tag: { text: string; color: string } | null = null;

    if (isInvoiceTypeDoc) {
      if (status === "PAID") tag = { text: "Paid", color: "success" };
      else if (status === "PARTIAL") tag = { text: "Part Paid", color: "info" };
    } else if (status === "CANCELED" || status === "CANCELLED") {
      tag = { text: "Canceled", color: "danger" };
    }

    if (!tag) return { tags: [] };

    return {
      tags: [
        { text: tag.text, finalClass: ["invoice-tag", tag.color].join(" ") },
      ],
    };
  });

  HB.registerHelper("or", function (...args: any[]) {
    const values = args.slice(0, -1);
    return values.some((val) => Boolean(val) && val !== "0" && val !== 0);
  });

  // Letterhead/footer assets are documented as strings, but the platform also
  // ships them as { url } — printing the raw value in an `src` renders
  // "[object Object]", which the browser resolves to a broken image: the
  // block keeps its height but shows nothing. Resolving here means a value we
  // cannot turn into a URL reads as absent, so the surrounding `is-empty`
  // guard collapses the block instead.
  function resolveAssetUrl(val: any): string {
    if (typeof val === "string") return val.trim();
    if (val && typeof val === "object") {
      for (const key of ["url", "src", "link", "href"]) {
        const nested = (val as any)[key];
        if (typeof nested === "string" && nested.trim()) return nested.trim();
      }
    }
    return "";
  }

  HB.registerHelper("assetUrl", function (val: any) {
    return resolveAssetUrl(val);
  });

  function stringifyFieldValue(val: any): string {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return isNaN(val) ? "" : String(val);
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      return val.map(stringifyFieldValue).filter(Boolean).join(", ");
    }
    // Objects have no sensible single-line form; printing one would render
    // "[object Object]" onto the document.
    return "";
  }

  // A party's operator-defined extras arrive in three differently shaped
  // buckets, and any of them can be absent. Flatten them to one {label, value}
  // list so each party block renders with a single loop.
  HB.registerHelper("partyFields", function (party: any) {
    if (!party || typeof party !== "object") return [];

    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: any, value: any, isHidden: boolean) => {
      if (isHidden) return;
      const text = stringifyFieldValue(value);
      const name = typeof label === "string" ? label.trim() : "";
      if (!text || !name) return;
      fields.push({ label: name, value: text });
    };
    const asArray = (val: any): any[] => (Array.isArray(val) ? val : []);

    // `showInInvoice` is opt-out: it is frequently absent on records that are
    // meant to print, so only an explicit false hides the row.
    for (const field of asArray(party.customFields)) {
      add(
        field?.label ?? field?.name,
        field?.value,
        field?.params?.showInInvoice === false
      );
    }
    for (const id of asArray(party.additionalIds)) {
      add(id?.label, id?.value, id?.showInInvoice === false);
    }
    for (const header of asArray(party.customHeaders)) {
      add(header?.label, header?.value, header?.showInInvoice === false);
    }

    return fields;
  });

  // Collapses runs of 2+ consecutive `<br>` a rich-text editor leaves behind
  // wherever the author pressed Enter twice — inside the text as much as at
  // the end of it. MarkdownViewer renders each one as a genuine empty line,
  // which inside a table cell shows up as a tall dead gap bounded by the
  // row's own borders. A single `<br>` is left alone: that's a deliberate
  // line break, not blank-line litter. Anything left dangling at the very
  // end is dropped entirely, same as a trailing blank line should be.
  HB.registerHelper("collapseBlankLines", function (text: any) {
    if (typeof text !== "string") return text;
    return text
      .replace(/(?:\s*<br\s*\/?>\s*){2,}/gi, "<br>")
      .replace(/(?:\s*<br\s*\/?>\s*)+$/gi, "")
      .replace(/\s+$/, "");
  });

  HB.registerHelper("formatPhone", function (phone: any) {
    if (typeof phone !== "string" && typeof phone !== "number") return "";
    const phoneStr = String(phone).trim();
    if (!phoneStr) return "";
    return formatPhoneNumberIntl(phoneStr) ?? phoneStr;
  });

  // A line item's quantity, with its unit inline ("2 (set)") when one is
  // declared — the design shows the unit as part of the same cell, not a
  // separate column.
  HB.registerHelper("formatQty", function (item: any) {
    if (!item) return "";
    const qty =
      item.quantity !== undefined && item.quantity !== null
        ? item.quantity
        : item.qty;
    if (qty === undefined || qty === null) return "";
    const unit = typeof item.unit === "string" ? item.unit.trim() : "";
    return unit ? `${qty} (${unit})` : String(qty);
  });

  // The item table's own footer row totals the quantity column itself: the
  // payload's aggregate totals (`finalTotal`/`totals`) only carry money
  // figures, never a unit count.
  HB.registerHelper("sumQuantities", function (items: any) {
    if (!Array.isArray(items)) return "";
    const total = items.reduce((sum, item) => {
      const raw = item?.quantity ?? item?.qty;
      const qty = typeof raw === "number" ? raw : parseFloat(raw);
      return sum + (Number.isFinite(qty) ? qty : 0);
    }, 0);
    return total;
  });

  // A customHeaders label as typed by the account ("Dear Sir,", "Kind Attn")
  // — the markup appends its own ":" after every label, so one that already
  // ends in a comma (a salutation line, typically) would otherwise print as
  // "Dear Sir,:". Trailing comma/colon/period is stripped first so the
  // appended ":" is the only punctuation.
  HB.registerHelper("headerLabel", function (label: any) {
    if (typeof label !== "string") return "";
    return label.trim().replace(/[,:.;]+$/, "");
  });

  // Every heading/body copy the document names for itself. The account
  // configures these in `invoice.customLabels` — a quotation's own salutation
  // wording, a renamed "Terms and Conditions" — so the string in the markup
  // is only what prints when the payload carries no label for that key.
  //
  // Named `docLabel`, not `label`: line items, terms and custom fields all
  // carry their own `label` property, and a helper of that name would shadow
  // every one of them.
  HB.registerHelper(
    "docLabel",
    function (key: string, fallback: string, options: any) {
      const customLabels = options?.data?.root?.invoice?.customLabels;
      const override =
        customLabels && typeof customLabels[key] === "string"
          ? customLabels[key].trim()
          : "";
      return override || fallback;
    }
  );

  // Attachment URLs carry no separate display name — the file name in the
  // path is the only thing worth printing, so it is derived rather than
  // dumping the whole URL onto the document.
  HB.registerHelper("filenameFromUrl", function (url: any) {
    if (typeof url !== "string" || !url) return "";
    const withoutQuery = url.split("?")[0];
    const segments = withoutQuery.split("/");
    return decodeURIComponent(segments[segments.length - 1] || url);
  });

  // Whether to show the HSN column. `derived.showHsnColumn` (from the shared
  // invoiceTemplateNormalization) gates this on the document being a GST tax
  // INVOICE, which a quotation never is — so a quotation whose line items
  // carry a real HSN code (this design's own reference documents all do)
  // would otherwise lose the column entirely. Showing it whenever any item
  // actually has one is simpler and matches what the account typed in.
  HB.registerHelper("hasHsn", function (items: any) {
    return Array.isArray(items) && items.some((item) => Boolean(item?.hsn));
  });
}
