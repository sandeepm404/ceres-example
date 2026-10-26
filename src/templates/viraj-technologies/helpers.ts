/*
 * View model for the Viraj Technologies template (Figma Document-Templates, node 18920:1491,
 * "VIRAJ TECHNOLOGIES": a ruled quotation).
 *
 * Built on the Ecommerce template's view model (itself from Apex Engineering and Modern
 * Manufacturing): the same contract coverage, settings and print behaviour, laid out as this
 * design. The template keeps `normalizeInvoiceTemplateState` as its data mapper and asks for
 * this model once, through `{{#with (vtView @root) as |view|}}`. Every value comes from the
 * payload: labels resolve through `customLabels` (or the column's own label), and the
 * design's words are only fallbacks for a key the business has never set. Nothing from the
 * reference design's sample document is written into the markup.
 *
 * Money prints with the document's currency symbol.
 */

import amountInWords from "../../widgets/shared/amountInWords";
import { computeHsnSummary } from "../../widgets/hsn-summary/utils";
import { computeTaxSummary } from "../../widgets/tax-summary/utils";
import formatCurrency from "../../widgets/shared/formatCurrency";
import {
  asArray,
  asRecord,
  asText,
  isRecord,
  pickFirst,
  toAmount,
} from "../../widgets/shared/payloadValues";
import type { UnknownRecord } from "../../widgets/shared/payloadValues";
import { toImageSrc } from "../../widgets/image/utils";
import { computeSubtotalRows } from "../../widgets/subtotal/utils";
import { computePaymentColumns } from "../../widgets/payment-table/utils";
import type { SubtotalRow } from "../../widgets/subtotal/utils";
import type { ImageInput } from "../../widgets/image/utils";

interface FormatContext {
  locale: string;
  digits: number;
  currency: string;
  symbol: string;
}

export interface LabelValue {
  key: string;
  label: string;
  value: string;
  isDate?: boolean;
  isUtcDate?: boolean;
  isHidden?: boolean;
  isNum?: boolean;
  attr?: string;
}

type ColumnKind =
  | "name"
  | "code"
  | "qty"
  | "money"
  | "percent"
  | "discount"
  | "number"
  | "text";

export interface ItemColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  className: string;
  summable: boolean;
}

const NUMERIC_KINDS: ColumnKind[] = [
  "qty",
  "money",
  "percent",
  "discount",
  "number",
];

const MONEY_KEYS = ["rate", "amount", "igst", "cgst", "sgst", "utgst", "total"];
const CODE_KEYS = [
  "hsn",
  "classification",
  "sku",
  "batchName",
  "batchCode",
  "manufacturerBatchNumber",
  "unit",
];

/* ------------------------------------------------------------------ values */

const text = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asText(value).trim();
};

const firstText = (...values: unknown[]): string =>
  values.map(text).find(Boolean) || "";

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && text(value) !== "";

/* 33.3333333 → "33.3333": a ratio or share, four places at most. */
const compactDecimal = (value: number): string =>
  String(Number(value.toFixed(4)));

/* Opt-out convention: only an explicit false (or "false") hides. */
const isOff = (value: unknown): boolean =>
  value === false || text(value).toLowerCase() === "false";

const formatNumber = (
  value: number,
  locale: string,
  min: number,
  max: number
): string => {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(value);
  } catch {
    // Only as many digits as the value has, as the formatter would give.
    return String(Number(value.toFixed(max)));
  }
};

/*
 * Money everywhere (table, Total row, HSN summary, currency fields) goes through the shared
 * formatCurrency, as the totals widget does: the document's currency symbol (or its custom
 * one), its locale's grouping, its decimal places (subUnitLength, else 2), negatives in
 * brackets.
 */
export const formatMoney = (value: unknown, ctx: FormatContext): string =>
  hasValue(value)
    ? formatCurrency(
        toAmount(value),
        ctx.currency,
        ctx.locale,
        ctx.digits,
        ctx.symbol || undefined
      )
    : "";

/*
 * A unit price (or flat discount) as entered: the currency symbol and only the decimals the
 * figure has, up to the document's places ("₹15,000", "₹180.5"), as refrens.com prints it.
 */
export const formatRate = (value: unknown, ctx: FormatContext): string => {
  if (!hasValue(value)) return "";
  const amount = toAmount(value);
  try {
    const shown = new Intl.NumberFormat(ctx.locale, {
      style: "currency",
      currency: ctx.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: ctx.digits,
    }).format(Math.abs(amount));
    // The shared formatCurrency's own marks win over the browser's (SAR prints "⃁ 100", the
    // Saudi Riyal sign, as refrens.com does, where Intl gives "SAR 100").
    const widgetMark = ctx.symbol
      ? ""
      : String(formatCurrency(1, ctx.currency, ctx.locale, 0)).replace(
          /[\d.,\s()-]/g,
          ""
        );
    const intlMark = shown.replace(/[\d.,\s-]/g, "");
    let symbol = shown;
    if (ctx.symbol) symbol = shown.replace(/[^\d.,\s-]+/, ctx.symbol);
    else if (widgetMark && widgetMark !== intlMark)
      symbol = `${widgetMark} ${shown.replace(/[^\d.,]+/g, "")}`;
    return amount < 0 ? `(${symbol})` : symbol;
  } catch {
    return formatMoney(value, ctx);
  }
};

/*
 * A money figure without the currency symbol, for the item table: the document's grouping
 * and decimal places, negatives in brackets as formatCurrency prints them.
 */
export const formatFigure = (value: unknown, ctx: FormatContext): string => {
  if (!hasValue(value)) return "";
  const amount = toAmount(value);
  const figure = formatNumber(
    Math.abs(amount),
    ctx.locale,
    ctx.digits,
    ctx.digits
  );
  return amount < 0 ? `(${figure})` : figure;
};

/* The document's decimal places (subUnitLength), else 2 — Refrens' default. */
export const moneyDigits = (invoice: UnknownRecord): number => {
  const digits = invoice.subUnitLength;
  return typeof digits === "number" && Number.isInteger(digits) && digits >= 0
    ? digits
    : 2;
};

export const formatContext = (invoice: UnknownRecord): FormatContext => ({
  locale: firstText(invoice.locale, asRecord(invoice.owner).locale, "en-IN"),
  digits: moneyDigits(invoice),
  currency: firstText(invoice.currency, "INR"),
  symbol: text(invoice.customCurrencySymbol),
});

/*
 * The template's data mapper: the shared normalizer, then the document's decimal places made
 * explicit, so the shared widgets that format money from the document itself (totals, tax
 * summary, payment record) print every figure with the same decimals as the table — a whole
 * amount as "625,975.00", not "625,975".
 */
export const withMoneyDefaults = <T>(state: T): T => {
  const invoice = asRecord(asRecord(state).invoice);
  if (
    asRecord(state).invoice &&
    invoice.subUnitLength !== moneyDigits(invoice)
  ) {
    // The document's own setting, before the default: the summaries print by it.
    invoice.vtOwnSubUnitLength = invoice.subUnitLength ?? null;
    invoice.subUnitLength = moneyDigits(invoice);
  }
  return state;
};

export const formatQuantity = (value: unknown, ctx: FormatContext): string =>
  hasValue(value) ? formatNumber(toAmount(value), ctx.locale, 0, 3) : "";

const formatPercent = (value: unknown, ctx: FormatContext): string =>
  hasValue(value) ? `${formatQuantity(value, ctx)}%` : "";

/* ------------------------------------------------------------------ dates */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* "+05:30" / "-0400" / minutes → minutes. The platform's default offset is IST. */
const offsetMinutes = (offset: unknown): number => {
  if (typeof offset === "number" && Number.isFinite(offset)) return offset;
  const match = (text(offset) || "+05:30").match(
    /^([+-]?)(\d{1,2}):?(\d{2})?$/
  );
  if (!match) return 330;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "-" ? -minutes : minutes;
};

/* 8 → "08". */
const twoDigits = (day: number): string => String(day).padStart(2, "0");

/*
 * Document dates print as the design does, "June 08, 2026". An instant (ISO with Z / an
 * offset, or epoch ms) is shifted into the business's offset first; a zone-less value
 * ("2026-09-21", or the IST-encoded IRN "2026-09-21 11:20:00") is already local, so its own
 * date parts print as they are. Anything unparseable prints as given rather than as a wrong date.
 */
export const formatDocumentDate = (
  value: unknown,
  offset?: unknown
): string => {
  const raw = typeof value === "number" ? "" : text(value);
  if (!raw && typeof value !== "number") return "";
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    return `${MONTHS[Number(parts[2]) - 1]} ${twoDigits(Number(parts[3]))}, ${
      parts[1]
    }`;
  }
  const time = typeof value === "number" ? value : Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  const shifted = new Date(time + offsetMinutes(offset) * 60000);
  return `${MONTHS[shifted.getUTCMonth()]} ${twoDigits(
    shifted.getUTCDate()
  )}, ${shifted.getUTCFullYear()}`;
};

/* "Jun 10, 2026": the payment dates, as refrens.com prints them in its payments table. */
export const formatShortDate = (value: unknown, offset?: unknown): string => {
  const long = formatDocumentDate(value, offset);
  const month = MONTHS.find((name) => long.startsWith(`${name} `));
  return month ? `${month.slice(0, 3)}${long.slice(month.length)}` : long;
};

/* ------------------------------------------------------------------ labels */

/* A row label: the business override when set, otherwise the fallback word. */
const labelOr = (labels: UnknownRecord, key: string, fallback: string) =>
  firstText(labels[key], fallback);

/*
 * A section heading: an empty override deliberately hides it (the platform's guarded
 * heading), so only a key that was never set falls back.
 */
const heading = (labels: UnknownRecord, key: string, fallback: string) =>
  typeof labels[key] === "string" ? text(labels[key]) : fallback;

/* ------------------------------------------------------------------ settings */

/*
 * The document's template settings (`invoice.template`): the business's theme colour (the
 * item table's header fill, black in the design) and one layout choice: transport details
 * in the details list or a box of their own. Notes always take a row of their own.
 * Every other toggle is the document's own data (a section shows when it has content and the
 * business has not switched it off).
 */
const DEFAULT_THEME = "#000000";

const hexColor = (value: unknown): string => {
  const raw = text(value).toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  return /^#[0-9a-f]{3}$/.test(raw)
    ? `#${Array.from(raw.slice(1), (digit) => digit + digit).join("")}`
    : "";
};

/* The light tint of a theme colour used for the dividers between table header cells. */
export const themeTint = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map(
    (start) => parseInt(hex.slice(start, start + 2), 16) / 255
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (chroma !== 0 && max === r) hue = ((g - b) / chroma + 6) % 6;
  else if (chroma !== 0 && max === g) hue = (b - r) / chroma + 2;
  else if (chroma !== 0) hue = (r - g) / chroma + 4;
  // Same hue and saturation at 87% lightness.
  const tintChroma = (1 - Math.abs(2 * 0.87 - 1)) * saturation;
  const x = tintChroma * (1 - Math.abs((hue % 2) - 1));
  const m = 0.87 - tintChroma / 2;
  const sector = Math.floor(hue);
  const [tr, tg, tb] = [
    [tintChroma, x, 0],
    [x, tintChroma, 0],
    [0, tintChroma, x],
    [0, x, tintChroma],
    [x, 0, tintChroma],
    [tintChroma, 0, x],
  ][sector % 6];
  return `#${[tr, tg, tb]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

/*
 * Text on the theme fill: white, or the ink colour on a light theme (relative luminance over
 * 0.5), so a yellow or pastel header stays readable.
 */
export const onThemeColor = (hex: string): string => {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#22272f" : "#ffffff";
};

export const mapSettings = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const template = asRecord(invoice.template);
  const theme = hexColor(template.primaryColor);
  return {
    // The default black lives in the stylesheet; any other theme colour is set inline with
    // its own tint.
    theme:
      theme && theme !== DEFAULT_THEME
        ? {
            accent: theme,
            tint: themeTint(theme),
            onAccent: onThemeColor(theme),
          }
        : null,
    transportInGrid:
      text(template.transportPosition).toLowerCase() !== "section",
  };
};

/* ------------------------------------------------------------------ script */

/*
 * Change Script (Language/Script and "Enable right-to-left script"): read under every name the
 * other templates accept, on invoice.template first, then the invoice. Latin, Latin ext,
 * Cyrillic, Greek and Vietnamese are in Inter already; any other script brings its Noto Sans
 * face from Google Fonts, used for the glyphs Inter lacks.
 */
const SCRIPT_FONTS: Record<string, string> = {
  arabic: "Noto Sans Arabic",
  urdu: "Noto Sans Arabic",
  persian: "Noto Sans Arabic",
  hebrew: "Noto Sans Hebrew",
  devanagari: "Noto Sans Devanagari",
  hindi: "Noto Sans Devanagari",
  marathi: "Noto Sans Devanagari",
  nepali: "Noto Sans Devanagari",
  bengali: "Noto Sans Bengali",
  bangla: "Noto Sans Bengali",
  gujarati: "Noto Sans Gujarati",
  gurmukhi: "Noto Sans Gurmukhi",
  punjabi: "Noto Sans Gurmukhi",
  tamil: "Noto Sans Tamil",
  telugu: "Noto Sans Telugu",
  kannada: "Noto Sans Kannada",
  malayalam: "Noto Sans Malayalam",
  oriya: "Noto Sans Oriya",
  odia: "Noto Sans Oriya",
  sinhala: "Noto Sans Sinhala",
  thai: "Noto Sans Thai",
  khmer: "Noto Sans Khmer",
  lao: "Noto Sans Lao",
  myanmar: "Noto Sans Myanmar",
  georgian: "Noto Sans Georgian",
  armenian: "Noto Sans Armenian",
  ethiopic: "Noto Sans Ethiopic",
  amharic: "Noto Sans Ethiopic",
  japanese: "Noto Sans JP",
  korean: "Noto Sans KR",
  chinese: "Noto Sans SC",
  chinesesimplified: "Noto Sans SC",
  simplifiedchinese: "Noto Sans SC",
  chinesetraditional: "Noto Sans TC",
  traditionalchinese: "Noto Sans TC",
};

/* Scripts read right to left on their own, even without the RTL switch. */
const RTL_SCRIPTS = ["arabic", "urdu", "persian", "hebrew"];

const scriptKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z]/g, "");

const optionalFlag = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  const raw = text(value).toLowerCase();
  if (["true", "1", "yes", "on"].includes(raw)) return true;
  if (["false", "0", "no", "off"].includes(raw)) return false;
  return undefined;
};

export const mapScript = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const template = asRecord(invoice.template);
  const sources = [template, invoice];
  const pick = (...keys: string[]) =>
    firstText(...sources.flatMap((source) => keys.map((key) => source[key])));
  const script = pick(
    "languageScript",
    "script",
    "fontScript",
    "scriptType",
    "language"
  );
  const key = scriptKey(script);
  const rtlFlag = sources
    .flatMap((source) =>
      [
        "enableRtl",
        "enableRTL",
        "isRtl",
        "isRTL",
        "rtl",
        "rightToLeft",
        "enableRightToLeft",
      ].map((name) => optionalFlag(source[name]))
    )
    .find((flag) => flag !== undefined);
  const direction = scriptKey(pick("direction", "textDirection", "dir"));
  const isRtl = rtlFlag ?? (direction === "rtl" || RTL_SCRIPTS.includes(key));
  const font = SCRIPT_FONTS[key] || "";
  return {
    dir: isRtl ? "rtl" : "ltr",
    lang: pick("languageCode", "lang", "locale"),
    script: key,
    font,
    fontUrl: font
      ? `https://fonts.googleapis.com/css2?family=${font.replace(
          / /g,
          "+"
        )}:wght@400;500;600;700&display=swap`
      : "",
  };
};

/* ------------------------------------------------------------------ document settings */

/*
 * A field's own setting (invoiceValueProps): `false`, or `{ visible | isVisible | show |
 * showInInvoice: false }` (also under `params`), hides it. Keys match case-blind.
 */
export const fieldSetting = (
  invoice: UnknownRecord,
  keys: string[]
): boolean | undefined => {
  const props = asRecord(invoice.invoiceValueProps);
  const names = Object.keys(props);
  return keys
    .map((key) =>
      names.find((name) => name.toLowerCase() === key.toLowerCase())
    )
    .filter((name): name is string => name !== undefined)
    .map((name) => {
      const prop = props[name];
      const record = asRecord(prop);
      const params = asRecord(record.params);
      return [
        prop,
        record.visible,
        record.isVisible,
        record.show,
        record.showInInvoice,
        params.visible,
        params.isVisible,
        params.showInInvoice,
      ]
        .map(optionalFlag)
        .find((value) => value !== undefined);
    })
    .find((value) => value !== undefined);
};

/*
 * The document's display settings, each under every name a host sends it (advanceOptions
 * first, then the document, whose root also carries the host-level fields), as the Sri Lankan
 * and Vaishnavi templates read them. Where the shared normalizer already resolves a setting,
 * its answer is the fallback, so a document with none of the aliases reads as before.
 */
export const resolveSettings = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const advanceOptions = asRecord(state.advanceOptions);
  const pdfOptions = asRecord(state.pdfOptions);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const read = (...keys: string[]): boolean | undefined =>
    [advanceOptions, invoice]
      .flatMap((source) => keys.map((key) => optionalFlag(source[key])))
      .find((value) => value !== undefined);
  // "show…" wins over "hide…"; with neither, the default.
  const showHide = (show: string[], hide: string[], fallback: boolean) => {
    const shown = read(...show);
    if (shown !== undefined) return shown;
    const hidden = read(...hide);
    return hidden === undefined ? fallback : !hidden;
  };
  const showTotals = Boolean(visibility.showTotals);
  return {
    descriptionFullWidth:
      read("showDescriptionInFullWidth", "isDescriptionFullWidth") ??
      Boolean(visibility.isDescriptionFullWidth),
    itemNameFullWidth:
      read("itemNameFullWidth", "showItemNameFullWidth") ??
      Boolean(visibility.itemNameFullWidth),
    // Serial numbers of serial-tracked stock, under the item's name (on unless switched off).
    serialNumbers:
      read("showSerialNumbersInDescription", "showSerialNumbersInInvoice") ??
      true,
    groupSubtotal: showHide(["showGroupSubTotal"], ["hideGroupSubTotal"], true),
    // The in-table Total row ("Show summarised total quantity").
    totalsRow:
      showTotals &&
      (read(
        "showSummarizedTotalQuantity",
        "showSummarisedTotalQuantity",
        "showTotalsRow"
      ) ??
        Boolean(visibility.showTotalsRow)),
    totalInWords: showHide(["showTotalInWords"], ["hideTotalInWords"], true),
    // The Balance Due row (shown once something is paid, unless switched off).
    dueAmount:
      fieldSetting(invoice, ["dueAmount", "balanceDue", "due", "toPay"]) ??
      showHide(
        ["showDueAmount", "showBalanceDue"],
        ["hideDueAmount", "hideBalanceDue"],
        true
      ),
    terms:
      fieldSetting(invoice, ["terms", "termsAndConditions"]) ??
      showHide(["showTerms"], ["hideTerms"], true),
    batchSummary: read("showStockSummary") ?? true, // "Show Batch Summary in Invoice"
    // "Show Applied Exchange Rate" (the document settings' checkbox
    // advanceOptions.showExchangeRateOnPdf): the business-currency figures and the Conversion
    // Rate row. Off unless switched on.
    exchangeRate:
      read(
        "showExchangeRateOnPdf",
        "showAppliedExchangeRate",
        "showExchangeRate"
      ) ?? false,
    // Lydia's Pageless PDF: one page as tall as the content, so nothing repeats per page.
    pageless:
      [pdfOptions.pageless, pdfOptions.isPageless, pdfOptions.longPdf]
        .map(optionalFlag)
        .find((value) => value !== undefined) ?? false,
  };
};

export type VirajSettings = ReturnType<typeof resolveSettings>;

/* ------------------------------------------------------------------ parties */

/* Parties carry an ISO country code ("IN"); print the country's name. */
/* Country names refrens.com writes its own way. */
const REFRENS_COUNTRY_NAMES: Record<string, string> = {
  US: "United States of America (USA)",
  AE: "United Arab Emirates (UAE)",
};

const regionName = (code: string): string => {
  const own = REFRENS_COUNTRY_NAMES[code.toUpperCase()];
  if (own) return own;
  return /^[A-Za-z]{2}$/.test(code)
    ? (new Intl.DisplayNames(["en"], { type: "region", fallback: "code" }).of(
        code.toUpperCase()
      ) as string)
    : code;
};

const ownerConfiguration = (invoice: UnknownRecord): UnknownRecord =>
  asRecord(asRecord(invoice.owner).configuration);

/* An e-invoice setting of the business (showSignedIrnQr, irnPosition), at the configuration's
   top level or in its tax / einvoice groups: test-janvi has never saved either, so where
   Refrens keeps them is not confirmed. */
const einvoiceSetting = (invoice: UnknownRecord, key: string): unknown => {
  const configuration = ownerConfiguration(invoice);
  return [
    configuration,
    asRecord(configuration.tax),
    asRecord(configuration.einvoice),
  ]
    .map((source) => source[key])
    .find((value) => value !== undefined && value !== null && value !== "");
};

/* `fieldVisibility.<key>.showInDocument` on the business, and the party's own map. */
const fieldShown = (
  invoice: UnknownRecord,
  party: UnknownRecord,
  key: string
): boolean => {
  const business = asRecord(
    asRecord(
      asRecord(ownerConfiguration(invoice).experimental).fieldVisibility
    )[key]
  );
  return (
    !isOff(business.showInDocument) &&
    !isOff(asRecord(party.fieldVisibility)[key])
  );
};

/* A party in India ("IN" or "India"). */
const isIndianParty = (party: UnknownRecord): boolean =>
  ["IN", "INDIA"].includes(text(party.country).toUpperCase());

/*
 * A party's VAT / TRN / TIN / SST / Tax ID prints only when the document carries it (user
 * rule: nothing that was not added in the form). A business profile keeps these numbers
 * whatever the document, so a stored value alone is not enough:
 *   - a switch that hides it anywhere (`<key>ShowInInvoice`, `hide<Key>`, the party's or the
 *     business's fieldVisibility) hides it;
 *   - an Indian GST document's form has GSTIN and PAN only, so there these show only when a
 *     switch turns them on explicitly; elsewhere (a VAT / TRN geography) they show by default.
 */
export const taxIdShown = (
  invoice: UnknownRecord,
  party: UnknownRecord,
  aliases: string[]
): boolean => {
  const names = aliases.map((alias) => alias.toLowerCase());
  const business = asRecord(
    asRecord(ownerConfiguration(invoice).experimental).fieldVisibility
  );
  const fromMap = (map: UnknownRecord) =>
    Object.keys(map)
      .filter((key) => names.includes(key.toLowerCase()))
      .map((key) => {
        const value = map[key];
        const record = asRecord(value);
        return [
          value,
          record.showInDocument,
          record.showInInvoice,
          record.visible,
        ]
          .map(optionalFlag)
          .find((flag) => flag !== undefined);
      });
  const switches = [
    ...aliases.flatMap((alias) => {
      const cap = alias.charAt(0).toUpperCase() + alias.slice(1);
      return [
        party[`${alias}ShowInInvoice`],
        party[`show${cap}InInvoice`],
        party[`show${cap}`],
      ].map(optionalFlag);
    }),
    ...fromMap(asRecord(party.fieldVisibility)),
    ...fromMap(business),
  ].filter((flag): flag is boolean => flag !== undefined);
  const hidden = aliases.some((alias) => {
    const cap = alias.charAt(0).toUpperCase() + alias.slice(1);
    return optionalFlag(party[`hide${cap}`]) === true;
  });
  if (hidden || switches.includes(false)) return false;
  if (switches.includes(true)) return true;
  // A party abroad prints its own tax number on an Indian GST document too (refrens.com).
  return (
    text(invoice.taxType).toUpperCase() !== "INDIA" || !isIndianParty(party)
  );
};

/* A party's field list, as an array or as a map keyed by field id (business profiles). */
const fieldList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : Object.values(asRecord(value));

/*
 * A custom field's value as Refrens prints it, whatever its type: a multi-select or checkbox
 * list joined ("Option 2, Option 3"), a yes/no field as "Yes" / "No", the rest as text.
 */
/*
 * A choice field's stored values print as their options' labels, in the options' order, as
 * refrens.com prints them: stored ["Option 4", "Option 3"] with option "Option 4" labelled
 * "Option 5" reads "Option 3, Option 5".
 */
const optionLabels = (value: unknown, options: unknown): unknown => {
  const list = asArray(options).map(asRecord);
  if (!list.length) return value;
  const chosen = (Array.isArray(value) ? value : [value]).map((entry) =>
    isRecord(entry) ? text(entry.value) : text(entry)
  );
  const labelled = list
    .filter((option) => chosen.includes(text(option.value)))
    .map((option) => firstText(option.label, option.value));
  const unknown = chosen.filter(
    (entry) => !list.some((option) => text(option.value) === entry)
  );
  const all = [...labelled, ...unknown].filter(Boolean);
  return Array.isArray(value) ? all : all[0] ?? value;
};

export const customFieldText = (
  value: unknown,
  options?: unknown,
  locale = "en-IN"
): string => {
  if (options !== undefined)
    return customFieldText(optionLabels(value, options), undefined, locale);
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        isRecord(entry) ? firstText(entry.label, entry.value) : text(entry)
      )
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  // A number field groups its digits in the document's locale, as refrens.com prints it
  // ("34,74,52,16,339" on an Indian document).
  if (typeof value === "number" && Number.isFinite(value)) {
    try {
      return new Intl.NumberFormat(locale || "en-IN", {
        maximumFractionDigits: 20,
      }).format(value);
    } catch {
      return String(value);
    }
  }
  // A currency field: "AED 200", as refrens.com prints it.
  if (isRecord(value) && hasValue(value.currency) && hasValue(value.amount)) {
    return `${text(value.currency)} ${text(value.amount)}`;
  }
  return text(value);
};

const extraRows = (party: UnknownRecord, locale?: string): LabelValue[] => [
  ...fieldList(party.additionalIds)
    .map(asRecord)
    .filter((entry) => !isOff(entry.showInInvoice))
    .map((entry) => ({
      key: "additionalId",
      label: text(entry.label),
      value: text(entry.value),
    })),
  ...fieldList(party.customFields)
    .map(asRecord)
    .filter((entry) => !isOff(asRecord(entry.params).showInInvoice))
    .map((entry) => ({
      key: "customField",
      label: firstText(entry.label, entry.name),
      value: customFieldText(entry.value, entry.options, locale),
      isDate: text(entry.dataType).toLowerCase() === "date",
    })),
  ...fieldList(party.customHeaders)
    .map(asRecord)
    .filter((entry) => !isOff(entry.showInInvoice))
    .map((entry) => ({
      key: "customHeader",
      label: text(entry.label),
      value: text(entry.value),
    })),
];

/*
 * Numbers never wrap; text does (user rule). A field the template reads as a figure or code
 * (a challan number, a vehicle number, an ID) keeps to one line only while its value looks
 * like one: a single unbroken token, or a short value with digits in it ("MH 12 AB 1234",
 * "+91 90000 00000"). A business can relabel such a field and fill it with text ("Final
 * Destination: <an address>"), which then wraps like any text. Dates stay whole.
 */
const NUMBER_LIKE_MAX = 24;

export const staysWhole = (value: unknown, isDate = false): boolean => {
  if (isDate) return true;
  const shown = text(value);
  // A long unbroken value (a URL) is no figure: it breaks where its box ends.
  if (!/\s/.test(shown)) return shown.length <= NUMBER_LIKE_MAX;
  return shown.length <= NUMBER_LIKE_MAX && /\d/.test(shown);
};

/*
 * Indian GST state codes, as refrens.com names them: a party's state prints from its GST state
 * code when it has one (Refrens prints "Andhra Pradesh" for gstState "37", even over a different
 * typed state), and Place of Supply as "Andhra Pradesh (37)". Copied from the shared normalizer's
 * table (not exported there), with "Other Countries" (96).
 */
const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "96": "Other Countries",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

export const partyStateName = (party: UnknownRecord): string => {
  const code = text(party.gstState).match(/^0?(\d{1,2})$/);
  return (
    (code && GST_STATE_NAMES[code[1].padStart(2, "0")]) || text(party.state)
  );
};

export const mapParty = (
  invoice: UnknownRecord,
  partyValue: unknown,
  title: string,
  // A shipping address keeps its GSTIN / PAN abroad too, as refrens.com prints it.
  keepIndianIds = false
) => {
  const party = asRecord(partyValue);
  const name = text(party.name);
  if (!name) return null;

  // "Bengaluru, Karnataka, India - 560055", as the design writes the city line.
  const pin = text(party.pincode || party.zipCode);
  const place = [
    text(party.city),
    text(party.district) === text(party.city) ? "" : text(party.district),
    partyStateName(party),
    regionName(text(party.country)),
  ]
    .filter(Boolean)
    .join(", ");
  const regionLine = [place, pin].filter(Boolean).join(" - ");
  const streetLine = [
    text(party.address),
    text(party.building),
    text(party.street),
  ]
    .filter(Boolean)
    .join(", ");

  const ids: LabelValue[] = [];
  // GSTIN and PAN only when filled: never a bare label, even with Refrens' "Show when
  // Empty" on (user rule: only the fields that were added print).
  // GSTIN and PAN are Indian numbers: refrens.com prints neither for a party abroad.
  const domestic =
    keepIndianIds || isIndianParty(party) || !text(party.country);
  if (domestic && fieldShown(invoice, party, "gst") && text(party.gstin)) {
    ids.push({ key: "gstin", label: "GSTIN", value: text(party.gstin) });
  }
  if (domestic && fieldShown(invoice, party, "pan") && text(party.panNumber)) {
    ids.push({ key: "pan", label: "PAN", value: text(party.panNumber) });
  }
  const labels = asRecord(invoice.customLabels);
  // The other geographies' tax numbers (VAT, TRN, TIN, SST, Tax ID), labelled as
  // sr-trading-2-0 labels them — only where the document carries them (taxIdShown).
  [
    {
      key: "vatNumber",
      aliases: ["vat", "vatNumber"],
      label: firstText(
        labels.vat,
        labels.vatNumber,
        party.vatLabel,
        "VAT Number"
      ),
    },
    {
      key: "trnNumber",
      aliases: ["trn", "trnNumber"],
      label: firstText(labels.trn, labels.trnNumber, "TRN"),
    },
    {
      key: "tinNumber",
      aliases: ["tin", "tinNumber"],
      label: firstText(labels.tin, labels.tinNumber, "TIN"),
    },
    {
      key: "sstNumber",
      aliases: ["sst", "sstNumber"],
      label: firstText(labels.sst, labels.sstNumber, "SST"),
    },
    {
      key: "taxId",
      aliases: ["taxId"],
      label: firstText(labels.taxId, "Tax ID"),
    },
  ].forEach(({ key, aliases, label }) => {
    // refrens.com prints none of these for a party in India.
    if (
      text(party[key]) &&
      !isIndianParty(party) &&
      taxIdShown(invoice, party, aliases)
    ) {
      ids.push({ key, label, value: text(party[key]) });
    }
  });

  /*
   * The contact person reads as a field like the others, "Contact Person: …" as
   * Refrens prints it, unless one of the party's own fields already carries the name.
   */
  const extras = extraRows(party, text(invoice.locale) || undefined).filter(
    (row) => row.label && row.value
  );
  const contactPerson = asRecord(party.contactPerson);
  const personName = text(contactPerson.name);
  // The contact person's email and phone print too when the client's contact asks for them
  // (contactPerson.displayFields, as the API sends it: ["name", "email", "phone"]).
  const shows = (field: string) =>
    asArray(contactPerson.displayFields).map(text).includes(field);
  const person: LabelValue[] = [
    ...(personName &&
    !extras.some((row) => row.value.toLowerCase() === personName.toLowerCase())
      ? [
          {
            key: "contactPerson",
            label: firstText(
              labels.contactPerson,
              labels.responsiblePerson,
              "Contact Person"
            ),
            value: personName,
          },
        ]
      : []),
    ...(shows("email") && text(contactPerson.email)
      ? [
          {
            key: "contactPersonEmail",
            label: labelOr(labels, "contactPersonEmail", "Contact Email"),
            value: text(contactPerson.email),
          },
        ]
      : []),
    ...(shows("phone") && text(contactPerson.phone)
      ? [
          {
            key: "contactPersonPhone",
            label: labelOr(labels, "contactPersonPhone", "Contact Phone"),
            value: text(contactPerson.phone),
          },
        ]
      : []),
  ];
  // Phone numbers never wrap (layout rule 4); an email address keeps to one line too. Party
  // boxes print the labels ("Phone: …"); the header prints the values alone.
  const contacts = [
    {
      key: "phone",
      label: labelOr(labels, "phone", "Phone"),
      value: isOff(party.phoneShowInInvoice) ? "" : text(party.phone),
      isNum: true,
    },
    {
      key: "email",
      label: labelOr(labels, "email", "Email"),
      value: isOff(party.emailShowInInvoice) ? "" : text(party.email),
      isNum: false,
    },
  ].filter((contact) => contact.value);

  /*
   * Every identifier line reads alike (12/500, label: value), in the header and the party
   * boxes: the tax numbers (GSTIN | PAN …), Phone | Email, then the responsible person and
   * the party's own fields (ID No., custom fields…) two to a line, in the order they were
   * filled in the form. Figures, codes, dates and one-word values never wrap
   * (isNum); an email stays on one line while it fits and breaks only when its box is too
   * narrow (isEmail), never overflowing; other text wraps.
   */
  const entry = (row: LabelValue & { isNum?: boolean }, numeric: boolean) => {
    const isNum = numeric && staysWhole(row.value, Boolean(row.isDate));
    return {
      label: row.label,
      value: row.value,
      isDate: Boolean(row.isDate),
      isNum,
      noWrap: isNum,
      isEmail: row.key === "email",
      isPhone: row.key === "phone",
      // One unbroken word (an email, a GSTIN, a code): it starts on its label's line and only
      // what does not fit runs on to the next (user request), instead of the whole value
      // dropping below the label.
      isToken: !row.isDate && !/\s/.test(row.value),
    };
  };
  const pairs = <T>(rows: T[]): T[][] =>
    rows
      .filter((_, index) => index % 2 === 0)
      .map((_, index) => rows.slice(index * 2, index * 2 + 2));
  const lines = [
    ids.map((row) => entry(row, true)),
    contacts.map((row) => entry(row, row.isNum)),
    ...pairs(
      [...person, ...extras].map((row) =>
        entry(row, Boolean(row.isDate) || /^\S+$/.test(row.value))
      )
    ),
  ].filter((line) => line.length > 0);

  return {
    title,
    name,
    // One line of text in the party boxes; the header sets the street in bold above the
    // city, state and country (user request).
    address: [streetLine, regionLine].filter(Boolean).join(", "),
    street: streetLine,
    region: regionLine,
    ids,
    contacts,
    extras,
    // The identifier lines share one grid in the party boxes, so their columns align.
    lines,
    hasIdLines: lines.length > 0,
  };
};

/* ------------------------------------------------------------------ QR codes */

/* eslint-disable no-bitwise, no-continue */

/*
 * Offline QR encoder (byte mode, error correction M, versions 1-40, up to 2,331 bytes: an
 * e-invoice's signed QR runs to about 1,000), extended from the one the Shree Vaishnavi
 * template ships (versions 21-40 follow the standard's block and alignment tables); the
 * API hands the UPI QR as a `upi://` link
 * and the document QR as text, not images, so the template draws them itself.
 */

// [ecc codewords per block, group 1 blocks, group 1 data codewords,
//  group 2 blocks, group 2 data codewords] for error correction level M.
const ECC_M_BLOCKS: Array<[number, number, number, number, number]> = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42],
  [26, 17, 42, 0, 0],
  [28, 17, 46, 0, 0],
  [28, 4, 47, 14, 48],
  [28, 6, 45, 14, 46],
  [28, 8, 47, 13, 48],
  [28, 19, 46, 4, 47],
  [28, 22, 45, 3, 46],
  [28, 3, 45, 23, 46],
  [28, 21, 45, 7, 46],
  [28, 19, 47, 10, 48],
  [28, 2, 46, 29, 47],
  [28, 10, 46, 23, 47],
  [28, 14, 46, 21, 47],
  [28, 14, 46, 23, 47],
  [28, 12, 47, 26, 48],
  [28, 6, 47, 34, 48],
  [28, 29, 46, 14, 47],
  [28, 13, 46, 32, 47],
  [28, 40, 47, 7, 48],
  [28, 18, 47, 31, 48],
];

const ALIGNMENT_POSITIONS: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

const dataCapacity = (version: number): number => {
  const [, blocks1, data1, blocks2, data2] = ECC_M_BLOCKS[version - 1];
  return blocks1 * data1 + blocks2 * data2;
};

const appendBits = (bits: number[], value: number, length: number): void => {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
};

const multiply = (left: number, right: number): number => {
  let result = 0;
  for (let index = 7; index >= 0; index -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((right >>> index) & 1) * left;
  }
  return result & 0xff;
};

const reedSolomonDivisor = (degree: number): number[] => {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let term = 0; term < degree; term += 1) {
      result[term] = multiply(result[term], root);
      if (term + 1 < degree) result[term] ^= result[term + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
};

const reedSolomonRemainder = (data: number[], divisor: number[]): number[] => {
  const result = new Array(divisor.length).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= multiply(coefficient, factor);
    });
  });
  return result;
};

const encodeCodewords = (bytes: Uint8Array, version: number): number[] => {
  const capacityBits = dataCapacity(version) * 8;
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    appendBits(bits, pad, 8);
  }
  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    data.push(
      bits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0)
    );
  }

  const [eccLength, blocks1, data1, blocks2, data2] = ECC_M_BLOCKS[version - 1];
  const divisor = reedSolomonDivisor(eccLength);
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let offset = 0;
  [
    ...new Array(blocks1).fill(data1),
    ...new Array(blocks2).fill(data2),
  ].forEach((length: number) => {
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, divisor));
  });

  const result: number[] = [];
  const longest = Math.max(data1, data2);
  for (let index = 0; index < longest; index += 1) {
    dataBlocks.forEach((block) => {
      if (index < block.length) result.push(block[index]);
    });
  }
  for (let index = 0; index < eccLength; index += 1) {
    eccBlocks.forEach((block) => result.push(block[index]));
  }
  return result;
};

type Matrix = { modules: boolean[][]; isFunction: boolean[][] };

const createBaseMatrix = (version: number): Matrix => {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () =>
    new Array(size).fill(false)
  );
  const isFunction = Array.from({ length: size }, () =>
    new Array(size).fill(false)
  );
  const set = (x: number, y: number, dark: boolean): void => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  for (let index = 0; index < size; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }
  [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ].forEach(([centerX, centerY]) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, distance !== 2 && distance !== 4);
      }
    }
  });

  const positions = ALIGNMENT_POSITIONS[version - 1];
  positions.forEach((y, row) => {
    positions.forEach((x, column) => {
      const last = positions.length - 1;
      if (
        (row === 0 && column === 0) ||
        (row === 0 && column === last) ||
        (row === last && column === 0)
      ) {
        return;
      }
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });

  // Reserve the format areas (drawn per mask later) and the dark module.
  for (let index = 0; index < 9; index += 1) {
    if (!isFunction[8][index]) set(index, 8, false);
    if (!isFunction[index][8]) set(8, index, false);
  }
  for (let index = 0; index < 8; index += 1) {
    set(size - 1 - index, 8, false);
    set(8, size - 1 - index, false);
  }
  set(8, size - 8, true);

  if (version >= 7) {
    let remainder = version;
    for (let index = 0; index < 12; index += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | remainder;
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) === 1;
      const a = size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  return { modules, isFunction };
};

const drawCodewords = (matrix: Matrix, codewords: number[]): void => {
  const { modules, isFunction } = matrix;
  const size = modules.length;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (isFunction[y][x]) continue;
        if (bitIndex < codewords.length * 8) {
          modules[y][x] =
            ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex += 1;
        }
      }
    }
  }
};

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

const applyMask = (matrix: Matrix, mask: number): boolean[][] =>
  matrix.modules.map((row, y) =>
    row.map((dark, x) =>
      matrix.isFunction[y][x] ? dark : dark !== MASKS[mask](x, y)
    )
  );

const drawFormatBits = (modules: boolean[][], mask: number): void => {
  const size = modules.length;
  // Error correction level M is 0b00.
  const data = mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (index: number): boolean => ((bits >>> index) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) modules[index][8] = bit(index);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let index = 9; index < 15; index += 1) {
    modules[8][14 - index] = bit(index);
  }
  for (let index = 0; index < 8; index += 1) {
    modules[8][size - 1 - index] = bit(index);
  }
  for (let index = 8; index < 15; index += 1) {
    modules[size - 15 + index][8] = bit(index);
  }
  modules[size - 8][8] = true;
};

const penalty = (modules: boolean[][]): number => {
  const size = modules.length;
  let score = 0;
  const lineScore = (line: boolean[]): number => {
    let total = 0;
    let run = 1;
    for (let index = 1; index <= line.length; index += 1) {
      if (index < line.length && line[index] === line[index - 1]) {
        run += 1;
      } else {
        if (run >= 5) total += run - 2;
        run = 1;
      }
    }
    const bits = line.map((dark) => (dark ? "1" : "0")).join("");
    const finderLike = /(?=(10111010000|00001011101))/g;
    total += (bits.match(finderLike) || []).length * 40;
    return total;
  };
  for (let index = 0; index < size; index += 1) {
    score += lineScore(modules[index]);
    score += lineScore(modules.map((row) => row[index]));
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) dark += 1;
      if (
        x < size - 1 &&
        y < size - 1 &&
        modules[y][x] === modules[y][x + 1] &&
        modules[y][x] === modules[y + 1][x] &&
        modules[y][x] === modules[y + 1][x + 1]
      ) {
        score += 3;
      }
    }
  }
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
};

export const encodeQrMatrix = (payload: string): boolean[][] | null => {
  const bytes = new TextEncoder().encode(payload);
  const version = ECC_M_BLOCKS.findIndex(
    (_spec, index) =>
      4 + (index + 1 <= 9 ? 8 : 16) + bytes.length * 8 <=
      dataCapacity(index + 1) * 8
  );
  if (!bytes.length || version < 0) return null;
  const matrix = createBaseMatrix(version + 1);
  drawCodewords(matrix, encodeCodewords(bytes, version + 1));
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMask(matrix, mask);
    drawFormatBits(candidate, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
};

/**
 * Returns an SVG data URL for the text, or "" when it cannot be encoded.
 * @param payload
 */
export const generateQrDataUrl = (payload: string): string => {
  const modules = encodeQrMatrix(String(payload ?? ""));
  if (!modules) return "";
  const quiet = 4;
  const size = modules.length + quiet * 2;
  const path = modules
    .flatMap((row, y) =>
      row.map((dark, x) => (dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : ""))
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/* eslint-enable no-bitwise, no-continue */

const isImageSource = (value: string): boolean =>
  /^(data:image\/|https?:\/\/|blob:)/i.test(value);

/* An image source as given, or the text drawn as a QR. */
export const qrImage = (value: string): string =>
  !value || isImageSource(value) ? value : generateQrDataUrl(value);

/*
 * The UPI intent the platform encodes: payee address and name, the amount still due (UPI
 * caps a transfer at 1,00,000; left out when the business accepts part payments) and the
 * document reference as the note (50 characters at most).
 */
export const upiIntent = (invoice: UnknownRecord, upiId: string): string => {
  const due = toAmount(
    pickFirst(asRecord(invoice.balance).due, asRecord(invoice.finalTotal).total)
  );
  const partial =
    asRecord(asRecord(invoice.paymentOptions).meta).allowPartialPayment ===
    true;
  const params = [
    ["pa", upiId],
    ["pn", text(asRecord(invoice.billedBy).name)],
    ["am", !partial && due > 0 ? Math.min(due, 100000).toFixed(2) : ""],
    ["cu", text(invoice.currency) || "INR"],
    [
      "tn",
      [text(invoice.invoiceTitle), text(invoice.invoiceNumber)]
        .filter(Boolean)
        .join(" ")
        .slice(0, 50),
    ],
  ].filter(([, value]) => value);
  return `upi://pay?${params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&")}`;
};

/* ------------------------------------------------------------------ meta */

/*
 * IRN and e-way rows follow the business settings in owner.configuration (einvoice / eway),
 * overridden by the host's einvoiceConfig / ewayConfig. A row shows when it has a value and
 * its setting is not false — a missing setting does not hide it.
 */
const complianceSettings = (invoice: UnknownRecord) => {
  const configuration = ownerConfiguration(invoice);
  return {
    einvoice: {
      ...asRecord(configuration.einvoice),
      ...asRecord(invoice.einvoiceConfig),
    },
    eway: { ...asRecord(configuration.eway), ...asRecord(invoice.ewayConfig) },
  };
};

const gstCode = (value: unknown): string => {
  const match = text(value).match(/^0?(\d{1,2})(?:\D|$)/);
  return match ? match[1].padStart(2, "0") : "";
};

/*
 * Country of supply: the document's own, else the buyer's country.
 * Place of supply: the document's own, else pos, then the buyer's GST state, state or
 * state code (the fallbacks Refrens prints with).
 */
const countryOfSupply = (invoice: UnknownRecord): string =>
  firstText(invoice.countryOfSupply, asRecord(invoice.billedTo).country);

const placeOfSupply = (invoice: UnknownRecord): string => {
  const billedTo = asRecord(invoice.billedTo);
  return firstText(
    invoice.placeOfSupply,
    invoice.pos,
    billedTo.gstState,
    billedTo.state,
    billedTo.stateCode
  );
};

/*
 * Indian place of supply prints as "State (code)": the code from the same raw value the
 * name was read from, the name from that code (the raw name when the code is unknown).
 */
export const placeOfSupplyText = (invoice: UnknownRecord): string => {
  const name = placeOfSupply(invoice).replace(/^0?\d{1,2}\s*[-:]\s*/, "");
  const country = countryOfSupply(invoice).toUpperCase();
  const billedTo = asRecord(invoice.billedTo);
  const code = gstCode(
    pickFirst(
      invoice.placeOfSupply,
      invoice.pos,
      billedTo.gstState,
      billedTo.state,
      billedTo.stateCode
    )
  );
  // The state is named from its GST code, as refrens.com does ("Karnataka (29)"), even when
  // the address carries another typed state (a buyer saved with "England" and code 29).
  const stateName = (code && GST_STATE_NAMES[code]) || name;
  return code && stateName !== code && (!country || country === "IN")
    ? `${stateName} (${code})`
    : name;
};

/*
 * Country / Place of Supply show whenever they have a value — the document's own, or the
 * buyer's country / state as Refrens falls back to — unless the document hides them. Each
 * field's settings: its field setting (invoiceValueProps), show…, hide… (advanceOptions,
 * then the invoice).
 */
const flag = (value: unknown): boolean | undefined => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
};

const supplySetting = (
  state: UnknownRecord,
  field: "countryOfSupply" | "placeOfSupply"
) => {
  const invoice = asRecord(state.invoice);
  const advanceOptions = asRecord(state.advanceOptions);
  const suffix = field[0].toUpperCase() + field.slice(1);
  const props = asRecord(invoice.invoiceValueProps);
  const propKey = Object.keys(props).find(
    (key) => key.toLowerCase() === field.toLowerCase()
  );
  const prop = propKey === undefined ? undefined : props[propKey];
  const configured =
    flag(prop) ??
    flag(asRecord(prop).visible) ??
    flag(asRecord(prop).showInInvoice);
  const shown = flag(
    pickFirst(advanceOptions[`show${suffix}`], invoice[`show${suffix}`])
  );
  const hidden = flag(
    pickFirst(advanceOptions[`hide${suffix}`], invoice[`hide${suffix}`])
  );
  return { configured, shown, hidden };
};

const customFieldValue = (field: UnknownRecord, ctx: FormatContext) => {
  const dataType = text(field.dataType).toLowerCase();
  if (dataType === "currency") return formatMoney(field.value, ctx);
  return customFieldText(field.value, field.options, ctx.locale);
};

/*
 * The invoice details grid (spec v2 §4.3): document fields and header fields, then the
 * transport fields when they sit in the grid. Country / Place of Supply have their own row
 * (mapSupply); document custom fields go to Additional Info.
 */
/* Characters beyond which a header detail's value moves under its label. */
const META_LONG = 30;

export const mapMeta = (state: UnknownRecord, transportRows: LabelValue[]) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);

  const rows: LabelValue[] = [
    // A purchase / expense prints its own number as "Purchase No", as refrens.com does.
    {
      key: "expenseNumber",
      label: "Purchase No",
      value: invoice.isExpenditure === true ? text(invoice.expenseNumber) : "",
    },
    {
      key: "invoiceNumber",
      label: labelOr(labels, "invoiceNumber", "Invoice Number"),
      // "#2026-1-SYNC22" unless the business hides the # (Settings > Hide # in all Document
      // Number series, owner.configuration.hideHashInDocumentNumber), as refrens.com prints it.
      value:
        text(invoice.invoiceNumber) &&
        ownerConfiguration(invoice).hideHashInDocumentNumber === false
          ? `#${text(invoice.invoiceNumber)}`
          : text(invoice.invoiceNumber),
    },
    {
      key: "invoiceDate",
      label: labelOr(labels, "invoiceDate", "Invoice Date"),
      value: firstText(invoice.invoiceDate),
      isDate: true,
    },
    {
      key: "dueDate",
      label: labelOr(labels, "dueDate", "Due Date"),
      value: firstText(invoice.dueDate),
      isDate: true,
    },
    // A credit / debit note's linked invoice, by number, as refrens.com prints it under the
    // dates. Only the notes' own endpoints (/creditnotes, /debitnotes) carry the number
    // ({ _id, invoiceNumber }); a bare id prints nothing (no empty fields, user rule).
    {
      key: "linkedDocument",
      label: labelOr(labels, "linkedDocument", "Linked Document"),
      value: [
        ...asArray(invoice.linkedInvoices),
        ...asArray(invoice.linkedDocuments),
      ]
        .map((linked) => text(asRecord(linked).invoiceNumber))
        .filter(Boolean)
        .join(", "),
    },
    // A credit / debit note's reason ("Product Return", "Correction in Invoice"), as Refrens
    // prints it under the dates.
    {
      key: "documentReason",
      label: labelOr(labels, "documentReason", "Reason"),
      value: text(invoice.documentReason),
    },
    {
      key: "purchaseOrderNumber",
      label: labelOr(labels, "purchaseOrderNumber", "PO No."),
      value: text(invoice.purchaseOrderNumber),
    },
    ...asArray(invoice.customHeaders)
      .map(asRecord)
      .map((entry) => ({
        key: "customHeader",
        label: text(entry.label),
        value: customFieldText(entry.value),
      })),
    ...transportRows,
    // "Created by <name>" when the document's "Show in Invoice" toggle beside its creator is
    // on (advanceOptions.showCreatorInInvoice).
    {
      key: "createdBy",
      label: labelOr(labels, "createdBy", "Created By"),
      value:
        asRecord(invoice.advanceOptions).showCreatorInInvoice === true
          ? text(asRecord(invoice.creator).name)
          : "",
    },
    {
      key: "reverseCharge",
      label: labelOr(labels, "reverseCharge", "Reverse Charge"),
      value:
        invoice.reverseCharge === true ||
        asRecord(invoice.advanceOptions).reverseCharge === true
          ? "Yes"
          : "",
    },
  ];

  // Figures, codes and dates never wrap (layout rule 4); text values do, and a long one
  // (more than META_LONG characters) takes a line of its own under its label (user request).
  // A field the business has switched off in its field settings stays off.
  return rows
    .filter((row) => row.label && row.value)
    .filter((row) => fieldSetting(invoice, [row.key]) !== false)
    .map((row) => ({
      ...row,
      isLong: !row.isDate && row.value.length > META_LONG,
      isNum:
        Boolean(row.isDate) ||
        ((Boolean(row.isNum) ||
          ["invoiceNumber", "purchaseOrderNumber", "linkedDocument"].includes(
            row.key
          )) &&
          staysWhole(row.value)) ||
        (row.key.startsWith("custom") && /^\S+$/.test(row.value)),
    }));
};

/*
 * Country of Supply | Place of Supply: a row of their own above the items table (as Refrens
 * prints them). Refrens has one toggle for both, "Show Place/Country Of Supply", stored as
 * hideCountryOfSupply: it shows or hides the whole row (data-ceres-country-of-supply, the
 * host's live toggle target). Place of Supply's own keys, when a document has them, act on
 * its cell (data-ceres-place-of-supply). Everything stays in the page, hidden, so the live
 * toggles have a target.
 */
export const mapSupply = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const country = supplySetting(state, "countryOfSupply");
  const place = supplySetting(state, "placeOfSupply");
  const rowShown =
    country.shown ?? (country.hidden === undefined ? true : !country.hidden);
  const rows = [
    {
      key: "countryOfSupply",
      label: labelOr(labels, "countryOfSupply", "Country of Supply"),
      value: regionName(countryOfSupply(invoice)),
      isHidden: country.configured === false,
      attr: "",
    },
    {
      key: "placeOfSupply",
      label: labelOr(labels, "placeOfSupply", "Place of Supply"),
      value: placeOfSupplyText(invoice),
      isHidden: !(
        place.configured ??
        place.shown ??
        (place.hidden === undefined ? true : !place.hidden)
      ),
      attr: "data-ceres-place-of-supply",
    },
  ].filter((row) => row.value);
  return { rows, show: rows.length > 0, hidden: !rowShown };
};

/*
 * Additional Info (spec v2 §4.11): the document's Additional Info fields (customFooters, as
 * Refrens prints them at the foot) and its custom fields, as label / value rows, any number
 * of them, values wrapping.
 */
export const mapAdditionalInfo = (state: UnknownRecord, ctx: FormatContext) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  // The document's Additional Info fields (customFooters / footers), then its custom fields.
  const footerRows = [
    ...asArray(invoice.customFooters),
    ...asArray(invoice.footers),
  ]
    .map(asRecord)
    .map((entry) => ({
      key: "footer",
      label: firstText(entry.label, entry.defaultValue),
      value: text(entry.value),
      isDate: false,
    }))
    .filter((row) => row.value);
  const fieldRows = asArray(invoice.customFields)
    .map(asRecord)
    .filter((entry) => !isOff(asRecord(entry.params).showInInvoice))
    .map((entry) => ({
      key: "customField",
      label: firstText(entry.label, entry.name),
      value: customFieldValue(entry, ctx),
      isDate: text(entry.dataType).toLowerCase() === "date",
    }))
    .filter((row) => row.label && row.value);
  const rows = [...footerRows, ...fieldRows];
  return rows.length
    ? {
        title: heading(labels, "additionalInfo", "Additional Information"),
        rows,
      }
    : null;
};

/*
 * Transport details: in the invoice details grid by default, or their own box beside Shipped
 * From (template setting transportPosition = "section"). Any transport value, or an e-way
 * bill alone, shows them; each row shows only when it has a value.
 */
/*
 * The e-way bill (number, date, valid till, cancelled on): printed in the compliance box under
 * the IRN details (user request), each row unless the business's e-way settings hide it.
 */
export const mapEway = (state: UnknownRecord): LabelValue[] => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const irn = asRecord(invoice.irn);
  const { eway } = complianceSettings(invoice);
  const rows: LabelValue[] = [
    ...(isOff(eway.billNumber)
      ? []
      : [
          {
            key: "ewayBillNumber",
            label: labelOr(labels, "ewayBillNumber", "Eway Bill"),
            value: text(irn.EwbNo),
            isNum: true,
          },
        ]),
    ...(isOff(eway.billDate)
      ? []
      : [
          {
            key: "ewayBillDate",
            label: labelOr(labels, "ewayBillDate", "E-Way Bill Date"),
            value: text(irn.EwbDt),
            isUtcDate: true,
          },
        ]),
    ...(isOff(eway.billValidTillDate)
      ? []
      : [
          {
            key: "ewayValidTill",
            label: labelOr(labels, "validTillDate", "Valid Till"),
            value: text(irn.EwbValidTill),
            isUtcDate: true,
          },
        ]),
    ...(isOff(eway.billCancelledDate)
      ? []
      : [
          {
            key: "ewayCancelled",
            label: labelOr(labels, "ewayCancelledDate", "E-Way Cancelled On"),
            value: text(irn.ewayCancelDate),
            isUtcDate: true,
          },
        ]),
  ];
  return rows.filter((row) => row.label && row.value);
};

/*
 * Refrens stores transport choices as codes ("RAIL", "OVERDIMENSIONALCARGO"); the document
 * prints their names, as Refrens does. An unknown code reads in title case ("NEW_MODE" →
 * "New Mode"); free text prints as typed.
 */
const TRANSPORT_NAMES: Record<string, string> = {
  ROAD: "Road",
  RAIL: "Rail",
  AIR: "Air",
  SHIP: "Ship",
  REGULAR: "Regular",
  OVERDIMENSIONALCARGO: "Over Dimensional Cargo",
};

export const transportName = (value: unknown): string => {
  const raw = text(value);
  if (!/^[A-Z][A-Z0-9_]*$/.test(raw)) return raw;
  return (
    TRANSPORT_NAMES[raw] ||
    raw
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ")
  );
};

/*
 * Transport Details in the order the form fills them and Refrens prints them (user request: no
 * reordering): Transport Mode, Transporter, Transporter ID, Distance, Challan Date, Challan
 * Number, Vehicle Type, Vehicle Number, then any extra information. Transaction Type and Sub
 * Supply Type belong to the e-way bill and are not printed here, as on Refrens.
 */
export const mapTransport = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const transport = asRecord(invoice.transportDetails);
  const transporter = asRecord(transport.transporter);

  const rows: LabelValue[] = [
    {
      key: "transportMode",
      label: labelOr(labels, "transportMode", "Transport Mode"),
      value: transportName(
        firstText(transport.transportMode, transport.transport)
      ),
    },
    {
      key: "transportName",
      // "Transporter", as Refrens prints it: the business's transportName label ("Transport")
      // is not the one Refrens uses for this line.
      label: labelOr(labels, "transporter", "Transporter"),
      value: firstText(transporter.name, transport.transporterName),
    },
    {
      key: "transporterId",
      label: labelOr(labels, "transporterId", "Transporter ID"),
      value: firstText(transporter.transporterId, transport.transporterId),
      isNum: true,
    },
    {
      key: "distance",
      label: labelOr(labels, "distance", "Distance"),
      value: text(transport.distance),
      isNum: true,
    },
    {
      key: "challanDate",
      label: labelOr(labels, "challanDate", "Challan Date"),
      value: text(transport.challanDate),
      isDate: true,
    },
    {
      key: "challanNumber",
      label: labelOr(labels, "challanNumber", "Challan Number"),
      value: text(transport.challanNumber),
      isNum: true,
    },
    {
      key: "vehicleType",
      label: labelOr(labels, "vehicleType", "Vehicle Type"),
      value: transportName(transport.vehicleType),
    },
    {
      key: "vehicleNumber",
      label: labelOr(labels, "vehicleNumber", "Vehicle Number"),
      value: text(transport.vehicleNumber),
      isNum: true,
    },
    {
      key: "transportExtraInfo",
      label: labelOr(labels, "transportExtraInfo", "Extra Information"),
      value: text(transport.extraInformation),
    },
  ]
    .filter((row) => row.label && row.value)
    .map((row) => ({
      ...row,
      isNum:
        Boolean(row.isDate) || (Boolean(row.isNum) && staysWhole(row.value)),
    }));

  // Any transport value shows the block.
  return rows.length
    ? { title: heading(labels, "transport", "Transport Details"), rows }
    : null;
};

export const mapCompliance = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const irn = asRecord(invoice.irn);
  const { einvoice } = complianceSettings(invoice);
  const isCancelled =
    asRecord(asRecord(state.mapped).irn).isCancelled === true ||
    text(invoice.einvoiceGeneratedStatus).toUpperCase() === "CANCELLED";
  // The e-invoice QR: an image the host posts (qrCode), else the IRN's own QR text as the API
  // sends it — the signed QR (irn.SignedQRCode) when the business prints that
  // (owner.configuration.showSignedIrnQr), else the QR payload (irn.qr) — drawn here.
  const irnQr = qrImage(
    firstText(
      invoice.qrCode,
      irn.qrCode,
      einvoiceSetting(invoice, "showSignedIrnQr") === true
        ? firstText(irn.SignedQRCode, irn.qr)
        : firstText(irn.qr, irn.SignedQRCode)
    )
  );

  const rows: LabelValue[] = [
    {
      key: "ackNo",
      label: labelOr(labels, "irnAcknowledgementNumber", "Ack No."),
      value:
        isOff(einvoice.irnAcknowledgementNumber) || isCancelled
          ? ""
          : text(irn.AckNo),
    },
    {
      key: "ackDate",
      label: labelOr(labels, "irnAcknowledgementDate", "Ack Date"),
      value:
        isOff(einvoice.irnAcknowledgementDate) || isCancelled
          ? ""
          : text(irn.AckDt),
      isUtcDate: true,
    },
    {
      key: "irnCancelled",
      label: labelOr(labels, "irnCancelledDate", "IRN Cancelled On"),
      value: isOff(einvoice.irnCancelledDate) ? "" : text(irn.CancelDate),
      isDate: true,
    },
  ].filter((row) => row.value);
  const eway = mapEway(state);

  return {
    // Above the item table unless the business places it below (irnPosition).
    isBelowItems:
      firstText(invoice.irnPosition, einvoiceSetting(invoice, "irnPosition"))
        .toUpperCase()
        .replace(/[^A-Z]/g, "") === "BELOWLINEITEMS",
    showIrn: !isOff(einvoice.irnNumber),
    irnLabel: labelOr(labels, "irn", "IRN No."),
    irn: text(irn.Irn),
    // E-Invoice and E-Way Bill: two groups of "Label: value" lines side by side, without titles
    // (user request), the QR codes on the end edge.
    eway,
    rows: [...rows, ...eway],
    irnRows: rows,
    // Two to a line (Ack No. | Ack Date), like the party fields.
    rowLines: rows
      .filter((_, index) => index % 2 === 0)
      .map((_, index) => rows.slice(index * 2, index * 2 + 2)),
    /*
     * One QR: while the e-invoice is active its QR (signed or plain, per showSignedIrnQr)
     * prints on the end edge of the IRN details, beside the IRN it belongs to (user,
     * 2026-10-20); the details box then holds none. The document QR itself never prints in
     * this template (user request).
     */
    qr: {
      irn: irnQr && !isCancelled ? irnQr : "",
      zatca: text(invoice.zatcaQrCode),
      lhdn: text(invoice.lhdnQrCode),
      document: "",
      documentAlt: "Document QR Code",
    },
  };
};

/* ------------------------------------------------------------------ items */

/*
 * Units. An item's unit is either its name ("PCS") or the key of a unit the business set up
 * ("1ohfdis0uax"), resolved through the business's unit configuration, whatever its shape: a
 * list of { _id | id | key | value | code | unit, name … } entries, a { key: name } map, a
 * { name: key } map, or groups of these (same rules as the Solvin template). A key that
 * resolves nowhere is never printed: the item's own unit name fields are tried, else nothing.
 */
const UNIT_IDS = ["_id", "id", "key", "value", "code", "unit"];

const unitName = (entry: unknown, raw: string): string => {
  if (!isRecord(entry)) {
    const value = text(entry);
    return value === raw ? "" : value;
  }
  return firstText(
    entry.displayName,
    entry.label,
    entry.name,
    entry.symbol,
    entry.unitName,
    entry.code,
    text(entry.value) === raw ? "" : entry.value
  );
};

const matchesUnit = (entry: unknown, raw: string): boolean =>
  isRecord(entry) && UNIT_IDS.some((key) => text(entry[key]) === raw);

const findUnit = (units: unknown, raw: string, depth: number): string => {
  if (!units || depth > 3) return "";
  if (Array.isArray(units)) {
    return (
      units
        .filter((entry) => matchesUnit(entry, raw))
        .map((entry) => unitName(entry, raw))
        .find(Boolean) || ""
    );
  }
  const map = asRecord(units);
  const direct = Object.prototype.hasOwnProperty.call(map, raw)
    ? unitName(map[raw], raw)
    : "";
  if (direct) return direct;
  return (
    Object.entries(map)
      .map(([key, entry]) => {
        if (!isRecord(entry) && !Array.isArray(entry)) {
          return text(entry) === raw && key !== raw ? key : "";
        }
        return matchesUnit(entry, raw)
          ? unitName(entry, raw)
          : findUnit(entry, raw, depth + 1);
      })
      .find(Boolean) || ""
  );
};

/* A generated key (letters and digits, 8+ long) is an id, not a name. */
const isUnitKey = (value: string): boolean =>
  value.length >= 8 && /[a-z]/i.test(value) && /\d/.test(value);

export const unitText = (invoice: UnknownRecord, item: UnknownRecord) => {
  const raw = isRecord(item.unit)
    ? firstText(
        item.unit.value,
        item.unit.code,
        item.unit.symbol,
        item.unit.name,
        item.unit.label
      )
    : text(item.unit);
  const configured = raw
    ? [
        ownerConfiguration(invoice).units,
        asRecord(asRecord(invoice.business).configuration).units,
        asRecord(asRecord(invoice.ownerBusiness).configuration).units,
        asRecord(invoice.configuration).units,
        invoice.units,
      ]
        .map((units) => findUnit(units, raw, 0))
        .find(Boolean)
    : "";
  return (
    configured ||
    firstText(item.unitName, item.uomName, item.uom) ||
    (isUnitKey(raw) ? "" : raw)
  );
};

/*
 * The batches an item is drawn from: its allocations' batch data (a batch-tracked line
 * carries { batch: <id>, batchData: { batchName, batchCode, expiryDate, … } }), else the batch
 * itself when it came populated, then the item's own batchSummary entries. A bare batch id is
 * never one of them.
 */
const itemBatches = (item: UnknownRecord): UnknownRecord[] => [
  ...asArray(item.allocations).map((entry) => {
    const allocation = asRecord(entry);
    return {
      ...(isRecord(allocation.batch) ? allocation.batch : {}),
      ...asRecord(allocation.batchData),
    };
  }),
  ...asArray(item.batchSummary).map((entry) => {
    const record = asRecord(entry);
    return { ...asRecord(record.batch), ...record };
  }),
];

/*
 * Refrens' batch columns in the items table (the business's own columns: Batch Name, Batch
 * Code, Expiry Date, Mfg Date, Mfg Name, Mfg Batch No.): each batch's value, once each.
 */
const BATCH_FIELD_KEYS = [
  "batchName",
  "batchCode",
  "expiryDate",
  "manufacturingDate",
  "manufacturerName",
  "manufacturerBatchNumber",
];

const batchFieldText = (
  item: UnknownRecord,
  key: string,
  ownerOffset: unknown
): string =>
  itemBatches(item)
    .map((batch) => {
      const value =
        key === "batchName"
          ? pickFirst(batch.batchName, batch.name)
          : batch[key];
      if (!hasValue(value)) return "";
      return /date$/i.test(key)
        ? formatDocumentDate(value, ownerOffset)
        : text(value);
    })
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(", ");

/*
 * An item's serial numbers (serial-tracked stock): its own list, then those of its batches,
 * each a plain value or { serialNumber | serialNo | serial | code | value | name }, once each.
 */
const serialText = (value: unknown): string => {
  if (!isRecord(value)) return text(value);
  return firstText(
    value.serialNumber,
    value.serialNo,
    value.serial,
    value.code,
    value.value,
    value.name
  );
};

const listOf = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  return hasValue(value) || isRecord(value) ? [value] : [];
};

export const itemSerialNumbers = (item: UnknownRecord): string =>
  [
    ...listOf(
      pickFirst(
        item.serialNumbers,
        item.serials,
        item.inventorySerialNumbers,
        item.serialNumber,
        item.serialNo
      )
    ),
    ...asArray(item.batchSummary).flatMap((entry) => {
      const batch = asRecord(entry);
      return listOf(
        pickFirst(
          batch.serialNumbers,
          batch.serials,
          batch.inventorySerialNumbers
        )
      );
    }),
  ]
    .map(serialText)
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(", ");

const columnKind = (column: UnknownRecord): ColumnKind => {
  const key = text(column.key);
  const semantic = text(column.semanticType).toLowerCase();
  if (key === "name") return "name";
  if (CODE_KEYS.includes(key)) return "code";
  if (key === "quantity") return "qty";
  if (key === "gstRate" || semantic === "percentage") return "percent";
  if (key === "discount") return "discount";
  // A cess column prints as a plain figure, as refrens.com's invoices print it.
  if (column.isCessColumn === true) return "number";
  if (
    MONEY_KEYS.includes(key) ||
    semantic === "currency" ||
    text(column.dataType).toLowerCase() === "currency" ||
    text(column.fxReturnType).toLowerCase() === "currency"
  ) {
    return "money";
  }
  // A formula returning a number prints as a figure, as a number column does (refrens.com).
  const dataType = text(column.dataType).toLowerCase();
  return dataType === "number" ||
    (dataType === "formula" &&
      ["number", ""].includes(text(column.fxReturnType).toLowerCase()))
    ? "number"
    : "text";
};

const makeColumn = (column: UnknownRecord): ItemColumn => {
  const key = text(column.key);
  const kind = columnKind(column);
  const summable =
    (["qty", "money", "discount"].includes(kind) && key !== "rate") ||
    (kind === "number" && column.summarise === true);
  return {
    key,
    label: text(column.label),
    kind,
    className: `vt-col-${key.replace(/[^A-Za-z0-9_-]/g, "")} ${
      NUMERIC_KINDS.includes(kind) || kind === "code" ? "is-fixed" : "is-text"
    }${NUMERIC_KINDS.includes(kind) ? " is-num" : ""}`,
    summable,
  };
};

const customCellValue = (item: UnknownRecord, column: ItemColumn): unknown =>
  pickFirst(
    item[column.key],
    asRecord(item.custom)[column.key],
    asRecord(
      asArray(item.customFields)
        .map(asRecord)
        .find((field) =>
          [field.key, field.name, field.label]
            .map(text)
            .some((name) => name === column.key || name === column.label)
        )
    ).value
  );

/* The discount column holds either a flat amount or `{ amount, discountType }`. */
const discountParts = (item: UnknownRecord) => {
  const { discount } = item;
  if (!isRecord(discount)) return { amount: discount, isPercent: false };
  return {
    amount: discount.amount,
    isPercent: /percent/i.test(text(discount.discountType)),
  };
};

/*
 * A custom (formula) column can hold its figure as formatted text — "20,13,20,21,562" — and a
 * plain number reader stops at the first comma, printing "20" (user report). Grouped text
 * that is all digits reads as the whole number; anything else stays as it is.
 */
export const groupedNumber = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!/^-?\d{1,3}([,\s]\d{2,3})+(\.\d+)?$/.test(raw)) return value;
  const parsed = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : value;
};

export const columnNumber = (
  item: UnknownRecord,
  column: ItemColumn
): unknown => {
  if (column.key === "total") return pickFirst(item.total, item.subTotal);
  if (column.key === "sgst") return pickFirst(item.sgst, item.utgst);
  if (column.key === "gstRate") return pickFirst(item.gstRate, item.taxRate);
  if (column.kind === "discount") return discountParts(item).amount;
  const value = customCellValue(item, column);
  return column.kind === "text" ? value : groupedNumber(value);
};

const cellValue = (
  invoice: UnknownRecord,
  visibility: UnknownRecord,
  item: UnknownRecord,
  column: ItemColumn,
  ctx: FormatContext,
  mergeUnit: boolean
): string => {
  if (BATCH_FIELD_KEYS.includes(column.key)) {
    const own = customCellValue(item, column);
    return hasValue(own)
      ? text(own)
      : batchFieldText(item, column.key, invoice.ownerOffset);
  }
  const value = columnNumber(item, column);
  switch (column.kind) {
    case "code":
      if (column.key === "unit") return unitText(invoice, item);
      return text(value);
    case "qty": {
      // "10 PCS": the account's choice, or the table's last-but-one width fallback.
      const unit =
        visibility.showUnitInQuantity || mergeUnit
          ? unitText(invoice, item)
          : "";
      const quantity = formatQuantity(value, ctx);
      // "1 (LDS)", as refrens.com writes a merged unit.
      return quantity && unit ? `${quantity} (${unit})` : quantity;
    }
    case "percent":
      return formatPercent(value, ctx);
    case "discount": {
      // A line without a discount reads "0%"; a flat one as entered ("₹50"), as refrens.com.
      const parts = discountParts(item);
      const amount = hasValue(parts.amount) ? parts.amount : 0;
      return parts.isPercent || !hasValue(parts.amount)
        ? formatPercent(amount, ctx)
        : formatRate(amount, ctx);
    }
    case "money":
      // The unit price as entered ("₹15,000", "₹1", "₹12.5"), as refrens.com prints it; the
      // amounts keep the document's decimal places.
      return column.key === "rate"
        ? formatRate(value, ctx)
        : formatMoney(value, ctx);
    // A custom number or formula column: grouped, at the document's decimal places, without a
    // currency symbol ("15,62,82,300.00", "0.00"), as refrens.com prints them.
    case "number": {
      // A negative figure with its minus sign ("-8.00"), as refrens.com prints these columns.
      const figure = formatFigure(value, ctx);
      return figure.startsWith("(") ? `-${figure.slice(1, -1)}` : figure;
    }
    default:
      return Array.isArray(value) ? value.map(text).join(", ") : text(value);
  }
};

/*
 * MSIC: the shared normalizer always drops it; refrens.com prints the column (unless hidden) on
 * quotations and delivery challans, and not on invoices, proformas or sales orders (checked on
 * 148 real test documents, every Refrens template alike). Other types: kept off.
 */
const MSIC_TYPES = ["QUOTATION", "DELIVERYCHALLAN"];

const resolveColumns = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const labels = asRecord(invoice.customLabels);
  // Normalization drops semanticType / isCessColumn; read them off the account's column.
  const raw = asArray(invoice.columns).map(asRecord);
  // MSIC is a column like any other on refrens.com (the shared normalizer always drops it):
  // it prints unless the business hid it.
  const columns = asArray(asRecord(state.mapped).columns)
    .map(asRecord)
    .filter(
      (column) =>
        text(column.key) &&
        (column.isHidden !== true ||
          (column.key === "msic" &&
            MSIC_TYPES.includes(text(invoice.billType).toUpperCase()) &&
            raw.some(
              (entry) => entry.key === "msic" && entry.isHidden !== true
            )))
    )
    .map((column) =>
      makeColumn({
        ...raw.find((entry) => entry.key === column.key),
        ...column,
      })
    );
  const has = (key: string) => columns.some((column) => column.key === key);

  // Unit is not an account column: it comes from the item itself. Batch columns are the
  // business's own (batchName, batchCode, expiryDate…), filled from the item's batches.
  const quantityIndex = columns.findIndex(
    (column) => column.key === "quantity"
  );
  // No item with a unit: no Unit column (as refrens.com).
  const anyUnit = asArray(invoice.items)
    .map(asRecord)
    .some((item) => !item.group && unitText(invoice, item));
  // An account Unit column with no unit on any item prints nothing on refrens.com.
  if (!anyUnit && has("unit")) {
    columns.splice(
      columns.findIndex((column) => column.key === "unit"),
      1
    );
  }
  if (
    visibility.showUnitAsColumn &&
    anyUnit &&
    !has("unit") &&
    quantityIndex >= 0
  ) {
    columns.splice(
      quantityIndex + 1,
      0,
      makeColumn({ key: "unit", label: labelOr(labels, "unit", "Unit") })
    );
  }
  return columns;
};

/*
 * Item images arrive as plain URLs or as { url } / { src } objects, in an array or alone —
 * read them through the image widget's own normalizer so every shape renders.
 */
const imageList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .map((entry) => toImageSrc(entry as ImageInput))
    .filter((src): src is string => src !== null);

/*
 * "Show thumbnail as column" puts the item's own `thumbnail` beside its name — a separate
 * field from `images[]` (the API never repeats it there), so an item without one shows none
 * rather than borrowing a gallery image.
 */
export const thumbnailOf = (item: UnknownRecord): string =>
  imageList(item.thumbnail)[0] || "";

const isRealItem = (item: UnknownRecord) =>
  item.group !== true &&
  item.isGroupItemTotalRow !== true &&
  item.isAdditionalCharge !== true;

/*
 * Table layout. Columns start at their Figma widths (node 18843:3442) and grow only when their
 * widest value needs it; Description takes the rest of the 960 px design width and keeps at
 * least 22% of the table. When it would fall below that, these fallbacks apply in order:
 * columns shrink to their content, headers wrap (after "/"), Unit merges into Qty, numbers get
 * 10% smaller. Below the table's minimum width the table scrolls inside its own box. Widths
 * are estimated from the text with bold glyph widths, which errs wide for the regular cells.
 */
/* 960 px of content less the table's own 1 px outline on each side. */
const DESIGN_TABLE_WIDTH = 958;
/*
 * Every cell, header included, carries 6 px of padding each side (user request); the Sr
 * column is the design's 28 px widened by that padding.
 */
// The most figure columns a tablet lays out side by side under the item's name (styles.css).
const TABLET_FIGURE_COLUMNS = 8;
const SERIAL_WIDTH = 43;
/* Item columns holding a tax amount (IGST, CGST, SGST, UTGST, cess…). */
const TAX_COLUMN = /^(igst|cgst|sgst|utgst|cess|vat|tax)/i;
const MIN_DESCRIPTION_SHARE = 0.22;
const CELL_PADDING = 13; // 6 px each side + the 1 px rule
const HEADER_PADDING = CELL_PADDING;

/*
 * Advance widths of Inter Bold at 12 px (measured in Chrome). Headers, item amounts and the
 * Total row are bold, so every estimate uses them; regular figures are a little narrower.
 * Lower-case letters count as their capitals, which errs wide.
 */
const BOLD_WIDTHS: Record<string, number> = {
  "0": 8.09,
  "1": 5.18,
  "2": 7.56,
  "3": 7.74,
  "4": 8.12,
  "5": 7.46,
  "6": 7.8,
  "7": 6.98,
  "8": 7.81,
  "9": 7.8,
  A: 8.96,
  B: 7.94,
  C: 8.88,
  D: 8.67,
  E: 7.29,
  F: 7.04,
  G: 9.01,
  H: 8.96,
  I: 3.37,
  J: 7.01,
  K: 8.63,
  L: 6.79,
  M: 11.18,
  N: 9.15,
  O: 9.25,
  P: 7.78,
  Q: 9.32,
  R: 7.88,
  S: 7.86,
  T: 8.01,
  U: 8.78,
  V: 8.96,
  W: 12.45,
  X: 8.86,
  Y: 8.77,
  Z: 7.97,
  ",": 4.01,
  ".": 4.01,
  "/": 4.66,
  "-": 5.61,
  ":": 4.01,
  " ": 3.2,
  "%": 12.19,
  "(": 4.53,
  ")": 4.53,
  "&": 8.06,
};
const DEFAULT_CHAR_WIDTH = 8;

/* The table's text is 13 px (user request); the widths above are measured at 12 px. */
const TABLE_TEXT_SCALE = 13 / 12;

/* One-line width of a value in the table's bold text. */
const textWidth = (value: string): number =>
  Array.from(value.toUpperCase()).reduce(
    (total, char) => total + (BOLD_WIDTHS[char] ?? DEFAULT_CHAR_WIDTH),
    0
  ) * TABLE_TEXT_SCALE;

/*
 * data-col (the test hook) and the starting width of each account column: the Figma widths
 * (Unit Price 103, Qty / Unit 61, Model 78), the rest sized alike.
 */
const COLUMN_SPEC: Record<string, { col: string; width: number }> = {
  name: { col: "desc", width: 0 },
  itemCode: { col: "code", width: 78 },
  sku: { col: "code", width: 78 },
  batchName: { col: "batch", width: 78 },
  hsn: { col: "hsn", width: 78 },
  quantity: { col: "qty", width: 61 },
  unit: { col: "unit", width: 61 },
  rate: { col: "rate", width: 103 },
  discount: { col: "disc", width: 78 },
  amount: { col: "tx", width: 103 },
  gstRate: { col: "gst", width: 61 },
  cgst: { col: "c", width: 93 },
  sgst: { col: "s", width: 93 },
  igst: { col: "ig", width: 103 },
  total: { col: "amt", width: 103 },
};
const CUSTOM_COLUMN_WIDTH = 78;

/* Header words, with a break opportunity after every "/" ("HSN/" + "SAC"). */
export const headerParts = (label: string): string[] =>
  label.replace(/\//g, "/\u0000").split("\u0000").filter(Boolean);

const headerWidth = (label: string): number =>
  Math.max(0, ...label.split(/\s+/).flatMap(headerParts).map(textWidth)) +
  HEADER_PADDING;

const longestWordWidth = (value: string): number =>
  Math.max(0, ...value.split(/\s+/).map(textWidth));

interface WidthInput {
  column: ItemColumn;
  values: string[];
  /* Qty's values as they print once Unit merges into it ("10 PCS"). */
  mergedValues?: string[];
}

/* The narrowest one-line width a column's content needs, at a given figure scale. */
const contentWidth = (
  { column, values }: { column: ItemColumn; values: string[] },
  scale: number
): number =>
  Math.max(
    headerWidth(column.label),
    ...values.map(
      (value) =>
        (column.kind === "text" ? longestWordWidth(value) : textWidth(value)) *
          scale +
        CELL_PADDING
    )
  );

export interface TableLayout {
  /* Final width per column key, in px. */
  widths: Record<string, number>;
  mergeUnit: boolean;
  smallNumbers: boolean;
  /* Description's width at the design width, and the minimum it is held to. */
  descriptionWidth: number;
  descriptionMin: number;
  /* Every column but Description, shrunk to content at full size: what print has to fit. */
  printFixedWidth: number;
}

export const planTableLayout = (inputs: WidthInput[]): TableLayout => {
  const fixed = inputs.filter(({ column }) => column.kind !== "name");
  const startOf = (column: ItemColumn) =>
    (COLUMN_SPEC[column.key] || { width: CUSTOM_COLUMN_WIDTH }).width;
  const minDescription = DESIGN_TABLE_WIDTH * MIN_DESCRIPTION_SHARE;

  const attempt = (shrink: boolean, mergeUnit: boolean, scale: number) => {
    const widths: Record<string, number> = {};
    fixed
      .filter(({ column }) => !(mergeUnit && column.key === "unit"))
      .forEach((input) => {
        const values =
          mergeUnit && input.mergedValues ? input.mergedValues : input.values;
        const needed = Math.ceil(
          contentWidth({ column: input.column, values }, scale)
        );
        widths[input.column.key] = shrink
          ? needed
          : Math.max(startOf(input.column), needed);
      });
    const others = Object.values(widths).reduce(
      (total, width) => total + width,
      SERIAL_WIDTH
    );
    return { widths, others, mergeUnit, smallNumbers: scale < 1 };
  };

  // The Unit column stays a column of its own however crowded the table (refrens.com never
  // folds it into Quantity to make room); only the business's own setting merges it.
  const steps = [
    attempt(false, false, 1),
    attempt(true, false, 1), // shrink to content; headers already wrap after "/"
    attempt(true, false, 0.9),
  ];
  const chosen =
    steps.find((step) => DESIGN_TABLE_WIDTH - step.others >= minDescription) ||
    steps[steps.length - 1];

  return {
    widths: chosen.widths,
    mergeUnit: chosen.mergeUnit,
    smallNumbers: chosen.smallNumbers,
    descriptionWidth: DESIGN_TABLE_WIDTH - chosen.others,
    // Content width that holds the Description cell at ≥ 22% of the table even when the
    // table must scroll (2 px spare for rounding); the cell adds its own padding and rule.
    descriptionMin:
      Math.ceil(
        (chosen.others * MIN_DESCRIPTION_SHARE) / (1 - MIN_DESCRIPTION_SHARE)
      ) +
      2 -
      CELL_PADDING,
    printFixedWidth: attempt(true, chosen.mergeUnit, 1).others,
  };
};

const NUMBER_KINDS: ColumnKind[] = [...NUMERIC_KINDS, "code"];
/* Text values up to this many characters never wrap in the item table. */
const SHORT_TEXT = 12;

/*
 * A markdown table (the editor's table, in the notes or an item's description) loses what is
 * empty, so nothing prints without a value (user rule): spacer columns empty in every row
 * (the notes grid reads label | value | label | value without blank strips), rows empty in
 * every cell, and a table with nothing in it at all. An empty heading row gives way to the
 * first row with something in it (headings print like any row here). Only whole table
 * blocks are touched; everything else stays as typed.
 */
export const withoutEmptyColumns = (markdown: string): string => {
  const lines = markdown.split("\n");
  const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
  const isRule = (line: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line);
  const cellsOf = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (!isRow(lines[i])) {
      out.push(lines[i]);
      i += 1;
    } else {
      const block: string[] = [];
      while (i < lines.length && isRow(lines[i])) {
        block.push(lines[i]);
        i += 1;
      }
      const rows = block.map(cellsOf);
      const ruleAt = block.findIndex(isRule);
      if (ruleAt !== 1) {
        out.push(...block); // not a table as the editor writes it: left as typed
      } else {
        const filled = (row: string[]) => row.some((cell) => text(cell) !== "");
        const content = rows.filter((row, r) => r !== ruleAt && filled(row));
        const width = Math.max(...rows.map((row) => row.length));
        const keep = Array.from({ length: width }, (_, col) =>
          content.some((row) => text(row[col]) !== "")
        );
        if (content.length > 0) {
          const head = filled(rows[0]) ? rows[0] : content[0];
          const body = content.filter((row) => row !== head);
          const line = (row: string[]) =>
            `|${Array.from({ length: width }, (_, col) => row[col] ?? "")
              .filter((_, col) => keep[col])
              .join("|")}|`;
          out.push(
            line(head),
            `|${keep
              .filter(Boolean)
              .map(() => " --- ")
              .join("|")}|`,
            ...body.map(line)
          );
        }
      }
    }
  }
  return out.join("\n");
};

const ROOMY_COLUMNS = 8;

/*
 * Group subtotals, as refrens.com prints them: a document with groups but no stored total rows
 * gets a "Sub total" row after each group's items, summing the quantity and the amounts (never
 * the taxes). Stored total rows (isGroupItemTotalRow) are used as they are.
 */
const withGroupSubtotals = (
  items: UnknownRecord[],
  columns: ItemColumn[],
  enabled: boolean
): UnknownRecord[] => {
  const hasGroups = items.some((item) => item.group === true);
  const hasTotals = items.some((item) => item.isGroupItemTotalRow === true);
  if (!enabled || !hasGroups || hasTotals) return items;
  const summed = columns.filter(
    (column) =>
      column.summable &&
      !TAX_COLUMN.test(column.key) &&
      column.kind !== "discount"
  );
  const out: UnknownRecord[] = [];
  let members: UnknownRecord[] = [];
  let open = false;
  const close = () => {
    if (open && members.length) {
      const total: UnknownRecord = {
        isGroupItemTotalRow: true,
        name: "Sub total",
        custom: {},
      };
      summed.forEach((column) => {
        const sum = members.reduce(
          (all, item) => all + toAmount(columnNumber(item, column)),
          0
        );
        total[column.key] = sum;
        asRecord(total.custom)[column.key] = sum;
      });
      out.push(total);
    }
    members = [];
  };
  items.forEach((item) => {
    if (item.group === true) {
      close();
      open = true;
    } else if (open && item.isGroupItemTotalRow !== true) {
      members.push(item);
    }
    out.push(item);
  });
  close();
  return out;
};

export const mapItemTable = (
  state: UnknownRecord,
  ctx: FormatContext,
  settings: VirajSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const labels = asRecord(invoice.customLabels);
  const listed = asArray(invoice.items)
    .map(asRecord)
    .filter((item) => item.hidden !== true && item.isAdditionalCharge !== true);
  const allColumns = resolveColumns(state);
  const items = withGroupSubtotals(listed, allColumns, settings.groupSubtotal);
  const realItems = items.filter(isRealItem);
  const showThumbnail =
    Boolean(visibility.showThumbnailAsColumn) &&
    realItems.some((item) => thumbnailOf(item) !== "");
  const fullWidth = settings.descriptionFullWidth;
  const { itemNameFullWidth } = settings;
  const discountsArePercent = realItems.some(
    (item) => discountParts(item).isPercent
  );

  const footerValue = (column: ItemColumn): string => {
    if (
      !column.summable ||
      (column.kind === "discount" && discountsArePercent)
    ) {
      return "";
    }
    const sum = realItems.reduce(
      (total, item) => total + toAmount(columnNumber(item, column)),
      0
    );
    return column.kind === "money" || column.kind === "discount"
      ? formatMoney(sum, ctx)
      : formatQuantity(sum, ctx);
  };
  const valuesOf = (column: ItemColumn, mergeUnit: boolean) => [
    ...realItems.map((item) =>
      cellValue(invoice, visibility, item, column, ctx, mergeUnit)
    ),
    footerValue(column),
  ];

  const unitMergeable = allColumns.some((column) => column.key === "quantity");
  const layout = planTableLayout(
    allColumns.map((column) => ({
      column,
      values: valuesOf(column, false),
      // Qty as it would print once Unit merges into it (the third fallback).
      ...(column.key === "quantity" && unitMergeable
        ? { mergedValues: valuesOf(column, true) }
        : {}),
    }))
  );
  const { mergeUnit } = layout;
  const columns = allColumns.filter(
    (column) => !(mergeUnit && column.key === "unit")
  );
  const colspan = columns.length + 1;

  const header = columns.map((column) => ({
    key: column.key,
    col: (COLUMN_SPEC[column.key] || { col: column.key }).col,
    className: column.className,
    isName: column.kind === "name",
    labelParts: headerParts(column.label),
  }));

  /*
   * Groups read as section rows under their own name and number their items from 1 again.
   * Without groups the items number straight through.
   */
  let serial = 0;
  let itemIndex = -1;
  const rows = items
    .filter(
      (item) => !(item.isGroupItemTotalRow === true && !settings.groupSubtotal)
    )
    .map((item) => {
      if (item.group === true) {
        serial = 0;
        // A group carries images of its own, as an item does: images[] as thumbnails under
        // its name, originalImages[] in a full-width row below it.
        return {
          isGroupHeader: true,
          name: text(item.name),
          images: imageList(item.images),
          originalImages: imageList(item.originalImages),
          colspan,
        };
      }
      itemIndex += 1;
      const isGroupTotal = item.isGroupItemTotalRow === true;
      if (!isGroupTotal) serial += 1;
      /*
       * The codes on a line of their own under the name ("SKU: … HSN/SAC: … Unit: …"), never
       * beside it (user request; refrens.com puts the HSN and unit in brackets after the name
       * when there is no SKU).
       */
      const sku =
        visibility.showSkuInName && item.showSku !== false && text(item.sku)
          ? `${labelOr(labels, "sku", "SKU")}: ${text(item.sku)}`
          : "";
      const hsnCode =
        visibility.showInlineHsn && text(item.hsn) && !isGroupTotal
          ? text(item.hsn)
          : "";
      const unitInName = visibility.showUnitInName
        ? unitText(invoice, item)
        : "";
      const inlineCodes = [
        sku,
        hsnCode ? `${labelOr(labels, "hsn", "HSN/SAC")}: ${hsnCode}` : "",
        visibility.showInlineClassification && text(item.classification)
          ? `${labelOr(labels, "classification", "Classification")}: ${text(
              item.classification
            )}`
          : "",
        unitInName && !isGroupTotal
          ? `${labelOr(labels, "unit", "Unit")}: ${unitInName}`
          : "",
        settings.serialNumbers && !isGroupTotal && itemSerialNumbers(item)
          ? `${labelOr(
              labels,
              "serialNumbers",
              "Serial No."
            )}: ${itemSerialNumbers(item)}`
          : "",
      ].filter(Boolean);
      const description = isGroupTotal
        ? ""
        : withoutEmptyColumns(text(item.description)).trim();
      // images[] travel with the description, wherever it is placed. originalImages[] always
      // take a row of their own under the item, across the whole table at its full width,
      // whether or not the description is full width.
      const images = isGroupTotal ? [] : imageList(item.images);
      const originalImages = isGroupTotal ? [] : imageList(item.originalImages);
      const hasDetail = description !== "" || images.length > 0;
      const inDetailRow = hasDetail && fullWidth;
      return {
        isItem: !isGroupTotal,
        isGroupTotal,
        itemIndex,
        // Rows alternate white / stripe per item; an item's detail row shares its stripe.
        isStripe: itemIndex % 2 === 1,
        serial: isGroupTotal ? "" : String(serial),
        // A group's total row reads "Sub total" in its name cell, as refrens.com labels it.
        name: isGroupTotal
          ? firstText(item.name, "Sub total")
          : text(item.name),
        inlineCodes,
        description,
        images,
        originalImages,
        hasDetail,
        // Rows are vertically centred; one with a note or images reads from the top.
        isRich: hasDetail || (showThumbnail && thumbnailOf(item) !== ""),
        detailInline: hasDetail && !inDetailRow,
        detailRow: inDetailRow,
        // The full-width row keeps the serial column and spans everything after it.
        detailColspan: colspan - 1,
        // "Item name full width": the name (and its codes) reads across the row above the
        // item's figures, the name cell below left for the description.
        nameRow: itemNameFullWidth && !isGroupTotal,
        imageRow: originalImages.length > 0,
        thumbnail: showThumbnail ? thumbnailOf(item) : "",
        cells: columns.map((column) => {
          // A group total row only repeats the figures that add up (quantity, amounts, taxes,
          // total): a unit rate summed over a group means nothing ("₹0.00" before).
          const value =
            isGroupTotal && !column.summable
              ? ""
              : cellValue(invoice, visibility, item, column, ctx, mergeUnit);
          // A one-word or short value in a text column (a date, a code, "BLOCK - 1") stays
          // on one line too; longer text wraps.
          const isWord =
            column.kind === "text" &&
            (/^\S+$/.test(value) || value.length <= SHORT_TEXT);
          return {
            key: column.key,
            col: (COLUMN_SPEC[column.key] || { col: column.key }).col,
            className: isWord
              ? `${column.className} is-word`
              : column.className,
            isName: column.kind === "name",
            isNum:
              value !== "" && (NUMBER_KINDS.includes(column.kind) || isWord),
            // The column's heading beside the figure where a phone lists an item's figures.
            label: column.label,
            value,
          };
        }),
        colspan,
      };
    });

  const footerCells = columns.map((column) => {
    const value = footerValue(column);
    return {
      key: column.key,
      col: (COLUMN_SPEC[column.key] || { col: column.key }).col,
      className: column.className,
      isName: column.kind === "name",
      isNum: value !== "",
      label: column.label,
      value,
    };
  });

  /*
   * The TOTAL row prints what the design totals: the tax columns and the last money column
   * (Total Amount). The other sums (Qty, Net Amount) stay in `cells`, so the totals rows
   * below know which figures the items already add up to.
   */
  // refrens.com's Total row sums the quantity and the amounts, never the taxes.
  const totalled = footerCells.map((cell) =>
    TAX_COLUMN.test(cell.key) ? { ...cell, isNum: false, value: "" } : cell
  );
  const firstTotalled = totalled.findIndex((cell) => cell.value !== "");
  const nameIndex = columns.findIndex((column) => column.kind === "name");
  const nameSpan = nameIndex >= 0 ? nameIndex + 2 : 1;

  return {
    columns,
    header,
    rows,
    colspan,
    // The further totals rows: the label across every column but the last.
    labelColspan: colspan - 1,
    /*
     * The totals rows under the TOTAL row: the label, an empty cell per column (no rules of
     * their own), and the figure in the last column with the one rule before it (user
     * request). A figure wider than its column never widens it: in the browser every row's
     * figure cell takes over the same number of empty cells to its left, as many as the widest
     * figure needs (registerVirajTableFit), so the rule stays one straight line on an item
     * column's edge.
     */
    nameSpan,
    // The Total row keeps the Sr. No. cell (and its rule) of its own; the label spans the
    // columns up to the item's name (user request). Without a name column it sits in Sr. No.
    labelSpan: nameSpan - 1,
    fillers: Array.from(
      { length: Math.max(0, colspan - nameSpan - 1) },
      (_, i) => i
    ),
    showThumbnail,
    // The figure columns (every column but the item's name): a tablet lays them out in as
    // many equal tracks under the item's name (styles.css).
    figureCount: columns.filter((column) => column.kind !== "name").length,
    // More than this many figure columns cannot sit side by side on a tablet: such a table
    // shows its items as cards there too.
    manyFigures:
      columns.filter((column) => column.kind !== "name").length >
      TABLET_FIGURE_COLUMNS,
    // Up to eight columns, each keeps room for a two-line heading ("Price Each in Rs."); a
    // wider table drops to the narrow floor so it still fits the page.
    roomy: columns.length <= ROOMY_COLUMNS,
    serialLabel: labelOr(labels, "serialNumber", "Sr. No."),
    serialWidth: SERIAL_WIDTH,
    mergeUnit,
    smallNumbers: layout.smallNumbers,
    descriptionMin: layout.descriptionMin,
    printFixedWidth: layout.printFixedWidth,
    footer: {
      show: settings.totalsRow && realItems.length > 0 && firstTotalled >= 0,
      // "TOTAL:" spans the serial cell and every column before the first totalled one, as
      // the design draws it; the figures sit under their own columns.
      labelSpan: 1 + Math.max(firstTotalled, 0),
      // TOTAL: under Sr.No and Description, then every column's own cell (its sum or empty),
      // so the item columns' rules run on through the TOTAL row (user request).
      gridCells: totalled.slice(nameSpan - 1),
      valueCells: firstTotalled < 0 ? [] : totalled.slice(firstTotalled),
      // No customLabels key exists for the in-table summary row (see architect-template).
      label: labelOr(labels, "total", "Total"),
      labelInSerial: !columns.some((column) => column.kind === "name"),
      cells: footerCells,
    },
  };
};

/* ------------------------------------------------------------------ summaries */

/*
 * Batch Summary, Refrens' "Show Batch Summary in Invoice" (advanceOptions.showStockSummary):
 * one row per batch drawn — the document's own batchSummary (sent only for batch-tracked
 * documents with the setting on), else, when the setting is explicitly on, the items' batches.
 * Columns follow the business's batch summary config (stockSummaryConfig.batchSummaryColumns:
 * order, labels, hidden ones left out, the item's SKU and the batch's code in brackets when
 * switched on), as Refrens' own invoice prints them; without one, Item Name | Batch Name | Qty |
 * Warehouse | Mfg Name | Mfg Date | Expiry Date, a column no row fills left out. Kept in the
 * page, hidden, while switched off (data-ceres-batch-summary), like the other summaries.
 */
type BatchColumn = {
  key: string;
  label: string;
  showSku?: boolean;
  showBatchCode?: boolean;
};

const BATCH_COLUMNS: BatchColumn[] = [
  { key: "itemName", label: "Item Name", showSku: true },
  { key: "batchName", label: "Batch Name", showBatchCode: true },
  { key: "quantity", label: "Qty" },
  { key: "warehouse", label: "Warehouse" },
  { key: "manufacturerName", label: "Mfg Name" },
  { key: "manufacturingDate", label: "Mfg Date" },
  { key: "expiryDate", label: "Expiry Date" },
];

/* "Name (code)", or whichever of the two there is. */
const withCode = (name: unknown, code: unknown, show?: boolean): string => {
  const main = text(name);
  const extra = show ? text(code) : "";
  if (main && extra) return `${main} (${extra})`;
  return main || extra;
};

const batchValue = (entry: UnknownRecord, column: BatchColumn): unknown => {
  const batch = isRecord(entry.batch) ? entry.batch : {};
  if (column.key === "itemName") {
    return withCode(
      entry.itemName,
      pickFirst(entry.sku, batch.sku),
      column.showSku
    );
  }
  if (column.key === "batchName") {
    return withCode(
      pickFirst(
        entry.batchName,
        batch.batchName,
        batch.name,
        typeof entry.batch === "string" ? entry.batch : undefined
      ),
      pickFirst(entry.batchCode, batch.batchCode),
      column.showBatchCode
    );
  }
  if (column.key === "warehouse") {
    return pickFirst(
      entry.warehouseName,
      batch.warehouseName,
      isRecord(entry.warehouse) ? undefined : entry.warehouse
    );
  }
  return pickFirst(
    entry[column.key],
    batch[column.key],
    asRecord(entry.custom)[column.key],
    asRecord(batch.custom)[column.key]
  );
};

export const mapBatchSummary = (
  state: UnknownRecord,
  ctx: FormatContext,
  settings: VirajSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const advanceOptions = asRecord(state.advanceOptions);
  const explicit = optionalFlag(
    pickFirst(advanceOptions.showStockSummary, invoice.showStockSummary)
  );
  const documentRows = asArray(invoice.batchSummary).map(asRecord);
  const itemRows = (): UnknownRecord[] =>
    asArray(invoice.items)
      .map(asRecord)
      .filter(isRealItem)
      .flatMap((item) =>
        asArray(item.batchSummary)
          .map(asRecord)
          .map((batch) => ({
            ...batch,
            itemName: firstText(batch.itemName, item.name),
            sku: pickFirst(batch.sku, item.sku),
          }))
      );
  let entries = documentRows;
  if (!entries.length && explicit === true) entries = itemRows();
  if (!entries.length) return null;

  const configured: BatchColumn[] = asArray(
    pickFirst(
      asRecord(invoice.stockSummaryConfig).batchSummaryColumns,
      invoice.defaultBatchColumns
    )
  )
    .map(asRecord)
    .filter((column) => column.isHidden !== true)
    .map((column) => ({
      key: firstText(column.key, column.name),
      label: firstText(column.label, column.name, column.key),
      showSku: column.showSku === true,
      showBatchCode: column.showBatchCode === true,
    }))
    .filter((column) => column.key && column.label);
  const format = (key: string, value: unknown): string => {
    if (!hasValue(value)) return "";
    if (/date$/i.test(key))
      return formatDocumentDate(value, invoice.ownerOffset);
    if (/^(?:quantity|qty)$/i.test(key)) return formatQuantity(value, ctx);
    return text(value);
  };
  const source = configured.length ? configured : BATCH_COLUMNS;
  const rows = entries.map((entry) =>
    source.map((column) => ({
      key: column.key,
      value: format(column.key, batchValue(entry, column)),
      isNum: /^(?:quantity|qty)$/i.test(column.key),
    }))
  );
  // The business's own columns all print, filled or not (Refrens does the same).
  const columns = source
    .map((column, index) => ({ key: column.key, label: column.label, index }))
    .filter(
      (column) =>
        configured.length || rows.some((row) => row[column.index].value)
    );
  if (!columns.length) return null;

  return {
    title: heading(labels, "batchSummary", "Batch Summary"),
    hidden: !settings.batchSummary,
    columns,
    rows: rows.map((row) => columns.map((column) => row[column.index])),
  };
};

/* ------------------------------------------------------------------ payment */

const UPI_NOTE_MIN = 10;

export const mapBank = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const bank = asRecord(invoice.bankAccount);
  const labels = {
    ...asRecord(invoice.customLabels),
    ...asRecord(bank.customLabels),
  };
  const upiQr = text(asRecord(asRecord(state.mapped).qr).upi);

  // In the order of Refrens' bank account form (user request): Account Name, Account Number,
  // IFSC (with IBAN / SWIFT / Sort Code beside it), Account Type, Bank, then the rest.
  const rows: LabelValue[] = visibility.showBankAccount
    ? [
        {
          key: "accountHolderName",
          label: labelOr(labels, "accountHolderName", "Account Name"),
          value: firstText(bank.name, bank.accountHolderName),
        },
        {
          key: "accountNumber",
          label: firstText(
            labels.accountNumber,
            labels.accountNo,
            "Account Number"
          ),
          value: firstText(bank.accountNo, bank.accountNumber),
        },
        {
          key: "ifsc",
          label: firstText(labels.ifsc, labels.ifscCode, "IFSC"),
          value: firstText(bank.ifsc, bank.ifscCode),
        },
        {
          key: "iban",
          label: labelOr(labels, "iban", "IBAN"),
          value: text(bank.iban),
        },
        {
          key: "swift",
          label: firstText(labels.swiftCode, labels.swift, "SWIFT Code"),
          value: firstText(bank.swift, bank.swiftCode),
        },
        {
          key: "sortCode",
          label: labelOr(labels, "sortCode", "Sort Code"),
          value: text(bank.sortCode),
        },
        {
          key: "bankName",
          label: labelOr(labels, "bankName", "Bank"),
          value: firstText(bank.bank, bank.bankName),
        },
        {
          key: "branch",
          label: labelOr(labels, "branch", "Branch"),
          value: text(bank.branch),
        },
        ...asArray(bank.customFields)
          .map(asRecord)
          .filter((field) => !isOff(asRecord(field.params).showInInvoice))
          .map((field) => ({
            key: "customField",
            label: firstText(field.label, field.name),
            value: customFieldText(field.value, field.options),
          })),
      ].filter((row) => row.label && row.value)
    : [];

  const upiId = visibility.showUpi
    ? text(asRecord(asRecord(state.mapped).upi).id)
    : "";
  const isRupees = firstText(invoice.currency, "INR").toUpperCase() === "INR";
  const upiQrImage = isImageSource(upiQr)
    ? upiQr
    : qrImage(upiIntent(invoice, upiId));
  const NUMERIC_BANK_ROWS = [
    "accountNumber",
    "ifsc",
    "iban",
    "swift",
    "sortCode",
  ];

  // A delivery challan asks for no payment: refrens.com prints no bank or UPI details on one.
  const isChallan = text(invoice.billType).toUpperCase() === "DELIVERYCHALLAN";
  return {
    show:
      !isChallan &&
      Boolean(visibility.showBankUpiSection) &&
      (rows.length > 0 || upiId !== ""),
    // With bank transfer off, the box holds UPI alone and says so.
    title:
      rows.length > 0
        ? heading(labels, "bankDetails", "Bank Details")
        : heading(labels, "upiDetails", "UPI Details"),
    rows: rows.map((row) => ({
      ...row,
      isNum: NUMERIC_BANK_ROWS.includes(row.key) && staysWhole(row.value),
    })),
    upi: upiId
      ? {
          label: labelOr(labels, "upi", "UPI"),
          id: upiId,
          scanLabel: labelOr(labels, "scanToPay", "Scan to pay via UPI"),
          // A pre-resolved QR image as given; otherwise the platform's UPI intent, drawn here.
          // UPI pays in rupees: refrens.com draws the QR on INR documents only.
          qr: isRupees ? upiQrImage : "",
          // The daily-limit note, as refrens.com shows it: under the QR, on a document still
          // to be paid, and not for a token amount (none on 369 real test documents under
          // ₹6, every one from ₹100 up; the cut-off between is inferred).
          note:
            isRupees &&
            text(invoice.status).toUpperCase() !== "PAID" &&
            toAmount(asRecord(invoice.finalTotal).total) >= UPI_NOTE_MIN
              ? labelOr(
                  labels,
                  "upiLimitNote",
                  "Maximum of 1 lakh can be transferred via UPI in a single day"
                )
              : "",
        }
      : null,
  };
};

/*
 * The amount in words on a document in another currency, as refrens.com writes it: thousands,
 * millions and billions, the currency's own unit names ("TWELVE THOUSAND FOUR HUNDRED NINETEEN
 * DOLLARS AND FIFTY CENTS ONLY"). Rupees keep the shared Indian-system converter.
 */
const CURRENCY_UNITS: Record<string, [string, string]> = {
  USD: ["Dollars", "Cents"],
  HKD: ["Dollars", "Cents"],
  SGD: ["Dollars", "Cents"],
  AUD: ["Dollars", "Cents"],
  CAD: ["Dollars", "Cents"],
  NZD: ["Dollars", "Cents"],
  EUR: ["Euros", "Cents"],
  GBP: ["Pounds", "Pence"],
  AED: ["Dirhams", "Fils"],
  SAR: ["Riyals", "Halalas"],
  QAR: ["Riyals", "Dirhams"],
  OMR: ["Rials", "Baisa"],
  MYR: ["Ringgit", "Sen"],
  LKR: ["Rupees", "Cents"],
  NPR: ["Rupees", "Paisa"],
};

const SMALL_WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS_WORDS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const belowThousand = (n: number): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const restWords =
    rest < 20
      ? SMALL_WORDS[rest]
      : [TENS_WORDS[Math.floor(rest / 10)], SMALL_WORDS[rest % 10]]
          .filter(Boolean)
          .join(" ");
  return [hundreds ? `${SMALL_WORDS[hundreds]} Hundred` : "", restWords]
    .filter(Boolean)
    .join(" ");
};

export const internationalWords = (whole: number): string => {
  if (whole === 0) return "Zero";
  const scales = ["", "Thousand", "Million", "Billion", "Trillion"];
  const parts: string[] = [];
  let n = Math.floor(whole);
  for (let i = 0; n > 0 && i < scales.length; i += 1) {
    const chunk = n % 1000;
    if (chunk)
      parts.unshift(
        [belowThousand(chunk), scales[i]].filter(Boolean).join(" ")
      );
    n = Math.floor(n / 1000);
  }
  return parts.join(" ");
};

export const foreignAmountInWords = (
  amount: number,
  currency: string
): string => {
  if (!Number.isFinite(amount)) return "";
  const [major, minor] = CURRENCY_UNITS[currency] || [currency, ""];
  const cents = Math.round(Math.abs(amount) * 100) % 100;
  const whole = Math.floor(Math.round(Math.abs(amount) * 100) / 100);
  const minorPart =
    cents && minor ? ` And ${internationalWords(cents)} ${minor}` : "";
  return `${internationalWords(whole)} ${major}${minorPart} Only`;
};

/* Summary money: whole amounts without decimals ("₹90"), others at the document's places ("₹18.10"). */
export const formatSummaryMoney = (
  value: unknown,
  ctx: FormatContext,
  ownDigits?: unknown
): string => {
  if (!hasValue(value)) return "";
  const amount = toAmount(value);
  // At the document's own decimal places when it sets them ("₹18.00"); without one, whole
  // amounts bare ("₹90") and others at two places ("₹18.10"), as refrens.com prints summaries
  // (checked on 25 real test invoices).
  let { digits } = ctx;
  if (typeof ownDigits === "number") digits = ownDigits;
  else if (Number.isInteger(amount)) digits = 0;
  return formatCurrency(
    amount,
    ctx.currency,
    ctx.locale,
    digits,
    ctx.symbol || undefined
  );
};

export const summaryWords = (amount: number, currency: string): string =>
  currency.toUpperCase() === "INR"
    ? amountInWords(amount).replace(/^ZERO RUPEES\b/, "ZERO RUPEE")
    : foreignAmountInWords(amount, currency.toUpperCase()).toUpperCase();

/*
 * The HSN and tax summaries print refrens.com's own stored figures (invoice.hsnSummary /
 * taxSummary: each row's tax total as Refrens rounded it, "₹18.10" where a recount of the
 * items gives "₹18.09"). Without them, the shared widgets' computation from the items.
 */
export const summaryTable = (rootValue: unknown, kind: "hsn" | "tax") => {
  const root = asRecord(rootValue);
  const invoice = asRecord(root.invoice);
  const visibility = asRecord(asRecord(root.mapped).visibility);
  const flags = {
    isIgst: Boolean(visibility.showIgst),
    isUtgst: Boolean(visibility.isUtgst),
  };
  const items = asArray(invoice.items) as never[];
  const computed: UnknownRecord =
    kind === "hsn"
      ? computeHsnSummary(items, flags)
      : computeTaxSummary(items, flags);
  const listKey = kind === "hsn" ? "hsnList" : "taxList";
  const stored = asRecord(
    kind === "hsn" ? invoice.hsnSummary : invoice.taxSummary
  );
  const storedList = asArray(stored[listKey]).map(asRecord);
  /*
   * Without a stored tax summary, refrens.com builds it from the items, one row per rate: the
   * IGST (or CGST / SGST) amounts as the items carry them, and each row's Total as the items'
   * CGST + SGST, each rounded to paise ("₹18.09" IGST, "₹18.10" total), checked on four
   * real test invoices.
   */
  if (kind === "tax" && !storedList.length) {
    const round = (value: number) => Math.round(value * 100) / 100;
    const byRate = new Map<number, UnknownRecord>();
    asArray(invoice.items)
      .map(asRecord)
      .filter(isRealItem)
      .forEach((item) => {
        const rate = toAmount(item.gstRate) || 0;
        const into = byRate.get(rate) || {
          gstRate: rate,
          igstRate: rate,
          cgstRate: rate / 2,
          sgstRate: rate / 2,
          igstAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
        };
        ["igst", "cgst", "sgst"].forEach((key) => {
          into[`${key}Amount`] =
            toAmount(into[`${key}Amount`]) + (toAmount(item[key]) || 0);
        });
        byRate.set(rate, into);
      });
    Array.from(byRate.values())
      .filter((row) => toAmount(row.gstRate) > 0)
      .sort((x, y) => toAmount(y.gstRate) - toAmount(x.gstRate))
      .forEach((row) => {
        const cgst = round(toAmount(row.cgstAmount));
        const sgst = round(toAmount(row.sgstAmount));
        // Items that carry only IGST: the row's total is that IGST.
        const split = cgst + sgst > 0;
        storedList.push({
          ...row,
          igstAmount: round(toAmount(row.igstAmount)),
          cgstAmount: cgst,
          sgstAmount: sgst,
          taxAmount: split
            ? round(cgst + sgst)
            : round(toAmount(row.igstAmount)),
        });
      });
    const sum = (key: string) =>
      round(storedList.reduce((all, row) => all + toAmount(row[key]), 0));
    Object.assign(stored, {
      totalIgstAmount: sum("igstAmount"),
      totalCgstAmount: sum("cgstAmount"),
      totalSgstAmount: sum("sgstAmount"),
      totalTaxAmount: sum("taxAmount"),
    });
  }
  const currency = firstText(invoice.currency, "INR");
  // "Total Tax In Words": rupees as refrens.com writes them ("ZERO RUPEE AND EIGHTEEN PAISE
  // ONLY"), other currencies in their own units ("… DOLLARS ONLY").
  if (!storedList.length) {
    return {
      ...computed,
      words: summaryWords(toAmount(computed.totalTaxAmount), currency),
    };
  }
  const number = (value: unknown) => toAmount(value) || 0;
  const list = storedList.map((row) => ({
    ...row,
    hsn: text(row.hsn),
    gstRate: number(pickFirst(row.gstRate, row.taxRate, row.rate)),
    taxableValue: number(row.taxableValue),
    igstRate: number(row.igstRate),
    igstAmount: number(row.igstAmount),
    cgstRate: number(row.cgstRate),
    cgstAmount: number(row.cgstAmount),
    sgstRate: number(row.sgstRate),
    sgstAmount: number(row.sgstAmount),
    cessRate: number(row.totalCess),
    cessAmount: number(row.totalCessAmount),
    taxAmount: number(row.taxAmount),
  }));
  return {
    ...computed,
    [listKey]: list,
    hasRows: list.length > 0,
    totalTaxableValue: number(
      pickFirst(stored.totalTaxableValue, computed.totalTaxableValue)
    ),
    totalIgstAmount: number(
      pickFirst(stored.totalIgstAmount, computed.totalIgstAmount)
    ),
    totalCgstAmount: number(
      pickFirst(stored.totalCgstAmount, computed.totalCgstAmount)
    ),
    totalSgstAmount: number(
      pickFirst(stored.totalSgstAmount, computed.totalSgstAmount)
    ),
    totalCessAmount: number(
      pickFirst(stored.totalCessAmount, computed.totalCessAmount)
    ),
    totalTaxAmount: number(
      pickFirst(stored.totalTaxAmount, computed.totalTaxAmount)
    ),
    words: summaryWords(
      number(pickFirst(stored.totalTaxAmount, computed.totalTaxAmount)),
      currency
    ),
  };
};

export const mapWords = (
  state: UnknownRecord,
  settings: VirajSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  if (!visibility.showTotals) return null;

  const stored = text(labels.totalInWordsValue);
  const currency = firstText(invoice.currency, "INR").toUpperCase();
  const computed =
    currency === "INR"
      ? amountInWords(toAmount(asRecord(invoice.finalTotal).total))
      : foreignAmountInWords(
          toAmount(asRecord(invoice.finalTotal).total),
          currency
        );
  // In capitals (user request), like the tax summary's words: "FIVE THOUSAND … ONLY", whether
  // the words come from the shared converter or the document (stored in lower case).
  const value = (stored || computed).toUpperCase();
  // Switched off, the line stays in the page, hidden, as the Subtotal widget keeps it, so
  // the host's live toggle (data-ceres-total-in-words) can bring it back. A document with
  // more decimal places than the currency (3) still shows it, in rupees and paise (user request).
  return value
    ? {
        label: labelOr(labels, "totalInWords", "Amount In Words"),
        value,
        hiddenBySetting: !settings.totalInWords,
      }
    : null;
};

/* ------------------------------------------------------------------ totals */

/* Rows whose value is free text, not money — never strip anything from these. */
const isTextRow = (row: SubtotalRow): boolean =>
  row.key === "conversionRate" || row.key.startsWith("extra:");

/* "₹1,03,465.00" → "1,03,465.00"; "(₹50.00)" → "(50.00)". Separators and signs survive. */
const plainRow = (row: SubtotalRow) =>
  isTextRow(row)
    ? { ...row, isNum: false, isGrand: false }
    : { ...row, isNum: true, isGrand: row.key === "total" };

/*
 * The totals block: the shared Subtotal widget decides every row, label, figure (with the
 * currency symbol) and visibility rule, at the document's decimal places. No Round Off row:
 * refrens.com prints none, the rounding is already in the total.
 */
/*
 * The discount row's rate (user request: a percentage after the discount label): the
 * document's own discountPercentage; else the one percentage every discounted item shares;
 * else the effective rate, the discount over the subtotal. "" when there is no discount.
 */
export const discountRate = (invoice: UnknownRecord): string => {
  const finalTotal = asRecord(invoice.finalTotal);
  const ctx = formatContext(invoice);
  const own = toAmount(finalTotal.discountPercentage);
  if (own > 0) return formatNumber(own, ctx.locale, 0, 2);
  const discounted = asArray(invoice.items)
    .map(asRecord)
    .filter(isRealItem)
    .map(discountParts)
    .filter((part) => toAmount(part.amount) > 0);
  const shares = discounted
    .map((part) => (part.isPercent ? toAmount(part.amount) : NaN))
    .filter((rate, index, all) => all.indexOf(rate) === index);
  if (discounted.length && shares.length === 1 && Number.isFinite(shares[0])) {
    return formatNumber(shares[0], ctx.locale, 0, 2);
  }
  const discount = toAmount(
    pickFirst(finalTotal.discount, finalTotal.totalDiscount)
  );
  const subTotal = toAmount(finalTotal.subTotal);
  return discount > 0 && subTotal > 0
    ? formatNumber((discount / subTotal) * 100, ctx.locale, 0, 2)
    : "";
};

export const mapTotals = (
  state: UnknownRecord,
  settings: VirajSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const advanceOptions = asRecord(invoice.advanceOptions);
  // Tax rows as the document's own tax view prints them on refrens.com: "IGST", or with
  // their rates ("IGST (18%)") when the view breaks the tax up by rate.
  const model = computeSubtotalRows(
    {
      ...invoice,
      subUnitLength: moneyDigits(invoice),
      advanceOptions,
      /*
       * A live switch from Lydia arrives in advanceOptions (the renderer re-renders with it);
       * the widget reads the document's own hideTotals / hideTaxes first, so it would keep the
       * saved value. Stored documents never carry these in advanceOptions.
       */
      hideTotals: pickFirst(advanceOptions.hideTotals, invoice.hideTotals),
      hideTaxes: pickFirst(advanceOptions.hideTaxes, invoice.hideTaxes),
    },
    {
      columns: asRecord(state.mapped).columns,
      businessCurrency: invoice.businessCurrency,
      businessLocale: invoice.businessLocale,
    }
  );
  /*
   * "Applied Exchange Rate | 1 USD = 95.3929 INR", as refrens.com prints it (user request):
   * the rate exactly as stored on the document (conversionRates, which the business can edit),
   * never rounded, between the two currency codes. The business currency is the one the
   * Subtotal widget converts to (owner.currency on the fetched document).
   */
  const owner = asRecord(invoice.owner);
  const businessCurrency = firstText(invoice.businessCurrency, owner.currency);
  const storedRate = asRecord(invoice.conversionRates)[businessCurrency];
  const appliedRate = (row: SubtotalRow): SubtotalRow =>
    row.key === "conversionRate"
      ? {
          ...row,
          label: labelOr(
            asRecord(invoice.customLabels),
            "appliedExchangeRate",
            "Applied Exchange Rate"
          ),
          value: hasValue(storedRate)
            ? `1 ${text(invoice.currency)} = ${text(
                storedRate
              )} ${businessCurrency}`
            : row.value,
        }
      : row;
  // "Discount (10%)": the rate after the label, with its space (the widget writes none).
  // "Discount", without a rate after it, as refrens.com labels the row.
  const withDiscountRate = (row: SubtotalRow): SubtotalRow =>
    row.key === "discount"
      ? { ...row, label: row.label.replace(/\s*\([^)]*%\)\s*$/, "") }
      : row;
  /*
   * "Show Applied Exchange Rate" (advanceOptions.showExchangeRateOnPdf): on a document in
   * another currency than the business's, the Subtotal widget adds the business-currency
   * figure under every amount and a Conversion Rate row whatever the setting. refrens.com
   * prints no converted figures at all, and the rate row only when the setting is on (user
   * request): so here too.
   */
  const exchange = settings.exchangeRate;
  const withExchange = <T extends SubtotalRow>(row: T): T => ({
    ...row,
    converted: null,
    extra: row.extra ? { ...row.extra, converted: null } : row.extra,
  });
  const keepRow = (row: SubtotalRow) =>
    exchange || row.key !== "conversionRate";
  return {
    hidden: model.hidden,
    hideTaxes: model.hideTaxes,
    main: model.groups.main
      .filter(keepRow)
      .map(appliedRate)
      .map(withDiscountRate)
      .map(withExchange)
      .map(plainRow),
    extra: model.groups.extra.map(withExchange).map(plainRow),
    // "Show balance due" off drops the Balance Due row; what was paid still prints.
    due: model.groups.due
      .filter((row) => settings.dueAmount || row.key !== "dueAmount")
      .map(withExchange)
      .map(plainRow),
  };
};

/* ------------------------------------------------------------------ footer */

const fileName = (url: string): string => {
  const last = url.split("?")[0].split("/").pop() as string;
  try {
    return decodeURIComponent(last) || url;
  } catch {
    return last;
  }
};

export const mapNotes = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const notesHidden =
    invoice.hideNotes === true ||
    [
      invoice.notesShowInInvoice,
      invoice.showNotesInInvoice,
      invoice.showNotes,
    ].some(isOff);
  const notes = notesHidden ? "" : withoutEmptyColumns(text(invoice.notes));

  const terms = asArray(invoice.terms)
    .map(asRecord)
    .map((group) => ({
      title: firstText(group.label, labels.terms, "Terms and Conditions"),
      items: asArray(group.terms).map(text).filter(Boolean),
    }))
    .filter((group) => group.items.length > 0);

  const attachments = asArray(invoice.attachments)
    .map((entry) =>
      isRecord(entry) ? firstText(entry.url, entry.link) : text(entry)
    )
    .filter(Boolean)
    .map((url) => ({ url, name: fileName(url) }));

  const notesBlock = notes
    ? { title: heading(labels, "notes", "Notes"), body: notes }
    : null;
  const attachmentsBlock = attachments.length
    ? {
        title: heading(labels, "attachment", "Attachments"),
        files: attachments,
      }
    : null;

  return { terms, notes: notesBlock, attachments: attachmentsBlock };
};

export const mapSignature = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const isDigital = text(invoice.signatureMethod).toUpperCase() === "DIGITAL";
  const request = asRecord(invoice.documentSignatureRequest);
  const isSigned = text(request.status).toUpperCase() === "SIGNED";
  const signer = asRecord(asArray(request.signers)[0]);

  const image = isDigital ? "" : text(invoice.signature);
  return {
    // The block prints only for a signature the document has — an image, or a digital
    // signing request (user rule); without one there is no "For … / Authorised Signatory".
    show: image !== "" || isDigital,
    hasMark: image !== "" || isDigital,
    forLabel: [
      labelOr(labels, "for", "For"),
      text(asRecord(invoice.billedBy).name),
    ]
      .filter(Boolean)
      .join(" "),
    image,
    awaitingDigital: isDigital && !isSigned,
    signedDigital: isDigital && isSigned,
    signerName: text(signer.signerName),
    verifyUrl: text(asRecord(invoice.share).pdf),
    label: heading(labels, "signature", "Authorized Signatory"),
  };
};

/*
 * The status tag as refrens.com shows it on each kind of document (checked on 360 real
 * documents): invoices, proformas and debit notes "Paid" / "Part Paid" (nothing while unpaid);
 * challans, purchase orders and quotations "Created"; credit notes "Issued" / "Partially
 * Utilised"; sales orders none; any document "Draft" or "Canceled" ("Cancelled" on a
 * quotation). Viewer-dependent tags ("Seen", "Sent") are left out. Colours: the status widget's.
 */
export const statusTag = (
  invoice: UnknownRecord
): { text: string; color: string } | null => {
  const type = text(invoice.billType).toUpperCase();
  const status = text(invoice.status).toUpperCase();
  if (status === "DRAFT") return { text: "Draft", color: "devider" };
  if (status === "CANCELED" || status === "CANCELLED") {
    return {
      // "Cancelled" on quotations and purchase orders, "Canceled" elsewhere, as refrens.com.
      text: ["QUOTATION", "PURCHASEORDER"].includes(type)
        ? "Cancelled"
        : "Canceled",
      color: "danger",
    };
  }
  if (["INVOICE", "PROFORMAINV", "DEBITNOTE"].includes(type)) {
    if (status === "PAID") return { text: "Paid", color: "success" };
    if (status === "PARTIAL" || status === "PARTIALLY_PAID") {
      return { text: "Part Paid", color: "info" };
    }
    return null;
  }
  if (["DELIVERYCHALLAN", "PURCHASEORDER", "QUOTATION"].includes(type)) {
    return { text: "Created", color: "info" };
  }
  if (type === "CREDITNOTE") {
    const credit = text(invoice.creditNoteStatus).toUpperCase();
    if (credit === "PARTIAL") {
      return { text: "Partially Utilised", color: "info" };
    }
    if (credit === "ISSUED") return { text: "Issued", color: "info" };
  }
  return null;
};

/* ------------------------------------------------------------------ view */

/*
 * Print and PDF print at true size (design-to-template §4a): no page-fit zoom, so 13 px text
 * prints at 13 px. The page is the paper width less the browser's default 1 cm margins
 * (A4: 718 px; the document has no padding of its own); it depends only on the format, never on the
 * window, because the PDF service renders in a window narrower than its page.
 *
 * zoomSize is the print size picked in Lydia (0.8 smaller … 1.2 larger). The renderer zooms
 * <html> by it (except at 0.8), which narrows the page in CSS px. textScale scales text only.
 *
 * compactTable: when the items table's other columns, shrunk to content, would leave
 * Description less than its 22% share of that page, the table prints with tight padding
 * (styles.css, .is-print-compact), as Solvin's compact print table does. Its text keeps its
 * size: only the table measured in print (fitPrintTable) shrinks text, and only when it
 * really is wider than the page (print 1:1, user 2026-10-21; this estimate had shrunk ten-
 * and eleven-column tables that fit at full size).
 */
const PRINT_MARGINS_PX = (2 * 96) / 2.54;
const PAPER_WIDTH_MM: Record<string, number> = {
  a3: 297,
  a4: 210,
  a5: 148,
  letter: 215.9,
  legal: 215.9,
};

const positiveNumber = (value: unknown): number | undefined => {
  const parsed = hasValue(value) ? Number(text(value)) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/* Paper heights, for a landscape page (its width is the paper's height). */
const PAPER_HEIGHT_MM: Record<string, number> = {
  a3: 420,
  a4: 297,
  a5: 210,
  letter: 279.4,
  legal: 355.6,
};

export const mapPrint = (state: UnknownRecord, tableFixedWidth = 0) => {
  const pdfOptions = asRecord(state.pdfOptions);
  const invoice = asRecord(state.invoice);
  const format = text(pdfOptions.format).toLowerCase();
  const landscape = optionalFlag(pdfOptions.landscape) === true;
  const paperMm = landscape
    ? PAPER_HEIGHT_MM[format] ?? PAPER_HEIGHT_MM.a4
    : PAPER_WIDTH_MM[format] ?? PAPER_WIDTH_MM.a4;
  const pageZoom = positiveNumber(pdfOptions.zoomSize) ?? 1;
  const rendererZoom = pageZoom === 0.8 ? 1 : pageZoom;
  const pageWidth = ((paperMm / 25.4) * 96 - PRINT_MARGINS_PX) / rendererZoom;
  /*
   * The printable width in the document's own pixels, which caps the page in print
   * (styles.css): the PDF service lays the page out in a window wider than the paper before
   * it prints. Side margins are xMargins centimetres (1 when unset), and Chrome scales them
   * with the print zoom like the rest of the page; 4 px kept back for rounding.
   */
  const sideMarginCm = positiveNumber(pdfOptions.xMargins) ?? 1;
  const printWidth = Math.floor(
    ((paperMm / 25.4) * 96) / rendererZoom - (2 * sideMarginCm * 96) / 2.54 - 4
  );
  // A browser's own print (Lydia's print button, Ctrl+P) keeps its own 1 cm margins, whatever
  // xMargins says: the page is fitted for the narrower of the two (prepareBrowserPrint).
  const browserPrintWidth = Math.floor(
    ((paperMm / 25.4) * 96) / rendererZoom - (2 * 96) / 2.54 - 4
  );
  // The printable height in the document's own pixels (1 cm top and bottom), for the rows'
  // page room (markTallRows).
  const paperHeightMm = landscape
    ? PAPER_WIDTH_MM[format] ?? PAPER_WIDTH_MM.a4
    : PAPER_HEIGHT_MM[format] ?? PAPER_HEIGHT_MM.a4;
  const printHeight = Math.floor(
    ((paperHeightMm / 25.4) * 96) / rendererZoom - (2 * 96) / 2.54
  );
  const rawScale =
    positiveNumber(pdfOptions.textScale) ?? positiveNumber(pdfOptions.scale);
  // A percentage (110) or a ratio (1.1); kept readable either way.
  const ratio =
    rawScale !== undefined && rawScale > 2 ? rawScale / 100 : rawScale;
  const textScale = Math.min(2, Math.max(0.3, ratio ?? 1));
  const compactTable =
    tableFixedWidth * textScale > pageWidth * (1 - MIN_DESCRIPTION_SHARE);
  return {
    textScale: compactDecimal(textScale),
    printWidth,
    browserPrintWidth,
    printHeight,
    compactTable,
    /*
     * "Stretch invoice & quotation tables to fill the page" (Settings > Experimental,
     * owner.configuration.experimental.stretchInvoiceTable) with the document's own toggle
     * (pdfOptions.fullHeightTable): on a one-page printout the item table runs down to the
     * footer (helpers.ts stretchItemTable). Every document type, not only invoices and
     * quotations as refrens.com does (user request).
     */
    stretchTable:
      asRecord(asRecord(asRecord(invoice.owner).configuration).experimental)
        .stretchInvoiceTable === true &&
      optionalFlag(pdfOptions.fullHeightTable) === true,
  };
};

/*
 * An Indian GST document's tax columns are CGST, SGST and IGST (or the business's custom label
 * for them). A document can carry another country's tax name on its saved igst column — "PPN",
 * "VAT", left over from an earlier tax-name setting — and the shared widgets would print it
 * (column label before the fallback word). On taxType INDIA the template puts the GST word
 * back on such a column before anything reads it (user report: "PPN" instead of IGST), so the
 * item table, the totals and the HSN / tax summaries agree. A rename of the column the
 * business made itself ("Tax Amount") stays; other tax types keep their own word.
 */
const GST_COLUMN_WORDS: Record<string, string> = {
  igst: "IGST",
  cgst: "CGST",
  sgst: "SGST",
};

/*
 * Other tax systems' names, which only a stale tax-name setting puts on an Indian document's
 * tax column. A business's own rename of the column ("Tax Amount") is kept.
 */
const FOREIGN_TAX_NAMES = [
  "PPN",
  "VAT",
  "SST",
  "TAX",
  "SALES TAX",
  "HST",
  "PST",
  "QST",
  "IVA",
  "TVA",
  "MWST",
  "KDV",
  "ITBIS",
  "ICMS",
];

/*
 * Refrens' own defaults the shared normalizer reads differently, applied before it:
 * a document that never chose how units print (advanceOptions.unitColumn unset) shows them
 * in their own Unit column, as refrens.com does (verified on 124 real documents); the
 * normalizer would merge them into Quantity.
 */
export const withRefrensDefaults = <T>(payload: T): T => {
  const root = asRecord(payload);
  const wrapped = isRecord(root.invoice);
  const invoice = wrapped ? asRecord(root.invoice) : root;
  const options = asRecord(invoice.advanceOptions);
  const chosen = [
    "unitColumn",
    "unitDisplay",
    "showUnit",
    "showUnitInName",
    "showUnitInQuantity",
    "showUnitAsColumn",
    "showUnitColumn",
  ].some((key) => options[key] !== undefined && options[key] !== null);
  /*
   * refrens.com lays a document out by the Refrens template it was made with (template.name:
   * "default", "crisp", "enterprise"…): its HSN rule (a column of its own, or "(HSN/SAC: …)"
   * after the item name) keys on that name, and the shared normalizer reads it from
   * templateName, which the API leaves unset.
   */
  const refrensTemplate = text(asRecord(invoice.template).name);
  const fixed = {
    ...invoice,
    ...(chosen
      ? {}
      : { advanceOptions: { ...options, unitColumn: "SEPARATE_COLUMN" } }),
    ...(refrensTemplate && !text(invoice.templateName)
      ? { templateName: refrensTemplate }
      : {}),
  };
  return (wrapped ? { ...root, invoice: fixed } : fixed) as T;
};

export const withGstColumnLabels = <T>(payload: T): T => {
  const root = asRecord(payload);
  const wrapped = isRecord(root.invoice);
  const invoice = wrapped ? asRecord(root.invoice) : root;
  if (text(invoice.taxType).toUpperCase() !== "INDIA") return payload;
  const labels = asRecord(invoice.customLabels);
  const columns = asArray(invoice.columns).map((entry) => {
    const column = asRecord(entry);
    const key = text(column.key);
    const label = text(column.label);
    const word = GST_COLUMN_WORDS[key];
    if (word && FOREIGN_TAX_NAMES.includes(label.toUpperCase())) {
      return { ...column, label: firstText(labels[key], word) };
    }
    // The rate column: "PPN Rate" / "VAT %" read "GST Rate" / "GST %".
    const lead = FOREIGN_TAX_NAMES.find((name) =>
      label.toUpperCase().startsWith(`${name} `)
    );
    if (key === "gstRate" && lead) {
      // refrens.com keeps the business's own "Tax Rate" wording, in capitals ("TAX Rate").
      const taxWord = lead === "TAX" ? "TAX" : "GST";
      return {
        ...column,
        label: firstText(
          labels.gstRate,
          `${taxWord}${label.slice(lead.length)}`
        ),
      };
    }
    return entry;
  });
  const fixed = { ...invoice, columns };
  return (wrapped ? { ...root, invoice: fixed } : fixed) as T;
};

/*
 * The template's data mapper, before the shared normalizer: a host that wraps the document
 * ({ invoice, template }) may send the template settings (pdfOptions, primaryColor, fonts,
 * script…) beside the invoice instead of on it; the normalizer keeps only invoice.template,
 * so they are merged onto it here (the document's own values win).
 */
export const withTemplateSettings = <T>(payload: T): T => {
  const root = asRecord(payload);
  if (!isRecord(root.invoice) || !isRecord(root.template)) return payload;
  const invoice = asRecord(root.invoice);
  const own = asRecord(invoice.template);
  const host = asRecord(root.template);
  return {
    ...root,
    invoice: {
      ...invoice,
      template: {
        ...host,
        ...own,
        pdfOptions: {
          ...asRecord(host.pdfOptions),
          ...asRecord(own.pdfOptions),
        },
      },
    },
  } as T;
};
/* ------------------------------------------------------------------ parties (design) */

export interface PartyLine {
  key: string;
  label: string;
  value: string;
  isDate?: boolean;
  isNum?: boolean;
  isEmail?: boolean;
  isPhone?: boolean;
  isToken?: boolean;
  isHidden?: boolean;
  attr?: string;
}

/*
 * Place of Supply and Country of Supply, the last lines of the buyer's last column, as the
 * design prints them — and nothing derived beside them (user request). Refrens' "Show
 * Place/Country of Supply" switch (hideCountryOfSupply) shows or hides them; they stay in the
 * page, hidden, carrying the host's live toggle target (data-ceres-country-of-supply; the
 * place also data-ceres-place-of-supply for its own key).
 */
export const mapSupplyLines = (state: UnknownRecord) => {
  const supply = mapSupply(state);
  const lines: PartyLine[] = [
    ...supply.rows.filter((row) => row.key === "placeOfSupply"),
    ...supply.rows.filter((row) => row.key === "countryOfSupply"),
  ].map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value,
    isHidden: row.isHidden,
    attr: row.attr,
  }));
  return lines.length ? { hidden: supply.hidden, lines } : null;
};

/*
 * The template prints its own colon after every label ("Date: …"); a business label that
 * already ends in one ("Date: ") loses it, so it never reads "Date::".
 */
export const bareLabel = (label: string): string =>
  label.replace(/\s*[:：]\s*$/, "");

const bareRows = <T extends { label: string }>(rows: T[]): T[] =>
  rows.map((row) => ({ ...row, label: bareLabel(row.label) }));

/*
 * Document details (the design's "Order and invoice references" row), the last section above
 * the items (user request): the document's own number and dates on the right, every other
 * header detail (PO, the document's own header fields, reverse charge) on the left. Transport
 * Details are a section of their own above it.
 */
const OWN_DETAILS = ["invoiceNumber", "invoiceDate", "dueDate"];

export const mapReferences = (state: UnknownRecord) => {
  const transport = mapTransport(state);
  const meta = mapMeta(state, []);
  const start = meta.filter((row) => !OWN_DETAILS.includes(row.key));
  const end = meta.filter((row) => OWN_DETAILS.includes(row.key));
  return {
    start,
    end,
    // Transport Details: a section of its own, above the document details.
    transport: transport
      ? { title: bareLabel(transport.title), rows: bareRows(transport.rows) }
      : null,
    showDetails: meta.length > 0,
    // "Invoice Details" / "Quotation Details" / "Credit Note Details"…, the document's own
    // label for this section, as refrens.com titles it (user request).
    title: bareLabel(
      labelOr(
        asRecord(asRecord(state.invoice).customLabels),
        "invoiceDetails",
        "Invoice Details"
      )
    ),
  };
};

/* ------------------------------------------------------------------ totals rows (design) */

/*
 * The Subtotal widget's rows print in full under the TOTAL row (user request: the subtotal
 * fields must show) — Sub Total, discount, taxes, charges, round-off, Total, paid and due —
 * even where a figure repeats a column sum of the TOTAL row.
 */
export const mapTotalRows = (totals: ReturnType<typeof mapTotals>) => ({
  main: totals.main,
  extra: totals.extra,
  due: totals.due,
  show: totals.main.length + totals.extra.length + totals.due.length > 0,
});

/* ------------------------------------------------------------------ payments (design) */

/*
 * The design's "Payment details" strip: Date | Mode | Amount Received | Payment Account |
 * Transaction Charge | TDS, one strip per payment recorded on the document. Transaction
 * Charge and TDS appear when a payment has one (the payment table widget's own rule). Kept
 * in the page, hidden, while "Show payments table" is off (data-ceres-payment-table).
 */
/*
 * The payment widget names the modes it knows; one the API sends in another case ("CHEQUE",
 * not the widget's "Cheque") would print as the raw code. Codes are named as refrens.com
 * names them; anything else prints as given.
 */
const PAYMENT_MODE_NAMES: Record<string, string> = {
  ACCOUNT_TRANSFER: "Account Transfer",
  BANK_TRANSFER: "Account Transfer",
  CASH: "Cash Payment",
  CHEQUE: "Cheque",
  CHECK: "Cheque",
  DD: "Demand Draft",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  UPI: "UPI",
  WALLET: "Digital Wallet",
  PREPAID_CARD: "Prepaid Card",
  NET_BANKING: "Net Banking",
  OTHER: "Other",
};

export const paymentModeName = (value: unknown): string => {
  const raw = text(value);
  return PAYMENT_MODE_NAMES[raw.toUpperCase().replace(/[\s-]+/g, "_")] || raw;
};

export const mapPayments = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const advanceOptions = asRecord(state.advanceOptions);
  const ctx = formatContext(invoice);
  const sourcePayments = asArray(invoice.allPayments)
    .filter(Boolean)
    .map(asRecord);
  // The payment widget carries no notes; refrens.com adds a Notes column when any payment
  // has one (user report), so they come from the payments themselves.
  const showNotes = sourcePayments.some(
    (payment) => text(payment.notes) !== ""
  );
  const model = computePaymentColumns(sourcePayments, {
    businessCurrency:
      firstText(invoice.businessCurrency, asRecord(invoice.owner).currency) ||
      undefined,
    currency: text(invoice.currency) || undefined,
  });
  const rows = model.payments.map((payment, index) => [
    { label: "Date", value: payment.paymentDate, isDate: true },
    {
      label: "Mode",
      value: paymentModeName(payment.paymentMethodLabel),
      isDate: false,
    },
    {
      label: "Amount Received",
      value: formatMoney(payment.amount, ctx),
      isDate: false,
      // On a document in another currency, the amount in the business's currency under it,
      // in brackets, as refrens.com prints it: "530.580 / (₹50,378.84)".
      converted:
        model.showBizAmount && payment.amountInBizCurrencyFormatted
          ? `(${payment.amountInBizCurrencyFormatted})`
          : "",
    },
    {
      label: "Payment Account",
      value: payment.paymentAccountName,
      isDate: false,
      isText: true,
    },
    ...(model.showTransactionCharge
      ? [
          {
            label: "Transaction Charge",
            value: formatMoney(payment.transactionCharge, ctx),
            isDate: false,
          },
        ]
      : []),
    ...(model.showTds
      ? [
          {
            label: "TDS",
            value: formatMoney(payment.tds, ctx),
            isDate: false,
          },
        ]
      : []),
    ...(showNotes
      ? [
          {
            label: "Notes",
            value: text(sourcePayments[index]?.notes),
            isDate: false,
            isText: true,
          },
        ]
      : []),
  ]);
  /*
   * One table, as the payment widget and refrens.com print it (user request): the headings
   * once, a row per payment and, with more than one payment, a Total row summing the amount
   * received, the transaction charges and the TDS.
   */
  const columns = rows.length ? rows[0].map((field) => field.label) : [];
  const totalOf: Record<string, string> = {
    "Amount Received": formatMoney(model.totalAmount, ctx),
    "Transaction Charge": formatMoney(model.totalTransactionCharge, ctx),
    TDS: formatMoney(model.totalTds, ctx),
  };
  const total =
    rows.length > 1
      ? columns.map((label, index) => ({
          value: index === 0 ? "Total" : totalOf[label] || "",
        }))
      : null;
  return {
    // "Payments" over the table, as refrens.com titles it (user request).
    title: heading(asRecord(invoice.customLabels), "payments", "Payments"),
    columns,
    total,
    show: rows.length > 0,
    // Printed only when the document turns "Show Payments Table" on, as refrens.com does
    // (verified on 41 real invoices with payments); the host's live toggle can still show it.
    hidden: !(
      advanceOptions.showPaymentsTable === true ||
      invoice.showPaymentsTable === true
    ),
    rows,
  };
};

/* "Duplicate" → "(Duplicate)": the copy label in brackets, as the design sets it. */
export const copyLabel = (value: unknown): string => {
  const copy = text(value);
  if (!copy) return "";
  return /^\(.*\)$/.test(copy) ? copy : `(${copy})`;
};

/* ------------------------------------------------------------------ Viraj layout */

/* A field as the layout prints it: "Label" | "value", with how the value may wrap. */
export interface FieldCell {
  label: string;
  value: string;
  isDate?: boolean;
  isNum?: boolean;
  isEmail?: boolean;
  isPhone?: boolean;
  isToken?: boolean;
}

type PartyModel = NonNullable<ReturnType<typeof mapParty>>;

/* Every identifier line of a party, flattened in the form's order. */
const partyFields = (party: PartyModel): FieldCell[] =>
  party.lines
    .reduce((all, line) => all.concat(line), [] as PartyModel["lines"][number])
    .map((row) => ({
      label: bareLabel(row.label),
      value: row.value,
      isDate: row.isDate,
      isNum: row.noWrap,
      isEmail: row.isEmail,
      isPhone: row.isPhone,
      isToken: row.isToken,
    }));

/* Fields two to a row; an odd last row keeps its empty pair of cells (the design's grid). */
export const fieldPairs = <T>(rows: T[]): Array<{ cells: Array<T | null> }> =>
  rows
    .filter((_, index) => index % 2 === 0)
    .map((_, index) => {
      const pair: Array<T | null> = rows.slice(index * 2, index * 2 + 2);
      while (pair.length < 2) pair.push(null);
      return { cells: pair };
    });

/*
 * The buyer's box ("To: <name>", "Address : <lines>"), then its fields in a grid two to a
 * row — tax numbers, phone, email, the contact person and the client's own fields ("Kind
 * Attention", "Sales Engineer") — label and value in cells of their own, as the design rules
 * them.
 */
export const mapBilling = (
  invoice: UnknownRecord,
  partyValue: unknown = invoice.billedTo,
  labelKey = "billedTo",
  fallback = "Billed To"
) => {
  const party = mapParty(invoice, partyValue, "");
  if (!party) return null;
  const labels = asRecord(invoice.customLabels);
  return {
    title: bareLabel(labelOr(labels, labelKey, fallback)),
    name: party.name,
    addressLabel: bareLabel(labelOr(labels, "address", "Address")),
    addressLines: [party.street, party.region].filter(Boolean),
    rows: fieldPairs(partyFields(party)),
  };
};

/* Shipped From, Shipped To: a titled panel each, the address then "Label: value" lines. */
const mapShippingPanel = (
  invoice: UnknownRecord,
  value: unknown,
  title: string,
  role: string
) => {
  const party = mapParty(invoice, value, title, true);
  if (!party) return null;
  return {
    role,
    title: bareLabel(title),
    name: party.name,
    addressLines: [party.street, party.region].filter(Boolean),
    fields: partyFields(party),
    supply: null as null | { hidden: boolean; lines: PartyLine[] },
  };
};

/*
 * The document details beside the buyer's box, one ruled row each: the number and dates, the
 * PO, the document's own header fields, the reason, created-by and reverse charge — the
 * document's details only. Its Contact Details (invoice.contact) close the document instead
 * (mapDocumentContact), as refrens.com prints them.
 */
/*
 * The document's E-commerce Operator (GST), after the dates as refrens.com prints it:
 * "E-commerce Operator  test (24AAAAA0000A1Z5)", the GSTIN in brackets when there is one.
 */
const mapEcommerceOperator = (invoice: UnknownRecord) => {
  const operator = asRecord(invoice.ecommerceOperator);
  const name = text(operator.name);
  if (!name) return [];
  const gstin = text(operator.gstin);
  return [
    {
      key: "ecommerceOperator",
      label: labelOr(
        asRecord(invoice.customLabels),
        "ecommerceOperator",
        "E-commerce Operator"
      ),
      value: gstin ? `${name} (${gstin})` : name,
      isDate: false,
      isNum: false,
      isEmail: false,
      isPhone: false,
    },
  ];
};

export const mapDetails = (state: UnknownRecord) => [
  ...mapMeta(state, []).map((row) => ({
    key: row.key,
    label: bareLabel(row.label),
    value: row.value,
    isDate: Boolean(row.isDate),
    isNum: Boolean(row.isNum),
    isEmail: false,
    isPhone: false,
  })),
  ...mapEcommerceOperator(asRecord(state.invoice)),
];

/*
 * The document's Contact Details (invoice.contact), worded as refrens.com closes a document:
 * "For any enquiry, reach out via email at …, call on …". Only with an email or a phone; each
 * phrase is the business's own label when set (customLabels contact / contactEmail /
 * contactPhone).
 */
export const mapDocumentContact = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const contact = asRecord(invoice.contact);
  const email = text(contact.email);
  const phone = text(contact.phone);
  return email || phone
    ? {
        lead: labelOr(labels, "contact", "For any enquiry, reach out via"),
        emailLabel: labelOr(labels, "contactEmail", "email at"),
        phoneLabel: labelOr(labels, "contactPhone", "call on"),
        email,
        phone,
      }
    : null;
};

export const buildVirajView = (root: unknown) => {
  const state = asRecord(root);
  const invoice = asRecord(state.invoice);
  const mapped = asRecord(state.mapped);
  const visibility = asRecord(mapped.visibility);
  const labels = asRecord(invoice.customLabels);
  const settings = mapSettings(state);
  const options = resolveSettings(state);

  const shippedFrom = visibility.shippedFrom
    ? mapShippingPanel(
        invoice,
        invoice.shippedFrom,
        labelOr(labels, "shippedFrom", "Shipped From"),
        "shipped-from"
      )
    : null;
  const shippedTo = visibility.shippedTo
    ? mapShippingPanel(
        invoice,
        invoice.shippedTo,
        labelOr(labels, "shippedTo", "Shipped To"),
        "shipped-to"
      )
    : null;
  // Place / Country of Supply print under Shipped To only (as in the Ecommerce template): a
  // document without a shipping address shows neither.
  if (shippedTo) {
    const supply = mapSupplyLines(state);
    shippedTo.supply = supply
      ? { ...supply, lines: bareRows(supply.lines) }
      : null;
  }
  const { transport } = mapReferences(state);

  const notes = mapNotes(state);
  const terms = options.terms ? notes.terms : [];
  const table = mapItemTable(state, formatContext(invoice), options);
  const totals = mapTotals(state, options);
  const rawCompliance = mapCompliance(state);
  const compliance = {
    ...rawCompliance,
    irnLabel: bareLabel(rawCompliance.irnLabel),
    irnRows: bareRows(rawCompliance.irnRows),
    eway: bareRows(rawCompliance.eway),
  };
  const status = statusTag(invoice);
  const print = mapPrint(state, table.printFixedWidth);
  const bank = mapBank(state);
  const additional = mapAdditionalInfo(state, formatContext(invoice));
  const words = mapWords(state, options);
  /*
   * The box carries the party the document is for. A purchase order is issued by the
   * business, which the API stores as Billed To ("Order By"), to the vendor in Billed By
   * ("Order To"), so there the vendor fills the box. The issuer's own details (Billed By) are
   * not printed in this template (user request); its name is only the logo's alt text.
   */
  const isPurchaseOrder =
    text(invoice.billType).toUpperCase() === "PURCHASEORDER";
  const issuer = asRecord(
    isPurchaseOrder ? invoice.billedTo : invoice.billedBy
  );
  const billing = isPurchaseOrder
    ? mapBilling(invoice, invoice.billedBy, "billedBy", "Order To")
    : mapBilling(invoice);
  const logo = firstText(invoice.logo, asRecord(invoice.billedBy).logo);
  const shipping = [shippedFrom, shippedTo].filter(
    (panel): panel is NonNullable<typeof panel> => panel !== null
  );
  const bankShown = Boolean(bank.show);
  // The design's group is Declaration | Bank Account Details, with the terms after it. Without
  // notes, the first terms take the Declaration's place beside the bank (user request), rather
  // than the bank standing alone.
  const termsInGroup =
    !notes.notes && bankShown && terms.length > 0 ? terms[0] : null;

  return {
    logo,
    sellerName: text(issuer.name),
    title: firstText(invoice.invoiceTitle),
    subtitle: text(invoice.invoiceSubTitle),
    copy: copyLabel(invoice.copy),
    status: status
      ? { ...status, inPrint: Boolean(visibility.showStatusTagInPrint) }
      : null,
    theme: settings.theme,
    billing,
    details: mapDetails(state),
    contact: mapDocumentContact(state),
    shipping,
    transport,
    showDispatch: shipping.length > 0 || Boolean(transport),
    compliance,
    table,
    descriptionFullWidth: options.descriptionFullWidth,
    totals: { ...totals, ...mapTotalRows(totals) },
    words: words ? { ...words, label: bareLabel(words.label) } : null,
    hsn: { hidden: !visibility.showHsnSummary },
    taxSummary: { hidden: !visibility.showTaxTable },
    batch: mapBatchSummary(state, formatContext(invoice), options),
    signature: mapSignature(state),
    terms: termsInGroup ? terms.slice(1) : terms,
    termsInGroup,
    notes: notes.notes,
    // Notes and the bank details share a row (notes take the room, bank its own width).
    showNotesRow: Boolean(notes.notes) || bankShown,
    bank: {
      ...bank,
      rows: bareRows(bank.rows),
      upi: bank.upi ? { ...bank.upi, label: bareLabel(bank.upi.label) } : null,
    },
    // The design's "Terms & Conditions" grid: the document's Additional Info fields (and its
    // custom fields), label | value | label | value. No customLabels key renames this
    // section in Refrens, so the design's title is the default.
    additional: additional
      ? {
          title: bareLabel(
            labelOr(labels, "additionalInfo", "Terms & Conditions")
          ),
          rows: fieldPairs(bareRows(additional.rows)),
        }
      : null,
    attachments: notes.attachments,
    payments: mapPayments(state),
    footerEveryPage: !visibility.footerOnLastPage,
    letterheadEveryPage: !visibility.letterHeadOnFirstPage,
    pageless: options.pageless,
    print,
    script: mapScript(state),
  };
};

interface HelperRegistry {
  registerHelper: (
    name: string,
    helper: (...args: unknown[]) => unknown
  ) => void;
}

export const registerVirajHelpers = (HB: HelperRegistry | undefined): void => {
  if (!HB) return;
  HB.registerHelper("vtView", (root: unknown) => buildVirajView(root));
  // Summary money as refrens.com prints it: whole amounts without decimals ("₹90", "₹1,000"),
  // the rest with theirs ("₹18.09").
  HB.registerHelper("vtMoney", (value: unknown, options: unknown) => {
    const root = asRecord(asRecord(asRecord(options).data).root);
    const invoice = isRecord(root.invoice) ? asRecord(root.invoice) : root;
    return formatSummaryMoney(
      value,
      formatContext(invoice),
      "vtOwnSubUnitLength" in invoice
        ? invoice.vtOwnSubUnitLength
        : invoice.subUnitLength
    );
  });
  // The HSN and tax summaries from the document's own stored figures, as refrens.com prints them.
  HB.registerHelper("vtHsnSummary", (root: unknown) =>
    summaryTable(root, "hsn")
  );
  HB.registerHelper("vtTaxSummary", (root: unknown) =>
    summaryTable(root, "tax")
  );
  // `{{vtDate value offset}}` — Handlebars appends its options object, so only a string or
  // number second argument is an offset.
  HB.registerHelper("vtShortDate", (value: unknown, offset: unknown) =>
    formatShortDate(
      value,
      typeof offset === "string" || typeof offset === "number"
        ? offset
        : undefined
    )
  );
  // Every date as refrens.com prints it: "Nov 15, 2025".
  HB.registerHelper("vtDate", (value: unknown, offset: unknown) =>
    formatShortDate(
      value,
      typeof offset === "string" || typeof offset === "number"
        ? offset
        : undefined
    )
  );
};

/* ------------------------------------------------------------------ business logo */

/*
 * The logo box follows the logo's shape, as the Apex Engineering template sizes it (user
 * request): a logo no wider than 1.25 × its height (square, or upright) prints in a 100 px
 * square; a wider one in a 200 × 80 box (80 px is the design's logo height). Its shape is only
 * known once it loads, so the logo is marked then (is-square, styles.css); load events do not
 * bubble, so the listener sits on the document's capture phase, ahead of every render. The
 * signature image is marked the same way (user request): a square one in its 120 px box, a
 * wide one in the logo's 200 × 80.
 */
const SQUARE_LOGO_RATIO = 1.25;

export const isSquareLogo = (width: number, height: number): boolean =>
  width > 0 && height > 0 && width / height <= SQUARE_LOGO_RATIO;

export const markLogoShape = (image: HTMLImageElement): void => {
  image.classList.toggle(
    "is-square",
    isSquareLogo(image.naturalWidth, image.naturalHeight)
  );
};

export const registerVirajLogo = (): void => {
  const state = window as typeof window & { vtLogoRegistered?: boolean };
  if (state.vtLogoRegistered || typeof document === "undefined") return;
  state.vtLogoRegistered = true;
  document.addEventListener(
    "load",
    (event) => {
      const { target } = event;
      if (
        target instanceof HTMLImageElement &&
        (target.classList.contains("vt-logo-image") ||
          target.classList.contains("vt-signature-image"))
      ) {
        markLogoShape(target);
      }
    },
    true
  );
};

/* ------------------------------------------------------------------ print table fit */

/*
 * Print: the item table must fit the page whatever the paper, margins or print size. The
 * columns size to their content, so the table is measured once laid out for print rather than
 * estimated: a table wider than its page takes the tight print padding (is-print-fit), then
 * its text shrinks just enough to fit (--vt-print-fit), never under the 10 px floor (CSS).
 * Back on screen, it reads as before.
 */
const MIN_PRINT_FIT = 0.6;
// Sub-pixel rounding is not an overflow.
const PRINT_SLACK = 0.5;
// The share of the page's width a fitted table may take (see fitPrintTable).
const PRINT_ROOM = 0.99;
/*
 * The Item column's floor in print: a readable column of about 12 characters with its padding.
 * On a narrow page (A5, a large print size) the other columns at full size leave it a sliver,
 * every description runs down as a column of single words and an item no longer fits a page.
 */
const PRINT_DESCRIPTION_FLOOR = 120;

/*
 * An item row prints whole (break-inside: avoid; user rule 2026-10-19: a line item never
 * splits), moving to the next page when it does not fit. Only a row taller than a page's room
 * between the letterhead, the footer and the table's headings may break, as it could not fit
 * on any page (at most TALL_ROW, A4 portrait's; 320 px split ordinary items with a long
 * description). In print the room is the paper's (--vt-print-height, helpers.ts mapPrint): on
 * A5 or a landscape page an item taller than it was held whole, and Chrome counted pages for
 * it that it then did not fill, ending a browser's own print with blank pages. An item whose
 * name, description and image rows together outgrow the room may break between them too.
 */
const TALL_ROW = 640;

const printRoom = (root: ParentNode): number => {
  const doc = root.querySelector<HTMLElement>(".vt-doc");
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  const pageHeight = doc
    ? parseFloat(getComputedStyle(doc).getPropertyValue("--vt-print-height"))
    : NaN;
  if (!doc || !printing || !(pageHeight > 0)) return TALL_ROW;
  // Laid-out pixels per CSS pixel of the document (the print size zooms the page).
  const scale = doc.getBoundingClientRect().width / (doc.offsetWidth || 1) || 1;
  const height = (selector: string) => {
    const element = root.querySelector<HTMLElement>(selector);
    return element && element.getClientRects().length
      ? element.getBoundingClientRect().height / scale
      : 0;
  };
  const room =
    pageHeight -
    height(".vt-page-frame-header") -
    height(".vt-page-frame-footer") -
    height(".vt-items > thead");
  return room > 100 ? Math.min(TALL_ROW, room) : TALL_ROW;
};

export const markTallRows = (root: ParentNode = document): void => {
  const limit = printRoom(root);
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>(".vt-items tbody tr")
  );
  rows.forEach((row) => {
    row.classList.toggle("is-tall", row.getBoundingClientRect().height > limit);
    row.classList.remove("is-loose");
  });
  // An item's rows, from its name (or item) row to its last description or image row.
  const PARTS = ["vt-detail-row", "vt-image-row"];
  rows.forEach((row, index) => {
    if (!row.classList.contains("vt-item-row")) return;
    const group = [row];
    const before = rows[index - 1];
    if (before?.classList.contains("vt-name-row")) group.unshift(before);
    for (
      let next = index + 1;
      next < rows.length &&
      PARTS.some((part) => rows[next].classList.contains(part));
      next += 1
    ) {
      group.push(rows[next]);
    }
    const total = group.reduce(
      (sum, part) => sum + part.getBoundingClientRect().height,
      0
    );
    if (group.length > 1 && total > limit) {
      group.forEach((part) => part.classList.add("is-loose"));
    }
  });
};

/*
 * Laid-out pixels per CSS pixel at an element (the renderer zooms <html> for the print size):
 * read off a 1000 px probe, as offsetHeight rounds to whole pixels.
 */
const layoutScale = (parent: HTMLElement, before: Element): number => {
  const probe = document.createElement("div");
  probe.style.cssText = "height: 1000px; margin: 0; break-inside: avoid;";
  parent.insertBefore(probe, before);
  const scale = probe.getBoundingClientRect().height / 1000;
  probe.remove();
  return scale > 0 ? scale : 1;
};

/*
 * Stretch the item table to the page (view.print.stretchTable): in print, while the whole
 * document fits on one page, its empty filler row takes the page's spare height so the footer
 * sits at the page's foot, the column rules running down through it. A document longer than
 * a page keeps its natural height (Refrens stretches single-page PDFs only).
 *
 * The page's height is left to CSS (100vh): Refrens' PDF service lays the page out in a
 * window shorter than the paper and only then prints, so a height measured here was the
 * window's (the table barely stretched in a short window and ran onto a second page in a
 * tall one). 100vh is the page area when the PDF is made; the content's own height is
 * measured here (the width is the paper's already, styles.css). Under the print zoom Chrome
 * scales the page margins as well, so 100vh / zoom is a few px off: kept back with the
 * slack. A document longer than a page comes out at 0.
 */
const STRETCH_SLACK = 16;
// The error under a zoom above 1 grows with it: 2 × the margin × (1 − 1 / zoom), for margins
// up to 80 px (about 2 cm).
const STRETCH_ZOOM_SLACK = 160;

/*
 * Stretch on, a document longer than a page (user, 2026-10-19): where a whole item moves to the
 * next page, the space it leaves keeps the table's look. Chrome runs the items wrapper on to
 * the page's foot, so the wrapper draws the column rules there and a rule under each page's
 * piece of the table (styles.css); the table's row groups are opaque in print, so the rules
 * show only below the page's last row. Positions are read off the row with the most cells, as
 * fractions of the wrapper's width (the print zoom scales both alike); the rules' width comes
 * from styles.css (a 0.5 px border reads back as 1 px), their colour from the cells' borders.
 */
const columnRules = (
  wrap: HTMLElement,
  table: HTMLTableElement
): { layers: string; color: string } | undefined => {
  const row = Array.from(table.tBodies)
    .flatMap((body) => Array.from(body.rows))
    .reduce<HTMLTableRowElement | undefined>(
      (best, candidate) =>
        !best || candidate.cells.length > best.cells.length ? candidate : best,
      undefined
    );
  const box = wrap.getBoundingClientRect();
  if (!row || row.cells.length === 0 || box.width <= 0) return undefined;
  const style = getComputedStyle(row.cells[0]);
  const color = parseFloat(style.borderInlineEndWidth)
    ? style.borderInlineEndColor
    : style.borderInlineStartColor;
  const width =
    parseFloat(
      getComputedStyle(wrap).getPropertyValue("--vt-column-rule-width")
    ) || 1;
  const scale = box.width / (wrap.offsetWidth || box.width);
  const room = box.width - width * scale;
  const cells = Array.from(row.cells).map((cell) =>
    cell.getBoundingClientRect()
  );
  const edges = [
    ...cells.map((cell) => cell.left - box.left),
    cells[cells.length - 1].right - box.left,
  ];
  const layers = edges
    .map(
      (x) =>
        `linear-gradient(${color}, ${color}) ${compactDecimal(
          Math.min(100, Math.max(0, (x / room) * 100))
        )}% 0 / var(--vt-column-rule-width) 100% no-repeat`
    )
    .join(", ");
  return { layers, color };
};

export const stretchItemTable = (root: ParentNode = document): void => {
  const doc = root.querySelector<HTMLElement>(".vt-doc.is-stretch");
  const filler = doc?.querySelector<HTMLElement>(".vt-items .vt-filler");
  const frame = doc?.querySelector<HTMLElement>(".vt-page-frame");
  if (!doc || !filler || !frame) return;
  filler.style.removeProperty("--vt-filler-height");
  const wrap = doc.querySelector<HTMLElement>(".vt-items-scroll");
  const table = doc.querySelector<HTMLTableElement>(".vt-items");
  wrap?.style.removeProperty("--vt-column-rules");
  wrap?.style.removeProperty("--vt-column-rule-color");
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  if (!printing || !frame.parentElement) return;
  const rules = wrap && table ? columnRules(wrap, table) : undefined;
  if (wrap && rules) {
    wrap.style.setProperty("--vt-column-rules", rules.layers);
    wrap.style.setProperty("--vt-column-rule-color", rules.color);
  }
  const zoom =
    parseFloat(getComputedStyle(document.documentElement).zoom || "1") || 1;
  // The whole document: the frame, and the letterhead footer after it when it prints on the
  // last page only (on every page it sits in the frame's repeating footer space).
  const content =
    doc.getBoundingClientRect().height /
    layoutScale(frame.parentElement, frame);
  const slack =
    STRETCH_SLACK + (zoom > 1 ? STRETCH_ZOOM_SLACK * (1 - 1 / zoom) : 0);
  filler.style.setProperty(
    "--vt-filler-height",
    `max(0px, calc(100vh / ${compactDecimal(zoom)} - ${Math.ceil(
      content + slack
    )}px))`
  );
};

/*
 * A totals figure has no width of its own (styles.css .vt-fig), so it never widens the item
 * table's last column (user, 2026-10-21, as in the Ecommerce template). Once laid out, when the
 * widest figure on show does not fit its cell, every totals row's figure cell takes the same
 * whole columns to its left from the label, so the one rule between label and figure stays a
 * straight line on an item column's edge. Each layout starts over from the last column alone;
 * a row hidden at the time (hideTotals / hideTaxes) is not measured.
 */
export const fitTotals = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLTableElement>("table.vt-items").forEach((table) => {
    const pairs = Array.from(
      table.querySelectorAll<HTMLTableRowElement>(
        ":scope > tbody.vt-totals > tr.ceres-subtotal-row"
      )
    )
      .map((row) => ({
        label: row.querySelector<HTMLTableCellElement>(
          ":scope > .ceres-subtotal-label"
        ),
        value: row.querySelector<HTMLTableCellElement>(
          ":scope > .ceres-subtotal-value"
        ),
      }))
      .filter(
        (
          pair
        ): pair is {
          label: HTMLTableCellElement;
          value: HTMLTableCellElement;
        } => Boolean(pair.label && pair.value)
      );
    if (!pairs.length) return;
    const columns = pairs[0].label.colSpan + pairs[0].value.colSpan;
    pairs.forEach(({ label, value }) => {
      label.colSpan = columns - 1;
      value.colSpan = 1;
    });
    // Phones and tablets read the totals as label | figure lines: no columns to line up with.
    if (table.matches(".is-cards, .is-grid") || columns < 2) return;
    const row = Array.from(table.tBodies)
      .flatMap((body) => Array.from(body.rows))
      .find((candidate) => candidate.cells.length === columns);
    if (!row) return;
    const widths = Array.from(row.cells).map(
      (cell) => cell.getBoundingClientRect().width
    );
    let need = 0;
    pairs.forEach(({ value }) => {
      if (!value.getClientRects().length) return;
      const figure = value.querySelector(".vt-fig");
      if (!figure) return;
      const style = getComputedStyle(value);
      const padding =
        (parseFloat(style.paddingInlineStart) || 0) +
        (parseFloat(style.paddingInlineEnd) || 0);
      // At least a whole pixel for the rule: a 0.5 px rule still paints a full device pixel.
      const rule = Math.max(
        1,
        Math.ceil(parseFloat(style.borderInlineStartWidth) || 0)
      );
      Array.from(figure.children).forEach((child) => {
        need = Math.max(
          need,
          child.getBoundingClientRect().width + padding + rule
        );
      });
    });
    let span = 1;
    let room = widths[columns - 1];
    while (need > room && span < columns - 1) {
      span += 1;
      room += widths[columns - span];
    }
    if (span === 1) return;
    pairs.forEach(({ label, value }) => {
      label.colSpan = columns - span;
      value.colSpan = span;
    });
  });
};

/*
 * The totals carry on without the item headings (user, 2026-10-19): in print, the rows after
 * the items move into a table of their own right under the item table, so a page that holds
 * only them repeats no heading row. Its columns take the item columns' widths, so the TOTAL
 * row's figures stay under their columns. joinTotals puts them back in the one table.
 */
const TOTALS_SPLIT = "data-vt-totals-split";
const TOTALS_GROUPS = ":scope > tbody.vt-items-total, :scope > tbody.vt-totals";

export const joinTotals = (root: ParentNode = document): void => {
  root
    .querySelectorAll<HTMLTableElement>(`table[${TOTALS_SPLIT}]`)
    .forEach((split) => {
      const table = split.previousElementSibling;
      const marker = Array.from(table?.childNodes || []).find(
        (node) =>
          node.nodeType === Node.COMMENT_NODE &&
          node.textContent === TOTALS_SPLIT
      );
      if (table && marker) {
        Array.from(split.querySelectorAll(TOTALS_GROUPS)).forEach((group) =>
          table.insertBefore(group, marker)
        );
        marker.remove();
      }
      split.remove();
    });
};

/*
 * The summary tables (Tax, HSN, Batch, Payments) read as cards on a phone, as in the Modern
 * Manufacturing template (user, 2026-10-20): each cell is labelled with its column's heading,
 * both heading rows joined ("IGST Rate"), for the card CSS to print beside its value. A Total
 * row's first cell is its title, and a cell with nothing in it is left off the card.
 */
export const labelSummaryCells = (root: ParentNode = document): void => {
  root
    .querySelectorAll<HTMLTableElement>(".vt-summary table.ceres-table")
    .forEach((table) => {
      const span = (cell: Element) =>
        Math.max(1, Number(cell.getAttribute("colspan")) || 1);
      const headings: string[][] = [];
      table.querySelectorAll("thead tr").forEach((row) => {
        let col = 0;
        Array.from(row.children).forEach((cell) => {
          const name = cell.textContent?.trim() ?? "";
          for (let i = 0; i < span(cell); i += 1) {
            headings[col + i] ??= [];
            if (name && !headings[col + i].includes(name)) {
              headings[col + i].push(name);
            }
          }
          col += span(cell);
        });
      });
      table.querySelectorAll("tbody tr, tfoot tr").forEach((row) => {
        let col = 0;
        const isTotal = row.parentElement?.tagName === "TFOOT";
        Array.from(row.children).forEach((cell, index) => {
          const label =
            span(cell) === 1 && !(isTotal && index === 0)
              ? (headings[col] ?? []).join(" ")
              : "";
          if (label) cell.setAttribute("data-label", label);
          else cell.removeAttribute("data-label");
          cell.toggleAttribute(
            "data-vt-empty",
            !(cell.textContent ?? "").trim() && !cell.querySelector("img, svg")
          );
          col += span(cell);
        });
      });
    });
};

export const splitTotals = (root: ParentNode = document): void => {
  joinTotals(root);
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  if (!printing) return;
  root.querySelectorAll<HTMLTableElement>(".vt-items").forEach((table) => {
    const groups = Array.from(
      table.querySelectorAll<HTMLElement>(TOTALS_GROUPS)
    );
    const row = Array.from(table.tBodies)
      .filter((body) => !groups.includes(body))
      .flatMap((body) => Array.from(body.rows))
      .reduce<HTMLTableRowElement | undefined>(
        (best, candidate) =>
          !best || candidate.cells.length > best.cells.length
            ? candidate
            : best,
        undefined
      );
    if (!groups.length || !row || !table.parentElement) return;
    const split = document.createElement("table");
    split.className = table.className;
    split.setAttribute(TOTALS_SPLIT, "");
    const style = table.getAttribute("style");
    if (style) split.setAttribute("style", style);
    split.style.tableLayout = "fixed";
    groups[0].before(document.createComment(TOTALS_SPLIT));
    groups.forEach((group) => split.appendChild(group));
    table.after(split);
    /*
     * Measured once the totals have left: the item table sizes its columns again without
     * them, and widths taken before drifted a few px from the rules above (user report).
     * Layout pixels: the print zoom scales the measured boxes, not the widths set here.
     */
    const scale =
      table.getBoundingClientRect().width / (table.offsetWidth || 1) || 1;
    split.style.width = `${table.offsetWidth}px`;
    const cols = document.createElement("colgroup");
    Array.from(row.cells).forEach((cell) => {
      const col = document.createElement("col");
      col.span = cell.colSpan || 1;
      col.style.width = `${cell.getBoundingClientRect().width / scale}px`;
      cols.appendChild(col);
    });
    split.prepend(cols);
  });
};

export const fitPrintTable = (
  root: ParentNode = document,
  force = false
): void => {
  const printing =
    force ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("print").matches);
  root.querySelectorAll<HTMLElement>(".vt-items").forEach((table) => {
    table.classList.remove("is-print-fit");
    table.style.removeProperty("--vt-print-fit");
    table.style.removeProperty("zoom");
    const box = table.parentElement;
    if (!printing || !box) return;
    // 1 % kept back: Chrome sets the PDF's text a little wider than the layout measured it, and a
    // word on the table's edge ("Amount", "Expiry") was cut there.
    const room = () => box.getBoundingClientRect().width * PRINT_ROOM;
    // The table fills its box (width 100 %), so its own width always exceeds 99 % of it: what
    // counts is how narrow its columns can go, measured at width 0 (a table is never narrower
    // than its content). Read as it stood, a table that fit was shrunk to the 10 px floor.
    const need = () => {
      const { width } = table.style;
      table.style.width = "0px";
      const narrowest = table.getBoundingClientRect().width;
      table.style.width = width;
      return narrowest;
    };
    const overflow = () => need() - room();
    // The Item column as laid out, against its floor in the same (zoomed) pixels.
    const name = table.querySelector<HTMLElement>(
      ":scope > thead .vt-col-name"
    );
    const pxScale = () =>
      box.getBoundingClientRect().width / (box.offsetWidth || 1) || 1;
    const narrow = () =>
      !!name &&
      name.getBoundingClientRect().width <
        PRINT_DESCRIPTION_FLOOR * pxScale() - PRINT_SLACK;
    if (overflow() <= PRINT_SLACK && !narrow()) return;
    table.classList.add("is-print-fit");
    let fit = 1;
    // Shrinks by the measured ratio, and by at least a step each time, so the last pixel or
    // two of overflow (the floors, padding and rules do not scale exactly) still goes; a table
    // that fits but leaves the Item column under its floor shrinks a step at a time.
    for (
      let step = 0;
      step < 20 && (overflow() > PRINT_SLACK || narrow());
      step += 1
    ) {
      const ratio = overflow() > PRINT_SLACK ? room() / need() : 1;
      fit = Math.max(
        MIN_PRINT_FIT,
        Math.min(fit - 0.01, Math.floor(fit * ratio * 100) / 100)
      );
      table.style.setProperty("--vt-print-fit", String(fit));
      if (fit === MIN_PRINT_FIT) break;
    }
    // Last resort: a table still wider than its page at the 10 px text floor (eighteen
    // columns of figures that never wrap) is scaled as a whole to the page's width, text,
    // padding and rules alike, rather than its last columns (the amounts, the totals) being
    // cut off at the page edge. Rules and rounding keep a pixel or two: it settles in steps.
    let scale = 1;
    for (let step = 0; step < 10 && overflow() > PRINT_SLACK; step += 1) {
      const ratio = room() / need();
      scale = Math.min(scale - 0.005, Math.floor(scale * ratio * 1000) / 1000);
      table.style.setProperty("zoom", String(scale));
    }
  });
};

/* ------------------------------------------------------------------ print: a browser's own print */

/*
 * A browser's own print (Lydia's print button, Ctrl+P) counts the pages from the print layout
 * as it stands when printing starts; the print media listener runs after that, so a table it
 * fitted left blank pages at the end (two on A4, four on A5 in Modern Manufacturing, user report 2026-10-20). Just
 * before printing (beforeprint), the stylesheets' print rules are switched on for one
 * synchronous measurement, the table is fitted as print lays it out, and the rules go back:
 * the fit styles print only, so the screen never changes, and the page count is right.
 * Refrens' PDF service switches to print media before it prints, where the listener does it.
 */
const MEDIA_WIDTH =
  /\(\s*(min-width|max-width|width)\s*(:|<=|>=|<|>)\s*(\d+(?:\.\d+)?)px\s*\)/g;

/* What a media query says in print, on a page `width` px wide; undefined leaves it alone. */
export const printMediaText = (
  query: string,
  width: number
): string | undefined => {
  if (/\bprint\b/.test(query)) {
    return /\bnot\s+print\b/.test(query)
      ? "not all"
      : query.replace(/\bprint\b/g, "all");
  }
  if (/\bscreen\b/.test(query)) return "not all";
  const conditions = [...query.matchAll(MEDIA_WIDTH)];
  if (!conditions.length || /,|\bor\b|\bnot\b/.test(query)) return undefined;
  const holds = conditions.every(([, feature, op, value]) => {
    const px = Number(value);
    if (feature === "min-width" || op === ">=") return width >= px;
    if (feature === "max-width" || op === "<=") return width <= px;
    if (op === "<") return width < px;
    return width > px;
  });
  return holds ? "all" : "not all";
};

export const withPrintRules = <T>(width: number, measure: () => T): T => {
  const changed: Array<[MediaList, string]> = [];
  const flip = (media: MediaList) => {
    const before = media.mediaText;
    const next = printMediaText(before, width);
    if (next === undefined || next === before) return;
    changed.push([media, before]);
    // eslint-disable-next-line no-param-reassign
    media.mediaText = next;
  };
  const visit = (rules: CSSRuleList) =>
    Array.from(rules).forEach((rule) => {
      // A media rule (or an @import with media): by its media list, which jsdom's rules carry
      // without being CSSMediaRule instances.
      const { media } = rule as CSSMediaRule;
      if (media && typeof media.mediaText === "string") flip(media);
      if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    });
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      if (sheet.media?.mediaText) flip(sheet.media);
      visit(sheet.cssRules);
    } catch {
      // Another origin's stylesheet (a font): it holds no print rules of ours.
    }
  });
  try {
    return measure();
  } finally {
    changed.reverse().forEach(([media, before]) => {
      // eslint-disable-next-line no-param-reassign
      media.mediaText = before;
    });
  }
};

/*
 * For the same measurement, the template's own checks of `matchMedia("print")` answer yes, so
 * the print steps that need no pages (the table fit, the totals split) run as print runs them.
 */
export const withPrintMedia = <T>(measure: () => T): T => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    /\bprint\b/.test(query) && !/\bnot\b/.test(query)
      ? ({
          matches: true,
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList)
      : original.call(window, query)) as typeof window.matchMedia;
  try {
    return measure();
  } finally {
    window.matchMedia = original;
  }
};

/*
 * `layout` is the print media listener's own work (the totals split and all), so the page
 * count is taken from the layout that prints: splitting the totals off after the count left a
 * blank page at the end of an A5 printout. Only the steps that need the pages themselves (the
 * footer on the last page's edge) wait for the listener.
 */
export const prepareBrowserPrint = (
  layout?: () => void,
  root: ParentNode = document
): void => {
  const doc = root.querySelector<HTMLElement>(".vt-doc");
  if (!doc) return;
  const style = getComputedStyle(doc);
  // The document's printable width, or the browser's own (1 cm margins) where narrower.
  const width = Math.min(
    parseFloat(style.getPropertyValue("--vt-print-width")) ||
      doc.getBoundingClientRect().width,
    parseFloat(style.getPropertyValue("--vt-browser-print-width")) || Infinity
  );
  // The phone and tablet layouts are screen only.
  const fitted = Array.from(
    root.querySelectorAll<HTMLElement>(".vt-items:is(.is-cards, .is-grid)")
  ).map((table) => [table, table.className] as const);
  fitted.forEach(([table]) => table.classList.remove("is-cards", "is-grid"));
  const docWidth = doc.style.width;
  withPrintRules(width, () => {
    doc.style.width = `${width}px`;
    withPrintMedia(() => {
      if (layout) layout();
      else {
        fitPrintTable(root, true);
        markTallRows(root);
      }
    });
  });
  doc.style.width = docWidth;
  fitted.forEach(([table, className]) => {
    // eslint-disable-next-line no-param-reassign
    table.className = `${className}${
      table.classList.contains("is-print-fit") ? " is-print-fit" : ""
    }`;
  });
};

/*
 * The summaries (HSN, tax, batch) divide their width equally between their columns (user
 * request). The widgets' words row spans 99 columns, so a fixed table layout would make 99
 * columns of it; instead every cell of the first data row takes an equal share, and the
 * table's own layout keeps the rest in line.
 */
export const equalizeSummaries = (root: ParentNode = document): void => {
  root
    // The batch summary's columns hug their content instead (user request): a long item
    // name takes the room the short columns leave.
    .querySelectorAll<HTMLTableElement>(
      ".vt-summary .ceres-table:not(.vt-batch-table)"
    )
    .forEach((table) => {
      // The table's own first data row: the document itself sits in a page-frame table, so a
      // plain "tbody tr" would match the header rows too.
      const row = table.querySelector(":scope > tbody > tr");
      if (!row) return;
      const cells = Array.from(row.children) as HTMLElement[];
      const share = `${compactDecimal(100 / cells.length)}%`;
      cells.forEach((cell) => {
        cell.style.width = share;
      });
    });
};

/*
 * The item table on a phone or tablet screen (styles.css, "phones and tablets"): on a screen
 * up to PHONE_WIDTH every item reads as a card (is-cards); on one narrower than an A4 page
 * (PAPER_WIDTH, 794 px) the table stays as on paper while it fits its box, and one that would
 * scroll sideways keeps its headings in a row over the items (is-grid), or reads as cards with
 * more figure columns than a tablet row holds (has-many-figures). A screen as wide as the
 * page, and print, keep the table as it is, so the preview at A4 width matches the PDF.
 */
const PHONE_WIDTH = 640;
const PAPER_WIDTH = 794;

export const fitItemsToScreen = (root: ParentNode = document): void => {
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  root.querySelectorAll<HTMLElement>(".vt-items").forEach((table) => {
    table.classList.remove("is-cards", "is-grid");
    const doc = table.closest<HTMLElement>(".vt-doc");
    const box = table.parentElement;
    if (printing || !doc || !box) return;
    const width = document.documentElement.clientWidth;
    if (width >= PAPER_WIDTH) return;
    const phone = width <= PHONE_WIDTH;
    if (!phone && box.scrollWidth <= box.clientWidth + 1) return;
    table.classList.add(
      phone || table.classList.contains("has-many-figures")
        ? "is-cards"
        : "is-grid"
    );
  });
};

/* Registers the browser-side fits: the summaries' equal columns and the print table. */
export const registerVirajTableFit = (): void => {
  const state = window as typeof window & { vtTableFitRegistered?: boolean };
  if (state.vtTableFitRegistered || typeof document === "undefined") return;
  state.vtTableFitRegistered = true;
  let timer = 0;
  let run = (): void => {};
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => run(), 0);
  };
  // A second look a moment after each change, once late images and fonts have settled.
  let settle = 0;
  const scheduleSettled = () => {
    window.clearTimeout(settle);
    settle = window.setTimeout(() => run(), 600);
  };
  const output = document.getElementById("documentOutput");
  /*
   * Any change in the document re-runs the fits: a new render, and the host's live toggles
   * that only flip classes or styles (hideTotals, hideTaxes, Show Place/Country of Supply…)
   * — a totals row shown that way was hidden at the last fit. The fits' own changes are not
   * watched: the observer is off while they run and their records are dropped.
   */
  const observer =
    output && typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          schedule();
          scheduleSettled();
        })
      : null;
  const watch = () => {
    if (!observer || !output) return;
    observer.observe(output, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "src"],
    });
  };
  // The table first (its columns set the totals' room), then the totals.
  run = () => {
    observer?.disconnect();
    joinTotals();
    equalizeSummaries();
    fitPrintTable();
    markTallRows();
    fitTotals();
    splitTotals();
    stretchItemTable();
    fitItemsToScreen();
    labelSummaryCells();
    observer?.takeRecords();
    watch();
  };
  watch();
  window.addEventListener("resize", schedule);
  // An image or font arriving after the render changes the columns.
  document.addEventListener("load", schedule, true);
  if (typeof window.matchMedia === "function") {
    window.matchMedia("print").addEventListener("change", run);
    // The fits as print runs them (run), so the page count is taken from the printed layout.
    window.addEventListener("beforeprint", () => prepareBrowserPrint(run));
  }
  /*
   * Fonts: a face (Inter Bold for the grand total) can start loading after fonts.ready has
   * already resolved, and a figure measured in the fallback face is narrower than it ends up
   * — the bold total then spilled over the column rule (user report). Every finished font
   * load re-runs the fits.
   */
  if (document.fonts) {
    document.fonts.ready.then(schedule).catch(() => {});
    document.fonts.addEventListener("loadingdone", schedule);
  }
  schedule();
};

/* ------------------------------------------------------------------ print: footer on the page edge */

/*
 * Footer on the last page only (pdfOptions.footerOnLastPage): on paper it ends on the bottom
 * edge of the last page, not under the last line of content (user request). CSS cannot reach
 * the last page's foot, and a page box (@page) would break Lydia's Pageless PDF, so once the
 * print layout is in place the template measures where that page ends and gives the footer
 * the space above it. The footer on every page is fixed to each page's foot by CSS instead.
 *
 * Print layout stacks the pages' content areas, so a forced page break shows where the
 * current page ends; a second one gives the page height. Sizes are read as laid out (with
 * the renderer's print zoom) and written back in the footer's own pixels.
 */
export interface FooterPlacement {
  /* Where the page holding the end of the content ends, and how tall a page is. */
  pageEnd: number;
  pageHeight: number;
  footerTop: number;
  footerHeight: number;
}

// 2 px to spare, so rounding never pushes the footer onto a page of its own.
const PAGE_EDGE_SLACK = 2;
// Shorter than any printed page (A5 landscape at the smallest print size is about 400 px).
const MIN_PAGE_HEIGHT = 200;

/* The space to add above the footer so it ends on the page's bottom edge. */
export const footerEdgeGap = ({
  pageEnd,
  pageHeight,
  footerTop,
  footerHeight,
}: FooterPlacement): number => {
  if (!(pageHeight > 0) || !(footerHeight > 0)) return 0;
  const footerEnd = footerTop + footerHeight;
  // A footer that does not fit under the content starts the next page and ends at its foot.
  const target =
    footerEnd <= pageEnd + PAGE_EDGE_SLACK ? pageEnd : pageEnd + pageHeight;
  return Math.max(0, target - footerEnd - PAGE_EDGE_SLACK);
};

const LAST_PAGE_FOOTER =
  ".vt-doc > .vt-letterhead-footer:not(.vt-footer-fixed):not(.is-empty)";

const pageTop = (element: Element): number =>
  element.getBoundingClientRect().top + window.scrollY;

export const resetFootersOnPageEdge = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLElement>(LAST_PAGE_FOOTER).forEach((footer) => {
    footer.style.removeProperty("margin-top");
    footer.style.removeProperty("break-before");
  });
};

export const placeFootersOnPageEdge = (root: ParentNode = document): void => {
  resetFootersOnPageEdge(root);
  root.querySelectorAll<HTMLElement>(LAST_PAGE_FOOTER).forEach((footer) => {
    // Not drawn (the PDF service prints its own footer): nothing to place.
    if (!footer.getClientRects().length) return;

    const parent = footer.parentElement as HTMLElement;
    const breaks = [0, 1].map(() => {
      const marker = document.createElement("div");
      marker.style.cssText = "break-before: page; height: 0; margin: 0;";
      parent.insertBefore(marker, footer);
      return marker;
    });
    const [pageEnd, nextPageEnd] = breaks.map(pageTop);
    breaks.forEach((marker) => marker.remove());
    const pageHeight = nextPageEnd - pageEnd;
    // Not paginated yet (the PDF service switches to print media before it prints, so the
    // forced breaks collapse): the page edge cannot be measured, and the footer stays after
    // the content rather than be forced onto a page of its own.
    if (pageHeight < MIN_PAGE_HEIGHT) return;

    let box = footer.getBoundingClientRect();
    const fits =
      box.top + window.scrollY + box.height <= pageEnd + PAGE_EDGE_SLACK;
    if (!fits) {
      // A page of its own: a forced break keeps the margin above it (a natural one drops it).
      footer.style.breakBefore = "page";
      box = footer.getBoundingClientRect();
    }
    const target = fits ? pageEnd : nextPageEnd;
    const gap = footerEdgeGap({
      pageEnd: target,
      pageHeight,
      footerTop: box.top + window.scrollY,
      footerHeight: box.height,
    });
    if (gap <= 0) return;
    // Measured as laid out (zoomed); the margin is in the footer's own pixels.
    footer.style.marginTop = `${gap / layoutScale(parent, footer)}px`;
    // Should the footer still not end where it was meant to, it flows after the content as
    // before rather than slip onto a page the print has not counted.
    const placed = footer.getBoundingClientRect();
    if (
      placed.top + window.scrollY + placed.height >
      target + PAGE_EDGE_SLACK
    ) {
      resetFootersOnPageEdge(parent);
    }
  });
};

/*
 * Placed when the print layout applies (the print media query turning on: Chrome lays the
 * pages out first, so the measurement is the printed one) and cleared when it ends. Lydia's
 * Pageless PDF (isLydiaMode) has one page as tall as the content, so the footer already ends
 * on its edge.
 */
export const registerVirajPrint = (): void => {
  const state = window as typeof window & { vtPrintRegistered?: boolean };
  if (state.vtPrintRegistered || typeof window.matchMedia !== "function") {
    return;
  }
  state.vtPrintRegistered = true;
  if (new URLSearchParams(window.location.search).has("isLydiaMode")) return;

  window.matchMedia("print").addEventListener("change", (event) => {
    if (event.matches) placeFootersOnPageEdge();
    else resetFootersOnPageEdge();
  });
  window.addEventListener("afterprint", () => resetFootersOnPageEdge());
};
