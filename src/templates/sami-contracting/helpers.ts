// Handlebars helpers for the sami-contracting template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

/* eslint-disable @typescript-eslint/no-explicit-any */

import formatCurrency from "../../widgets/shared/formatCurrency";

type Field = { label: string; value: string };

const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const asText = (value: any): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
};

// The script a business picked for its PDFs ("arabic", "latin", …). Lydia's
// General Preferences writes it to the business's `configuration.pdfOptions`;
// the document's own `template.pdfOptions` and the older
// `configuration.script` are read after it so whichever the host populated wins.
export const documentScript = (invoice: any, pdfOptions: any): string =>
  [
    invoice?.owner?.configuration?.pdfOptions?.script,
    pdfOptions?.script,
    invoice?.owner?.configuration?.script,
  ]
    .map(asText)
    .find(Boolean) ?? "";

// The font the business picked for that script — written beside it by the
// same General Preferences control, and read from the same places.
export const documentFont = (invoice: any, pdfOptions: any): string =>
  [
    invoice?.owner?.configuration?.pdfOptions?.fontFamily,
    pdfOptions?.fontFamily,
  ]
    .map(asText)
    .find(Boolean) ?? "";

// Text scale, applied as a zoom on the shell — read from the same places, in
// the same order, as the fitking and saga-engineering templates. Only a
// positive number comes back, so nothing else reaches the style attribute.
export const documentTextScale = (
  invoice: any,
  pdfOptions: any,
  advanceOptions: any
): string => {
  const scale = [
    pdfOptions?.textScale,
    advanceOptions?.textScale,
    invoice?.textScale,
  ]
    .map(asText)
    .find(Boolean);
  if (!scale || !/^\d*\.?\d+$/.test(scale)) return "";
  return Number(scale) > 0 ? scale : "";
};

const toAmount = (value: any): number => {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

// The fixed totals block: excl. VAT, VAT, incl. VAT, paid and due, always all
// five whatever the account's totals settings say. VAT is the document's IGST
// (CGST + SGST when it is split); "excl. VAT" is the total less that VAT, so
// discounts, charges and round-off are already inside it. The rate is printed
// only when every item carries the same one. Figures always carry the
// document's decimal places (2 when it sets none), so 4,800 prints 4,800.00,
// and are formatted here in the document's own currency, locale and symbol —
// never left to a template-side helper that can fall back to INR.
export const fixedTotals = (invoice: any) => {
  const finalTotal = invoice?.finalTotal ?? {};
  const balance = invoice?.balance ?? {};
  const total = toAmount(finalTotal.total);
  const vat =
    toAmount(finalTotal.igst) ||
    toAmount(finalTotal.cgst) + toAmount(finalTotal.sgst);
  const paid = toAmount(balance.paid);
  const hasDue = balance.due !== undefined && balance.due !== null;
  const rates = Array.from(
    new Set(
      asArray(invoice?.items)
        .map((item) => item?.gstRate)
        .filter((rate) => rate !== undefined && rate !== null && rate !== "")
        .map((rate) => String(rate))
    )
  );
  const decimals = Number.isInteger(invoice?.subUnitLength)
    ? invoice.subUnitLength
    : 2;
  const amounts = {
    exclVat: total - vat,
    vat,
    total,
    paid,
    due: hasDue ? toAmount(balance.due) : total - paid,
  };
  const format = (amount: number): string =>
    formatCurrency(
      amount,
      asText(invoice?.currency),
      asText(invoice?.locale),
      decimals,
      asText(invoice?.customCurrencySymbol) || null
    );
  return {
    ...amounts,
    vatRate: rates.length === 1 ? rates[0] : "",
    text: {
      exclVat: format(amounts.exclVat),
      vat: format(amounts.vat),
      total: format(amounts.total),
      paid: format(amounts.paid),
      due: format(amounts.due),
    },
  };
};

// The account's own "Product Code" column prints first, before the item —
// Refrens cannot order a column ahead of the item name, so the template does.
// It is found by the name the account gave it (English or Arabic, either on its
// own or as part of a bilingual heading), and the column moves together with
// its cell in every row, which the rows key by column.
const PRODUCT_CODE_LABELS = ["product code", "كود الصنف"];

export const isProductCodeColumn = (column: any): boolean => {
  const label = asText(column?.label).replace(/\s+/g, " ").toLowerCase();
  return PRODUCT_CODE_LABELS.some((name) => label.includes(name));
};

export const productCodeFirst = <T>(state: T): T => {
  const mapped = (state as any)?.mapped;
  const columns = asArray(mapped?.columns);
  const code = columns.find(isProductCodeColumn);
  if (!code) return state;
  const toFront = (list: any[]): any[] => {
    const at = list.findIndex((entry) => entry?.key === code.key);
    if (at <= 0) return list;
    return [list[at], ...list.slice(0, at), ...list.slice(at + 1)];
  };
  return {
    ...(state as any),
    mapped: {
      ...mapped,
      columns: toFront(columns),
      rows: asArray(mapped.rows).map((row) => ({
        ...row,
        cells: toFront(asArray(row?.cells)),
      })),
    },
  };
};

// A blank row of empty cells after the items, ahead of any summary row. In
// print it takes the page's spare height (styles.css), so the item rows keep
// their own height while the table's box reaches down to the summary. The
// shape mirrors the widget's own stretch filler; when the account already
// has that stretch on, its filler is used as is.
const fillerRow = (columns: any[]) => ({
  cells: columns
    .filter((column) => !column?.isHidden)
    .map((column) => ({
      key: column.key,
      text: "",
      className: column.className,
      label: column.label,
      isItemCell: false,
    })),
  lineNumber: null,
  isGroupHeading: false,
  isAdditionalCharge: false,
  rowClass: "row-filler",
  item: {
    name: "",
    showSku: false,
    sku: "",
    mergedAsNote: false,
    mergedNotes: [],
    showThumbnail: false,
    thumbnailImages: [],
  },
  extras: { hasAny: false },
  isTotalsRow: false,
  isFillerRow: true,
});

export const withFillerRow = <T>(state: T): T => {
  const mapped = (state as any)?.mapped;
  const rows = asArray(mapped?.rows);
  if (!rows.length || rows.some((row) => row?.isFillerRow)) return state;
  const at = rows.findIndex((row) => row?.rowClass === "row-summary");
  const filler = fillerRow(asArray(mapped.columns));
  const next =
    at < 0
      ? [...rows, filler]
      : [...rows.slice(0, at), filler, ...rows.slice(at)];
  return { ...(state as any), mapped: { ...mapped, rows: next } };
};

// With "show description in full width" off, an item's description prints in
// its item cell, under the name (template.hbs), rather than in the row the
// shared widget spans across every column. The extras row then carries only
// what is left — images and serials — and drops away when nothing is.
export const descriptionInItemCell = <T>(state: T): T => {
  const mapped = (state as any)?.mapped;
  const rows = asArray(mapped?.rows);
  const moves = (row: any): boolean =>
    Boolean(row?.extras?.hasDescription) && !row.extras.descriptionFullWidth;
  if (!rows.some(moves)) return state;
  return {
    ...(state as any),
    mapped: {
      ...mapped,
      rows: rows.map((row) => {
        if (!moves(row)) return row;
        const { extras } = row;
        return {
          ...row,
          extras: {
            ...extras,
            hasDescription: false,
            descriptionInItem: true,
            hasAny: Boolean(
              extras.imagesInline ||
                extras.imagesRow ||
                extras.hasOriginalImages ||
                extras.hasSerials
            ),
          },
        };
      }),
    },
  };
};

// Lydia's text scale is the document's pdfOptions.zoomSize (smaller 0.8,
// small 0.9, normal 1.0, …). The shared renderer zooms the printed page for
// every value except 0.8, which it treats as "no zoom" — so "smaller" printed
// at full size, larger than "small". This hands back 0.8 for the template to
// apply in print itself; every other value is left to the renderer, so no
// value is ever zoomed twice.
export const printZoom = (pdfOptions: any): string =>
  Number(pdfOptions?.zoomSize) === 0.8 ? "0.8" : "";

// The zoom the shared renderer puts on the whole printed page (<html>): every
// valid zoomSize but 0.8. The one-page print height divides by it, so a zoomed
// page still reaches the foot of the page.
export const rendererPrintZoom = (pdfOptions: any): string => {
  const zoom = Number(pdfOptions?.zoomSize);
  return Number.isFinite(zoom) && zoom > 0 && zoom !== 0.8 ? String(zoom) : "";
};

// Google Fonts stylesheet for a family name. Lydia's picker lists Google
// families only, so any other character means the value is not one of them and
// nothing is loaded rather than building a URL from it.
export const googleFontHref = (family: any): string => {
  const name = asText(family);
  if (!/^[A-Za-z0-9 ]+$/.test(name)) return "";
  return `https://fonts.googleapis.com/css2?family=${name.replace(
    / /g,
    "+"
  )}:wght@400;500;600;700&display=swap`;
};

// `lang` for the scripts whose shaping or line breaking depends on it. Any
// other script leaves `lang` off rather than guessing a language from it.
const SCRIPT_LANG: Record<string, string> = {
  arabic: "ar",
  hebrew: "he",
};

export const documentLang = (script: any): string =>
  SCRIPT_LANG[asText(script).toLowerCase()] ?? "";

// Lydia's "RTL" toggle patches `template.rtl` on the document and reloads the
// preview, so reading it at render time keeps the iframe and the PDF in step.
export const documentDir = (invoice: any): "rtl" | "ltr" =>
  invoice?.template?.rtl === true ? "rtl" : "ltr";

// A party's own labelled extras: custom fields, additional ids (e.g. a
// commercial registration number) and party headers. `showInInvoice` is
// opt-out, so only an explicit false hides an entry; an entry without a label
// or a value has nothing to print.
export const partyFields = (party: any): Field[] => {
  const fields: Field[] = [];
  const add = (label: any, value: any, hidden: boolean) => {
    const name = asText(label);
    const text = asText(value);
    if (!hidden && name && text) fields.push({ label: name, value: text });
  };

  asArray(party?.customFields).forEach((field) =>
    add(
      field?.label || field?.name,
      field?.value,
      field?.params?.showInInvoice === false
    )
  );
  asArray(party?.additionalIds).forEach((id) =>
    add(id?.label, id?.value, id?.showInInvoice === false)
  );
  asArray(party?.customHeaders).forEach((header) =>
    add(header?.label, header?.value, header?.showInInvoice === false)
  );

  return fields;
};

// Bank rows in the platform's order. Values carry two shapes in the wild (the
// contract's `bankName`/`accountHolderName` and the `bank`/`name` real payloads
// send), so both are read. Labels come only from the account's or the
// document's custom labels: an Arabic document must never fall back to English
// text, so a row with no label prints its value alone.
const BANK_ROWS: Array<{ values: string[]; labels: string[] }> = [
  { values: ["name", "accountHolderName"], labels: ["accountHolderName"] },
  { values: ["bank", "bankName"], labels: ["bankName", "bank"] },
  {
    values: ["accountNo", "accountNumber"],
    labels: ["accountNumber", "accountNo"],
  },
  { values: ["iban"], labels: ["iban"] },
  { values: ["swift", "swiftCode"], labels: ["swiftCode", "swift"] },
  { values: ["ifsc", "ifscCode"], labels: ["ifsc", "ifscCode"] },
  { values: ["sortCode"], labels: ["sortCode"] },
  { values: ["accountType"], labels: ["accountType"] },
];

export const bankFields = (invoice: any): Field[] => {
  const account = invoice?.bankAccount;
  if (!account || typeof account !== "object") return [];

  const labelSources = [account.customLabels, invoice?.customLabels];
  const labelFor = (keys: string[]): string =>
    keys
      .flatMap((key) => labelSources.map((source) => asText(source?.[key])))
      .find(Boolean) ?? "";

  const rows: Field[] = [];
  BANK_ROWS.forEach((row) => {
    const value = row.values.map((key) => asText(account[key])).find(Boolean);
    if (value) rows.push({ label: labelFor(row.labels), value });
  });

  asArray(account.customFields).forEach((field) => {
    const label = asText(field?.label);
    const value = asText(field?.value);
    if (field?.params?.showInInvoice !== false && label && value) {
      rows.push({ label, value });
    }
  });

  return rows;
};

// The "issued from" document field, placed in the number band instead of the
// details list. Matched by its label (by request) — the API gives document fields
// no stable key. It may be a custom field or a custom header, so both are
// searched. The comparison ignores what does not change how the label reads:
// Unicode presentation forms (NFKC), invisible direction marks, tatweel,
// diacritics, extra spaces and a trailing colon. A field the business hid
// (showInInvoice false) never matches.
const ISSUED_FROM_LABEL = "المصدر من";

// Zero-width and bidi controls, BOM and tatweel; then every non-spacing mark
// (Arabic diacritics among them). Marks sit outside the class because a
// combining character inside one is ambiguous (no-misleading-character-class).
const INVISIBLE =
  /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0640]|\p{Mn}/gu;

const normaliseLabel = (label: any): string =>
  asText(label)
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/[:：\s]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

export const isIssuedFrom = (field: any): boolean =>
  field?.params?.showInInvoice !== false &&
  field?.showInInvoice !== false &&
  normaliseLabel(field?.label || field?.name) === ISSUED_FROM_LABEL;

export const issuedFromField = (fields: any, headers?: any): any =>
  [...asArray(fields), ...asArray(headers)].find(isIssuedFrom) ?? null;

// The seller's phone for the top row: the billed-by phone unless the business
// hid it, else the document's contact phone — real payloads often leave
// billedBy.phone empty and carry the number only under contact.
export const sellerPhone = (invoice: any): string => {
  const billedBy = invoice?.billedBy;
  const own =
    billedBy?.phoneShowInInvoice === false ? "" : asText(billedBy?.phone);
  return own || asText(invoice?.contact?.phone);
};

// Total quantity across the line items — the design's "number of items" figure
// (one line of 9 prints 9). Rounded to 4 places so float sums like 0.1 + 0.2
// print as 0.3; non-numeric quantities count as zero.
export const totalQuantity = (items: any): number => {
  const sum = asArray(items).reduce((acc, item) => {
    const qty = Number(item?.quantity);
    return Number.isFinite(qty) ? acc + qty : acc;
  }, 0);
  return Math.round(sum * 10000) / 10000;
};

// The file name an attachment URL points at, without its query string.
export const attachmentName = (url: any): string => {
  const path = asText(url).split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

// ─── Multi-page print fit ─────────────────────────────────────────────────
// Multi-page print: push the summary block to the foot of the last page.
//
// A single page needs no script: styles.css stretches the item table to one
// page height. Past one page CSS cannot tell how much of the last page is
// left, so this measures the layout as printing starts and pads the summary's
// top by exactly that amount. Chrome reports `matchMedia("print")` as changed
// with the page already split into pages (a plain PDF), or fires
// `beforeprint` with print media already emulated but the page still in one
// unbroken column. Either way changes made there reach the PDF. The page
// breaks are worked out from the rows (pagedEnd), which also holds for the
// already-paginated case, where nothing crosses a page end. Back on screen
// the padding is removed.

const SHELL = ".smc-shell";
const SUMMARY = ".smc-summary";
const ROWS = ".smc-items .line-items-table > tbody > tr:not(.row-filler)";
const HEAD = ".smc-items .line-items-table > thead";
const PADDING = "padding-block-start";
// Kept short of the page end so rounding can never spill a blank page.
const SAFETY_PX = 2;

export interface PrintUnit {
  // Offset from the content top, and height, in one unbroken column.
  top: number;
  height: number;
  // Height repeated above it when it starts a new page (the table header).
  repeat: number;
}

// Extra height page breaks add: each unit that would cross a page end moves to
// the next page (Chrome never splits a table row, or a block marked
// break-inside: avoid, that fits on one page), plus the header it carries
// there. Units are in document order.
export const pagedShift = (units: PrintUnit[], pageHeight: number): number =>
  units.reduce((shift, unit) => {
    if (!(pageHeight > 0) || unit.height >= pageHeight) return shift;
    const top = unit.top + shift;
    const page = Math.floor(top / pageHeight);
    const crosses = Math.floor((top + unit.height - 0.5) / pageHeight) > page;
    return crosses
      ? shift + (page + 1) * pageHeight - top + unit.repeat
      : shift;
  }, 0);

// Space left on the last page, given the content's height and one page's
// height in the same units. Zero when the content fits on one page (the CSS
// stretch covers that) or already ends at a page foot.
export const lastPageSlack = (used: number, pageHeight: number): number => {
  if (!(pageHeight > 0) || used <= pageHeight + SAFETY_PX) return 0;
  const pages = Math.ceil((used - SAFETY_PX) / pageHeight);
  return Math.max(0, pages * pageHeight - used - SAFETY_PX);
};

// One page's height in the shell's own layout: the same measure the print
// CSS stretches to (styles.css, `.smc-shell` min-height).
const measurePageHeight = (shell: HTMLElement): number => {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;inset-block-start:0;inline-size:0;visibility:hidden;" +
    "block-size:calc(min(100vh, 296mm) / var(--smc-page-zoom, 1));";
  shell.appendChild(probe);
  const { height } = probe.getBoundingClientRect();
  probe.remove();
  return height;
};

// The item rows, then every block after the items that must not split.
const printUnits = (shell: HTMLElement, origin: number): PrintUnit[] => {
  const rows = Array.from(shell.querySelectorAll<HTMLElement>(ROWS));
  const head = shell.querySelector<HTMLElement>(HEAD);
  const repeat =
    head && rows.length
      ? rows[0].getBoundingClientRect().top - head.getBoundingClientRect().top
      : 0;
  const items = shell.querySelector<HTMLElement>(".smc-items");
  const tail: HTMLElement[] = [];
  // The items' own siblings (the summary, in .smc-items-group), then the
  // blocks after the group.
  const group = items?.closest<HTMLElement>(".smc-items-group");
  [items, group].forEach((start) => {
    let next = start?.nextElementSibling as HTMLElement | null;
    while (next) {
      if (getComputedStyle(next).breakInside === "avoid") tail.push(next);
      next = next.nextElementSibling as HTMLElement | null;
    }
  });
  const unit = (el: HTMLElement, carried: number): PrintUnit => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top - origin, height: rect.height, repeat: carried };
  };
  return [
    ...rows.map((row) => unit(row, repeat)),
    ...tail.map((block) => unit(block, 0)),
  ];
};

const contentHeight = (shell: HTMLElement, pageHeight: number): number => {
  const { top, bottom } = shell.getBoundingClientRect();
  return bottom - top + pagedShift(printUnits(shell, top), pageHeight);
};

const fit = (): void => {
  const shell = document.querySelector<HTMLElement>(SHELL);
  const summary = shell?.querySelector<HTMLElement>(SUMMARY);
  if (!shell || !summary) return;

  summary.style.removeProperty(PADDING);
  const pageHeight = measurePageHeight(shell);
  const used = contentHeight(shell, pageHeight);
  const slack = lastPageSlack(used, pageHeight);
  if (slack <= 0) return;

  // The padding is in the summary's own CSS pixels, which a print zoom on the
  // page can scale; measure how far a trial moves the content's end and
  // correct by that ratio.
  summary.style.setProperty(PADDING, `${slack}px`);
  const moved = contentHeight(shell, pageHeight) - used;
  if (moved > 0 && Math.abs(moved - slack) > 0.5) {
    summary.style.setProperty(PADDING, `${(slack * slack) / moved}px`);
  }
};

const reset = (): void => {
  document
    .querySelector<HTMLElement>(`${SHELL} ${SUMMARY}`)
    ?.style.removeProperty(PADDING);
};

export const installPrintFit = (): void => {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const print = window.matchMedia("print");
  const onChange = (): void => (print.matches ? fit() : reset());
  if (print.addEventListener) print.addEventListener("change", onChange);
  else print.addListener(onChange);
  window.addEventListener("beforeprint", () => {
    if (print.matches) fit();
  });
  window.addEventListener("afterprint", reset);
};

/**
 *
 * @param HB
 */
export function registerSamiContractingTemplateHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  // Handlebars passes its options hash as the last argument; drop it.
  HB.registerHelper("or", (...args: any[]) => args.slice(0, -1).some(Boolean));
  HB.registerHelper("documentScript", documentScript);
  HB.registerHelper("documentFont", documentFont);
  HB.registerHelper("googleFontHref", googleFontHref);
  HB.registerHelper("documentTextScale", documentTextScale);
  HB.registerHelper("fixedTotals", fixedTotals);
  HB.registerHelper("printZoom", printZoom);
  HB.registerHelper("rendererPrintZoom", rendererPrintZoom);
  HB.registerHelper("documentLang", documentLang);
  HB.registerHelper("documentDir", documentDir);
  HB.registerHelper("partyFields", partyFields);
  HB.registerHelper("bankFields", bankFields);
  HB.registerHelper("attachmentName", attachmentName);
  HB.registerHelper("totalQuantity", totalQuantity);
  HB.registerHelper("isIssuedFrom", isIssuedFrom);
  HB.registerHelper("issuedFromField", issuedFromField);
  HB.registerHelper("sellerPhone", sellerPhone);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
