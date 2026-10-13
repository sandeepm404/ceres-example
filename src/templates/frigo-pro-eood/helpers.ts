// Handlebars helpers and data-mapper steps for the frigo-pro-eood template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildCellContext, buildRowCells } from "../../main/lineItemCells";
import formatCurrency from "../../widgets/shared/formatCurrency";

type Field = { label: string; value: string };

const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const asText = (value: any): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
};

const pad = (n: number): string => String(n).padStart(2, "0");

// "+05:30", "-0300", "+2" → minutes east of UTC. Anything else is UTC.
const offsetMinutes = (offset: any): number => {
  if (typeof offset === "number" && Number.isFinite(offset)) return offset;
  const m = asText(offset).match(/^([+-]?)(\d{1,2}):?(\d{2})?$/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
};

// Bulgarian documents print dates as dd.mm.yyyy, a format the date-time widget
// has no style for. The date is read in the business's own offset
// (ownerOffset), the same shift formateShortDateWithOffset applies, and from
// UTC parts so the result never depends on the printing machine's zone.
export const dottedDate = (value: any, offset?: any): string => {
  if (!value && value !== 0) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + offsetMinutes(offset) * 60000);
  return `${pad(shifted.getUTCDate())}.${pad(
    shifted.getUTCMonth() + 1
  )}.${shifted.getUTCFullYear()}`;
};

// A party's own labelled extras: custom fields, additional ids (the Bulgarian
// "Идент. №" / EIK lives here) and party headers. `showInInvoice` is opt-out,
// so only an explicit false hides an entry; an entry without a label or a
// value has nothing to print.
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

// A party's address without the city, which the design gives its own row.
export const partyAddress = (party: any): string =>
  [
    party?.building,
    party?.street,
    party?.district,
    party?.state,
    party?.pincode,
    party?.country,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");

// ─── Text scale ─────────────────────────────────────────────────────────────
//
// Two settings scale the document:
//   • Lydia's text scale, pdfOptions.zoomSize (smaller 0.8, small 0.9,
//     normal 1.0, …). In print the shared renderer zooms the whole page for
//     every value except 0.8, which it treats as "no zoom" — so "smaller"
//     printed larger than "small". On screen it applies nothing at all.
//   • The older textScale (pdfOptions, advanceOptions, then the invoice), read
//     in the same order as the fitking and saga-engineering templates.
// pageZoom works out the zoom this template still has to apply itself, once
// for screen and once for print, so no value is ever applied twice.

const positiveNumber = (value: any): number | null => {
  const text = asText(value);
  if (!text || !/^\d*\.?\d+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
};

export const textScale = (
  invoice: any,
  pdfOptions: any,
  advanceOptions: any
): number =>
  [pdfOptions?.textScale, advanceOptions?.textScale, invoice?.textScale]
    .map(positiveNumber)
    .find((n) => n !== null) ?? 1;

export const pageZoom = (
  invoice: any,
  pdfOptions: any,
  advanceOptions: any
): { screen: number; print: number } => {
  const scale = textScale(invoice, pdfOptions, advanceOptions);
  const zoomSize = positiveNumber(pdfOptions?.zoomSize);
  return {
    screen: scale * (zoomSize ?? 1),
    // The renderer covers every zoomSize but 0.8 in print.
    print: scale * (zoomSize === 0.8 ? 0.8 : 1),
  };
};

// The custom properties styles.css reads (.fpe-page zoom); empty when neither
// zoom differs from 1, so nothing reaches the style attribute.
export const pageZoomStyle = (
  invoice: any,
  pdfOptions: any,
  advanceOptions: any
): string => {
  const { screen, print } = pageZoom(invoice, pdfOptions, advanceOptions);
  const round = (n: number) => String(Math.round(n * 1000) / 1000);
  const parts: string[] = [];
  if (screen !== 1) parts.push(`--fpe-screen-zoom: ${round(screen)};`);
  if (print !== 1) parts.push(`--fpe-print-zoom: ${round(print)};`);
  return parts.join(" ");
};

// The account's "Show Applied Exchange Rate" setting. The shared Subtotal
// widget prints its Conversion Rate row whenever the document and business
// currencies differ, without reading this setting, so the template hides that
// row unless the setting is on. Off by default: only an explicit true shows it.
export const showExchangeRate = (advanceOptions: any, invoice: any): boolean =>
  (advanceOptions?.showAppliedExchangeRate ??
    invoice?.advanceOptions?.showAppliedExchangeRate ??
    invoice?.showAppliedExchangeRate) === true;

// The totals print the business-currency amount (e.g. INR beside a BGN
// figure) in a column of its own, between label and figure. The Subtotal
// widget only offers it as a sub-line inside the figure's cell, so the
// template renders the widget's rows itself (template.hbs) and this flag
// says whether the column exists: only when some row carries a converted
// amount, i.e. the document and business currencies differ and a rate is set.
export const hasBusinessColumn = (model: any): boolean =>
  ["main", "extra", "due"].some((group) =>
    asArray(model?.groups?.[group]).some(
      (row: any) => row?.converted || row?.extra?.converted
    )
  );

// The lev prints as "лв.", never its ISO code. The widget formats through Intl,
// which has no symbol for BGN and writes "BGN 1,234.00"; the code is swapped
// in every figure of the totals block (both columns and the rate row).
// The currency then follows the amount, as Bulgarian invoices write it:
// "1,234.00 лв.", "-625,975 €", "1 € = 1.96 лв.". A negative figure carries a
// minus sign, never the widget's accounting brackets ("(€200)").
export const BGN_SYMBOL = "лв.";

const SYMBOL_BEFORE_AMOUNT = /(лв\.|[^\d\s()\-−=,.]+)\s*(\d(?:[\d,.]*\d)?)/g;

export const totalsFigure = (text: any): any =>
  typeof text === "string"
    ? text
        .replace(/BGN/g, BGN_SYMBOL)
        .replace(SYMBOL_BEFORE_AMOUNT, "$2\u00a0$1")
        .replace(/^\s*\((.*)\)\s*$/, "-$1")
    : text;

// computeSubtotalRows' model, as the totals block in template.hbs prints it:
// every figure through totalsFigure, and `businessColumn` (hasBusinessColumn).
export const frigoTotals = (model: any): any => {
  if (!model?.groups) return model;
  const row = (r: any) => ({
    ...r,
    value: totalsFigure(r?.value),
    converted: totalsFigure(r?.converted),
    extra: r?.extra
      ? {
          ...r.extra,
          value: totalsFigure(r.extra.value),
          converted: totalsFigure(r.extra.converted),
        }
      : r?.extra,
  });
  return {
    ...model,
    businessColumn: hasBusinessColumn(model),
    groups: {
      main: asArray(model.groups.main).map(row),
      extra: asArray(model.groups.extra).map(row),
      due: asArray(model.groups.due).map(row),
    },
  };
};

// The business-currency amount is not printed in the item table. There it
// rides on each cell as `secondaryText`, which this mapper drops.
export const withoutSecondCurrency = <T>(state: T): T => {
  const mapped = (state as any)?.mapped;
  const rows = asArray(mapped?.rows);
  const carries = (row: any) =>
    asArray(row?.cells).some((cell) => cell?.secondaryText);
  if (!rows.some(carries)) return state;
  return {
    ...(state as any),
    mapped: {
      ...mapped,
      rows: rows.map((row) =>
        carries(row)
          ? {
              ...row,
              cells: row.cells.map((cell: any) => {
                const next = { ...cell };
                delete next.secondaryText;
                return next;
              }),
            }
          : row
      ),
    },
  };
};

// ─── Payment lines ──────────────────────────────────────────────────────────
//
// Each payment recorded against the invoice prints as one more line at the
// end of the item table, the way Bulgarian invoices deduct an advance:
//
//   Авансово плащане по ф-ра <invoice number>/<payment date>   бр.   -1   1 533.87   -1 533.87
//
// The line is a reference only: the totals under the table stay the shared
// Subtotal widget's, which already subtracts what was paid (Amount Paid /
// Due Amount from the document's balance).

export const PAYMENT_LINE_TEXT = "Авансово плащане по ф-ра";
export const PAYMENT_LINE_UNIT = "бр.";

// Columns a payment line fills. Every other column (HSN, tax rate, tax
// amounts, discount, a business's own columns) stays blank: the payment has
// no value there, and a "0%" or "0.00" would read as data.
const NAME_KEYS = new Set(["name", "item"]);
const SIGNED_KEYS = new Set(["quantity", "amount", "total"]);
const FILLED_KEYS = new Set([...NAME_KEYS, ...SIGNED_KEYS, "rate", "unit"]);

// The payments that count: every one still on the document. A removed or
// unapproved payment, or one with no amount, never reached the balance.
export const recordedPayments = (invoice: any): any[] =>
  asArray(invoice?.allPayments ?? invoice?.payments).filter((payment) => {
    if (!payment || typeof payment !== "object") return false;
    if (payment.isRemoved === true || payment.isApproved === false)
      return false;
    const amount = Number(payment.amount);
    return Number.isFinite(amount) && amount !== 0;
  });

export const paymentLineText = (invoice: any, payment: any): string => {
  const number = asText(invoice?.invoiceNumber);
  const date = dottedDate(
    payment?.paymentDate ?? payment?.date ?? payment?.createdAt,
    invoice?.ownerOffset
  );
  const reference = [number, date].filter(Boolean).join("/");
  return reference ? `${PAYMENT_LINE_TEXT} ${reference}` : PAYMENT_LINE_TEXT;
};

const negate = (text: string): string => (text ? `-${text}` : text);

const buildPaymentRow = (
  context: ReturnType<typeof buildCellContext>,
  visibleColumns: any[],
  invoice: any,
  payment: any,
  lineNumber: number
): any => {
  // Rounded to the document's sub-unit first: the rate cell prints every
  // decimal it is given, so a float leftover (29,91,534.5260000005) would show.
  const factor = 10 ** context.subUnitLength;
  const amount = Math.round(Math.abs(Number(payment.amount)) * factor) / factor;
  const name = paymentLineText(invoice, payment);
  // Formatted by the same cell builder as every real line, so the money and
  // quantity follow the document's currency, locale and rounding settings.
  // The builder prints magnitudes (a quantity is always abs()), so the sign
  // is put back below.
  const item = { name, quantity: 1, rate: amount, amount, total: amount };
  const cells = buildRowCells(context, visibleColumns, item).map((cell) => {
    if (!FILLED_KEYS.has(cell.key)) return { ...cell, text: "" };
    if (cell.key === "unit") return { ...cell, text: PAYMENT_LINE_UNIT };
    const next: any = { ...cell };
    // The second-currency amount is presentational and unsigned; a payment
    // line does not carry one.
    delete next.secondaryText;
    if (cell.key === "quantity" && context.showUnitInQuantity) {
      next.text = `${negate(cell.text)} (${PAYMENT_LINE_UNIT})`;
    } else if (SIGNED_KEYS.has(cell.key)) {
      next.text = negate(cell.text);
    }
    return next;
  });

  return {
    cells,
    lineNumber,
    isGroupHeading: false,
    isAdditionalCharge: false,
    rowClass: "row-payment",
    item: {
      name,
      showSku: false,
      sku: "",
      mergedAsNote: false,
      mergedNotes: [],
      showThumbnail: false,
      thumbnailImages: [],
    },
    extras: { hasAny: false },
    isTotalsRow: false,
    isFillerRow: false,
  };
};

// Appends one payment line per recorded payment after the last item line —
// above the stretch filler and the summary row, which stay last. Line numbers
// continue from the items'.
export const withPaymentRows = <T>(state: T): T => {
  const root = state as any;
  const invoice = root?.invoice;
  const mapped = root?.mapped;
  const payments = recordedPayments(invoice);
  if (!mapped || payments.length === 0) return state;

  const rows = asArray(mapped.rows);
  const visibleColumns = asArray(mapped.columns).filter(
    (column) => !column?.isHidden
  );
  if (visibleColumns.length === 0) return state;

  const unitColumnMode =
    asText(root?.advanceOptions?.unitColumn) || "SEPARATE_COLUMN";
  const context = buildCellContext(invoice, unitColumnMode, new Map());
  const lastLine = rows.reduce(
    (max, row) =>
      typeof row?.lineNumber === "number" ? Math.max(max, row.lineNumber) : max,
    0
  );
  const paymentRows = payments.map((payment, i) =>
    buildPaymentRow(context, visibleColumns, invoice, payment, lastLine + i + 1)
  );

  const at = rows.findIndex(
    (row) => row?.isFillerRow || row?.rowClass === "row-summary"
  );
  const next =
    at < 0
      ? [...rows, ...paymentRows]
      : [...rows.slice(0, at), ...paymentRows, ...rows.slice(at)];
  return { ...root, mapped: { ...mapped, rows: next } };
};

// ─── Settlement rows ────────────────────────────────────────────────────────
//
// The totals block, on every invoice, settles it against the payments
// recorded on it (the payment lines in the item table):
//
//   Данъчна основа   tax base × (1 − paid share)
//   ДДС              VAT      × (1 − paid share)
//   Amount paid      −paid            (part-paid only: hidden unpaid or paid in full)
//   Сума за плащане  total − paid
//
// Unpaid, they are the full figures; paid in full, tax base, VAT and amount
// to pay are 0.00. A
// payment includes VAT, so it is split between the two in proportion: the
// paid share is paid ÷ total, capped at 1. VAT is the document's tax: IGST or
// CGST + SGST — whichever the document prints (mapped.visibility, the same
// decision as the item table; a payload can carry both, IGST then being their
// sum) — plus cess. The tax base is the total less that VAT, so discounts,
// charges and round-off are inside it.
//
// Labels: the VAT row reuses the totals' own tax-row label without its rate.
// The other three are the design's fixed Bulgarian wording: no payload key
// carries a tax-base label, and the account asked for these two over its
// customLabels.paidAmount / dueAmount.

export const TAX_BASE_LABEL = "Данъчна основа";
export const PAID_LABEL = "Платена сума";
export const DUE_LABEL = "Сума за плащане";

const amountOf = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const documentVat = (finalTotal: any, visibility: any): number => {
  const cess = finalTotal?.cessTotal;
  const cessTotal =
    cess && typeof cess === "object"
      ? Object.values(cess).reduce<number>((sum, v) => sum + amountOf(v), 0)
      : amountOf(cess);
  const igst = amountOf(finalTotal?.igst);
  const split = amountOf(finalTotal?.cgst) + amountOf(finalTotal?.sgst);
  let tax: number;
  if (visibility?.showCgstSgst) tax = split;
  else if (visibility?.showIgst) tax = igst;
  else tax = igst || split;
  return tax + cessTotal;
};

export const settlementFigures = (
  invoice: any,
  visibility?: any
): { taxBase: number; vat: number; due: number; paid: number } => {
  const digits =
    typeof invoice?.subUnitLength === "number" ? invoice.subUnitLength : 2;
  const round = (n: number): number => {
    const factor = 10 ** digits;
    const r = Math.round(n * factor) / factor;
    return Object.is(r, -0) ? 0 : r;
  };

  const total = amountOf(invoice?.finalTotal?.total);
  const vat = documentVat(invoice?.finalTotal, visibility);
  const paid = recordedPayments(invoice).reduce(
    (sum, p) => sum + Math.abs(Number(p.amount)),
    0
  );
  const share = total > 0 ? Math.min(Math.max(paid / total, 0), 1) : 0;

  return {
    taxBase: round((total - vat) * (1 - share)),
    vat: round(vat * (1 - share)),
    due: round(total - paid),
    paid: round(paid),
  };
};

// The totals' first tax row (IGST, or CGST under a split), rate dropped:
// "ДДС (18%)" → "ДДС".
const vatLabel = (totals: any): string => {
  const row = asArray(totals?.groups?.main).find((r: any) => r?.isTaxRow);
  return asText(row?.label).replace(/\s*\([^)]*%\)\s*$/, "");
};

// Formatted as the Subtotal widget formats its rows (document currency and
// locale, the document's sub-unit length), then through totalsFigure like
// every other totals figure. Without a sub-unit length the widget drops the
// decimals of a whole number; these rows keep two, so a settled invoice
// reads "0.00 €" as the design shows. The business column, when the totals print one,
// converts at the document's rate for the business currency.
export const settlementTotals = (
  invoice: any,
  visibility: any,
  totals: any
): {
  hidden: boolean;
  rows: Array<{
    key: string;
    label: string;
    value: string;
    converted: string | null;
  }>;
} => {
  const figures = settlementFigures(invoice, visibility);
  const currency = asText(invoice?.currency) || "INR";
  const locale =
    asText(invoice?.locale) || asText(invoice?.businessLocale) || undefined;
  const subUnitLength =
    typeof invoice?.subUnitLength === "number" ? invoice.subUnitLength : 2;
  const symbol = asText(invoice?.customCurrencySymbol) || undefined;
  const businessCurrency =
    asText(invoice?.businessCurrency) || asText(invoice?.owner?.currency);
  const businessLocale =
    asText(invoice?.businessLocale) ||
    asText(invoice?.owner?.locale) ||
    undefined;
  const rate = amountOf(invoice?.conversionRates?.[businessCurrency]);
  const converts = Boolean(totals?.businessColumn) && rate > 0;

  const row = (key: string, label: string, amount: number) => ({
    key,
    label,
    value: totalsFigure(
      formatCurrency(amount, currency, locale, subUnitLength, symbol)
    ),
    converted: converts
      ? totalsFigure(
          formatCurrency(
            amount * rate,
            businessCurrency,
            businessLocale,
            subUnitLength
          )
        )
      : null,
  });

  return {
    hidden:
      invoice?.hideTotals === true ||
      invoice?.advanceOptions?.hideTotals === true,
    rows: [
      row("taxBase", TAX_BASE_LABEL, figures.taxBase),
      row("vat", vatLabel(totals), figures.vat),
      ...(figures.paid > 0 && figures.due > 0
        ? [row("paid", PAID_LABEL, -figures.paid)]
        : []),
      row("due", DUE_LABEL, figures.due),
    ],
  };
};

export function registerFrigoProTemplateHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  // Handlebars passes its options hash as the last argument; drop it.
  HB.registerHelper("or", (...args: any[]) => args.slice(0, -1).some(Boolean));
  HB.registerHelper("dottedDate", dottedDate);
  HB.registerHelper("partyFields", partyFields);
  HB.registerHelper("partyAddress", partyAddress);
  HB.registerHelper("showExchangeRate", showExchangeRate);
  HB.registerHelper("frigoTotals", frigoTotals);
  HB.registerHelper("settlementTotals", settlementTotals);
  HB.registerHelper("pageZoomStyle", pageZoomStyle);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
