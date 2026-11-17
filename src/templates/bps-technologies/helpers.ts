/*
 * View model for the BPS Technologies (Figma Document-Templates, node 1801:8109).
 *
 * Built on the Modern Manufacturing view model: same contract coverage, settings and print
 * behaviour (via the Apex Engineering template), laid out as the Simple design. The template keeps `normalizeInvoiceTemplateState`
 * as its data mapper and asks for this model once, through `{{#with (bpView @root) as |view|}}`. Every value here comes from the
 * payload: labels resolve through `customLabels` (or the column's own label) and the English
 * words are only fallbacks for a key the business has never set. Nothing from the reference
 * design is written into the markup.
 *
 * Money in the tables prints as a grouped figure without a symbol — the totals block (shared
 * Subtotal widget) carries the currency. Dates stay raw here and are formatted in the
 * template by the shared date-time widget, so the owner offset rule lives in one place.
 */

import type { FlattenedInvoicePayload } from "../../main/invoicePayloadContract";
import amountInWords from "../../widgets/shared/amountInWords";
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
const CODE_KEYS = ["hsn", "classification", "sku", "batch", "unit"];

/* ------------------------------------------------------------------ values */

const text = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asText(value).trim();
};

const firstText = (...values: unknown[]): string =>
  values.map(text).find(Boolean) || "";

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && text(value) !== "";

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
/*
 * A line of the notes that is bold and nothing else ("**Components Warranty**"), between
 * tables or paragraphs, is a label: it becomes a heading, styled as the notes' own title (user,
 * 2026-11-16). Bold words inside a sentence, a list item or a table cell stay as they are.
 */
// A colon typed after the bold text still makes a label ("**Components Warranty**:").
const BOLD_LINE = /^\s*(\*\*|__)(.+?)\1\s*:?\s*$/;
const BOLD_HTML_LINE = /^\s*<(strong|b)>(.+?)<\/\1>\s*:?\s*$/i;

export const notesLabels = (body: string): string => {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      const md = BOLD_LINE.exec(line);
      const html = md ? null : BOLD_HTML_LINE.exec(line);
      const label = (md || html)?.[2].trim() ?? "";
      if (!label || /\*\*|__|<\/?(strong|b)>/i.test(label)) return line;
      return `\n### ${label}\n`;
    })
    .join("\n");
};

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
      // Every decimal entered ("₹176.9231"), as refrens.com prints a rate.
      maximumFractionDigits: Math.max(ctx.digits, 6),
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
/*
 * A custom currency symbol made only of invisible characters (the business's way to print figures
 * with no symbol; user, 2026-11-16) showed as a crossed box in the PDF: the PDF service's fonts
 * have no glyph for it. It becomes WORD JOINER (U+2060), which browsers never draw, and
 * removeHiddenSymbol takes it and the space after it out of the page once drawn.
 */
export const HIDDEN_SYMBOL = "\u2060";
const INVISIBLE =
  /[\s\p{Cf}\p{Zs}\p{Mn}\u115F\u1160\u3164\uFFA0\u2800\u180E\u2028\u2029]/gu;

export const isInvisibleSymbol = (value: unknown): boolean =>
  typeof value === "string" &&
  value.length > 0 &&
  value.replace(INVISIBLE, "") === "";

export const withMoneyDefaults = <T>(state: T): T => {
  const invoice = asRecord(asRecord(state).invoice);
  if (
    asRecord(state).invoice &&
    invoice.subUnitLength !== moneyDigits(invoice)
  ) {
    invoice.subUnitLength = moneyDigits(invoice);
  }
  if (isInvisibleSymbol(invoice.customCurrencySymbol)) {
    invoice.customCurrencySymbol = HIDDEN_SYMBOL;
  }
  return state;
};

/* The hidden symbol and the space the formatter puts after it, out of every text in the page. */
export const removeHiddenSymbol = (root: ParentNode = document): void => {
  if (typeof document === "undefined") return;
  root.querySelectorAll<HTMLElement>(".bp-doc").forEach((doc) => {
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue || "";
      if (value.includes(HIDDEN_SYMBOL)) {
        node.nodeValue = value.replace(/\u2060[\s\u00a0]?/g, "");
      }
    }
  });
};

export const formatQuantity = (value: unknown, ctx: FormatContext): string =>
  hasValue(value) ? formatNumber(toAmount(value), ctx.locale, 0, 3) : "";

const formatPercent = (value: unknown, ctx: FormatContext): string =>
  hasValue(value) ? `${formatQuantity(value, ctx)}%` : "";

/* One unbroken code, or figures with separators ("34745215203 / 464622524"). */
const isFigureLike = (value: string): boolean =>
  !/\s/.test(value) || /^[\d\s/,.:+()-]+$/.test(value);

/* ------------------------------------------------------------------ dates */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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

/*
 * Document dates print as refrens.com prints them, "Jul 09, 2050" (the design's "December 1,
 * 2021" pattern, the day in two digits). An instant (ISO with Z / an offset, or epoch ms) is shifted into the
 * business's offset first; a zone-less value ("2026-09-21", or the IST-encoded IRN
 * "2026-09-21 11:20:00") is already local, so its own date parts print as they are. Anything
 * unparseable prints as given rather than as a wrong date.
 */
export const formatDocumentDate = (
  value: unknown,
  offset?: unknown
): string => {
  const raw = typeof value === "number" ? "" : text(value);
  if (!raw && typeof value !== "number") return "";
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (parts && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    return `${MONTHS[Number(parts[2]) - 1]} ${parts[3]}, ${parts[1]}`;
  }
  const time = typeof value === "number" ? value : Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  const shifted = new Date(time + offsetMinutes(offset) * 60000);
  return `${MONTHS[shifted.getUTCMonth()]} ${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}, ${shifted.getUTCFullYear()}`;
};

/* ------------------------------------------------------------------ supply */

/*
 * Country / Place of Supply (copied from refrens/ceres' shared normalizer, which this repo's
 * normalizer does not export yet): the country from the document or the customer, the place
 * named from its GST code as refrens.com does.
 */
const INDIA_GST_STATE_NAMES: Record<string, string> = {
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
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

const supplyPickFirst = (...values: unknown[]): unknown =>
  values.find((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    return !(typeof value === "string" && value.trim().length === 0);
  });

const supplyText = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
};

const normalizeGstCode = (value: unknown): string => {
  const match = supplyText(value).match(/^0?(\d{1,2})(?:\D|$)/);
  return match ? match[1].padStart(2, "0") : "";
};

const stateNameFromValue = (value: unknown): string => {
  const normalized = supplyText(value);
  if (!normalized || /^\d{1,2}$/.test(normalized)) return "";

  const prefixedName = normalized.match(/^0?\d{1,2}\s*[-:]\s*(.+)$/);
  return supplyText(prefixedName?.[1], normalized);
};

const normalizeCountryOfSupply = (invoice: FlattenedInvoicePayload): string =>
  supplyText(
    supplyPickFirst(
      asRecord(invoice).countryOfSupply,
      asRecord(invoice.billedTo).country
    )
  );

const normalizePlaceOfSupply = (invoice: FlattenedInvoicePayload): string => {
  const billedTo = asRecord(invoice.billedTo);
  const placeOfSupply = supplyText(
    supplyPickFirst(
      invoice.placeOfSupply,
      invoice.pos,
      billedTo.gstState,
      billedTo.state,
      billedTo.stateCode
    )
  );

  const supplyCountry = normalizeCountryOfSupply(invoice).toUpperCase();
  const hasGstCode = /^0?\d{1,2}(?:\D|$)/.test(placeOfSupply);
  if (supplyCountry && supplyCountry !== "IN" && hasGstCode) {
    const destinationPlace = [billedTo.state, billedTo.city, supplyCountry]
      .map((value) => supplyText(value))
      .find((value) => value && !/^0?\d{1,2}(?:\D|$)/.test(value));

    return destinationPlace || placeOfSupply;
  }

  if (!/^\d{1,2}$/.test(placeOfSupply)) return placeOfSupply;

  const code = normalizeGstCode(placeOfSupply);
  const billedToCode = normalizeGstCode(
    supplyPickFirst(billedTo.stateCode, billedTo.gstState)
  );
  const billedToState =
    stateNameFromValue(billedTo.state) || stateNameFromValue(billedTo.gstState);

  if (billedToCode === code && billedToState) return billedToState;
  return INDIA_GST_STATE_NAMES[code] || placeOfSupply;
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
// The Simple design's blue (user's mock, 2026-11-05: band, table outline and rules, grand
// total) where the document sets no theme colour.
/* Refrens' margin step: 30 px of the paper at either side per xMargins step. */
const MARGIN_STEP_PX = 30;

const DEFAULT_THEME = "#2d81f7";

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
            // A light theme colour reads as ink on the white paper (headings, table rules).
            accentText: onThemeColor(theme) === "#ffffff" ? "" : "#22272f",
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

/*
 * Text in a script Inter lacks prints as empty boxes in the PDF service, whose machine has no
 * fallback fonts (Khmer party names on a real delivery challan, inventoryinc A00001, 1 Nov 2026),
 * while the document's Language/Script stays at its Latin default. So the document's own text is
 * scanned too and each script found brings its Noto face, as if it had been picked (as the
 * E-commerce template does).
 */
const SCRIPT_RANGES: Array<[RegExp, string]> = [
  [
    /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/,
    "Noto Sans Arabic",
  ],
  [/[\u0590-\u05FF]/, "Noto Sans Hebrew"],
  [/[\u0530-\u058F]/, "Noto Sans Armenian"],
  [/[\u0900-\u097F]/, "Noto Sans Devanagari"],
  [/[\u0980-\u09FF]/, "Noto Sans Bengali"],
  [/[\u0A00-\u0A7F]/, "Noto Sans Gurmukhi"],
  [/[\u0A80-\u0AFF]/, "Noto Sans Gujarati"],
  [/[\u0B00-\u0B7F]/, "Noto Sans Oriya"],
  [/[\u0B80-\u0BFF]/, "Noto Sans Tamil"],
  [/[\u0C00-\u0C7F]/, "Noto Sans Telugu"],
  [/[\u0C80-\u0CFF]/, "Noto Sans Kannada"],
  [/[\u0D00-\u0D7F]/, "Noto Sans Malayalam"],
  [/[\u0D80-\u0DFF]/, "Noto Sans Sinhala"],
  [/[\u0E00-\u0E7F]/, "Noto Sans Thai"],
  [/[\u0E80-\u0EFF]/, "Noto Sans Lao"],
  [/[\u1000-\u109F]/, "Noto Sans Myanmar"],
  [/[\u10A0-\u10FF]/, "Noto Sans Georgian"],
  [/[\u1200-\u137F]/, "Noto Sans Ethiopic"],
  [/[\u1780-\u17FF\u19E0-\u19FF]/, "Noto Sans Khmer"],
  [/[\u1100-\u11FF\uAC00-\uD7AF]/, "Noto Sans KR"],
  [/[\u3040-\u30FF]/, "Noto Sans JP"],
  [/[\u4E00-\u9FFF\u3400-\u4DBF]/, "Noto Sans SC"],
];

const collectText = (value: unknown, out: string[], depth = 0): void => {
  if (depth > 8) return;
  if (typeof value === "string") {
    if (!/^https?:\/\//.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, out, depth + 1));
    return;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((entry) => collectText(entry, out, depth + 1));
  }
};

export const detectScriptFonts = (invoice: UnknownRecord): string[] => {
  const parts: string[] = [];
  collectText(invoice, parts);
  const all = parts.join("\n");
  // Everything Latin, Cyrillic, Greek or Vietnamese: nothing to load.
  if (!/[^\t\n\r\u0020-\u052F\u1E00-\u1EFF\u2000-\u2BFF]/.test(all)) return [];
  return SCRIPT_RANGES.filter(([range]) => range.test(all)).map(
    ([, font]) => font
  );
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
  const fonts = [
    ...new Set(
      [SCRIPT_FONTS[key] || "", ...detectScriptFonts(invoice)].filter(Boolean)
    ),
  ];
  return {
    dir: isRtl ? "rtl" : "ltr",
    lang: pick("languageCode", "lang", "locale"),
    script: key,
    // A font-family list ("'Noto Sans Khmer', 'Noto Sans Thai'"), printed unescaped.
    font: fonts.map((name) => `'${name}'`).join(", "),
    fontUrl: fonts.length
      ? `https://fonts.googleapis.com/css2?${fonts
          .map(
            (name) => `family=${name.replace(/ /g, "+")}:wght@400;500;600;700`
          )
          .join("&")}&display=swap`
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
 * Hide Totals: refrens.com keeps it on the document itself (the totals widget reads it there
 * first); the old advanceOptions copy, then the normalizer's answer, are the fallbacks.
 */
export const totalsShown = (state: UnknownRecord): boolean => {
  const hidden = [
    asRecord(state.invoice).hideTotals,
    asRecord(state.advanceOptions).hideTotals,
  ]
    .map(optionalFlag)
    .find((value) => value !== undefined);
  return hidden === undefined
    ? asRecord(asRecord(state.mapped).visibility).showTotals !== false
    : !hidden;
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
  const showTotals = totalsShown(state);
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
    stockSummary: read("showStockSummary") ?? true,
    // Lydia's Pageless PDF: one page as tall as the content, so nothing repeats per page.
    pageless:
      [pdfOptions.pageless, pdfOptions.isPageless, pdfOptions.longPdf]
        .map(optionalFlag)
        .find((value) => value !== undefined) ?? false,
  };
};

export type BpsSettings = ReturnType<typeof resolveSettings>;

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
  "99": "Other Countries", // as refrens.com names it
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

  // "Bengaluru, Karnataka, India - 560055", as refrens.com writes the city line; the state
  // is named from the party's GST state code when it has one (partyStateName).
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
  // GSTIN and PAN are Indian numbers: refrens.com prints neither for a party abroad (a
  // shipping address keeps them).
  const domestic =
    keepIndianIds || isIndianParty(party) || !text(party.country);
  if (domestic && party.gstin && fieldShown(invoice, party, "gst")) {
    ids.push({ key: "gstin", label: "GSTIN", value: text(party.gstin) });
  }
  if (domestic && party.panNumber && fieldShown(invoice, party, "pan")) {
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
  // (contactPerson.displayFields: ["name", "email", "phone"]).
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
  const entry = (row: LabelValue & { isNum?: boolean }, isNum: boolean) => ({
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
  });
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
    // The street on its own line, then "City, State, Country - PIN" on the line below (user
    // request); `address` keeps both for checks and alt text.
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
 * Offline QR encoder (byte mode, error correction M, versions 1-20, up to 666 bytes), the
 * same one the Shree Vaishnavi template ships. The API hands the UPI QR as a `upi://` link
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
  // Versions 21–40: a signed e-invoice QR (irn.SignedQRCode, ~950 bytes) needs version 25.
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
 * Indian place of supply prints as "State (code)". The name comes from the shared
 * normalizer; the code from the same raw value it read, so the two cannot disagree.
 */
export const placeOfSupplyText = (invoice: UnknownRecord): string => {
  const contractInvoice = invoice as unknown as FlattenedInvoicePayload;
  const typed = normalizePlaceOfSupply(contractInvoice).replace(
    /^0?\d{1,2}\s*[-:]\s*/,
    ""
  );
  const country = normalizeCountryOfSupply(contractInvoice).toUpperCase();
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
  // The state named from its GST code, as refrens.com names it ("Karnataka (29)"), whatever
  // state name was typed.
  const name = (code && GST_STATE_NAMES[code.padStart(2, "0")]) || typed;
  return code && name !== code && (!country || country === "IN")
    ? `${name} (${code})`
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
  if (dataType === "currency" && !isRecord(field.value))
    return formatMoney(field.value, ctx);
  // Choice, yes/no, number and currency fields as refrens.com prints them.
  return customFieldText(field.value, field.options, ctx.locale);
};

/*
 * The invoice details grid (spec v2 §4.3): document fields and header fields, then the
 * transport fields when they sit in the grid. Country / Place of Supply have their own row
 * (mapSupply); document custom fields go to Additional Info.
 */
/* Characters beyond which a header detail's value moves under its label. */
const META_LONG = 30;

/*
 * The business's saved order for the document details (documentFieldOrder /
 * documentDetailsOrder / headerFieldOrder, on the document or its template): entries are
 * keys, or { key | field | fieldKey | name | label }, matched to a row's key or label
 * case- and punctuation-blind. Rows it does not name keep their place after the named ones.
 */
const orderName = (value: unknown): string =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const orderByConfig = <T extends { key: string; label: string }>(
  rows: T[],
  ...configs: unknown[]
): T[] => {
  const keys = configs
    .flatMap((config) => (Array.isArray(config) ? config : []))
    .map((entry) => {
      const record = asRecord(entry);
      return orderName(
        typeof entry === "string"
          ? entry
          : firstText(
              record.key,
              record.field,
              record.fieldKey,
              record.name,
              record.label
            )
      );
    })
    .filter(Boolean);
  if (!keys.length) return rows;
  const remaining = [...rows];
  const ordered: T[] = [];
  keys.forEach((key) => {
    const index = remaining.findIndex(
      (row) => orderName(row.key) === key || orderName(row.label) === key
    );
    if (index >= 0) ordered.push(...remaining.splice(index, 1));
  });
  return [...ordered, ...remaining];
};

/*
 * A subsidy figure with a minus sign, not in brackets: "-₹78,000.00" (the client's quotation;
 * user, 2026-11-16), whether the template prints the row or Refrens' deduction does.
 */
export const minusSubsidy = <T extends { label: string; value: string }>(
  row: T
): T => {
  const bracketed = /^\s*\((.+)\)\s*$/.exec(row.value);
  return /subsid/i.test(row.label) && bracketed
    ? { ...row, value: `-${bracketed[1]}` }
    : row;
};

/* The customer's phone row labelled "Mobile Number" (BPS design). */
export const withMobileLabel = <T>(party: T): T => {
  if (!party) return party;
  const record = asRecord(party);
  return {
    ...record,
    fields: asArray(record.fields).map((field) =>
      asRecord(field).isPhone === true
        ? { ...asRecord(field), label: "Mobile Number" }
        : field
    ),
  } as T;
};

/* The document date moved in front of the document number (BPS design). */
export const dateFirst = <T extends { key: string }>(rows: T[]): T[] => {
  const date = rows.findIndex((row) => row.key === "invoiceDate");
  const number = rows.findIndex((row) => row.key === "invoiceNumber");
  if (date < 0 || number < 0 || date < number) return rows;
  const ordered = rows.filter((_, index) => index !== date);
  ordered.splice(number, 0, rows[date]);
  return ordered;
};

export const mapMeta = (state: UnknownRecord, transportRows: LabelValue[]) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);

  const rows: LabelValue[] = [
    {
      key: "invoiceNumber",
      label: labelOr(labels, "invoiceNumber", "Invoice No."),
      value: text(invoice.invoiceNumber),
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
    // A credit / debit note's reason ("Product Return", "Correction In Invoice"), as Refrens
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
    // "Created By <name>" when the document's "Show in Invoice" toggle beside its creator is
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
  // A field the business has switched off in its field settings stays off; the rest follow
  // the business's saved order.
  const template = asRecord(invoice.template);
  return orderByConfig(
    rows,
    invoice.documentFieldOrder,
    invoice.documentDetailsOrder,
    invoice.headerFieldOrder,
    template.documentFieldOrder,
    template.documentDetailsOrder
  )
    .filter((row) => row.label && row.value)
    .filter((row) => fieldSetting(invoice, [row.key]) !== false)
    .map((row) => ({
      ...row,
      isLong: !row.isDate && row.value.length > META_LONG,
      isNum:
        Boolean(row.isDate) ||
        (Boolean(row.isNum) && isFigureLike(row.value)) ||
        (["invoiceNumber", "purchaseOrderNumber"].includes(row.key) &&
          isFigureLike(row.value)) ||
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
      value: regionName(
        normalizeCountryOfSupply(invoice as unknown as FlattenedInvoicePayload)
      ),
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
/*
 * BPS subsidy (user, 2026-11-16): the government subsidy is NOT a deduction in Refrens (the
 * customer pays the full total, "Net Payable"; the subsidy reaches their bank account later).
 * It is a document custom field whose label names it ("Subsidy Amount: 78000"); the template
 * prints it under the totals with the "Net Effective Price" (total less subsidy), for show only.
 */
const SUBSIDY_LABEL = /subsid/i;

// Any field type: text "78,000", number 78000, currency { currency, amount }, or { value }.
const subsidyAmount = (entry: UnknownRecord): number => {
  const value = isRecord(entry.value) ? asRecord(entry.value) : null;
  const raw = value ? firstText(value.amount, value.value) : entry.value;
  const amount = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const isSubsidyField = (entry: UnknownRecord): boolean =>
  SUBSIDY_LABEL.test(firstText(entry.label, entry.name)) &&
  subsidyAmount(entry) > 0;

export const mapSubsidy = (state: UnknownRecord): number => {
  const invoice = asRecord(state.invoice);
  const field = [
    ...asArray(invoice.customFields),
    ...asArray(invoice.customHeaders),
  ]
    .map(asRecord)
    .find(isSubsidyField);
  return field ? subsidyAmount(field) : 0;
};

/*
 * A subsidy entered as a Refrens deduction instead ("Subsidy …" additional charge): Refrens
 * prints that row itself and its total is already less the subsidy, so the template only marks
 * the amount before it, the item's or the items' Total, "(Net Payable)".
 */
export const hasSubsidyDeduction = (state: UnknownRecord): boolean =>
  asArray(asRecord(state.invoice).additionalCharges)
    .map(asRecord)
    .some(
      (charge) =>
        SUBSIDY_LABEL.test(firstText(charge.label, charge.name)) &&
        toAmount(charge.amount) !== 0
    );

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
      value: customFieldText(entry.value, entry.options, ctx.locale),
      isDate: false,
    }))
    .filter((row) => row.value);
  const fieldRows = asArray(invoice.customFields)
    .map(asRecord)
    // The subsidy amount prints with the totals (mapSubsidy), not here.
    .filter((entry) => !isSubsidyField(entry))
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
        // BPS: the document's custom fields are the project's details (Project Type, system
        // capacity, inverter, panels), printed on page 1 (client brief, 2026-11-16).
        title: heading(labels, "additionalInfo", "Project Details"),
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
            // "Eway Bill", as refrens.com labels it.
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
            label: labelOr(labels, "ewayBillDate", "Eway Date"),
            value: text(irn.EwbDt),
            isUtcDate: true,
          },
        ]),
    ...(isOff(eway.billValidTillDate)
      ? []
      : [
          {
            key: "ewayValidTill",
            label: labelOr(labels, "ewayValidTill", "Eway Valid Till"),
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
      // A code or figure keeps to one line; a worded entry in a number field wraps.
      isNum: Boolean(row.isDate || (row.isNum && isFigureLike(row.value))),
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
  const isCancelled = asRecord(asRecord(state.mapped).irn).isCancelled === true;
  // The e-invoice QR: an image when the host sends one, else drawn from the IRP's signed QR
  // string (irn.SignedQRCode), as refrens.com prints it once the IRN is generated.
  const irnQr =
    firstText(invoice.qrCode, irn.qrCode) ||
    (text(irn.SignedQRCode) ? qrImage(text(irn.SignedQRCode)) : "");
  const configuration = ownerConfiguration(invoice);
  // refrens.com prints the document QR whenever the document carries one, whatever
  // enableQrCode / showQrCode say (checked on real PDFs, 2026-10-23).
  const documentQr = text(invoice.documentQr);

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
    // The e-way bill follows the IRN details (user request).
    ...mapEway(state),
  ].filter((row) => row.value);

  return {
    // Above the item table unless the business places it below (irnPosition).
    isBelowItems:
      firstText(invoice.irnPosition, configuration.irnPosition)
        .toUpperCase()
        .replace(/[^A-Z]/g, "") === "BELOWLINEITEMS",
    showIrn: !isOff(einvoice.irnNumber),
    irnLabel: labelOr(labels, "irn", "IRN No."),
    irn: isOff(einvoice.irnNumber) ? "" : text(irn.Irn),
    rows,
    // Two to a line (Ack No. | Ack Date), like the party fields.
    rowLines: rows
      .filter((_, index) => index % 2 === 0)
      .map((_, index) => rows.slice(index * 2, index * 2 + 2)),
    qr: {
      irn: isCancelled ? "" : irnQr,
      zatca: text(invoice.zatcaQrCode),
      lhdn: text(invoice.lhdnQrCode),
      // One QR only (standing decision): the e-invoice QR while the IRN is active, otherwise
      // the document QR. documentQr arrives as text (a JSON summary of the document): draw it.
      document: irnQr && !isCancelled ? "" : qrImage(documentQr),
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

export const batchText = (item: UnknownRecord): string =>
  [
    ...asArray(item.batchSummary).map((entry) =>
      firstText(asRecord(entry).batchName, asRecord(entry).name)
    ),
    ...asArray(item.allocations).map((entry) => {
      const allocation = asRecord(entry);
      const { batch } = allocation;
      return isRecord(batch)
        ? firstText(batch.batchName, batch.name)
        : firstText(
            asRecord(allocation.batchData).batchName,
            allocation.batchName,
            batch
          );
    }),
  ]
    // A bare batch id (24 hex characters) is never printed.
    .filter((value) => !/^[0-9a-f]{24}$/i.test(value))
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(", ");

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
  if (
    MONEY_KEYS.includes(key) ||
    semantic === "currency" ||
    text(column.fxReturnType).toLowerCase() === "currency"
  ) {
    return "money";
  }
  // Cess columns and number formulas print as plain figures ("0.00", "100.00"), as
  // refrens.com prints them.
  const dataType = text(column.dataType).toLowerCase();
  return column.isCessColumn === true ||
    dataType === "number" ||
    (dataType === "formula" &&
      text(column.fxReturnType).toLowerCase() === "number")
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
    className: `bp-col-${key.replace(/[^A-Za-z0-9_-]/g, "")} ${
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

export const columnNumber = (
  item: UnknownRecord,
  column: ItemColumn
): unknown => {
  if (column.key === "total") return pickFirst(item.total, item.subTotal);
  if (column.key === "sgst") return pickFirst(item.sgst, item.utgst);
  if (column.key === "gstRate") return pickFirst(item.gstRate, item.taxRate);
  if (column.kind === "discount") return discountParts(item).amount;
  return customCellValue(item, column);
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
      if (column.key === "batch") return batchText(item);
      if (column.key === "unit") return unitText(invoice, item);
      return text(value);
    case "qty": {
      // "10 PCS": the account's choice, or the table's last-but-one width fallback.
      const unit =
        visibility.showUnitInQuantity || mergeUnit
          ? unitText(invoice, item)
          : "";
      const quantity = formatQuantity(value, ctx);
      // "1 (LDS)", as refrens.com writes a unit merged into Quantity.
      return quantity && unit ? `${quantity} (${unit})` : quantity;
    }
    case "percent":
      // A custom percentage column left empty reads "0%", as refrens.com prints it.
      return formatPercent(
        hasValue(value) || column.key === "gstRate" ? value : 0,
        ctx
      );
    case "discount":
      // A percentage discount left empty reads "0%"; a flat one as entered ("₹50"), as
      // refrens.com prints them.
      return discountParts(item).isPercent || !hasValue(value)
        ? formatPercent(hasValue(value) ? value : 0, ctx)
        : formatRate(value, ctx);
    case "money":
      // The unit price as entered ("₹15,000", "₹180.5"); the amounts with the currency sign
      // at the document's decimal places ("₹13,050.00"), as refrens.com and the design print them.
      return column.key === "rate"
        ? formatRate(value, ctx)
        : formatMoney(value, ctx);
    case "number": {
      // A custom number or formula column: grouped at the document's decimal places, no
      // currency sign, a negative with its minus ("-8.00"), as refrens.com prints them.
      const figure = formatFigure(value, ctx);
      return figure.startsWith("(") ? `-${figure.slice(1, -1)}` : figure;
    }
    default:
      return Array.isArray(value) ? value.map(text).join(", ") : text(value);
  }
};

/*
 * MSIC: the shared normalizer always drops it; refrens.com prints the column (unless hidden) on
 * quotations and delivery challans, not on invoices, proformas or sales orders (checked on
 * real test documents).
 */
const MSIC_TYPES = ["QUOTATION", "DELIVERYCHALLAN"];

const resolveColumns = (state: UnknownRecord, items: UnknownRecord[]) => {
  const invoice = asRecord(state.invoice);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const labels = asRecord(invoice.customLabels);
  // Normalization drops semanticType / isCessColumn; read them off the account's column.
  const raw = asArray(invoice.columns).map(asRecord);
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

  // Unit is not an account column: it comes from the item itself. Batches print in the
  // business's own batch columns (Batch Name, Batch Code, Expiry Date…), filled from the
  // item's batches; the template adds no Batch column of its own (it showed a batch id).
  const quantityIndex = columns.findIndex(
    (column) => column.key === "quantity"
  );
  // No item with a unit: no Unit column (as refrens.com).
  const anyUnit = items.some((item) => !item.group && unitText(invoice, item));
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
const DESIGN_TABLE_WIDTH = 958; // the 1000 px canvas less 2 × 20 px, less the table's 1 px edges (Simple design)
/* The serial column: "Sl.No" in bold with 6 px either side. */
const SERIAL_WIDTH = 52;
// The most figure columns a tablet lays out side by side under the item's name (styles.css).
const TABLET_FIGURE_COLUMNS = 8;
const MIN_DESCRIPTION_SHARE = 0.22;
const CELL_PADDING = 12; // 6 px each side (Simple design)
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

/* The table's text is 12 px (Simple design), as the widths above are measured. */
const TABLE_TEXT_SCALE = 1;

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
  batch: { col: "batch", width: 78 },
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

/*
 * An item description saved with inline HTML ("<strong>100 to 200 words</strong>") reads as
 * refrens.com renders it: the shared Markdown viewer drops the tags and their emphasis, so
 * bold, italics and line breaks become Markdown and any other tag is dropped.
 */
export const htmlToMarkdown = (value: string): string =>
  /<\/?[a-z][^>]*>/i.test(value)
    ? value
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\s*(strong|b)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "**$2**")
        .replace(/<\s*(em|i)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, "*$2*")
        .replace(/<\/?[a-z][^>]*>/gi, "")
    : value;

/* A Markdown table: a row of cells over its "| --- | --- |" divider. */
export const hasMarkdownTable = (value: string): boolean =>
  /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m.test(
    value
  ) || /<\s*table\b/i.test(value);

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

  // The unit stays where the business put it (its own column, merged into Quantity or beside
  // the name): a crowded table shrinks to content and then to the small step, never moving it.
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

const TAX_COLUMN = /^(igst|cgst|sgst|utgst|cess|vat|tax)/i;

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
  settings: BpsSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const labels = asRecord(invoice.customLabels);
  const listed = asArray(invoice.items)
    .map(asRecord)
    .filter((item) => item.hidden !== true && item.isAdditionalCharge !== true);
  const realItems = listed.filter(isRealItem);
  const allColumns = resolveColumns(state, realItems);
  const items = withGroupSubtotals(listed, allColumns, settings.groupSubtotal);
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
    width: column.kind === "name" ? 0 : layout.widths[column.key],
    // The same width as a share of the table, used on screen and in print alike, so the
    // columns keep the design's proportions at any paper width (user, 2026-11-13: the PDF
    // and the print must look as the design).
    share:
      column.kind === "name"
        ? 0
        : Math.round((layout.widths[column.key] / DESIGN_TABLE_WIDTH) * 1e5) /
          1e3,
  }));

  /*
   * Groups read as the design's section rows, "A. <group name>", and number their items from
   * 1 again (a group name that already carries its own letter keeps it). Without groups the
   * items number straight through.
   */
  let serial = 0;
  let itemIndex = -1;
  // Zebra position: group rows take their turn in the stripes with the items (user, 2026-10-24).
  let stripeIndex = -1;
  // Group names print as entered, as refrens.com prints them.
  const groupName = (name: string): string => name;
  const rows = items
    .filter(
      (item) => !(item.isGroupItemTotalRow === true && !settings.groupSubtotal)
    )
    .map((item) => {
      if (item.group === true) {
        serial = 0;
        stripeIndex += 1;
        // A group carries images of its own, as an item does (the line item editor's "Upload
        // Image" on a group; user, 2026-11-03, as refrens.com's Simple template): images[] as
        // thumbnails under its name, originalImages[] in a full-width row below it.
        return {
          isGroupHeader: true,
          isStripe: stripeIndex % 2 === 0,
          name: groupName(text(item.name)),
          images: imageList(item.images),
          originalImages: imageList(item.originalImages),
          colspan,
        };
      }
      itemIndex += 1;
      stripeIndex += 1;
      const isGroupTotal = item.isGroupItemTotalRow === true;
      if (!isGroupTotal) serial += 1;
      const inlineCodes = [
        visibility.showSkuInName && item.showSku !== false && text(item.sku)
          ? `${labelOr(labels, "sku", "SKU")}: ${text(item.sku)}`
          : "",
        visibility.showInlineHsn && text(item.hsn)
          ? `${labelOr(labels, "hsn", "HSN/SAC")}: ${text(item.hsn)}`
          : "",
        visibility.showInlineClassification && text(item.classification)
          ? `${labelOr(labels, "classification", "Classification")}: ${text(
              item.classification
            )}`
          : "",
        visibility.showUnitInName && unitText(invoice, item)
          ? `${labelOr(labels, "unit", "Unit")}: ${unitText(invoice, item)}`
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
        : htmlToMarkdown(text(item.description));
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
        // Zebra rows as refrens.com's Simple template: the first row tinted, the second
        // white, and so on (seen on its own render, 2026-11-04); an item's name, detail and
        // image rows share its colour.
        isStripe: stripeIndex % 2 === 0,
        // 1, 2, 3 … as the BPS quotation numbers items (from 1 again in each group).
        serial: isGroupTotal ? "" : String(serial),
        name: text(item.name),
        inlineCodes,
        description,
        images,
        originalImages,
        hasDetail,
        // Rows are vertically centred; one with a note or images reads from the top.
        isRich: hasDetail || (showThumbnail && thumbnailOf(item) !== ""),
        detailInline: hasDetail && !inDetailRow,
        detailRow: inDetailRow,
        // The full-width row keeps the serial column and spans everything after it; one holding
        // a table spans the serial column too, the table edge to edge (user rule, 2026-10-20).
        detailColspan: colspan - 1,
        detailSpansAll: inDetailRow && hasMarkdownTable(description),
        // "Item name full width": the name (and its codes) reads across the row above the
        // item's figures, the name cell below left for the description.
        nameRow: itemNameFullWidth && !isGroupTotal,
        imageRow: originalImages.length > 0,
        thumbnail: showThumbnail ? thumbnailOf(item) : "",
        cells: columns.map((column) => {
          // A group total row only repeats its money figures.
          const value =
            isGroupTotal && !["money", "qty"].includes(column.kind)
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
            // A value with a figure in it (a date, "BLOCK - 1") never wraps, in print either.
            className: isWord
              ? `${column.className} is-word${
                  /\d/.test(value) ? " has-digits" : ""
                }`
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

  return {
    columns,
    header,
    rows,
    colspan,
    showThumbnail,
    // The figure columns (every column but the item's name): a tablet lays them out in as
    // many equal tracks under the item's name (styles.css); more than TABLET_FIGURE_COLUMNS
    // cannot sit side by side there, so such a table shows its items as cards.
    figureCount: columns.filter((column) => column.kind !== "name").length,
    manyFigures:
      columns.filter((column) => column.kind !== "name").length >
      TABLET_FIGURE_COLUMNS,
    // "Sl.No", as the client's quotation heads it (user, 2026-11-16); the business's own label wins.
    serialLabel: labelOr(labels, "serialNumber", "Sl.No"),
    serialWidth: SERIAL_WIDTH,
    serialShare: Math.round((SERIAL_WIDTH / DESIGN_TABLE_WIDTH) * 1e5) / 1e3,
    mergeUnit,
    smallNumbers: layout.smallNumbers,
    descriptionMin: layout.descriptionMin,
    printFixedWidth: layout.printFixedWidth,
    footer: {
      show: settings.totalsRow && realItems.length > 0,
      // No customLabels key exists for the in-table summary row (see architect-template).
      label: "Total",
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

export const mapStockSummary = (
  state: UnknownRecord,
  ctx: FormatContext,
  settings: BpsSettings = resolveSettings(state)
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
      // Quantities and dates stay on one line; the text columns wrap when the table is tight.
      isNum: /^(?:quantity|qty)$|date$/i.test(column.key),
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
    hidden: !settings.stockSummary,
    columns,
    rows: rows.map((row) => columns.map((column) => row[column.index])),
  };
};

/*
 * Payments: one table, as refrens.com prints it — Date | Mode | Amount Received | Payment
 * Account | Transaction Charge | TDS | Notes (the last three when a payment has one).
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
    title: labelOr(asRecord(invoice.customLabels), "payments", "Payments"),
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

/* ------------------------------------------------------------------ payment */

/* Below this total refrens.com shows no UPI limit note (none seen under ₹6, all from ₹100). */
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

  // In the client's order and wording (its quotation, 2026-11-16): Account Holder Name, Account
  // Number, Bank Name, IFSC Code; then IBAN / SWIFT / Sort Code, Account Type, Branch, the rest.
  const rows: LabelValue[] = visibility.showBankAccount
    ? [
        {
          key: "accountHolderName",
          // "Account Holder Name", as the client's quotation (user, 2026-11-16).
          label: labelOr(labels, "accountHolderName", "Account Holder Name"),
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
        // Bank Name and IFSC Code next, as the client's quotation lists and names them (user,
        // 2026-11-16).
        {
          key: "bankName",
          label: labelOr(labels, "bankName", "Bank Name"),
          value: firstText(bank.bank, bank.bankName),
        },
        {
          key: "ifsc",
          label: firstText(labels.ifsc, labels.ifscCode, "IFSC Code"),
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
        // "Savings" / "Current": shown by the design and by refrens.com's other layouts.
        {
          key: "accountType",
          label: labelOr(labels, "accountType", "Account Type"),
          value: text(bank.accountType)
            .toLowerCase()
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
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
  const NUMERIC_BANK_ROWS = [
    "accountNumber",
    "ifsc",
    "iban",
    "swift",
    "sortCode",
  ];
  const isRupees = firstText(invoice.currency, "INR").toUpperCase() === "INR";
  const upiQrImage = isImageSource(upiQr)
    ? upiQr
    : qrImage(upiIntent(invoice, upiId));
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
      isNum: NUMERIC_BANK_ROWS.includes(row.key) && isFigureLike(row.value),
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
          // to be paid, and not for a token amount.
          note:
            isRupees &&
            text(invoice.status).toUpperCase() !== "PAID" &&
            toAmount(asRecord(invoice.finalTotal).total) >= UPI_NOTE_MIN
              ? labelOr(
                  labels,
                  "upiLimitNote",
                  "Maximum of 1 lakh can be transferred via upi in a single day"
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

export const mapWords = (
  state: UnknownRecord,
  settings: BpsSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  if (!totalsShown(state)) return null;

  const stored = text(labels.totalInWordsValue);
  // Rupees by the shared Indian-system converter; another currency in its own units, as
  // refrens.com writes it ("… DOLLARS AND FIFTY CENTS ONLY").
  const currency = firstText(invoice.currency, "INR").toUpperCase();
  const computed =
    currency === "INR"
      ? amountInWords(toAmount(asRecord(invoice.finalTotal).total))
      : foreignAmountInWords(
          toAmount(asRecord(invoice.finalTotal).total),
          currency
        );
  // Every word capitalised, as Refrens' own Simple template writes the amount ("Nine Lakh …
  // Rupees And Sixty Four Paise Only", its real PDF of MMS/IN/26-27/082); the label is
  // editable and keeps its own case.
  const value = (stored || computed)
    .toLowerCase()
    .replace(
      /(^|[\s(/-])(\p{L})/gu,
      (_, lead: string, letter: string) => lead + letter.toUpperCase()
    );
  // Switched off, the line stays in the page, hidden, as the Subtotal widget keeps it, so
  // the host's live toggle (data-ceres-total-in-words) can bring it back. A document with
  // more decimal places than the currency (3) still shows it, in rupees and paise (user request).
  return value
    ? {
        label: labelOr(labels, "totalInWords", "Total (in words)"),
        value,
        hiddenBySetting: !settings.totalInWords,
      }
    : null;
};

/* ------------------------------------------------------------------ totals */

/* Rows whose value is free text, not money — never strip anything from these. */
const isTextRow = (row: SubtotalRow): boolean =>
  row.key === "conversionRate" || row.key.startsWith("extra:");

/* Each row's kind; "EarlyPay Discount" as refrens.com spells it. */
const plainRow = (row: SubtotalRow) => {
  const label = row.label.replace(/^Early Pay Discount/i, "EarlyPay Discount");
  return isTextRow(row)
    ? { ...row, label, isNum: false, isGrand: false }
    : { ...row, label, isNum: true, isGrand: row.key === "total" };
};

/*
 * The totals block: the shared Subtotal widget decides every row, label, figure (with the
 * currency symbol) and visibility rule, at the document's decimal places. No Round Off row:
 * refrens.com prints none, the rounding is already in the total.
 */

/*
 * "Show Applied Exchange Rate" (the document settings' checkbox
 * advanceOptions.showExchangeRateOnPdf): on a document in another currency than the
 * business's, the Subtotal widget adds the business-currency figure under every amount and a
 * Conversion Rate row whatever the setting. They print only when it is on; off or unset,
 * neither does, as on refrens.com.
 */
export const showsExchangeRate = (state: UnknownRecord): boolean => {
  const invoice = asRecord(state.invoice);
  const sources = [
    asRecord(state.advanceOptions),
    asRecord(invoice.advanceOptions),
    invoice,
  ];
  const keys = [
    "showExchangeRateOnPdf",
    "showAppliedExchangeRate",
    "showExchangeRate",
  ];
  const found = sources
    .flatMap((source) => keys.map((key) => source[key]))
    .find((value) => [true, false, "true", "false"].includes(value as never));
  return found === true || found === "true";
};

/* The totals rows with the business-currency figures and the Conversion Rate row taken out. */
const withoutExchange = <T extends SubtotalRow>(row: T): T => ({
  ...row,
  converted: null,
  extra: row.extra ? { ...row.extra, converted: null } : row.extra,
});

export const mapTotals = (
  state: UnknownRecord,
  settings: BpsSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const advanceOptions = asRecord(invoice.advanceOptions);
  // Tax rows as refrens.com prints them: the document's own tax view (one "CGST" row unless the
  // business breaks taxes up by rate).
  const model = computeSubtotalRows(
    {
      ...invoice,
      subUnitLength: moneyDigits(invoice),
      advanceOptions,
    },
    {
      columns: asRecord(state.mapped).columns,
      businessCurrency: invoice.businessCurrency,
      businessLocale: invoice.businessLocale,
    }
  );
  const ctx = formatContext(invoice);
  // "BGN 1 = ₹57.22": the unit side stays a whole 1, whatever the decimal places.
  // Its label reads "Applied Exchange Rate" (user, 2026-11-13; the default for every new
  // template), unless the business named the row itself.
  const unitRate = (row: SubtotalRow): SubtotalRow =>
    row.key === "conversionRate"
      ? {
          ...row,
          label:
            row.label === "Conversion Rate"
              ? "Applied Exchange Rate"
              : row.label,
          value: row.value.replace(
            /^.*? = /,
            `${formatCurrency(
              1,
              ctx.currency,
              ctx.locale,
              undefined,
              ctx.symbol || undefined
            )} = `
          ),
        }
      : row;
  // A tax row reads the business's own column wording ("Tax (10%)" for a column it named
  // "Tax"), as refrens.com prints it.
  const columnLabels = new Map(
    asArray(invoice.columns)
      .map(asRecord)
      .map((column) => [text(column.key), text(column.label)] as const)
  );
  const withColumnWord = (row: SubtotalRow): SubtotalRow => {
    const key = row.key.split(":")[0];
    const own = ["igst", "cgst", "sgst", "utgst"].includes(key)
      ? columnLabels.get(key) || ""
      : "";
    return own && own.toUpperCase() === "TAX"
      ? { ...row, label: row.label.replace(/^(IGST|CGST|SGST|UTGST)\b/i, own) }
      : row;
  };
  const exchange = showsExchangeRate(state);
  const exchangeRow = <T extends SubtotalRow>(row: T): T =>
    exchange ? row : withoutExchange(row);
  return {
    hidden: model.hidden,
    hideTaxes: model.hideTaxes,
    main: model.groups.main
      .filter((row) => exchange || row.key !== "conversionRate")
      .map(unitRate)
      // "Discount", as refrens.com prints it (the widget writes "Discount(10%)").
      .map((row) =>
        row.key === "discount"
          ? { ...row, label: row.label.replace(/\s*\([^)]*%\)\s*$/, "") }
          : row
      )
      .map(withColumnWord)
      .map(exchangeRow)
      .map(plainRow),
    extra: model.groups.extra.map(exchangeRow).map(plainRow),
    // "Show balance due" off drops the Balance Due row; what was paid still prints.
    due: model.groups.due
      .filter((row) => settings.dueAmount || row.key !== "dueAmount")
      .map(exchangeRow)
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
  const notes = notesHidden ? "" : text(invoice.notes);

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
    ? { title: heading(labels, "notes", "Notes"), body: notesLabels(notes) }
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
    image,
    awaitingDigital: isDigital && !isSigned,
    signedDigital: isDigital && isSigned,
    signerName: text(signer.signerName),
    verifyUrl: text(asRecord(invoice.share).pdf),
    label: heading(labels, "signature", "Authorized Signatory"),
  };
};

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

/* ------------------------------------------------------------------ view */

/*
 * Print and PDF print at true size (design-to-template §4a): no page-fit zoom, so 13 px text
 * prints at 13 px. The page is the paper width less the browser's default 1 cm margins
 * (A4: 718 px; the document has no padding of its own); it depends only on the format, never on the
 * window, because the PDF service renders in a window narrower than its page.
 *
 * zoomSize is the print size picked in Lydia (0.8 smaller … 1.2 larger). The page prints zoomed
 * by it (the renderer's html zoom, or the template's own at 0.8 and when unset), which narrows
 * the page in CSS px. textScale scales text only.
 *
 * Nothing shrinks to fit the paper: every text, the item table's included, prints at the
 * print size, and a table too wide for the page is cut off at its edge; landscape gives it
 * room (user, 2026-11-01, replacing the whole-document fit of 2026-10-31).
 */
const PAPER_WIDTH_MM: Record<string, number> = {
  a3: 297,
  a4: 210,
  a5: 148,
  letter: 215.9,
  legal: 215.9,
  // Refrens' sixth paper size (11 × 17 in): unknown formats fell back to A4, so a Tabloid page
  // printed an A4-wide column (real PDF, proforma A00012, 1 Nov 2026).
  tabloid: 279.4,
};

const positiveNumber = (value: unknown): number | undefined => {
  const parsed = hasValue(value) ? Number(text(value)) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const compactDecimal = (value: number): string =>
  String(Number(value.toFixed(4)));

/* Paper heights, for a landscape page (its width is the paper's height). */
const PAPER_HEIGHT_MM: Record<string, number> = {
  a3: 420,
  a4: 297,
  a5: 210,
  letter: 279.4,
  legal: 355.6,
  tabloid: 431.8,
};

/*
 * Print at the screen's size (user, 2026-11-02: like the E-commerce template; Refrens' own 75 %
 * read too small), zoomed by the text scale alone: Smaller 0.8 (Refrens' default, also when
 * unset), Small 0.9, Normal 1, Large 1.1, Larger 1.2, each at its own size (user, 2026-11-02:
 * "the smaller text scale is equal to normal, there is no difference"; 0.8 and 0.9 printed as
 * 1). Refrens' renderer zooms <html> by it except at 0.8 and when unset (src/main/commonUtils.ts),
 * so the template draws that zoom itself then (ownPrintZoom, template.hbs).
 */
const PRINT_BASE_SCALE = 1;
export const printScaleFor = (): number => PRINT_BASE_SCALE;

export const mapPrint = (state: UnknownRecord) => {
  const pdfOptions = asRecord(state.pdfOptions);
  const format = text(pdfOptions.format).toLowerCase();
  const landscape = optionalFlag(pdfOptions.landscape) === true;
  const paperMm = landscape
    ? PAPER_HEIGHT_MM[format] ?? PAPER_HEIGHT_MM.a4
    : PAPER_WIDTH_MM[format] ?? PAPER_WIDTH_MM.a4;
  const rendererZoom = positiveNumber(pdfOptions.zoomSize) ?? 0.8;
  const rawZoom = Number(text(pdfOptions.zoomSize));
  const ownPrintZoom =
    !hasValue(pdfOptions.zoomSize) ||
    !Number.isFinite(rawZoom) ||
    rawZoom <= 0 ||
    rawZoom === 0.8
      ? compactDecimal(rendererZoom)
      : undefined;
  /*
   * The printable width in the document's own pixels, which caps the page in print
   * (styles.css): Refrens' PDF service lays the page out in a window wider than the paper
   * before it prints, and a table fitted there was clipped on the page (user report). Side
   * margins are xMargins centimetres (1 when unset; 0 is a real setting, edge to edge). The
   * page's margins stay their size in the PDF whatever the print zoom, so the zoom divides
   * the width between them (measured 2026-10-23: subtracting the margins after the zoom ran
   * the page into the margins at 0.9 and left them wider at 1.1 and 1.2); 4 px kept back for
   * rounding. Side margins are Refrens' own: xMargins steps of 30 px of the paper at either side
   * (Narrow 0.5 is the default, also when unset; 0 is a real setting, edge to edge), never
   * centimetres (they printed a quarter wider than Refrens', user rule 2026-11-02).
   */
  const marginSetting = hasValue(pdfOptions.xMargins)
    ? Number(text(pdfOptions.xMargins))
    : NaN;
  const sideMarginPx =
    (Number.isFinite(marginSetting) && marginSetting >= 0
      ? marginSetting
      : 0.5) * MARGIN_STEP_PX;
  // The printable width at zoom 1 (syncPrintWidths divides it by a print zoom set later).
  const printableBase = (marginPx: number) =>
    (paperMm / 25.4) * 96 - 2 * marginPx;
  const printableWidth = (marginPx: number) =>
    Math.floor(printableBase(marginPx) / rendererZoom - 4);
  const printWidth = printableWidth(sideMarginPx);
  // The page's height in a browser's own print (its 1 cm margins), for the measurement made
  // before it prints, in the window's height otherwise (prepareBrowserPrint).
  const paperHeightMm = landscape
    ? PAPER_WIDTH_MM[format] ?? PAPER_WIDTH_MM.a4
    : PAPER_HEIGHT_MM[format] ?? PAPER_HEIGHT_MM.a4;
  const browserPrintHeight = Math.floor(
    ((paperHeightMm / 25.4) * 96 - (2 * 96) / 2.54) / rendererZoom
  );
  // A browser's own print (Lydia's print button, Ctrl+P) takes the document's side margins too
  // (applyBrowserPrintPage: an @page rule outside the PDF service; user, 2026-11-02: it kept the
  // browser's 1 cm whatever the setting).
  const browserPrintWidth = printWidth;
  const rawScale =
    positiveNumber(pdfOptions.textScale) ?? positiveNumber(pdfOptions.scale);
  // A percentage (110) or a ratio (1.1); kept readable either way.
  const ratio =
    rawScale !== undefined && rawScale > 2 ? rawScale / 100 : rawScale;
  const textScale = Math.min(2, Math.max(0.3, ratio ?? 1));
  return {
    textScale: compactDecimal(textScale),
    printScale: compactDecimal(printScaleFor()),
    ownPrintZoom,
    printWidth,
    browserPrintWidth,
    browserPrintHeight,
    printBase: compactDecimal(printableBase(sideMarginPx)),
    browserPrintBase: compactDecimal(printableBase(sideMarginPx)),
    // The side margins in cm, for a browser's own print (applyBrowserPrintPage).
    // In px of the paper (applyBrowserPrintPage).
    sideMargin: compactDecimal(sideMarginPx),
    // The paper's width in px, as printed (placeStampRoom).
    paperWidth: compactDecimal((paperMm / 25.4) * 96),
    /*
     * BPS: the item table is never stretched (2026-11-16). Its page (page 2 of the client's four)
     * always goes on with the totals, bank, terms, signature and notes, so the stretched row only
     * pushed the notes' last table onto a page of its own. The engine stays for a later change.
     */
    stretchTable: false,
  };
};

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
  // Refrens' PDF service reads a sales order from /salesorders/<id>, where bankAccount is only
  // the account's id and the account itself is bankAccountDetails: the bank details went
  // missing from real sales-order PDFs (inventoryinc A00009, 1 Nov 2026).
  const bankDetails = asRecord(invoice.bankAccountDetails);
  if (!isRecord(invoice.bankAccount) && Object.keys(bankDetails).length > 0) {
    const withBank = { ...invoice, bankAccount: bankDetails };
    return withRefrensDefaults(
      (wrapped ? { ...root, invoice: withBank } : withBank) as T
    );
  }
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
  const fixed = {
    ...invoice,
    ...(chosen
      ? {}
      : { advanceOptions: { ...options, unitColumn: "SEPARATE_COLUMN" } }),
  };
  return (wrapped ? { ...root, invoice: fixed } : fixed) as T;
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
    // refrens.com keeps the business's own "Tax" wording on the column (and its totals row);
    // only another tax system's name ("PPN", "VAT") reads IGST / CGST / SGST.
    if (
      word &&
      label.toUpperCase() !== "TAX" &&
      FOREIGN_TAX_NAMES.includes(label.toUpperCase())
    ) {
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

/* A party's identifier lines as one flat list: the design prints them one per line. */
const partyFields = (party: ReturnType<typeof mapParty>) =>
  party ? party.lines.reduce((all, line) => all.concat(line), []) : [];

/*
 * The status tag as refrens.com shows it on each kind of document (checked on 360 real
 * documents): invoices, proformas and debit notes "Paid" / "Part Paid" (nothing while unpaid);
 * challans, purchase orders and quotations "Created", or "<Type> Sent" / "<Type> Seen" once
 * emailed (reminders.views: an opened email is Seen); credit notes "Issued" (none once
 * overdue), "Partially Utilised", "Redeemed"; sales orders none; any document "Draft" or
 * "Canceled" ("Cancelled" on a quotation). Checked on 465 real documents. Colours: the status
 * widget's.
 */
const SENT_TYPE_NAMES: Record<string, string> = {
  DELIVERYCHALLAN: "Delivery Challan",
  PURCHASEORDER: "Purchase Order",
  QUOTATION: "Quotation",
};
export const statusTag = (
  invoice: UnknownRecord
): { text: string; color: string } | null => {
  const type = text(invoice.billType).toUpperCase();
  const status = text(invoice.status).toUpperCase();
  if (status === "DRAFT") return { text: "Draft", color: "devider" };
  if (status === "CANCELED" || status === "CANCELLED") {
    return {
      text: type === "QUOTATION" ? "Cancelled" : "Canceled",
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
  if (SENT_TYPE_NAMES[type]) {
    // A purchase order goes to its vendor: refrens.com marks it sent once the vendor send has
    // recipients (vendorReminder), with no client email views (seen on a real purchase order).
    const vendor = asRecord(invoice.vendorReminder);
    const emails = [
      ...asArray(asRecord(invoice.reminders).views),
      ...asArray(vendor.views),
    ].map(asRecord);
    if (emails.some((email) => Number(email.open) > 0)) {
      return { text: `${SENT_TYPE_NAMES[type]} Seen`, color: "success" };
    }
    if (
      emails.length ||
      (type === "PURCHASEORDER" && asArray(vendor.recipients).length > 0)
    ) {
      return { text: `${SENT_TYPE_NAMES[type]} Sent`, color: "info" };
    }
    return { text: "Created", color: "info" };
  }
  if (type === "CREDITNOTE") {
    const credit = text(invoice.creditNoteStatus).toUpperCase();
    if (credit === "PARTIAL") {
      return { text: "Partially Utilised", color: "info" };
    }
    if (credit === "REDEEMED") return { text: "Redeemed", color: "success" };
    if (credit === "ISSUED" && optionalFlag(invoice.isOverdue) !== true) {
      return { text: "Issued", color: "info" };
    }
  }
  return null;
};

/*
 * The E-Invoice / E-Way Bill card's title (Figma "Eway Bill Details"): the e-invoice's while an
 * IRN prints, else the e-way bill's; a card holding only a QR has none.
 */
const complianceTitle = (
  labels: UnknownRecord,
  compliance: ReturnType<typeof mapCompliance>
): string => {
  const hasIrn =
    (compliance.showIrn && compliance.irn !== "") ||
    compliance.rows.some((row) => /^(ack|irn)/i.test(row.key));
  if (hasIrn) return heading(labels, "eInvoiceDetails", "E-Invoice Details");
  return compliance.rows.length
    ? heading(labels, "ewayBillDetails", "Eway Bill Details")
    : "";
};

const qrInDetails = (invoice: UnknownRecord): boolean => {
  const placement = text(
    asRecord(ownerConfiguration(invoice).experimental).qrCodePlacement
  ).toUpperCase();
  return placement === "" || placement === "IN_DOCUMENT_DETAILS";
};

const statusInPrint = (invoice: UnknownRecord, tag: string): boolean =>
  !SENT_TYPE_NAMES[text(invoice.billType).toUpperCase()] ||
  ["Draft", "Canceled", "Cancelled"].includes(tag);

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
    },
  ];
};

export const buildBpsView = (root: unknown) => {
  const state = asRecord(root);
  const invoice = asRecord(state.invoice);
  const mapped = asRecord(state.mapped);
  const visibility = asRecord(mapped.visibility);
  const labels = asRecord(invoice.customLabels);
  const ctx = formatContext(invoice);
  const seller = mapParty(
    invoice,
    invoice.billedBy,
    heading(labels, "billedBy", "Billed By")
  );
  const logo = firstText(invoice.logo, asRecord(invoice.billedBy).logo);

  const settings = mapSettings(state);
  const options = resolveSettings(state);
  const withFields = (party: ReturnType<typeof mapParty>) =>
    party ? { ...party, fields: partyFields(party) } : null;
  // Shipped From / Shipped To always carry their heading: a cleared label prints the default
  // word, never a box without a title (user, 2026-11-17).
  const shippedFrom = visibility.shippedFrom
    ? withFields(
        mapParty(
          invoice,
          invoice.shippedFrom,
          labelOr(labels, "shippedFrom", "Shipped From"),
          true
        )
      )
    : null;
  const shippedTo = visibility.shippedTo
    ? withFields(
        mapParty(
          invoice,
          invoice.shippedTo,
          labelOr(labels, "shippedTo", "Shipped To"),
          true
        )
      )
    : null;
  const supply = mapSupply(state);
  // Transport Details is a card of its own (Figma), beside the E-Invoice / E-Way Bill card.
  const transport = mapTransport(state);
  const meta = [...mapMeta(state, []), ...mapEcommerceOperator(invoice)];
  const notes = mapNotes(state);
  const terms = options.terms ? notes.terms : [];
  const additional = mapAdditionalInfo(state, ctx);
  // Billed By | Billed To, side by side (Figma).
  const parties = [
    seller ? { ...withFields(seller), role: "billed-by" } : null,
    withFields(
      mapParty(
        invoice,
        invoice.billedTo,
        heading(labels, "billedTo", "Billed To")
      )
    ),
  ]
    .filter(Boolean)
    .map((party, index) =>
      index === 1 || !seller ? { ...party, role: "billed-to" } : party
    );
  const table = mapItemTable(state, ctx, options);
  const totals = mapTotals(state, options);
  const bank = mapBank(state);
  const compliance = mapCompliance(state);
  const hasCompliance = Boolean(
    (compliance.showIrn && compliance.irn) ||
      compliance.rows.length ||
      compliance.qr.irn ||
      compliance.qr.zatca ||
      compliance.qr.lhdn
  );
  const status = statusTag(invoice);
  const print = mapPrint(state);
  // "(Net Payable)" under the amount the customer pays (client's quotation), only with a
  // subsidy: under the one item's amount, else under the items' Total row, else under the
  // grand total.
  const subsidy = mapSubsidy(state);
  const deduction = !subsidy && hasSubsidyDeduction(state);
  const grandTotal = toAmount(asRecord(invoice.finalTotal).total);
  const itemRows = asArray(table.rows)
    .map(asRecord)
    .filter((row) => !row.isGroupHeader && !row.isGroupTotal && !row.isFiller);
  let netPayableAt = "";
  if ((subsidy || deduction) && itemRows.length === 1) {
    netPayableAt = "item";
    itemRows[0].netPayable = true;
  } else if ((subsidy || deduction) && asRecord(table.footer).show) {
    netPayableAt = "footer";
    asRecord(table.footer).netPayable = true;
  } else if (subsidy) netPayableAt = "grand";
  return {
    brand: { name: seller ? seller.name : "", logo },
    title: firstText(invoice.invoiceTitle),
    // The tagline is printed by the template; a subtitle repeating it is not printed twice.
    subtitle: /^telangana.s most trusted solar installer\.?$/i.test(
      text(invoice.invoiceSubTitle)
    )
      ? ""
      : text(invoice.invoiceSubTitle),
    copy: firstText(invoice.copy),
    // The status tag as refrens.com shows it for the document type (statusTag). Its PDFs
    // print every tag but a challan's, purchase order's or quotation's "Created" / "… Sent" /
    // "… Seen" (checked on real PDFs of each type, 2026-10-23).
    status: status
      ? { ...status, inPrint: statusInPrint(invoice, status.text) }
      : null,
    theme: settings.theme,
    meta,
    documentQr: compliance.qr.document,
    // refrens.com puts the document QR under the document details unless the business places
    // it elsewhere (owner.configuration.experimental.qrCodePlacement).
    qrInDetails: qrInDetails(invoice),
    hasBrandRow: Boolean(logo) || !qrInDetails(invoice),
    compliance: { ...compliance, title: complianceTitle(labels, compliance) },
    hasCompliance,

    parties,
    // The band (Simple design): the seller beside the logo, Billed To on the right.
    seller:
      parties.find((party) => asRecord(party).role === "billed-by") || null,
    // The customer's phone reads "Mobile Number" (the client's quotation; user, 2026-11-16).
    buyer: withMobileLabel(
      parties.find((party) => asRecord(party).role === "billed-to") || null
    ),
    // BPS design: the customer's lines in the details list, "Customer Name: …", "Address: …".
    // The client's fixed last two pages (Premium Services, Terms & Conditions), copied as the
    // client wrote them, on every document type (user, 2026-11-17: missing on the others).
    fixedPages: true,
    customerLabel: "Customer Name",
    addressLabel: "Address",
    // The band's details strip: the document details, then what is due.
    // The document date first, then its number (the client's quotation; user, 2026-11-16).
    details: dateFirst(meta),
    // Country / Place of Supply print under Shipped To (fixed decision, all templates); in the
    // document details only when the document has no Shipped To.
    supplyInShipping: shippedTo !== null,
    // A table whose columns cannot fit the printed width at the design's 12 px cell padding
    // prints with 6 px (text keeps its size; tables never shrink, user rule 2026-11-01).
    printTight: table.printFixedWidth + 160 > print.printWidth,
    // The details strip shows while it has a detail, the supply cells or the document QR's
    // place (kept for the host's live QR).
    hasDetailsRow:
      meta.length > 0 ||
      supply.show ||
      Boolean(compliance.qr.document) ||
      (hasCompliance && !compliance.isBelowItems),
    // Shipped From in the left column, Shipped To in the right one, whichever is present.
    dispatchParties: [
      shippedFrom ? { ...shippedFrom, role: "shipped-from", column: 1 } : null,
      shippedTo
        ? { ...shippedTo, role: "shipped-to", column: 2, isShippedTo: true }
        : null,
    ].filter(Boolean),
    hasShipping: shippedFrom !== null || shippedTo !== null,
    // The Shipped From | Shipped To | Transport row shows while it has one of them.
    hasLogistics:
      shippedFrom !== null || shippedTo !== null || Boolean(transport),
    // Country / Place of Supply in a row of their own just above the items, as refrens.com's
    // default layout prints them, with or without a Shipped To (user, 2026-10-23).
    supply: supply.show ? supply : null,
    transport,
    table,
    descriptionFullWidth: options.descriptionFullWidth,
    bank,
    totals: {
      ...totals,
      // One list in the side column: the totals, the grand total between its rules, then
      // what was paid and what is due.
      rows: [
        ...totals.main
          .map(minusSubsidy)
          .map((row) =>
            row.isGrand && subsidy && netPayableAt === "grand"
              ? { ...row, netPayable: true }
              : row
          ),
        ...totals.extra.map(minusSubsidy).map((row) => ({
          ...row,
          isExtra: true,
          emphasis: "normal",
        })),
        // The subsidy and what the customer finally spends: shown, never taken off the total.
        ...(subsidy
          ? [
              {
                key: "bpSubsidy",
                label:
                  "Subsidy (The Amount will be credited to customer’s bank account)",
                value: `-${formatMoney(subsidy, ctx)}`,
                isNum: true,
                emphasis: "normal",
                isBpSubsidy: true,
              },
              {
                key: "bpNetEffective",
                label: "Net Effective Price",
                value: formatMoney(grandTotal - subsidy, ctx),
                isNum: true,
                emphasis: "bold",
                isBpEffective: true,
              },
            ]
          : []),
        ...totals.due,
      ],
    },
    words: mapWords(state, options),
    terms,
    notes: notes.notes,
    additional,
    attachments: notes.attachments,
    /*
     * The summaries render whenever there is data, hidden while their setting is off, so the
     * host's live toggles (data-ceres-hsn-summary / -tax-summary / -payment-table) can show
     * them without a re-render.
     */
    hsn: {
      hidden: !visibility.showHsnSummary,
      title: heading(labels, "hsnSummary", "HSN Summary"),
    },
    taxSummary: {
      hidden: !visibility.showTaxTable,
      title: heading(labels, "taxSummary", "Tax Summary"),
    },
    stock: mapStockSummary(state, ctx, options),
    payments: mapPayments(state),
    enquiry: mapDocumentContact(state),
    signature: mapSignature(state),
    // The letterhead footer repeats at the foot of every printed page unless the document
    // asks for it on the last page only (pdfOptions.footerOnLastPage).
    // Pageless PDF is one page as tall as the content: letterhead and footer once each.
    footerEveryPage: !visibility.footerOnLastPage && !options.pageless,
    // Refrens' PDF service draws that every-page footer itself, unless "Hide footer" turns
    // its footer off (only the "electronically generated" line is meant): the template then
    // draws the letterhead footer in the PDF too.
    // A Long PDF (Pageless) too: the service stamps them at the top and foot of its one page,
    // and the template's own copies printed them twice (user, 2026-11-02).
    serviceFooter:
      !visibility.footerOnLastPage &&
      ![
        asRecord(state.pdfOptions).hideFooter,
        asRecord(state.template).hideFooter,
        invoice.hideFooter,
      ].some((value) => optionalFlag(value) === true),
    /*
     * "This is an electronically generated document, no signature is required." Refrens' PDF
     * service prints it at the foot of every page of an unsigned document, in its own page
     * footer; with the footer on the last page only it leaves that footer out for a custom
     * template, the line with it (user, 2026-11-03), while its own templates keep the line on
     * every page. The template prints it then, in the PDF's pages (not a Long PDF, where the
     * service still prints it); "Hide footer" drops it, as it does Refrens' own.
     */
    // Refrens' PDF service prints "This is an electronically generated document…" itself on
    // an unsigned document; the template never prints its own (it printed twice, user
    // 2026-11-05).
    ownSignatureNote: false,
    // The letterhead repeats at the top of every printed page unless the document asks for
    // it on the first page only (pdfOptions.letterHeadOnFirstPage).
    letterheadEveryPage: !visibility.letterHeadOnFirstPage && !options.pageless,
    // The service stamps the letterhead itself unless it is for the first page only.
    serviceLetterhead: !visibility.letterHeadOnFirstPage,
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

export const registerBpsHelpers = (HB: HelperRegistry | undefined): void => {
  if (!HB) return;
  HB.registerHelper("bpView", (root: unknown) => buildBpsView(root));
  // `{{bpDate value offset}}` — Handlebars appends its options object, so only a string or
  // number second argument is an offset.
  HB.registerHelper("bpDate", (value: unknown, offset: unknown) =>
    formatDocumentDate(
      value,
      typeof offset === "string" || typeof offset === "number"
        ? offset
        : undefined
    )
  );
};

/* ------------------------------------------------------------------ business logo */

/* ------------------------------------------------------------------ failed images */

/*
 * An image that fails to load (an expired or private link) prints nothing: not the browser's
 * broken-image mark, not its alt text (user rule). Load events do not bubble, so the listener
 * sits on the document's capture phase, ahead of every render.
 */
/*
 * Text on the theme colour stays readable when Lydia's colour picker changes the colour live (it
 * sets --primary-color on <html>, no re-render): a light colour (white, yellow) takes ink text on
 * the band and grand total and ink headings and table rules on the paper, as at render
 * (mapSettings onAccent / accentText); any other colour takes white on it and itself on paper.
 */
const INK_ON_LIGHT = "#22272f";
export const syncThemeContrast = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLElement>(".bp-doc").forEach((doc) => {
    const accent = getComputedStyle(doc).getPropertyValue("--bp-accent").trim();
    if (!accent) return;
    const probe = document.createElement("i");
    probe.style.color = accent;
    probe.style.display = "none";
    doc.appendChild(probe);
    const rgb = (getComputedStyle(probe).color.match(/[\d.]+/g) || []).map(
      Number
    );
    probe.remove();
    if (rgb.length < 3) return;
    const lum = rgb
      .slice(0, 3)
      .map((value) => value / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const light = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.5;
    doc.style.setProperty("--bp-on-accent", light ? INK_ON_LIGHT : "#ffffff");
    if (light) doc.style.setProperty("--bp-accent-text", INK_ON_LIGHT);
    else doc.style.removeProperty("--bp-accent-text");
  });
};

export const registerBpsThemeContrast = (): void => {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined")
    return;
  const registry = window as unknown as { bpThemeRegistered?: boolean };
  if (registry.bpThemeRegistered) return;
  registry.bpThemeRegistered = true;
  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      syncThemeContrast();
    }, 0);
  };
  // The live colour (the renderer writes --primary-color into <html>'s style).
  new MutationObserver(run).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
  });
  // A (re-)rendered document.
  const start = () =>
    new MutationObserver((records) => {
      if (
        records.some((r) =>
          Array.from(r.addedNodes).some(
            (n) =>
              n instanceof Element &&
              (n.matches(".bp-doc") || !!n.querySelector(".bp-doc"))
          )
        )
      )
        run();
    }).observe(document.body, { childList: true, subtree: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
};

export const registerBpsImages = (): void => {
  const state = window as typeof window & { bpImagesRegistered?: boolean };
  if (state.bpImagesRegistered || typeof document === "undefined") return;
  state.bpImagesRegistered = true;
  document.addEventListener(
    "error",
    (event) => {
      const { target } = event;
      if (target instanceof HTMLImageElement && target.closest(".bp-doc")) {
        target.classList.add("is-broken");
      }
    },
    true
  );
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

// A few px to spare, so rounding never pushes the footer onto a page of its own (2 px let the
// footer slip onto a page the print had not counted: lost, a blank last page; 2026-10-31).
const PAGE_EDGE_SLACK = 6;

/* The space to add above the footer so it ends on the page's bottom edge. */
// Per page, how much earlier the page ends read off forced breaks are taken (placeFootersOnPageEdge).
const PAGE_END_DRIFT = 4;

/* Below this a "page" is a collapsed forced break, not a printed page (Dibella path). */
const MIN_PAGE_HEIGHT = 200;

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
  ".bp-doc .bp-letterhead-footer:not(.bp-footer-fixed):not(.bp-footer-spacer):not(.is-empty)";

const pageTop = (element: Element): number =>
  element.getBoundingClientRect().top + window.scrollY;

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
    const [rawPageEnd, rawNextPageEnd] = breaks.map(pageTop);
    breaks.forEach((marker) => marker.remove());
    // Page ends read off forced breaks run late by 2.4–2.6 px a page (measured 2026-10-31 and
    // 2026-11-01: 26 px by page 10 of an A4 invoice with a cut-off table), and a footer set on
    // them slipped onto a page the print had not counted (lost, a blank last page). They are
    // taken 4 px a page earlier.
    const drift = (end: number) =>
      rawNextPageEnd > rawPageEnd
        ? PAGE_END_DRIFT * Math.round(end / (rawNextPageEnd - rawPageEnd))
        : 0;
    const pageEnd = rawPageEnd - drift(rawPageEnd);
    const nextPageEnd = rawNextPageEnd - drift(rawNextPageEnd);
    const pageHeight = nextPageEnd - pageEnd;
    // Not paginated yet (the PDF service switches to print media before it prints, so the
    // forced breaks collapse to a few pixels): the page edge cannot be measured, and the
    // footer stays after the content rather than be forced onto a page of its own.
    if (pageHeight < MIN_PAGE_HEIGHT) return;

    const box = footer.getBoundingClientRect();
    const fits =
      box.top + window.scrollY + box.height <= pageEnd + PAGE_EDGE_SLACK;
    // Not room for it under the content: it never takes a page of its own (a Legal PDF ended
    // on a page holding only the footer, 2026-11-05); it flows on with the content, which its
    // print rule (break-before: avoid-page) brings over to the next page with it.
    if (!fits) return;
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
 * Chrome before 128 (Refrens' PDF service runs 122) reports the size and place of anything inside
 * a CSS-zoomed element divided by that zoom; later Chrome reports what is drawn. The renderer zooms
 * <html> for the print size, so the totals' rule and the stretch rules measure the table through
 * this (2026-10-23: the totals' rule landed off the column). Elsewhere it returns the rect
 * unchanged.
 */
const legacyZoom = (): boolean =>
  typeof Element !== "undefined" && !("currentCSSZoom" in Element.prototype);

const zoomWithin = (element: Element): number => {
  let zoom = 1;
  for (
    let node: Element | null = element;
    node && node !== document.documentElement;
    node = node.parentElement
  ) {
    zoom *= parseFloat(getComputedStyle(node).zoom) || 1;
  }
  return zoom;
};

type Box = Pick<
  DOMRect,
  "x" | "y" | "width" | "height" | "left" | "right" | "top" | "bottom"
>;

export const drawnRect = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  const zoom = legacyZoom() ? zoomWithin(element) : 1;
  if (zoom === 1) return rect;
  const scaled = (value: number) => value * zoom;
  return {
    x: scaled(rect.x),
    y: scaled(rect.y),
    width: scaled(rect.width),
    height: scaled(rect.height),
    left: scaled(rect.left),
    right: scaled(rect.right),
    top: scaled(rect.top),
    bottom: scaled(rect.bottom),
  };
};
// Between beforeprint and afterprint: the screen's filler stays off, or a re-measure on the
// restored width put it back before Chrome counted the pages (a blank page 2, 2026-10-31).
let browserPrinting = false;
// While prepareBrowserPrint lays the document out for a browser's print (before it is cut
// into pages): the only time a browser's print measures the stretch.
let preparingBrowserPrint = false;

/*
 * A browser's print, once Chrome has cut the layout into pages: the stretch prepared before
 * (prepareBrowserPrint) stays as it is. Measured in the cut layout, the filler came out a page
 * break too tall (the E-commerce template, 2026-11-01).
 */
// The browser's own side margins against the ones a browser print is laid out for, either way.
const BROWSER_WIDTH_SLACK = 24;

const keepPreparedStretch = (): boolean =>
  browserPrinting && !preparingBrowserPrint;

/*
 * A browser's own print laid out at one width (prepareBrowserPrint, data-bp-prepared-width)
 * and printing at another: its dialog turned the paper.
 */
const pageTurned = (): boolean => {
  const doc = document.querySelector<HTMLElement>(".bp-doc");
  const prepared = Number(doc?.dataset.bpPreparedWidth);
  return (
    Boolean(doc) &&
    prepared > 0 &&
    Math.abs((doc as HTMLElement).getBoundingClientRect().width - prepared) >
      BROWSER_WIDTH_SLACK
  );
};

/*
 * The totals carry on without the item headings (user, 2026-10-19): in print, the rows after
 * the items move into a table of their own right under the item table, so a page that holds
 * only them repeats no heading row. Its columns take the item columns' widths, so the TOTAL
 * row's figures stay under their columns. joinTotals puts them back in the one table.
 */
const TOTALS_SPLIT = "data-bp-totals-split";
const TOTALS_GROUPS = ":scope > tbody.bp-items-total";

/*
 * The totals close the table, so the items' last row keeps square corners in print over the
 * page-break corners (styles.css, "corners at a page break"): its cells at the table's left and
 * right edges are marked, with their own ground and rule widths for the square drawn over the
 * curve. Read off the layout, as a description or a name row's serial cell may be the one at
 * the edge.
 */
const JOINT_CLASSES = ["is-joint-left", "is-joint-right", "is-joint-row"];

const clearJointCorners = (root: ParentNode): void => {
  root
    .querySelectorAll<HTMLElement>(".is-joint-left, .is-joint-right")
    .forEach((cell) => {
      cell.classList.remove(...JOINT_CLASSES);
      [
        "--bp-joint-bg",
        "--bp-joint-below",
        "--bp-joint-bottom",
        "--bp-joint-side",
      ].forEach((name) => cell.style.removeProperty(name));
    });
};

const transparent = (color: string): boolean =>
  !color || color === "transparent" || /rgba\([^)]*,\s*0\)$/.test(color);

// The first opaque ground behind an element: its own, its row's, its row group's.
const groundOf = (element: Element | null): string | undefined =>
  [element, element?.parentElement, element?.parentElement?.parentElement]
    .map((el) => (el ? getComputedStyle(el).backgroundColor : ""))
    .find((color) => !transparent(color));

const markJointCorners = (
  table: HTMLTableElement,
  totals: HTMLTableElement
): void => {
  /*
   * The corner pieces hang from the totals' table (styles.css), at its top corners, which are
   * the item table's bottom corners: no cell's border width to read (Chrome 122 under the print
   * zoom misread them, and the left piece sat a pixel inside the table's edge, user
   * 2026-11-03). Their ground is the item table's last row's.
   */
  totals.classList.remove(...JOINT_CLASSES);
  totals.style.removeProperty("--bp-joint-bg");
  totals.style.removeProperty("--bp-joint-rule");
  const cells = Array.from(table.tBodies)
    .flatMap((body) => Array.from(body.rows))
    .flatMap((row) => Array.from(row.cells))
    .filter((cell) => cell.getClientRects().length > 0)
    .map((cell) => ({ cell, box: cell.getBoundingClientRect() }));
  if (!cells.length) return;
  const bottom = Math.max(...cells.map(({ box }) => box.bottom));
  const last = cells.filter(({ box }) => bottom - box.bottom < 1.5);
  // On a tie the later row wins: a stretched table's filler (or a Sub total under it) ends the
  // table even while the page rules have not given the filler its height yet.
  // The totals' top edge is the one line where the two meet: the item table's last row draws
  // none (laid a hair apart in print, the two rules showed as a doubled line, 2026-11-03).
  last.forEach(({ cell }) => cell.classList.add("is-joint-row"));
  const left = last.reduce((a, b) => (b.box.left <= a.box.left ? b : a));
  const ground = groundOf(left.cell);
  if (ground) totals.style.setProperty("--bp-joint-bg", ground);
  // The item table's bottom rule as it is drawn (the print zoom makes it a fraction of a pixel):
  // the totals overlap it by exactly that and draw it again, so the two meet on one line
  // whether they follow on the same page or start the next one (user, 2026-11-03).
  const rule = Math.max(
    0,
    ...last.map(
      ({ cell }) => parseFloat(getComputedStyle(cell).borderBottomWidth) || 0
    )
  );
  // The rows' separator width (styles.css --bp-separator, 0.5 px): the joint is a separator.
  const separator =
    parseFloat(getComputedStyle(table).getPropertyValue("--bp-separator")) || 1;
  // Chrome draws a rule no thinner than one device pixel: under the print zoom that is more than
  // a pixel of the document's own (the rule printed 0.75 pt where 0.625 px gave 0.24 pt).
  const zoom =
    left.box.width /
      ((left.cell as HTMLElement).offsetWidth || left.box.width || 1) || 1;
  totals.style.setProperty(
    "--bp-joint-rule",
    `${compactDecimal(Math.max(rule || separator, separator / zoom))}px`
  );
  // A table too wide for the page is cut off at its box (user, 2026-11-01): a corner past that
  // edge is not on the paper, and Chrome 122 let such a mark escape the cut, so the PDF service
  // shrank the whole page to show it (2026-11-01: 13 px text printed at 9.9 px).
  const room = (table.parentElement ?? table).getBoundingClientRect();
  const box = table.getBoundingClientRect();
  if (box.left >= room.left - 1) totals.classList.add("is-joint-left");
  if (box.right <= room.right + 1) totals.classList.add("is-joint-right");
};

/*
 * The joint marked again once the stretch shows its filler: the totals are split (and the
 * joint marked) before the stretch runs, so the marks sat on the last item and the filler,
 * the table's real last row, ended in the page-break curve above the totals (user,
 * 2026-11-02).
 */
const remarkJointCorners = (root: ParentNode): void => {
  root
    .querySelectorAll<HTMLTableElement>(`table[${TOTALS_SPLIT}]`)
    .forEach((split) => {
      const table = split.previousElementSibling;
      if (!(table instanceof HTMLTableElement)) return;
      clearJointCorners(table);
      markJointCorners(table, split);
    });
};

export const joinTotals = (root: ParentNode = document): void => {
  clearJointCorners(root);
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
      if (table instanceof HTMLTableElement) {
        table.querySelector(`:scope > colgroup[${TOTALS_SPLIT}]`)?.remove();
        table.style.removeProperty("table-layout");
        table.style.removeProperty("width");
      }
      split.remove();
    });
};

/*
 * The totals' columns line up with the item columns above them (user, 2026-11-03: the Total
 * row's figures sat up to 10 pt left of their columns in a landscape PDF). Chrome 122 under the
 * print zoom does not give the fixed columns exactly the widths set, so each is measured on a
 * probe row and corrected, twice.
 */
const alignTotalsColumns = (
  row: HTMLTableRowElement,
  split: HTMLTableElement,
  cols: HTMLTableColElement
): void => {
  const columns = Array.from(cols.children) as HTMLTableColElement[];
  const target = Array.from(row.cells).map(
    (cell) => cell.getBoundingClientRect().width
  );
  if (columns.length !== target.length || !target.every((w) => w > 0)) return;
  const body = document.createElement("tbody");
  const probe = body.insertRow();
  columns.forEach((col) => {
    const cell = probe.insertCell();
    cell.colSpan = col.span || 1;
    cell.style.cssText = "padding:0;border:0;height:0;";
  });
  split.appendChild(body);
  for (let pass = 0; pass < 2; pass += 1) {
    const got = Array.from(probe.cells).map(
      (cell) => cell.getBoundingClientRect().width
    );
    if (got.every((w, i) => Math.abs(w - target[i]) < 0.5)) break;
    columns.forEach((col, i) => {
      const now = parseFloat(col.style.width) || 0;
      if (got[i] > 0 && now > 0) {
        // eslint-disable-next-line no-param-reassign
        col.style.width = `${(now * target[i]) / got[i]}px`;
      }
    });
  }
  body.remove();
};

/*
 * A browser's own print may turn the paper (its dialog's Layout), after the page was laid out
 * for the document's own orientation (user, 2026-11-03: landscape kept the portrait width, the
 * sides left empty): the two tables' columns are shares of their width, which is the frame's,
 * so they widen with the page and keep lined up. Never narrower than they were laid out: a
 * table wider than its frame is still cut at the page's edge there, whole on a wider page.
 */
const proportionalColumns = (
  table: HTMLTableElement,
  split: HTMLTableElement
): void => {
  const width = parseFloat(table.style.width) || 0;
  if (!(width > 0)) return;
  [table, split].forEach((each) => {
    each
      .querySelectorAll<HTMLTableColElement>(
        `:scope > colgroup[${TOTALS_SPLIT}] > col, :scope > colgroup > col`
      )
      .forEach((col) => {
        const px = parseFloat(col.style.width);
        // eslint-disable-next-line no-param-reassign
        if (px > 0) col.style.width = `${(px / width) * 100}%`;
      });
    // eslint-disable-next-line no-param-reassign
    each.style.width = `max(100%, ${width}px)`;
  });
};

export const splitTotals = (root: ParentNode = document): void => {
  joinTotals(root);
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  if (!printing) return;
  root.querySelectorAll<HTMLTableElement>(".bp-items").forEach((table) => {
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
    // Layout pixels: the print zoom scales the measured boxes, not the widths set here.
    const scale =
      table.getBoundingClientRect().width / (table.offsetWidth || 1) || 1;
    // Never wider than the wrapper: a table a pixel over it (its content's minimum width) had
    // its right rule cut off by the wrapper's clip, a faint or missing right edge and a notch
    // at the heading's corner in the PDF (user, 2026-11-04). The columns give up the pixel in
    // proportion. Only a rounding's worth: a table truly wider than the page keeps its columns
    // and is cropped (user rule: tables never shrink to fit).
    const natural = table.getBoundingClientRect().width / scale;
    const room = table.parentElement.getBoundingClientRect().width / scale;
    const fit =
      room > 0 && natural > room && natural - room <= 2 ? room / natural : 1;
    const split = document.createElement("table");
    split.className = table.className;
    split.setAttribute(TOTALS_SPLIT, "");
    const style = table.getAttribute("style");
    if (style) split.setAttribute("style", style);
    split.style.tableLayout = "fixed";
    const exact = `${natural * fit}px`; // offsetWidth rounds: up, it overflowed again
    split.style.width = exact;
    const cols = document.createElement("colgroup");
    Array.from(row.cells).forEach((cell) => {
      const col = document.createElement("col");
      col.span = cell.colSpan || 1;
      col.style.width = `${
        (cell.getBoundingClientRect().width / scale) * fit
      }px`;
      cols.appendChild(col);
    });
    split.appendChild(cols);
    // The item table keeps the columns it had with the totals in it: without them it narrowed
    // a column to its items' figures, and the Total row's wider figure, held to that column,
    // was cut off at the page edge (user, 2026-11-03, INVPD-4323343423 landscape).
    const keep = cols.cloneNode(true) as HTMLTableColElement;
    keep.setAttribute(TOTALS_SPLIT, "");
    table.insertBefore(keep, table.firstChild);
    table.style.tableLayout = "fixed";
    table.style.width = exact;
    groups[0].before(document.createComment(TOTALS_SPLIT));
    groups.forEach((group) => split.appendChild(group));
    table.after(split);
    alignTotalsColumns(row, split, cols);
    if (table.closest(".bp-doc.is-browser-print"))
      proportionalColumns(table, split);
    else if (fit < 1 || natural <= room) {
      // A table that fits keeps to its wrapper as shares of it: in pixels, the wrapper narrowed
      // a fraction after this measured it and the table ran 0.3 px past the clip again.
      [table, split].forEach((each) => {
        const set = Array.from(
          each.querySelectorAll<HTMLTableColElement>(":scope > colgroup > col")
        );
        const sum = set.reduce(
          (t, col) => t + (parseFloat(col.style.width) || 0),
          0
        );
        if (sum <= 0) return;
        set.forEach((col) => {
          col.style.width = `${
            ((parseFloat(col.style.width) || 0) / sum) * 100
          }%`;
        });
        each.style.width = "100%";
      });
    }
    markJointCorners(table, split);
  });
};

/* ------------------------------------------------------------------ print: a zoom set live */

/*
 * The print size (zoomSize) is drawn by the renderer as `@media print { html { zoom } }` in
 * a <style id="ceres-template-zoom"> (none at 0.8), and Lydia changes it live without a new
 * render: the page's print widths, worked out for the zoom at render time, then no longer
 * fitted the paper (zoom 1 → 1.2 printed 857 px on a 718 px page, cut off at the right). Once
 * that style has been seen, the widths follow it, from the zoom-free printable widths the
 * template carries (--bp-print-base, --bp-browser-print-base).
 */
const ZOOM_STYLE_ID = "ceres-template-zoom";
// The template's own print zoom (template.hbs), where the renderer draws none (0.8, unset).
const OWN_ZOOM_STYLE_ID = "bp-own-zoom";
let zoomStyleSeen = false;

/* The zoom the page prints at: the renderer's, else the template's own, else none. */
const drawnPrintZoom = (): number => {
  const style =
    document.getElementById(ZOOM_STYLE_ID) ??
    document.getElementById(OWN_ZOOM_STYLE_ID);
  const match = /zoom:\s*([\d.]+)/.exec(style?.textContent || "");
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
};

export const syncPrintWidths = (root: ParentNode = document): void => {
  if (document.getElementById(ZOOM_STYLE_ID)) zoomStyleSeen = true;
  if (!zoomStyleSeen) return;
  const zoom = drawnPrintZoom();
  root.querySelectorAll<HTMLElement>(".bp-doc").forEach((doc) => {
    [
      ["--bp-print-base", "--bp-print-width"],
      ["--bp-browser-print-base", "--bp-browser-print-width"],
    ].forEach(([base, width]) => {
      const printable = parseFloat(doc.style.getPropertyValue(base));
      if (!(printable > 0)) return;
      const next = `${Math.floor(printable / zoom - 4)}px`;
      if (doc.style.getPropertyValue(width) !== next) {
        doc.style.setProperty(width, next);
      }
    });
    const scale = compactDecimal(printScaleFor());
    if (doc.style.getPropertyValue("--bp-print-scale") !== scale) {
      doc.style.setProperty("--bp-print-scale", scale);
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
 * The template's stylesheet comes from another origin than the renderer (GitHub Pages under
 * lstatic.refrens.com), so its rules cannot be read and withPrintRules switched none of them:
 * a browser's own print counted its pages from the screen layout. The bundle carries the same
 * CSS as text (index.ts): put in the page as a <style> right after the stylesheet once the
 * document is drawn, switched off, and for a measurement switched on in the stylesheet's
 * place (the sheet's own disabled flag, which requests nothing; toggling the link's attribute
 * reloads it, and a fetched copy made Refrens' PDF service answer with an error page, as the
 * Viraj template found, 2026-10-26). The copy keeps the font import: the stylesheet switched
 * off takes its imported Inter with it, and a measurement in the fallback font came out 80 px
 * short, so a stretched table ran onto a blank second page. Not in the PDF service
 * (body.isDibella), which prints in print media and needs no measurement.
 */
const TEMPLATE_STYLESHEET = /\/bps-technologies\/[^/]+\/bundle\.css(?:[?#]|$)/;

let stylesheetText = "";
let measureStyle: HTMLStyleElement | null = null;

export const setBpsStylesheetText = (css: string): void => {
  stylesheetText = css;
};

const readable = (sheet: CSSStyleSheet | null): boolean => {
  try {
    return Boolean(sheet && sheet.cssRules);
  } catch {
    return false;
  }
};

const unreadableStylesheet = (): HTMLLinkElement | undefined =>
  Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  ).find(
    (candidate) =>
      TEMPLATE_STYLESHEET.test(candidate.href) && !readable(candidate.sheet)
  );

/* The switched-off copy, put in once the document is drawn (registerBpsWords). */
export const prepareReadableStylesheet = (): void => {
  if (measureStyle?.isConnected || !stylesheetText) return;
  if (document.body?.classList.contains("isDibella")) return;
  const link = unreadableStylesheet();
  if (!link) return;
  measureStyle = document.createElement("style");
  measureStyle.setAttribute("data-bp-measure", "");
  measureStyle.textContent = stylesheetText;
  link.after(measureStyle);
  if (measureStyle.sheet) measureStyle.sheet.disabled = true;
};

export const withReadableStylesheet = <T>(measure: () => T): T => {
  const link = unreadableStylesheet();
  const original = link?.sheet;
  if (!link || !original || !stylesheetText) return measure();
  prepareReadableStylesheet();
  const sheet = measureStyle?.sheet;
  if (!sheet) return measure();
  sheet.disabled = false;
  original.disabled = true;
  try {
    return measure();
  } finally {
    original.disabled = false;
    sheet.disabled = true;
  }
};

/*
 * `layout` is the print media listener's own work (the totals split and all), so the page
 * count is taken from the layout that prints: splitting the totals off after the count left a
 * blank page at the end of an A5 printout. Only the steps that need the pages themselves (the
 * footer on the last page's edge) wait for the listener.
 *
 * Refrens' PDF service is in print already when it makes the PDF, and making it fires
 * beforeprint too: the print listener has laid the document out for the document's own
 * margins, which a fit for the browser's 1 cm would undo (a 0.5 cm document printed its
 * table narrower than the page). Nothing to prepare then.
 */
export const prepareBrowserPrint = (
  layout?: () => void,
  root: ParentNode = document
): void => {
  const doc = root.querySelector<HTMLElement>(".bp-doc");
  if (!doc) return;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches
  ) {
    return;
  }
  const style = getComputedStyle(doc);
  // The document's printable width, or the browser's own (1 cm margins) where narrower.
  const width = Math.min(
    parseFloat(style.getPropertyValue("--bp-print-width")) ||
      doc.getBoundingClientRect().width,
    parseFloat(style.getPropertyValue("--bp-browser-print-width")) || Infinity
  );
  // The phone and tablet layouts are screen only.
  const fitted = Array.from(
    root.querySelectorAll<HTMLElement>(".bp-items:is(.is-cards, .is-grid)")
  ).map((table) => [table, table.className] as const);
  fitted.forEach(([table]) => table.classList.remove("is-cards", "is-grid"));
  const docWidth = doc.style.width;
  // The page fills the paper's width, whichever way the print dialog turns it (styles.css).
  doc.classList.add("is-browser-print");
  // The page's vh, not the window's: a print rule sized by the page's height (the item photos'
  // cap) measured in a short window left the table unfitted, and the page count one too many
  // (a blank last page on Legal, 2026-10-28).
  const pageHeight = parseFloat(
    style.getPropertyValue("--bp-browser-print-height")
  );
  withReadableStylesheet(() =>
    withPrintRules(width, () => {
      // Laid out wider by the 75 % print base, so it still fills the page (styles.css).
      doc.style.width = `calc(${width}px / var(--bp-print-scale, 1))`;
      if (pageHeight > 0)
        doc.style.setProperty("--bp-vh", `${pageHeight / 100}px`);
      withPrintMedia(() => {
        preparingBrowserPrint = true;
        try {
          layout?.();
        } finally {
          preparingBrowserPrint = false;
        }
        doc.dataset.bpPreparedWidth = String(doc.getBoundingClientRect().width);
      });
    })
  );
  doc.style.width = docWidth;
  doc.style.removeProperty("--bp-vh");
  fitted.forEach(([table, className]) => {
    // eslint-disable-next-line no-param-reassign
    table.className = className;
  });
};

/*
 * Stretch the item table to the page (view.print.stretchTable): in print, the empty filler row
 * under the last item takes what is left of the page that item ends on, so the table's side
 * rules run down to the page's foot, on a one-page document and a longer one alike (user,
 * 2026-11-01; it was one-page only). What follows the table on that page is pushed down with
 * it, never over to the next page (the slack below is kept back for that). As the E-commerce
 * template does (90ff146, a074dd1).
 *
 * The page's height is left to CSS (100vh, matched by media queries): Refrens' PDF service
 * lays the page out in a window shorter than the paper and only then prints, so a height
 * measured here was the window's. Under the print zoom Chrome scales the page margins as
 * well, so 100vh / zoom is a few px off: kept back with the slack.
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
  // The body's edge cells carry the side rules.
  const color = getComputedStyle(row.cells[0]).borderInlineStartColor;
  const width =
    parseFloat(
      getComputedStyle(wrap).getPropertyValue("--bp-column-rule-width")
    ) || 1;
  const scale = box.width / (wrap.offsetWidth || box.width);
  const room = box.width - width * scale;
  // No column rules in this design: only the table's two sides run down to the page foot.
  const cells = Array.from(row.cells).map((cell) => drawnRect(cell));
  const edges = [
    cells[0].left - box.left,
    cells[cells.length - 1].right - box.left,
  ];
  const layers = edges
    .map(
      (x) =>
        `linear-gradient(${color}, ${color}) ${compactDecimal(
          Math.min(100, Math.max(0, (x / room) * 100))
        )}% 0 / var(--bp-column-rule-width) 100% no-repeat`
    )
    .join(", ");
  return { layers, color };
};

/*
 * Pages, simulated. The document is cut into the units a page break cannot split (a section,
 * a line item with its rows, a totals group) and the units that break line by line (terms,
 * notes), in order, as laid out in one long column. Laid on pages of `page` px, they show
 * where the item table ends and how much of that page is left: the filler row takes it.
 *
 * Every position is c + k × page (FlowLength), so the filler's height comes out as a formula
 * of the page's height: in the PDF service the page's height is known only when it prints
 * (100vh), never while the template lays out (a shorter window).
 */
export interface FlowImage {
  top: number;
  measured: number;
  natural: number;
}

/*
 * A card that breaks between its lines in print: its top and bottom, its repeated top edge and
 * title (head) and its bottom edge (close), drawn on every page it spans, and the places it
 * may break: after a line ending at `fit`, the next page going on from `resume`.
 */
export interface FlowCard {
  top: number;
  bottom: number;
  head: number;
  close: number;
  breaks: { fit: number; resume: number }[];
}

export interface FlowUnit {
  top: number;
  bottom: number;
  // Breaks line by line (text) rather than moving whole.
  fluid?: boolean;
  line?: number;
  // A table's repeated heading (on every page it continues on) and its page-foot rule.
  head?: number;
  close?: number;
  // The first unit of its table (carries the heading itself).
  first?: boolean;
  // After the frame (a last-page footer): runs to the page's foot.
  tail?: boolean;
  // Images sized by the page's height (55vh, styles.css), as measured and uncapped.
  images?: FlowImage[];
  // Cards side by side (or one) that break between their lines (styles.css bp-split-frame).
  cards?: FlowCard[];
  // In the item table (group 0): its last row, lengthened when a page break follows it inside
  // the table (flowBreakFills). A group's Sub total row never is (summary rows never stretch).
  group?: number;
  row?: Element;
}

/*
 * Where a page ending at `end` (the unit's own coordinates) cuts a row of cards: each card
 * breaks after its last line that fits above its bottom edge, or moves on whole. `rest`: the
 * row's height on the next page (the tallest card's rest, its edge and title repeated); none
 * when every card moves on whole (the row goes to the next page as one).
 */
export const cutCards = (
  cards: FlowCard[],
  end: number
): { rest: number } | undefined => {
  let moved = 0;
  const rests = cards.map((card) => {
    if (card.bottom <= end) return 0;
    const at = card.breaks.filter((cut) => cut.fit + card.close <= end).pop();
    if (!at) {
      moved += 1;
      return card.bottom - card.top;
    }
    return card.head + card.bottom - at.resume;
  });
  return moved === cards.filter((card) => card.bottom > end).length
    ? undefined
    : { rest: Math.max(...rests) };
};

// styles.css .bp-large-image in print: 55 % of the page's height, 600 px at most.
const LARGE_IMAGE_SHARE = 0.55;
const LARGE_IMAGE_CAP = 600;

/*
 * An item's original images are capped by the page's height, so their height is the page's,
 * not the window's the layout was measured in. Each unit is resized for a page `vh` px tall
 * (100vh), images on one line taking the tallest's height, and every unit after it moved.
 */
export const flowAtHeight = (units: FlowUnit[], vh: number): FlowUnit[] => {
  let moved = 0;
  return units.map((unit) => {
    const top = unit.top + moved;
    const lines = new Map<number, { measured: number; now: number }>();
    (unit.images || []).forEach((image) => {
      const key = Math.round(image.top);
      const line = lines.get(key) || { measured: 0, now: 0 };
      line.measured = Math.max(line.measured, image.measured);
      line.now = Math.max(
        line.now,
        Math.min(image.natural, LARGE_IMAGE_SHARE * vh, LARGE_IMAGE_CAP)
      );
      lines.set(key, line);
    });
    lines.forEach((line) => {
      moved += line.now - line.measured;
    });
    return { ...unit, top, bottom: unit.bottom + moved };
  });
};

export interface FlowLength {
  c: number;
  k: number;
}

export interface FlowLayout {
  // The page's height, the page frame's repeated header and footer, the first page's start.
  page: number;
  head: number;
  foot: number;
  start: number;
}

const flowAt = (length: FlowLength, page: number): number =>
  length.c + length.k * page;

/*
 * The filler's height for the unit `anchor` (the last line item, the filler under it): the room
 * left on its page by it and every unit after it on that page. Undefined: no room, or a unit
 * up to the table's end is cut by a page break — where Chrome cuts it (an image or a line that
 * will not split moves down whole) is not known, so neither is the room left (a074dd1).
 */
// Kept back from the page's foot where the table ends a page the content after it does not
// share (flowFiller), on top of the stretch's own slack.
const NEXT_PAGE_KEEP = 24;

/*
 * A unit that ends this close to its page's end, either side, may fall on either page as it
 * prints (the page's height is known to within the slack, a row to within a line): where
 * things fall after it is not known, so no page break after it is filled (flowBreakFills).
 */
const FLOW_DOUBT = 24;

export interface FlowPlaced {
  page: number;
  bottom: FlowLength;
  end: FlowLength;
  // Cut by a page break: starts on an earlier page than it ends on.
  broken?: boolean;
}

/*
 * Every unit laid on pages: the page it ends on, its bottom and its page's end. `cut`: the
 * first unit a page break cuts (where Chrome cuts it is not known, so neither is anything after
 * it); `doubt`: the first unit that fits its page with less than FLOW_DOUBT to spare (it may
 * not fit in print). `nearMoves`: units that move whole to the next page though they overflow
 * by less than FLOW_DOUBT (they may fit in print): a fill on the unit before makes them move.
 */
const placeUnits = (
  units: FlowUnit[],
  layout: FlowLayout
): {
  placed: FlowPlaced[];
  cut: number;
  doubt: number;
  nearMoves: Set<number>;
} => {
  const { page, head, foot, start } = layout;
  let index = 0;
  let shift: FlowLength = { c: start, k: 0 };
  const placed: FlowPlaced[] = [];
  let cutAt = Infinity;
  let doubt = Infinity;
  const nearMoves = new Set<number>();
  const pageStart = (at: number, unit: FlowUnit): FlowLength =>
    at === 0
      ? { c: start, k: 0 }
      : { c: head + (unit.head && !unit.first ? unit.head : 0), k: at };
  const regionEnd = (at: number, unit: FlowUnit): FlowLength => ({
    c: -(unit.tail ? 0 : foot) - (unit.close || 0),
    k: at + 1,
  });
  units.forEach((unit, at) => {
    const top = (): FlowLength => ({ c: unit.top + shift.c, k: shift.k });
    const bottom = (): FlowLength => ({ c: unit.bottom + shift.c, k: shift.k });
    let broken = false;
    for (
      let guard = 0;
      guard < 200 &&
      flowAt(bottom(), page) > flowAt(regionEnd(index, unit), page) + 0.5;
      guard += 1
    ) {
      const begin = pageStart(index, unit);
      const firstOnPage = flowAt(top(), page) <= flowAt(begin, page) + 1;
      const near =
        flowAt(bottom(), page) - flowAt(regionEnd(index, unit), page) <
        FLOW_DOUBT;
      const cardCut = unit.cards
        ? cutCards(
            unit.cards,
            flowAt(regionEnd(index, unit), page) - flowAt(shift, page)
          )
        : undefined;
      if (unit.cards && (cardCut || firstOnPage)) {
        broken = true;
        // Cut between the cards' lines (none fits on a page of its own: cut at its foot, as
        // Chrome does): the row goes on at the next page's top with what is left of it.
        index += 1;
        const rest =
          cardCut?.rest ??
          unit.bottom -
            (flowAt(regionEnd(index - 1, unit), page) - flowAt(shift, page));
        shift = { c: head + rest - unit.bottom, k: index };
      } else if (!unit.fluid && !firstOnPage) {
        // Moves whole to the next page, its spacing above it dropped.
        if (near) nearMoves.add(at);
        index += 1;
        const next = pageStart(index, unit);
        const was = top();
        shift = { c: shift.c + next.c - was.c, k: shift.k + next.k - was.k };
      } else {
        // Breaks where the page ends and runs on at the next page's start (a table's heading
        // repeated), a line or two later for text (the line across the break, orphans).
        const cut = regionEnd(index, unit);
        broken = true;
        cutAt = Math.min(cutAt, at);
        if (near) doubt = Math.min(doubt, at);
        index += 1;
        const next = {
          c: head + (unit.head || 0) + (unit.fluid ? 2 * (unit.line || 0) : 0),
          k: index,
        };
        shift = { c: shift.c + next.c - cut.c, k: shift.k + next.k - cut.k };
      }
    }
    if (
      !unit.tail &&
      flowAt(regionEnd(index, unit), page) - flowAt(bottom(), page) < FLOW_DOUBT
    )
      doubt = Math.min(doubt, at);
    placed.push({
      page: index,
      bottom: bottom(),
      end: regionEnd(index, unit),
      broken,
    });
  });
  return { placed, cut: cutAt, doubt, nearMoves };
};

const roomBelow = (from: FlowPlaced): FlowLength => ({
  c: from.end.c - from.bottom.c,
  k: from.end.k - from.bottom.k,
});

export const flowFiller = (
  units: FlowUnit[],
  anchor: number,
  layout: FlowLayout,
  // Only where the whole document is one page (the preview).
  lastPageOnly = false
): FlowLength | undefined => {
  const { page } = layout;
  const { placed, cut } = placeUnits(units, layout);
  const at = placed[anchor];
  if (!at || cut <= anchor) return undefined;
  if (lastPageOnly && placed.some((unit) => unit.page !== 0)) return undefined;
  /*
   * What follows the table runs over to the next page (terms carrying on line by line): the
   * page is full already, and a space under the table only pushed a line over, then a tall
   * last-page footer onto a page of its own (quotation A00052-D, 2026-11-12). No space.
   */
  const firstNext = placed.findIndex(
    (unit, n) => n > anchor && unit.page > at.page
  );
  if (firstNext > 0 && placed[firstNext].broken) return undefined;
  const after = placed
    .slice(anchor + 1)
    .filter((unit) => unit.page === at.page);
  /*
   * What follows the table starts on the next page: the table still runs down this page (user,
   * 2026-11-04: half a page left empty under it), short of its foot by NEXT_PAGE_KEEP. A space
   * sized to the last pixel moved whole to the next page when the page came out a little
   * shorter, an empty table on a page of its own (real PDF of invoice 0024, 2026-11-03).
   */
  if (!after.length && placed.length > anchor + 1) {
    const kept = roomBelow(at);
    const rest = { c: kept.c - NEXT_PAGE_KEEP, k: kept.k };
    return flowAt(rest, page) > 0 ? rest : undefined;
  }
  const best = (after.length ? after : [at])
    .map(roomBelow)
    .reduce((least, next) =>
      flowAt(next, page) < flowAt(least, page) ? next : least
    );
  return flowAt(best, page) > 0 ? best : undefined;
};

/*
 * Every page the item table runs over, not only its last (user, 2026-11-12: "table stretch
 * nahi hua print and PDF me", as the E-commerce template, 5 Nov): where a line item moves
 * whole to the next page, the item before it is lengthened by the room it left, so the table
 * runs down to that page's foot. Only up to the first unit a page break cuts or that ends
 * too near its page's end to know which page it prints on.
 */
export const flowBreakFills = (
  units: FlowUnit[],
  anchor: number,
  layout: FlowLayout,
  // Room kept back at each break; and whether the other measure agrees up to a unit.
  keep = 0,
  agree: (upTo: number) => boolean = () => true
): { unit: number; room: FlowLength }[] => {
  const { placed, cut, doubt, nearMoves } = placeUnits(units, layout);
  const limit = Math.min(cut, doubt);
  // A fill that makes a unit move which might have fitted shifts every page after it onto the
  // layout simulated here: only safe while none of the table's own units (its Total row too)
  // is too near its page's foot (2026-11-12: page 2 came out a little fuller, the Total row
  // went to a page alone). What follows the table (terms) flows on whatever it is.
  const lastOfTable = units.reduce(
    (last, unit, at) => (unit.group === 0 ? at : last),
    anchor
  );
  const mayForce = doubt > lastOfTable && cut > lastOfTable;
  const fills: { unit: number; room: FlowLength }[] = [];
  for (let at = 0; at < anchor && at + 1 < limit; at += 1) {
    const room = roomBelow(placed[at]);
    const filled =
      units[at].group === 0 &&
      Boolean(units[at].row) &&
      units[at + 1].group === 0 &&
      placed[at + 1].page > placed[at].page &&
      flowAt(room, layout.page) > keep &&
      agree(at + 1);
    if (filled) fills.push({ unit: at, room });
    // A unit that only just overflowed may fit in print: where nothing above it fills the
    // page, which page it lands on (and everything after) is not known.
    if (nearMoves.has(at + 1) && !(filled && mayForce)) {
      if (filled) fills.pop();
      break;
    }
  }
  return fills;
};

/* The units of an element's content, in order, positions relative to `origin` (layout px). */
const flowUnits = (
  container: Element,
  origin: number,
  scale: number,
  filler: Element
): { units: FlowUnit[]; anchor: number } => {
  const units: FlowUnit[] = [];
  let anchor = -1;
  const box = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return {
      top: (rect.top - origin) / scale,
      bottom: (rect.bottom - origin) / scale,
    };
  };
  const avoids = (value: string) => value.startsWith("avoid");
  const imagesIn = (els: Element[]): FlowImage[] =>
    els.flatMap((el) =>
      Array.from(
        el.querySelectorAll<HTMLImageElement>("img.bp-large-image")
      ).map((img) => {
        const at = box(img);
        const room =
          (img.parentElement?.getBoundingClientRect().width || 0) / scale;
        // styles.css draws it the row's full width (width: 100%), a small photo scaled up too:
        // capped at its own size, a 500 px photo printed 140 px taller than reckoned, the page's
        // fill ran over and the table's foot printed on a page of its own (invoice 0024,
        // 2026-11-13).
        const natural =
          img.naturalWidth > 0
            ? img.naturalHeight * (room / img.naturalWidth)
            : at.bottom - at.top;
        return { top: at.top, measured: at.bottom - at.top, natural };
      })
    );
  const mergeInto = (into: FlowUnit, unit: FlowUnit, images: FlowImage[]) => {
    /* eslint-disable no-param-reassign */
    into.bottom = Math.max(into.bottom, unit.bottom);
    into.fluid = Boolean(into.fluid && unit.fluid);
    if (images.length) into.images = [...(into.images || []), ...images];
    if (unit.row) into.row = unit.row;
    if (unit.group !== undefined) into.group = unit.group;
    /* eslint-enable no-param-reassign */
  };
  const push = (unit: FlowUnit, joinPrevious: boolean, els: Element[] = []) => {
    const images = imagesIn(els);
    const last = units[units.length - 1];
    if (joinPrevious && last) {
      mergeInto(last, unit, images);
      return;
    }
    units.push(images.length ? { ...unit, images } : unit);
  };
  const lineOf = (style: CSSStyleDeclaration) =>
    parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 13) * 1.4;
  const table = (el: HTMLTableElement, joinPrevious: boolean) => {
    const head =
      el.tHead && getComputedStyle(el.tHead).display === "table-header-group"
        ? box(el.tHead).bottom - box(el.tHead).top
        : 0;
    const closer = el.querySelector(":scope > tfoot.bp-items-corners");
    const close =
      closer && getComputedStyle(closer).display === "table-footer-group"
        ? Math.max(0, box(closer).bottom - box(closer).top)
        : 0;
    let first = true;
    let afterAvoid = joinPrevious;
    const isItems = el.classList.contains("bp-items");
    Array.from(el.tBodies).forEach((body) => {
      const bodyStyle = getComputedStyle(body);
      if (bodyStyle.display === "none") return;
      const rows = avoids(bodyStyle.breakInside)
        ? [body]
        : Array.from(body.rows).filter((row) => row !== filler);
      rows.forEach((row) => {
        const style = getComputedStyle(row);
        if (style.display === "none") return;
        const at = box(row);
        if (at.bottom - at.top <= 0) return;
        const join = !first && (afterAvoid || avoids(style.breakBefore));
        push(
          {
            top: first && el.tHead ? box(el.tHead).top : at.top,
            bottom: at.bottom,
            line: lineOf(style),
            head,
            close,
            first,
            ...(isItems
              ? {
                  group: 0,
                  row:
                    row instanceof HTMLTableRowElement &&
                    !row.matches(".bp-group-total-row, .bp-total-row")
                      ? row
                      : undefined,
                }
              : {}),
          },
          join || (first && joinPrevious),
          [row]
        );
        first = false;
        afterAvoid = avoids(style.breakAfter);
      });
      if (body.contains(filler)) anchor = units.length - 1;
    });
  };
  // A display: contents box (the card grid's sections) lays its children out in its parent's
  // place: they are measured as the parent's own.
  // A display: contents box (the card grid's sections) lays its children out in its parent's
  // place: they are measured as the parent's own.
  const flatChildren = (parent: Element): Element[] =>
    Array.from(parent.children).flatMap((child) =>
      getComputedStyle(child).display === "contents" &&
      !(child instanceof HTMLTableElement)
        ? flatChildren(child)
        : [child]
    );
  // A card's lines (a field's label and value, side by side, are one), its edges and title.
  const splitCard = (card: Element): FlowCard => {
    const frame = card.querySelector(
      ":scope > .bp-split-frame"
    ) as HTMLTableElement;
    const at = box(card);
    const height = (el: Element | null) => {
      if (!el) return 0;
      const edge = box(el);
      return edge.bottom - edge.top;
    };
    const bands: { top: number; bottom: number }[] = [];
    Array.from(
      frame.querySelectorAll(
        ":scope > tbody :is(.bp-party-name, .bp-party-address, .bp-field-label, .bp-field-value, .bp-kv-label, .bp-kv-value)"
      )
    )
      .filter((el) => getComputedStyle(el).display !== "none")
      .map(box)
      .filter((line) => line.bottom > line.top)
      .sort((a, b) => a.top - b.top)
      .forEach((line) => {
        const last = bands[bands.length - 1];
        if (last && line.top < last.bottom - 1)
          last.bottom = Math.max(last.bottom, line.bottom);
        else bands.push({ ...line });
      });
    return {
      top: at.top,
      bottom: at.bottom,
      head: height(frame.tHead),
      close: height(frame.tFoot),
      breaks: bands.slice(0, -1).map((band, n) => ({
        fit: band.bottom,
        resume: bands[n + 1].top,
      })),
    };
  };
  const walk = (parent: Element) => {
    const children = flatChildren(parent).filter((child) => {
      if (child === filler) return false;
      const style = getComputedStyle(child);
      if (style.display === "none" || style.position === "fixed") return false;
      const at = box(child);
      return at.bottom - at.top > 0 || style.display === "contents";
    });
    let afterAvoid = false;
    let i = 0;
    while (i < children.length) {
      // Side by side (the two party cards, bank details beside the totals): one unit, a break
      // only above or below the row.
      const row = [children[i]];
      let rowBottom = box(children[i]).bottom;
      while (
        i + row.length < children.length &&
        // Side by side, not merely overlapping by a rule (the totals' table sits a couple of
        // pixels into the item table's foot, styles.css).
        box(children[i + row.length]).top < rowBottom - 4
      ) {
        rowBottom = Math.max(rowBottom, box(children[i + row.length]).bottom);
        row.push(children[i + row.length]);
      }
      const child = row[0];
      const style = getComputedStyle(child);
      const join = afterAvoid || avoids(style.breakBefore);
      // The document details break between fields (styles.css): measured field by field, the
      // logo beside them (a line or two at the top) going with the first.
      const details = child.classList.contains("bp-header")
        ? child.querySelector(":scope > .bp-header-main")
        : null;
      if (details) {
        walk(details);
        afterAvoid = false;
        i += row.length;
        // eslint-disable-next-line no-continue
        continue;
      }
      const cards = row.every(
        (el) =>
          el.matches(".bp-card") &&
          el.querySelector(":scope > .bp-split-frame") &&
          !avoids(getComputedStyle(el).breakInside) &&
          getComputedStyle(el.querySelector(".bp-split-frame") as Element)
            .display === "table"
      )
        ? row.map(splitCard)
        : undefined;
      if (cards) {
        // The party, shipping and transport cards in print break between their lines, each
        // piece with its edges and title (styles.css bp-split-frame): placed line by line.
        push({ top: box(child).top, bottom: rowBottom, cards }, join, row);
        if (row.some((el) => el.contains(filler))) anchor = units.length - 1;
      } else if (
        row.length > 1 &&
        row.some((el) => el.classList.contains("bp-bottom-main"))
      ) {
        // The bank details, terms and notes beside the totals (Simple's bottom): only what lies
        // level with the totals goes as one; the terms below them break line by line. Taken as
        // one unit, the whole column (pages of terms) fitted no page, the stretch filled the
        // table's last page and the totals went to the next (PDF, 2026-11-12).
        const main = row.find((el) =>
          el.classList.contains("bp-bottom-main")
        ) as Element;
        // Level with what the column beside holds, not its box: the right column stretches to
        // the left one's height (Simple's bottom part), and as a box it joined every line of
        // the terms into one block.
        const besideBottom = Math.max(
          ...row
            .filter((el) => el !== main)
            .map((el) => {
              const shown = Array.from(el.children).filter(
                (part) => getComputedStyle(part).display !== "none"
              );
              return shown.length
                ? Math.max(...shown.map((part) => box(part).bottom))
                : box(el).top;
            })
        );
        const before = units.length;
        walk(main);
        if (units.length === before) {
          push({ top: box(child).top, bottom: rowBottom }, join, row);
        } else {
          const lead = units[before];
          lead.top = Math.min(lead.top, box(child).top);
          lead.fluid = false;
          while (
            units.length > before + 1 &&
            units[before + 1].top < besideBottom
          ) {
            const next = units.splice(before + 1, 1)[0];
            mergeInto(lead, next, next.images || []);
          }
          lead.bottom = Math.max(lead.bottom, besideBottom);
          if (join && before > 0) {
            units.splice(before, 1);
            mergeInto(units[before - 1], lead, lead.images || []);
          }
        }
      } else if (row.length > 1) {
        push({ top: box(child).top, bottom: rowBottom }, join, row);
        if (row.some((el) => el.contains(filler))) anchor = units.length - 1;
      } else if (child instanceof HTMLTableElement) {
        table(child, join);
      } else if (avoids(style.breakInside)) {
        push({ ...box(child) }, join, [child]);
        if (child.contains(filler)) anchor = units.length - 1;
      } else if (
        Array.from(child.children).some(
          (el) => !["inline", "none"].includes(getComputedStyle(el).display)
        )
      ) {
        const before = units.length;
        walk(child);
        if (join && units.length > before + 1 && before > 0) {
          // The first unit inside goes with what came before it (the unit before `before`;
          // joined to the last unit inside, a whole line item and its images went missing
          // and the stretch filled a page too many, 2026-11-02).
          const firstInside = units.splice(before, 1)[0];
          mergeInto(units[before - 1], firstInside, firstInside.images || []);
          if (anchor >= before) anchor -= 1;
        }
      } else {
        push({ ...box(child), fluid: true, line: lineOf(style) }, join, [
          child,
        ]);
      }
      afterAvoid = avoids(getComputedStyle(row[row.length - 1]).breakAfter);
      i += row.length;
    }
  };
  walk(container);
  return { units, anchor };
};

/* The filler's room from the document as laid out, for pages of any height. */
const measureFlow = (
  doc: HTMLElement,
  filler: HTMLElement,
  printing: boolean
):
  | {
      units: FlowUnit[];
      anchor: number;
      layout: Omit<FlowLayout, "page">;
      scale: number;
    }
  | undefined => {
  const body = doc.querySelector<HTMLElement>(".bp-page-body");
  if (!body?.parentElement) return undefined;
  const scale = layoutScale(body.parentElement, body);
  const origin = printing
    ? document.documentElement.getBoundingClientRect().top
    : doc.getBoundingClientRect().top;
  const bodyBox = body.getBoundingClientRect();
  const height = (el: Element | null | undefined) =>
    el && getComputedStyle(el).display !== "none"
      ? el.getBoundingClientRect().height / scale
      : 0;
  const pageFrame = doc.querySelector(".bp-page-frame");
  // The page frame's header and footer repeat on every page in a browser's print (the
  // letterhead on every page); the PDF service stamps its own, and hides these.
  const head = printing
    ? height(pageFrame?.querySelector(":scope > thead"))
    : 0;
  const foot = printing
    ? height(pageFrame?.querySelector(":scope > tfoot"))
    : 0;
  const { units, anchor } = flowUnits(body, bodyBox.top, scale, filler);
  if (anchor < 0 || !units.length) return undefined;
  // The body's own bottom goes with its last unit; what follows (a last-page footer) runs to
  // the page's foot.
  units[units.length - 1].bottom = Math.max(
    units[units.length - 1].bottom,
    bodyBox.height / scale
  );
  const docBottom = (doc.getBoundingClientRect().bottom - bodyBox.top) / scale;
  const contentEnd = units[units.length - 1].bottom + (printing ? foot : 0);
  if (docBottom > contentEnd + 0.5) {
    units.push({
      top: units[units.length - 1].bottom,
      bottom: docBottom - (printing ? foot : 0),
      tail: true,
    });
  }
  return {
    units,
    anchor,
    layout: { head, foot, start: (bodyBox.top - origin) / scale },
    scale,
  };
};

/*
 * The preview always stretches (user, 2026-10-31), whatever the business's and the document's
 * toggles say: on screen the document is laid on A4 sheets as tall as its drawn width × 297 /
 * 210, and the filler takes what is left of the sheet the table ends on — one sheet or more
 * (user, 2026-11-01). Not for a Pageless document, nor where the table reads as cards or a
 * grid (fitItemsToScreen; the filler is hidden there). Measured with the filler out of the
 * layout, so a height reported to Lydia (ceres:content-height) never feeds back.
 */
const A4_ASPECT = 297 / 210;

const stretchOnScreen = (doc: HTMLElement, filler: HTMLElement): void => {
  const table = filler.closest<HTMLElement>(".bp-items");
  if (
    doc.classList.contains("is-pageless") ||
    table?.classList.contains("is-cards") ||
    table?.classList.contains("is-grid")
  ) {
    return;
  }
  const sheet = doc.offsetWidth;
  if (sheet <= 0 || browserPrinting) return;
  const flow = measureFlow(doc, filler, false);
  if (!flow) return;
  const page = sheet * A4_ASPECT;
  // Only where the whole document is one sheet: the preview shows no sheet edges, so space
  // filling a sheet's foot with more content below read as a stray gap above the totals
  // (user, 2026-11-03, twice). Print fills each page's foot (pages show).
  const room = flowFiller(
    flowAtHeight(flow.units, page),
    flow.anchor,
    { ...flow.layout, page },
    true
  );
  const spare = room ? Math.floor(flowAt(room, page)) : 0;
  filler.style.setProperty("--bp-filler-height", `${Math.max(0, spare)}px`);
  if (spare > 0) doc.classList.add("is-filled");
};

/*
 * Print: the page's height (page area, CSS px) is matched with a media query per range of
 * heights over every size a page can be, each giving the filler its formula of 100vh.
 */
const STRETCH_STYLE_ID = "bp-stretch-pages";
const PAGE_HEIGHTS: [number, number] = [280, 1800];

/*
 * An item lengthened at a page break runs to the page's foot less this (as the E-commerce
 * template): its row's rule then lands on the page piece's closing rule, not above it.
 */
const BREAK_SLACK = 4;

export const stretchPrintRules = (
  units: FlowUnit[],
  anchor: number,
  layout: Omit<FlowLayout, "page">,
  zoom: number,
  slack: number,
  // Only on a page this wide (CSS px, min and max): laid out at another width (a browser's
  // print dialog turned the paper), the units' heights are not these.
  pageWidth?: [number, number],
  /*
   * The same units measured with the text a touch wider than it prints (is-flow-measure):
   * Chrome prints text a little wider than it lays it out, so each row prints between the two
   * measures. A page break inside the table is filled only where both put the units on the
   * same pages up to it, by the wider measure's room (the smaller). Without it, none.
   */
  wide?: FlowUnit[]
): string => {
  const widthQuery = pageWidth
    ? ` and (min-width: ${Math.floor(
        pageWidth[0]
      )}px) and (max-width: ${Math.ceil(pageWidth[1])}px)`
    : "";
  const z = compactDecimal(zoom);
  const breakKeep = Math.max(BREAK_SLACK, slack);
  const length = (room: FlowLength, keep: number) => {
    const c = Math.floor(room.c - keep);
    return `max(0px, calc(${compactDecimal(room.k)} * 100vh / ${z} ${
      c < 0 ? "-" : "+"
    } ${Math.abs(c)}px))`;
  };
  const body = (height: number): string => {
    const page = height / zoom;
    const pageLayout = { ...layout, page };
    const sized = flowAtHeight(units, height);
    const parts: string[] = [];
    /*
     * The space under the last item by the smaller of the two measures (as the E-commerce
     * template): sized to the narrow one alone it came out a few px too tall, a line of the
     * terms went over to the next page, and a tall last-page footer then took a page of its
     * own (quotation A00052-D, landscape, 2026-11-12).
     */
    const narrowRoom = flowFiller(sized, anchor, pageLayout);
    const wideRoom =
      wide && wide.length === units.length
        ? flowFiller(flowAtHeight(wide, height), anchor, pageLayout)
        : narrowRoom;
    const room =
      narrowRoom && wideRoom
        ? [narrowRoom, wideRoom].reduce((least, next) =>
            flowAt(next, page) < flowAt(least, page) ? next : least
          )
        : undefined;
    if (room && flowAt(room, page) > slack)
      parts.push(
        `.bp-doc.is-stretch .bp-items .bp-filler { --bp-filler-height: ${length(
          room,
          slack
        )}; }`
      );
    if (wide && wide.length === units.length) {
      const wideSized = flowAtHeight(wide, height);
      const narrowPages = placeUnits(sized, pageLayout).placed.map(
        (unit) => unit.page
      );
      const widePages = placeUnits(wideSized, pageLayout).placed.map(
        (unit) => unit.page
      );
      const agree = (upTo: number) =>
        widePages.slice(0, upTo + 1).every((at, n) => at === narrowPages[n]);
      flowBreakFills(wideSized, anchor, pageLayout, breakKeep, agree).forEach(
        (fill) =>
          parts.push(
            `.bp-doc.is-stretch .bp-items tr[data-bp-break="${
              fill.unit
            }"] > td::after { content: ""; display: block; height: ${length(
              fill.room,
              breakKeep
            )}; }`
          )
      );
    }
    return parts.join(" ");
  };
  const rules: string[] = [];
  let open: { from: number; to: number; css: string } | undefined;
  const close = () => {
    if (open?.css)
      rules.push(
        `@media print and (min-height: ${open.from}px) and (max-height: ${
          open.to + 0.999
        }px)${widthQuery} { ${open.css} }`
      );
    open = undefined;
  };
  for (let height = PAGE_HEIGHTS[0]; height <= PAGE_HEIGHTS[1]; height += 1) {
    const css = body(height);
    if (open && open.css === css) {
      open.to = height;
    } else {
      close();
      open = { from: height, to: height, css };
    }
  }
  close();
  return rules.join("\n");
};

/* The print size (zoomSize): the renderer's `@media print { html { zoom } }`, or the template's. */
const printZoom = (): number => drawnPrintZoom();

/*
 * The filler row shows (styles.css, .bp-doc.is-filled) in print when the business stretches
 * its tables, and on screen while a sheet has room to fill. Each run starts from no filler:
 * when print starts the print rules decide, and when it ends the screen's comes back.
 */
/*
 * The summary rows never stretch (user, 2026-11-02): a group's Sub total closing the item list
 * stays on the Total row, and the empty space goes above it, under the last item.
 */
const placeFiller = (filler: HTMLElement): void => {
  let before: Element | null = filler;
  while (
    before?.previousElementSibling?.classList.contains("bp-group-total-row")
  ) {
    before = before.previousElementSibling;
  }
  if (before && before !== filler) before.before(filler);
};

export const stretchItemTable = (root: ParentNode = document): void => {
  const doc = root.querySelector<HTMLElement>(".bp-doc");
  const filler = doc?.querySelector<HTMLElement>(".bp-items .bp-filler");
  const frame = doc?.querySelector<HTMLElement>(".bp-page-frame");
  if (!doc || !filler || !frame) return;
  placeFiller(filler);
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  if (printing && keepPreparedStretch()) return;
  filler.style.removeProperty("--bp-filler-height");
  doc.classList.remove("is-filled");
  const wrap = doc.querySelector<HTMLElement>(".bp-items-scroll");
  const table = doc.querySelector<HTMLTableElement>(".bp-items");
  wrap?.style.removeProperty("--bp-column-rules");
  wrap?.style.removeProperty("--bp-column-rule-color");
  if (!printing) {
    stretchOnScreen(doc, filler);
    return;
  }
  if (!doc.classList.contains("is-stretch")) return;
  // Measured without the filler (is-filled off) and no row lengthened at a page break (marks
  // off), then shown with the rules' heights. Measured twice: as laid out, and with the text a
  // touch wider (is-flow-measure, styles.css), as Chrome prints it.
  doc
    .querySelectorAll("[data-bp-break]")
    .forEach((row) => row.removeAttribute("data-bp-break"));
  const flow = measureFlow(doc, filler, true);
  doc.classList.add("is-flow-measure");
  const wide = measureFlow(doc, filler, true);
  doc.classList.remove("is-flow-measure");
  flow?.units.forEach((unit, at) => {
    if (unit.group === 0 && unit.row instanceof HTMLTableRowElement)
      unit.row.setAttribute("data-bp-break", String(at));
  });
  doc.classList.add("is-filled");
  remarkJointCorners(doc);
  const rules = wrap && table ? columnRules(wrap, table) : undefined;
  if (wrap && rules) {
    wrap.style.setProperty("--bp-column-rules", rules.layers);
    wrap.style.setProperty("--bp-column-rule-color", rules.color);
  }
  const htmlZoom = printZoom();
  // The filler sits inside the document's 75 % print base too: a page is 100vh over both.
  const zoom =
    htmlZoom *
    (parseFloat(getComputedStyle(doc).getPropertyValue("--bp-print-scale")) ||
      1);
  const slack =
    STRETCH_SLACK +
    (htmlZoom > 1 ? STRETCH_ZOOM_SLACK * (1 - 1 / htmlZoom) : 0);
  let style = document.getElementById(STRETCH_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STRETCH_STYLE_ID;
    document.head.appendChild(style);
  }
  /*
   * A browser's own print was laid out at the document's own orientation (prepareBrowserPrint):
   * the stretch holds on a page of that width only, give or take the browser's margins; turned,
   * the table is left as it is (as the E-commerce template, 60f1e76).
   */
  const laid = doc.classList.contains("is-browser-print")
    ? doc.getBoundingClientRect().width
    : 0;
  const pageWidth: [number, number] | undefined =
    laid > 0
      ? [
          (laid / htmlZoom - BROWSER_WIDTH_SLACK) * htmlZoom,
          (laid / htmlZoom + BROWSER_WIDTH_SLACK) * htmlZoom,
        ]
      : undefined;
  const css = flow
    ? stretchPrintRules(
        flow.units,
        flow.anchor,
        flow.layout,
        zoom,
        slack,
        pageWidth,
        wide?.units
      )
    : "";
  if (style.textContent !== css) style.textContent = css;
};

/*
 * The tax and HSN summaries' "Total Tax In Words" as refrens.com writes it: "ZERO RUPEE AND
 * EIGHTEEN PAISE ONLY" in rupees, and in the document's own currency otherwise ("… DOLLARS AND
 * EIGHTEEN CENTS ONLY") — the shared widgets spell every amount in rupees and their words
 * helper is fixed at build time, so each line is rewritten after the render from its table's
 * Total row (the last cell, the total tax).
 */
export const respellTaxWords = (root: ParentNode = document): void => {
  const doc = root.querySelector<HTMLElement>(".bp-doc");
  const currency = (doc?.dataset.bpCurrency || "INR").toUpperCase();
  if (!doc) return;
  doc
    .querySelectorAll<HTMLElement>(
      '[data-section="hsn"] .ceres-table-words, [data-section="tax-summary"] .ceres-table-words'
    )
    .forEach((cell) => {
      const current = cell.textContent || "";
      let words = current;
      if (currency === "INR") {
        words = current.replace(/\bZERO RUPEES\b/, "ZERO RUPEE");
      } else {
        const table = cell.closest("table");
        const total = [...(table?.querySelectorAll("tr") || [])].find(
          (row) => row.firstElementChild?.textContent?.trim() === "Total"
        );
        const last = total?.lastElementChild?.textContent || "";
        const amount = Number(last.replace(/[^0-9.-]/g, ""));
        if (!last || !Number.isFinite(amount)) return;
        const label = current.split(":")[0];
        words = `${label}: ${foreignAmountInWords(
          amount,
          currency
        ).toUpperCase()}`;
      }
      if (current !== words) cell.textContent = words;
    });
};

/*
 * The item table on a phone or tablet screen (styles.css, "phones and tablets"), as refrens.com
 * lays out its own invoice pages (user request, 2026-10-24): narrower than PHONE_WIDTH every
 * item reads as a card (is-cards); narrower than an A4 page (PAPER_WIDTH, 794 px) the headings
 * stay in a row and each item's name runs across the table above its figures (is-grid),
 * scrolling sideways only when the figures cannot fit. A screen as wide as the page, and
 * print, keep the table as it is, so the preview at A4 width matches the PDF (refrens.com
 * switches at 992 px, but here the page sits in the host's frame, often narrower on a laptop).
 */
const PHONE_WIDTH = 576;
const PAPER_WIDTH = 794;

/*
 * The summaries on a phone screen (user request, 2026-10-24): each row reads as a heading |
 * figure pair per column, one under another (styles.css, "summaries on a phone"). Each body
 * and footer cell is given its column's heading, both heading rows joined ("IGST Rate"); the
 * footer's "Total" and the words row span the table and take none.
 */
/**
 *
 * @param table
 */
function labelSummaryCells(table: HTMLTableElement): void {
  const labels: string[] = [];
  Array.from(table.tHead?.rows ?? []).forEach((row) => {
    let column = 0;
    Array.from(row.cells).forEach((cell) => {
      const caption = cell.textContent?.trim() ?? "";
      for (let i = 0; i < cell.colSpan; i += 1) {
        labels[column + i] = [labels[column + i], caption]
          .filter(Boolean)
          .join(" ");
      }
      column += cell.colSpan;
    });
  });
  const rows = [
    ...Array.from(table.tBodies).flatMap((body) => Array.from(body.rows)),
    ...Array.from(table.tFoot?.rows ?? []),
  ];
  rows.forEach((row) => {
    let column = 0;
    Array.from(row.cells).forEach((cell, index) => {
      const footerTotal =
        row.parentElement === table.tFoot &&
        index === 0 &&
        row.cells.length > 1;
      const label = cell.colSpan === 1 && !footerTotal ? labels[column] : "";
      if (label) cell.dataset.label = label;
      else delete cell.dataset.label;
      column += cell.colSpan;
    });
  });
}

/* A table that grows after it was fitted (a font, a style set late) is fitted again. */
let fitTimer = 0;
let tableWatch: ResizeObserver | undefined;
const refitSoon = (): void => {
  window.clearTimeout(fitTimer);
  // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
  fitTimer = window.setTimeout(() => fitItemsToScreen(), 0);
};

/*
 * The details strip (user, 2026-11-12: a long document number ran into the Date beside it). A
 * value that cannot wrap (a document number, a code, a date) takes as many of the strip's
 * columns as it needs, so the next detail moves along or down instead of being written over;
 * one wider than the whole strip gets a row of its own and breaks inside it. Measured afresh
 * at every width: the preview, a phone, the PDF service and a browser's print.
 */
let detailsWatch: ResizeObserver | undefined;
export const fitDetails = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLElement>(".bp-details").forEach((grid) => {
    if (typeof ResizeObserver === "function") {
      detailsWatch ??= new ResizeObserver(refitSoon);
      detailsWatch.observe(grid);
    }
    const cells = Array.from(grid.querySelectorAll<HTMLElement>(".bp-detail"));
    cells.forEach((cell) => {
      cell.style.removeProperty("grid-column");
      cell.classList.remove("is-squeezed");
    });
    const style = getComputedStyle(grid);
    const columns = style.gridTemplateColumns
      .split(" ")
      .map((size) => parseFloat(size))
      .filter((size) => size > 0);
    if (columns.length < 2) return;
    const column = columns[0];
    const gap = parseFloat(style.columnGap) || 0;
    cells.forEach((cell) => {
      const value = cell.querySelector<HTMLElement>(".bp-detail-value");
      if (!value || cell.offsetParent === null || value.clientWidth <= 0)
        return;
      if (value.scrollWidth <= value.clientWidth + 1) return;
      // In the column's own units: the ratio holds under any zoom.
      const needed = (value.scrollWidth / value.clientWidth) * column;
      const span = Math.ceil((needed + gap) / (column + gap) - 0.001);
      if (span >= columns.length) {
        cell.style.setProperty("grid-column", "1 / -1");
        if (needed > columns.length * column + (columns.length - 1) * gap)
          cell.classList.add("is-squeezed");
      } else {
        cell.style.setProperty("grid-column", `span ${span}`);
      }
    });
  });
};

/*
 * The totals' figure column lines up with the item table's last column (user, 2026-11-16: "as
 * the E-commerce template"): its left rule falls on the rule before that column. A figure wider
 * than the column takes the last two (or more) columns instead, so the rule still lands on one
 * of the item table's. Set as a share of the width, so it holds at every print size; measured
 * again with every fit (screen, the PDF service, a browser's print).
 */
export const alignTotalsColumn = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLElement>(".bp-doc").forEach((doc) => {
    const items = doc.querySelector<HTMLTableElement>(".bp-items");
    const totals = doc.querySelector<HTMLTableElement>(".bp-totals-table");
    if (!items || !totals) return;
    const clear = () => {
      totals.style.removeProperty("--bp-value-share");
      totals.classList.remove("is-aligned");
    };
    const head = items.querySelector("thead > tr");
    const cells = head ? (Array.from(head.children) as HTMLElement[]) : [];
    const table = items.getBoundingClientRect();
    if (
      cells.length < 2 ||
      table.width <= 0 ||
      items.classList.contains("is-cards") ||
      items.classList.contains("is-grid")
    ) {
      clear();
      return;
    }
    // The figures' own width: the column at its narrowest.
    totals.classList.remove("is-aligned");
    totals.classList.add("is-measuring");
    const needed = Math.max(
      0,
      ...Array.from(
        totals.querySelectorAll<HTMLElement>(".ceres-subtotal-value")
      )
        .filter((cell) => cell.offsetParent !== null)
        .map((cell) => cell.getBoundingClientRect().width)
    );
    totals.classList.remove("is-measuring");
    const box = totals.getBoundingClientRect();
    if (box.width <= 0) {
      clear();
      return;
    }
    // From the rule before the last column (the previous cell's end rule), leftwards.
    let span = 1;
    const ruleAt = (count: number) =>
      cells[cells.length - count].getBoundingClientRect().left - 1;
    while (span < cells.length - 1 && table.right - ruleAt(span) < needed - 0.5)
      span += 1;
    const share = ((box.right - ruleAt(span)) / box.width) * 100;
    totals.style.setProperty("--bp-value-share", `${share.toFixed(4)}%`);
    totals.classList.add("is-aligned");
  });
};

export const fitItemsToScreen = (root: ParentNode = document): void => {
  removeHiddenSymbol(root);
  fitDetails(root);
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  root.querySelectorAll<HTMLElement>(".bp-items").forEach((table) => {
    if (typeof ResizeObserver === "function") {
      tableWatch ??= new ResizeObserver(refitSoon);
      tableWatch.observe(table);
    }
    const width = document.documentElement.clientWidth;
    let layout = "";
    if (!printing && table.parentElement && width < PAPER_WIDTH) {
      layout = width < PHONE_WIDTH ? "is-cards" : "is-grid";
    }
    // Only a change of layout touches the classes, so the table's own resize does not loop.
    ["is-cards", "is-grid"].forEach((name) =>
      table.classList.toggle(name, name === layout)
    );
  });
  // The preview's A4 sheet, on the layout just chosen (print sets its own stretch). Measured
  // without the filler and set to the same height again, so the table's resize does not loop.
  if (!printing) stretchItemTable(root);
  root.querySelectorAll<HTMLElement>(".bp-widget-table").forEach((section) => {
    const table = section.querySelector<HTMLTableElement>(".ceres-table");
    if (!table) return;
    labelSummaryCells(table);
    section.classList.toggle(
      "is-stacked",
      !printing && document.documentElement.clientWidth < PHONE_WIDTH
    );
  });
  alignTotalsColumn(root);
};

/* Runs the after-render fixes each time the renderer draws the document or the window resizes. */
/*
 * HSN and Tax Summary columns share the width equally (user request, 2026-10-23). The shared
 * widget gives the "Total Tax In Words" row colspan 99, which a fixed-layout table reads as 99
 * columns; it is set to the table's real column count, then the table is marked even
 * (styles.css lays it out fixed only then).
 */
const SUMMARY_EVEN =
  '.bp-widget-table:is([data-section="hsn"], [data-section="tax-summary"]) .ceres-table';

export const evenSummaryColumns = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLTableElement>(SUMMARY_EVEN).forEach((table) => {
    const columns = Math.max(
      0,
      ...Array.from(table.rows)
        .filter(
          (row) => !Array.from(row.cells).some((cell) => cell.colSpan > 20)
        )
        .map((row) =>
          Array.from(row.cells).reduce((sum, cell) => sum + cell.colSpan, 0)
        )
    );
    if (!columns) return;
    table.querySelectorAll<HTMLTableCellElement>("td, th").forEach((cell) => {
      if (cell.colSpan > columns) cell.colSpan = columns;
    });
    table.classList.add("is-even");
  });
};

/*
 * A script face (mapScript: --bp-script-font) is only a fallback, and Chrome fetches a fallback
 * face once it lays out text that needs it: the PDF service printed before that fetch ended, so
 * a Khmer party name printed as empty boxes (E-commerce, real PDF, 1 Nov 2026). Each face is
 * asked for as soon as its stylesheet is in, for the characters the document uses.
 */
/*
 * Refrens' PDF service can be in print media before the template renders (2026-11-01, real
 * PDFs): the print media change never fires there, so the print steps (totals split, stretch)
 * set up in registerBpsPrint also run on every render and refit made in print media,
 * outside a browser's own print.
 */
let printLayoutHook: (() => void) | undefined;
const runPrintLayoutIfPrinting = (): void => {
  if (
    !printLayoutHook ||
    browserPrinting ||
    typeof window.matchMedia !== "function" ||
    !window.matchMedia("print").matches
  ) {
    return;
  }
  printLayoutHook();
};

/*
 * The PDF service stamps an every-page letterhead and footer image across the paper's whole
 * width, but keeps the page's margins for them as on an A4 portrait page: on a wider page
 * (landscape, A3) the stamp came out taller than its margin and covered the content (real PDF
 * 2026-11-02, A4 landscape, a 1000 × 200 letterhead: 169 pt stamped in a 135 pt margin). The
 * difference is kept free at the top and foot of every page (a row in the page frame's header
 * and footer, styles.css .bp-stamp-room); none on A4 portrait or narrower.
 */
const A4_PORTRAIT_WIDTH = (210 / 25.4) * 96;

export const placeStampRoom = (root: ParentNode = document): void => {
  const doc = root.querySelector<HTMLElement>(".bp-doc");
  if (!doc) return;
  const paper = parseFloat(doc.dataset.bpPaperWidth || "");
  const zoom =
    printZoom() *
    (parseFloat(getComputedStyle(doc).getPropertyValue("--bp-print-scale")) ||
      1);
  const room = (img: HTMLImageElement | null): number => {
    if (!img || !(paper > A4_PORTRAIT_WIDTH)) return 0;
    if (!img.complete || !img.naturalWidth) {
      img.addEventListener(
        "load",
        () => {
          placeStampRoom(root);
          runPrintLayoutIfPrinting();
        },
        { once: true }
      );
      return 0;
    }
    return (
      ((paper - A4_PORTRAIT_WIDTH) * img.naturalHeight) /
      img.naturalWidth /
      zoom
    );
  };
  const top = room(
    doc.querySelector<HTMLImageElement>(
      ".bp-page-frame-header .bp-letterhead.no-dibella:not(.is-empty) img"
    )
  );
  const bottom = room(
    doc.querySelector<HTMLImageElement>(
      ".bp-page-frame-footer .bp-footer-spacer.no-dibella:not(.is-empty) img"
    )
  );
  doc.style.setProperty("--bp-stamp-top", `${compactDecimal(top)}px`);
  doc.style.setProperty("--bp-stamp-bottom", `${compactDecimal(bottom)}px`);
  // The same room outside the document (the print watermark on the body), under the html zoom
  // only (styles.css: the watermark keeps between the letterhead and the footer).
  const docScale =
    parseFloat(getComputedStyle(doc).getPropertyValue("--bp-print-scale")) || 1;
  document.documentElement.toggleAttribute(
    "data-bp-stamp-room",
    top > 0 || bottom > 0
  );
  const page = document.documentElement.style;
  page.setProperty(
    "--bp-stamp-page-top",
    `${compactDecimal(top * docScale)}px`
  );
  page.setProperty(
    "--bp-stamp-page-bottom",
    `${compactDecimal(bottom * docScale)}px`
  );
};

const requestedScriptFonts = new Set<string>();
export const loadScriptFonts = (): void => {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const doc = document.querySelector<HTMLElement>(".bp-doc");
  const list = doc?.style.getPropertyValue("--bp-script-font") || "";
  if (!doc || !list.trim()) return;
  const sample = doc.textContent || "";
  list
    .split(",")
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .forEach((name) => {
      [400, 500, 600, 700].forEach((weight) => {
        const key = `${weight} ${name}`;
        if (requestedScriptFonts.has(key)) return;
        document.fonts
          .load(`${weight} 16px "${name}"`, sample)
          // No face yet (its stylesheet still on the way): asked again on the next run.
          .then((faces) => {
            if (faces.length) requestedScriptFonts.add(key);
          })
          .catch(() => {});
      });
    });
};

/*
 * A browser's own print (Ctrl+P, Lydia's print button) takes the document's side margins
 * (pdfOptions.xMargins), as Refrens' PDF service does, instead of the browser's 1 cm: an @page
 * margin. Top and bottom are 0 so Chrome prints no date / title / URL / page-number stamps
 * (user, 2026-11-02); the page frame's margin rows put 1 cm back. The print size's html zoom scales a browser's @page
 * margins with it (1 cm printed 12 mm at 1.2, 2026-11-02), so they are written divided by it.
 * Never in the PDF service (body.isDibella), which sets its own page margins.
 */
const BROWSER_PAGE_STYLE_ID = "bp-browser-page";
export const applyBrowserPrintPage = (): void => {
  if (typeof document === "undefined") return;
  const doc = document.querySelector<HTMLElement>(".bp-doc");
  const existing = document.getElementById(BROWSER_PAGE_STYLE_ID);
  const side = Number(doc?.dataset.bpSideMargin);
  if (
    !doc ||
    document.body?.classList.contains("isDibella") ||
    !Number.isFinite(side) ||
    side < 0
  ) {
    existing?.remove();
    return;
  }
  const zoom = printZoom();
  const cm = (value: number) => `${compactDecimal(value / zoom)}cm`;
  const px = (value: number) => `${compactDecimal(value / zoom)}px`;
  // Top and bottom 0: Chrome prints no stamps there; the page frame's margin rows (styles.css)
  // give each page its 1 cm back, sized in the document's own pixels. A Long PDF keeps 1 cm.
  const pageZoom =
    zoom *
    (parseFloat(getComputedStyle(doc).getPropertyValue("--bp-print-scale")) ||
      1);
  doc.style.setProperty("--bp-page-zoom", compactDecimal(pageZoom));
  const vertical = doc.classList.contains("is-pageless") ? cm(1) : "0";
  const css = `@page { margin: ${vertical} ${px(side)}; }`;
  if (existing?.textContent === css) return;
  const style = existing ?? document.createElement("style");
  style.id = BROWSER_PAGE_STYLE_ID;
  style.textContent = css;
  if (!existing) document.head.appendChild(style);
};

export const registerBpsWords = (): void => {
  const state = window as typeof window & { bpWordsRegistered?: boolean };
  if (state.bpWordsRegistered || typeof document === "undefined") return;
  state.bpWordsRegistered = true;
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      removeHiddenSymbol();
      prepareReadableStylesheet();
      applyBrowserPrintPage();
      loadScriptFonts();
      syncPrintWidths();
      respellTaxWords();
      evenSummaryColumns();
      fitItemsToScreen();
      runPrintLayoutIfPrinting();
    }, 0);
  };
  const start = () => {
    const output = document.getElementById("documentOutput");
    if (!output) return;
    new MutationObserver(schedule).observe(output, { childList: true });

    // A window resized, an image or a font arriving later changes the table's width.
    window.addEventListener("resize", schedule);
    document.addEventListener("load", schedule, true);
    document.fonts?.ready.then(schedule);
    // Lydia's live updates change the colours, fonts, text scale and letterhead in place,
    // without drawing the document again: laid out again once the renderer has applied them.
    window.addEventListener("message", (event) => {
      const { type } = asRecord(event.data);
      if (type === "lydia:template-update" || type === "lydia:invoice-update") {
        schedule();
      }
    });
    schedule();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else start();
  // A description drawn after the render (the Markdown viewer) changes the table's width: the
  // table is fitted again. The whole page is watched, as the renderer may add #documentOutput
  // later; only classes change in a fit, which this observer does not watch.
  if (typeof MutationObserver === "function") {
    new MutationObserver(refitSoon).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
};

/*
 * Placed when the print layout applies (the print media query turning on: Chrome lays the
 * pages out first, so the measurement is the printed one) and cleared when it ends. Inside
 * Lydia too (isLydiaMode is the editor's preview, not the Pageless PDF); only a Pageless
 * document (.is-pageless: one page as tall as the content) needs no placing.
 */
export const registerBpsPrint = (): void => {
  const state = window as typeof window & { bpPrintRegistered?: boolean };
  if (state.bpPrintRegistered || typeof window.matchMedia !== "function") {
    return;
  }
  state.bpPrintRegistered = true;
  // Lydia's print size, changed live (syncPrintWidths).
  if (typeof MutationObserver === "function") {
    new MutationObserver(() => {
      syncPrintWidths();
      applyBrowserPrintPage();
    }).observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  const pageless = () => Boolean(document.querySelector(".bp-doc.is-pageless"));
  // A Pageless PDF (one page as tall as the content) places nothing on pages.
  const pagelessLayout = () => {};
  // The totals are lined up last, on the fitted and split item columns. The preview's filler
  // goes first (stretchOnScreen), so the print steps measure the document as it prints.
  const printLayout = () => {
    placeStampRoom();
    if (!keepPreparedStretch()) {
      document.querySelector(".bp-doc")?.classList.remove("is-filled");
    }
    // A browser's own print counted its pages from the prepared layout (prepareBrowserPrint):
    // on a page its dialog turned, the totals laid out again at that width came out shorter
    // than counted, and the printout ended in blank pages (user, 2026-11-03, landscape).
    if (!(keepPreparedStretch() && pageTurned())) {
      joinTotals();
      splitTotals();
    }
    stretchItemTable();
  };
  printLayoutHook = () => {
    fitItemsToScreen();
    if (!pageless()) printLayout();
  };
  window.matchMedia("print").addEventListener("change", (event) => {
    fitItemsToScreen();
    if (pageless()) {
      pagelessLayout();
      return;
    }
    if (event.matches) {
      printLayout();
      placeFootersOnPageEdge();
    } else {
      joinTotals();
      stretchItemTable();
      resetFootersOnPageEdge();
    }
  });
  // A browser's own print counts its pages before the listener above runs: the same layout is
  // prepared first (prepareBrowserPrint), so the count is the printed one.
  window.addEventListener("beforeprint", () => {
    browserPrinting = true;
    // The page rule once more, as the print starts: top and bottom 0, so Chrome has no room
    // for its date / title / URL / page-number stamps (user, 2026-11-12, Refrens app print).
    applyBrowserPrintPage();
    prepareBrowserPrint(pageless() ? pagelessLayout : printLayout);
  });
  window.addEventListener("afterprint", () => {
    browserPrinting = false;
    document
      .querySelectorAll(".bp-doc.is-browser-print")
      .forEach((doc) => doc.classList.remove("is-browser-print"));
    resetFootersOnPageEdge();
    stretchItemTable();
  });
};
