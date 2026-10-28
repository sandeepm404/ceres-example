/*
 * View model for the Apex Engineering template (Figma Document-Templates, node 18842:2814).
 *
 * Built on the Modern Manufacturing view model: same contract coverage, settings and print
 * behaviour, laid out as the Apex design. The template keeps `normalizeInvoiceTemplateState`
 * as its data mapper and asks for this model once, through `{{#with (axView @root) as |view|}}`. Every value here comes from the
 * payload: labels resolve through `customLabels` (or the column's own label) and the English
 * words are only fallbacks for a key the business has never set. Nothing from the reference
 * design is written into the markup.
 *
 * Money in the tables prints as a grouped figure without a symbol — the totals block (shared
 * Subtotal widget) carries the currency. Dates stay raw here and are formatted in the
 * template by the shared date-time widget, so the owner offset rule lives in one place.
 */

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

/* 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
const ordinal = (day: number): string => {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] || "th"}`;
};

/*
 * Document dates print as the design does, "27th May, 2026". An instant (ISO with Z / an
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
    return `${ordinal(Number(parts[3]))} ${MONTHS[Number(parts[2]) - 1]}, ${
      parts[1]
    }`;
  }
  const time = typeof value === "number" ? value : Date.parse(raw);
  if (!Number.isFinite(time)) return raw;
  const shifted = new Date(time + offsetMinutes(offset) * 60000);
  return `${ordinal(shifted.getUTCDate())} ${
    MONTHS[shifted.getUTCMonth()]
  }, ${shifted.getUTCFullYear()}`;
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

export type ApexSettings = ReturnType<typeof resolveSettings>;

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
 * Indian place of supply prints as "State (code)". The name and the code come from
 * the same raw value, so the two cannot disagree.
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
        Boolean(row.isNum || row.isDate) ||
        ["invoiceNumber", "purchaseOrderNumber"].includes(row.key) ||
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
      value: customFieldText(entry.value, entry.options, ctx.locale),
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
            label: labelOr(labels, "ewayBillNumber", "E-Way Bill No."),
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
      isNum: Boolean(row.isNum || row.isDate),
    }));

  // Any transport value shows the block.
  return rows.length
    ? { title: heading(labels, "transport", "Transport Details"), rows }
    : null;
};

/* Document type → its key in owner.configuration.showQrCode. */
const QR_DOCUMENT_KEYS: Record<string, string> = {
  INVOICE: "invoice",
  QUOTATION: "quotation",
  PROFORMA: "proforma",
  PROFORMAINVOICE: "proforma",
  PURCHASE: "expenditure",
  EXPENDITURE: "expenditure",
  PURCHASEORDER: "purchaseOrder",
  SALESORDER: "salesOrder",
  DELIVERYCHALLAN: "deliveryChallan",
  CREDITNOTE: "creditNote",
  DEBITNOTE: "debitNote",
};

export const mapCompliance = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const irn = asRecord(invoice.irn);
  const { einvoice } = complianceSettings(invoice);
  const isCancelled = asRecord(asRecord(state.mapped).irn).isCancelled === true;
  const irnQr = firstText(invoice.qrCode, irn.qrCode);
  // The document QR shows unless the business switched QR codes off, in general
  // (enableQrCode) or for this kind of document (showQrCode.<type>).
  const configuration = ownerConfiguration(invoice);
  const qrKey =
    QR_DOCUMENT_KEYS[text(invoice.billType).toUpperCase()] ||
    text(invoice.billType).toLowerCase();
  const documentQr =
    isOff(configuration.enableQrCode) ||
    isOff(asRecord(configuration.showQrCode)[qrKey])
      ? ""
      : text(invoice.documentQr);

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
    column.isCessColumn === true ||
    semantic === "currency" ||
    text(column.fxReturnType).toLowerCase() === "currency"
  ) {
    return "money";
  }
  return text(column.dataType).toLowerCase() === "number" ? "number" : "text";
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
    className: `ax-col-${key.replace(/[^A-Za-z0-9_-]/g, "")} ${
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
      // A percentage discount left empty reads "0%", as refrens.com prints it.
      return discountParts(item).isPercent
        ? formatPercent(hasValue(value) ? value : 0, ctx)
        : formatFigure(value, ctx);
    case "money":
      return formatFigure(value, ctx);
    case "number":
      return formatQuantity(value, ctx);
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
const DESIGN_TABLE_WIDTH = 958;
/*
 * Every cell, header included, carries 6 px of padding each side (user request); the Sr
 * column is the design's 28 px widened by that padding.
 */
const SERIAL_WIDTH = 32;
// The most figure columns a tablet lays out side by side under the item's name (styles.css).
const TABLET_FIGURE_COLUMNS = 8;
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
  settings: ApexSettings = resolveSettings(state)
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
      ? formatFigure(sum, ctx)
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
  }));

  /*
   * Groups read as the design's section rows, "A. <group name>", and number their items from
   * 1 again (a group name that already carries its own letter keeps it). Without groups the
   * items number straight through.
   */
  let serial = 0;
  let groupIndex = -1;
  let itemIndex = -1;
  const groupName = (name: string): string =>
    !name || /^[A-Z]{1,2}[.)]\s/.test(name)
      ? name
      : `${String.fromCharCode(65 + (groupIndex % 26))}. ${name}`;
  const rows = items
    .filter(
      (item) => !(item.isGroupItemTotalRow === true && !settings.groupSubtotal)
    )
    .map((item) => {
      if (item.group === true) {
        groupIndex += 1;
        serial = 0;
        return {
          isGroupHeader: true,
          name: groupName(text(item.name)),
          colspan,
        };
      }
      itemIndex += 1;
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
        // Rows alternate white / stripe per item; an item's detail row shares its stripe.
        isStripe: itemIndex % 2 === 1,
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
        // The full-width row keeps the serial column and spans everything after it.
        detailColspan: colspan - 1,
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
    serialLabel: labelOr(labels, "serialNumber", "Sr."),
    serialWidth: SERIAL_WIDTH,
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
  settings: ApexSettings = resolveSettings(state)
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

  // In the order and wording of Refrens' bank account form: Account Name, Account Number,
  // IFSC (with IBAN / SWIFT / Sort Code beside it), Account Type, Bank, Branch, then the rest.
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
          key: "accountType",
          label: labelOr(labels, "accountType", "Account Type"),
          value: text(bank.accountType),
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
      isNum: NUMERIC_BANK_ROWS.includes(row.key),
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

export const mapWords = (
  state: UnknownRecord,
  settings: ApexSettings = resolveSettings(state)
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
  // The amount reads in capitals, like the tax summaries' words (user request); the label
  // is editable and keeps its own case.
  const value = (stored || computed).toUpperCase();
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
  settings: ApexSettings = resolveSettings(state)
) => {
  const invoice = asRecord(state.invoice);
  const advanceOptions = asRecord(invoice.advanceOptions);
  const view = text(advanceOptions.taxSummaryView).toUpperCase();
  // Tax rows carry their rate (user request): the Subtotal widget's per-rate breakup,
  // "CGST (9%)" / "SGST (9%)" / "IGST (18%)" — one row per rate when the items' rates differ.
  const model = computeSubtotalRows(
    {
      ...invoice,
      subUnitLength: moneyDigits(invoice),
      advanceOptions: {
        ...advanceOptions,
        taxSummaryView: ["BOTH", "INVOICE_SUMMARY"].includes(view)
          ? view
          : "INVOICE_SUMMARY",
      },
    },
    {
      columns: asRecord(state.mapped).columns,
      businessCurrency: invoice.businessCurrency,
      businessLocale: invoice.businessLocale,
    }
  );
  const ctx = formatContext(invoice);
  // "BGN 1 = ₹57.22": the unit side stays a whole 1, whatever the decimal places.
  const unitRate = (row: SubtotalRow): SubtotalRow =>
    row.key === "conversionRate"
      ? {
          ...row,
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
  // "Discount (10%)": the rate after the label, with its space (the widget writes none).
  const rate = discountRate(invoice);
  const withDiscountRate = (row: SubtotalRow): SubtotalRow =>
    row.key === "discount" && rate
      ? {
          ...row,
          label: `${row.label.replace(/\s*\([^)]*%\)\s*$/, "")} (${rate}%)`,
        }
      : row;
  const exchange = showsExchangeRate(state);
  const exchangeRow = <T extends SubtotalRow>(row: T): T =>
    exchange ? row : withoutExchange(row);
  return {
    hidden: model.hidden,
    hideTaxes: model.hideTaxes,
    main: model.groups.main
      .filter((row) => exchange || row.key !== "conversionRate")
      .map(unitRate)
      .map(withDiscountRate)
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
 * The contact strip at the foot (Figma "document-footer"): Billed By under its own heading
 * as refrens.com titles it for the document type (Billed By, Issued By, Quotation From,
 * Order To…), its name, address, phone and email (user rule). A field the business switched
 * off for documents (phoneShowInInvoice / emailShowInInvoice) stays off.
 */
export const mapContact = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const seller = asRecord(invoice.billedBy);
  const party = mapParty(invoice, seller, "");
  const name = text(seller.name);
  const phone = isOff(seller.phoneShowInInvoice) ? "" : text(seller.phone);
  const email = isOff(seller.emailShowInInvoice) ? "" : text(seller.email);
  const address = party ? party.address : "";
  return name || address || phone || email
    ? {
        title: labelOr(labels, "billedBy", "Billed By"),
        name,
        address,
        // Street on its own line, then "City, State, Country - PIN" below (user request).
        street: party ? party.street : "",
        region: party ? party.region : "",
        phone,
        email,
      }
    : null;
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

/*
 * Payment Terms card (Figma node 18843:3808): every terms line that opens with a share
 * ("90% Advance along with order…"), from whichever group, prints here (user rule) — the
 * share in bold over the rest in regular text — and leaves Terms and Conditions; every other
 * line stays there. The card's title is the label of a group made only of such lines (the
 * document's own "Payment Terms" group), else the paymentTerms label, else "Payment Terms".
 */
const SHARE_LINE = /^(\d+(?:[.,]\d+)?\s?%)\s*[-–:,]?\s*([\s\S]*)$/;

export const isShareLine = (term: unknown): boolean =>
  SHARE_LINE.test(text(term));

const termLines = (group: UnknownRecord): string[] =>
  asArray(group.terms).map(text).filter(Boolean);

export const mapPaymentTerms = (state: UnknownRecord) => {
  const invoice = asRecord(state.invoice);
  const labels = asRecord(invoice.customLabels);
  const groups = asArray(invoice.terms).map(asRecord);
  const cells = groups
    .flatMap(termLines)
    .map((term) => term.match(SHARE_LINE))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      figure: match[1].replace(/\s/g, ""),
      caption: match[2],
    }));
  if (!cells.length) return null;
  const ownGroup = groups.find((group) => {
    const lines = termLines(group);
    return lines.length > 0 && lines.every(isShareLine);
  });
  return {
    title: firstText(
      ownGroup && ownGroup.label,
      labels.paymentTerms,
      "Payment Terms"
    ),
    cells,
  };
};

/*
 * The cost card's currency mark: the design's rupee artwork on rupee documents (template), and
 * for any other currency the same 32 px black disc carrying that currency's symbol in white —
 * the document's own symbol (customCurrencySymbol) when it has one, else the currency's narrow
 * symbol ("$", "€", "£", "¥", "₦"…), else its code ("AED"), drawn as a white outline like the
 * rupee's (user request). Longer marks are set smaller so they stay inside the disc.
 */
export const currencyMark = (
  invoice: UnknownRecord
): { symbol: string; size: number } | null => {
  const currency = text(invoice.currency).toUpperCase();
  if (!currency || currency === "INR") return null;
  let symbol = text(invoice.customCurrencySymbol);
  if (!symbol) {
    try {
      symbol =
        new Intl.NumberFormat("en", {
          style: "currency",
          currency,
          currencyDisplay: "narrowSymbol",
        })
          .formatToParts(0)
          .find((part) => part.type === "currency")?.value || currency;
    } catch {
      symbol = currency;
    }
  }
  const { length } = Array.from(symbol);
  if (!length) return null;
  const size = [20, 20, 14, 9][Math.min(length, 3)];
  return { symbol, size };
};

/*
 * The cost card beside the client (Figma "Value card"): the grand total row of the totals —
 * its label and figure, with the currency — and a note on the tax it includes: "(INCL. GST @18%)"
 * when every taxed item carries the same rate, "(INCL. GST)" when rates differ, nothing on an
 * untaxed document. Hidden with the totals (hideTotals).
 */
export const mapCostCard = (
  state: UnknownRecord,
  totals: ReturnType<typeof mapTotals>
) => {
  const grand = totals.main.find((row) => row.key === "total");
  if (!grand || totals.hidden) return null;
  const invoice = asRecord(state.invoice);
  const visibility = asRecord(asRecord(state.mapped).visibility);
  const finalTotal = asRecord(invoice.finalTotal);
  const taxed = ["igst", "cgst", "sgst", "utgst", "tax"].some(
    (key) => toAmount(finalTotal[key]) > 0
  );
  const rates = asArray(invoice.items)
    .map(asRecord)
    .filter(isRealItem)
    .map((item) => toAmount(pickFirst(item.gstRate, item.taxRate)))
    .filter((rate) => rate > 0)
    .filter((rate, index, all) => all.indexOf(rate) === index);
  const isGst = Boolean(visibility.showIgst || visibility.showCgstSgst);
  const taxName = firstText(invoice.taxName, isGst ? "GST" : "Tax");
  const labels = asRecord(invoice.customLabels);
  return {
    label: grand.label,
    value: grand.value,
    // The design's rupee mark on rupee documents; every other currency its own symbol.
    showRupeeIcon: text(invoice.currency).toUpperCase() === "INR",
    currencyMark: currencyMark(invoice),
    converted: grand.converted,
    note:
      taxed && !totals.hideTaxes
        ? `(${labelOr(labels, "inclusiveOf", "INCL.")} ${taxName}${
            rates.length === 1
              ? ` @${formatQuantity(rates[0], formatContext(invoice))}%`
              : ""
          })`
        : "",
  };
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
 * Description less than its 22% share of that page, the table prints at the small step
 * with tight padding (styles.css, .is-print-compact), as Solvin's compact print table does.
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

const compactDecimal = (value: number): string =>
  String(Number(value.toFixed(4)));

/* Paper heights, for a landscape page (its width is the paper's height). */
const PAPER_HEIGHT_MM: Record<string, number> = {
  a3: 420,
  a4: 297,
  a5: 210,
  letter: 279.4,
  legal: 355.6,
};

/*
 * The Description cell's floor on a page too narrow for the table (A5, a large print size):
 * a readable column of about 12 characters with its padding.
 */
const PRINT_DESCRIPTION_FLOOR = 120;
/* 13 px × 0.77 = 10 px: the repo preset's floor (design-to-template §4a); below it, wrap. */
const MIN_TABLE_FIT = 0.77;
const COMPACT_PADDING_SAVING = 4; // 6 → 4 px each side

export const mapPrint = (
  state: UnknownRecord,
  tableFixedWidth = 0,
  fixedColumns = 0
) => {
  const pdfOptions = asRecord(state.pdfOptions);
  const invoice = asRecord(state.invoice);
  const template = asRecord(invoice.template);
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
   * (styles.css): Refrens' PDF service lays the page out in a window wider than the paper
   * before it prints, and a table fitted there was clipped on the page (user report). Side
   * margins are xMargins centimetres (1 when unset; 0 is a real setting, edge to edge). The
   * page's margins stay their size in the PDF whatever the print zoom, so the zoom divides
   * the width between them (measured 2026-10-23: subtracting the margins after the zoom ran
   * the page into the margins at 0.9 and left them wider at 1.1 and 1.2); 4 px kept back for
   * rounding.
   */
  const marginSetting = hasValue(pdfOptions.xMargins)
    ? Number(text(pdfOptions.xMargins))
    : NaN;
  const sideMarginCm =
    Number.isFinite(marginSetting) && marginSetting >= 0 ? marginSetting : 1;
  const printableWidth = (marginCm: number) =>
    Math.floor(
      ((paperMm / 25.4) * 96 - (2 * marginCm * 96) / 2.54) / rendererZoom - 4
    );
  const printWidth = printableWidth(sideMarginCm);
  // A browser's own print (Lydia's print button, Ctrl+P) keeps its own 1 cm margins, whatever
  // xMargins says: the page is fitted for the narrower of the two (prepareBrowserPrint).
  const browserPrintWidth = printableWidth(1);
  const rawScale =
    positiveNumber(pdfOptions.textScale) ?? positiveNumber(pdfOptions.scale);
  // A percentage (110) or a ratio (1.1); kept readable either way.
  const ratio =
    rawScale !== undefined && rawScale > 2 ? rawScale / 100 : rawScale;
  const textScale = Math.min(2, Math.max(0.3, ratio ?? 1));
  const compactTable =
    tableFixedWidth * textScale > pageWidth * (1 - MIN_DESCRIPTION_SHARE);
  // Last resort, only when even compact padding leaves Description under its floor: the
  // table's text shrinks just enough to fit the page (never below MIN_TABLE_FIT), rather than
  // the page clipping its last columns. A4 at the normal print size never gets here.
  const compactWidth =
    (tableFixedWidth - fixedColumns * COMPACT_PADDING_SAVING) * textScale;
  const tableFit =
    compactTable && compactWidth > 0
      ? Math.min(
          1,
          Math.max(
            MIN_TABLE_FIT,
            (pageWidth - PRINT_DESCRIPTION_FLOOR) / compactWidth
          )
        )
      : 1;
  return {
    textScale: compactDecimal(textScale),
    printWidth,
    browserPrintWidth,
    compactTable,
    tableFit:
      tableFit < 1 ? compactDecimal(Math.floor(tableFit * 100) / 100) : "",
    /*
     * "Stretch invoice & quotation tables to fill the page" (Settings > Experimental,
     * owner.configuration.experimental.stretchInvoiceTable) with the document's own toggle
     * (pdfOptions.fullHeightTable): on a one-page printout the item table runs down to the
     * footer (stretchItemTable). Every document type (standing decision).
     */
    stretchTable:
      asRecord(asRecord(asRecord(invoice.owner).configuration).experimental)
        .stretchInvoiceTable === true &&
      optionalFlag(pdfOptions.fullHeightTable) === true,
    // "Hide footer": the letterhead footer is not drawn at all.
    hideFooter: [
      pdfOptions.hideFooter,
      template.hideFooter,
      invoice.hideFooter,
    ].some((value) => optionalFlag(value) === true),
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
 * The subtitle splits at its first comma (user rule): "<lead>, <rest>" prints the part before it in bold and the rest, commas and
 * all, on the line below in regular text. A line break splits it the same way.
 */
export const subtitleLines = (
  value: unknown
): { lead: string; rest: string } => {
  const raw = text(value);
  const at = raw.search(/[,\n]/);
  if (at < 0) return { lead: raw, rest: "" };
  return {
    lead: raw.slice(0, at).trim(),
    rest: raw
      .slice(at + 1)
      .replace(/\s*\n\s*/g, " ")
      .trim(),
  };
};

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

export const buildApexView = (root: unknown) => {
  const state = asRecord(root);
  const invoice = asRecord(state.invoice);
  const mapped = asRecord(state.mapped);
  const visibility = asRecord(mapped.visibility);
  const labels = asRecord(invoice.customLabels);
  const ctx = formatContext(invoice);
  const seller = mapParty(invoice, invoice.billedBy, "");
  const showsSeller = text(invoice.billType).toUpperCase() === "PURCHASEORDER";
  const logo = firstText(invoice.logo, asRecord(invoice.billedBy).logo);

  const settings = mapSettings(state);
  const options = resolveSettings(state);
  const shippedFrom = visibility.shippedFrom
    ? mapParty(
        invoice,
        invoice.shippedFrom,
        heading(labels, "shippedFrom", "Shipped From"),
        true
      )
    : null;
  const shippedTo = visibility.shippedTo
    ? mapParty(
        invoice,
        invoice.shippedTo,
        heading(labels, "shippedTo", "Shipped To"),
        true
      )
    : null;
  const supply = mapSupply(state);
  const allTransport = mapTransport(state);
  // Transport sits in the header's details list by default; with a dispatch panel (Shipped
  // From or Shipped To), or the template's "section" setting, it takes the panel's last column.
  const transportInGrid =
    settings.transportInGrid && shippedFrom === null && shippedTo === null;
  const transport = transportInGrid ? null : allTransport;
  const meta = mapMeta(
    state,
    transportInGrid && allTransport ? allTransport.rows : []
  );
  const notes = mapNotes(state);
  // "Show terms" off hides every terms group, the Payment Terms card's included.
  const paymentTerms = options.terms ? mapPaymentTerms(state) : null;
  // Lines opening with a share are on the Payment Terms card; the rest stay in Terms and
  // Conditions, and a group left with no lines drops out.
  const terms = options.terms
    ? notes.terms
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !isShareLine(item)),
        }))
        .filter((group) => group.items.length > 0)
    : [];
  const additional = mapAdditionalInfo(state, ctx);
  // Client panel: Bill To (name, address | fields) and the cost card. Shipped From, Shipped
  // To and transport form the dispatch panel below it (user request).
  const parties = [
    mapParty(
      invoice,
      invoice.billedTo,
      heading(labels, "billedTo", "Billed To")
    ),
  ]
    .filter(Boolean)
    .map((party) => ({ ...party, fields: partyFields(party) }));
  const withFields = (party: ReturnType<typeof mapParty>) =>
    party ? { ...party, fields: partyFields(party) } : null;
  const table = mapItemTable(state, ctx, options);
  const totals = mapTotals(state, options);
  const subtitle = subtitleLines(invoice.invoiceSubTitle);
  const notesBlock = notes.notes;
  const bank = mapBank(state);
  const compliance = mapCompliance(state);
  // The document QR sits beside the document details in the header, not in this card.
  const hasCompliance = Boolean(
    (compliance.showIrn && compliance.irn) ||
      compliance.rows.length ||
      compliance.qr.irn ||
      compliance.qr.zatca ||
      compliance.qr.lhdn
  );
  const status = statusTag(invoice);
  const print = mapPrint(
    state,
    table.printFixedWidth,
    table.columns.filter((column) => column.kind !== "name").length
  );

  return {
    brand: {
      name: seller ? seller.name : "",
      logo,
      // Under the contact strip: the business's own custom fields on every document (user
      // request, 2026-10-21); its tax numbers (GSTIN, PAN…) only on a purchase order, where
      // the strip is the vendor ("Order To").
      fields: seller
        ? [...(showsSeller ? seller.ids : []), ...seller.extras].map((row) => ({
            label: row.label,
            value: row.value,
            isDate: Boolean(row.isDate),
          }))
        : [],
    },
    showsSeller,
    title: firstText(invoice.invoiceTitle),
    subtitle,
    copy: firstText(invoice.copy),
    // The status tag as refrens.com shows it for the document type (statusTag); on paper only
    // when the business prints it.
    status: status
      ? { ...status, inPrint: Boolean(visibility.showStatusTagInPrint) }
      : null,
    theme: settings.theme,
    meta,
    documentQr: compliance.qr.document,
    // The logo and the document QR share the header's top row (user request).
    hasBrandRow: Boolean(logo) || Boolean(compliance.qr.document),
    compliance,
    hasCompliance,

    parties,
    // The design's empty ruled column before the cost card.
    clientSlot: parties.length === 1,
    costCard: mapCostCard(state, totals),
    // Dispatch panel, in this order: Shipped From | Shipped To | Transport Details.
    shippedFrom: withFields(shippedFrom),
    shippedTo: withFields(shippedTo),
    dispatchParties: [
      shippedFrom ? { ...withFields(shippedFrom), role: "shipped-from" } : null,
      // Place / Country of Supply close the Shipped To block, and print nowhere else
      // (standing decision): no Shipped To, no supply lines.
      shippedTo
        ? {
            ...withFields(shippedTo),
            role: "shipped-to",
            supply: supply.show ? supply : null,
          }
        : null,
    ].filter(Boolean),
    transport,
    hasDispatch:
      shippedFrom !== null || shippedTo !== null || transport !== null,
    table,
    descriptionFullWidth: options.descriptionFullWidth,
    // The UPI QR is always 100 px, like every QR (user request): upiShrink no longer applies.
    bank,
    totals,
    words: mapWords(state, options),
    // Terms and Conditions | Bank Details, then the notes on a row of their own (user
    // request), then Additional Info | Attachments.
    termsRow: {
      terms,
      show: terms.length > 0 || bank.show,
    },
    notesRow: notesBlock,
    infoRow: {
      additional,
      attachments: notes.attachments,
      show: !!additional || !!notes.attachments,
    },
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
    paymentTerms,
    contact: mapContact(state),
    enquiry: mapDocumentContact(state),
    signature: mapSignature(state),
    // The letterhead footer repeats at the foot of every printed page unless the document
    // asks for it on the last page only (pdfOptions.footerOnLastPage).
    // Pageless PDF is one page as tall as the content: letterhead and footer once each.
    footerEveryPage: !visibility.footerOnLastPage && !options.pageless,
    // The letterhead repeats at the top of every printed page unless the document asks for
    // it on the first page only (pdfOptions.letterHeadOnFirstPage).
    letterheadEveryPage: !visibility.letterHeadOnFirstPage && !options.pageless,
    pageless: options.pageless,
    hideFooter: print.hideFooter,
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

export const registerApexHelpers = (HB: HelperRegistry | undefined): void => {
  if (!HB) return;
  HB.registerHelper("axView", (root: unknown) => buildApexView(root));
  // `{{axDate value offset}}` — Handlebars appends its options object, so only a string or
  // number second argument is an offset.
  HB.registerHelper("axDate", (value: unknown, offset: unknown) =>
    formatDocumentDate(
      value,
      typeof offset === "string" || typeof offset === "number"
        ? offset
        : undefined
    )
  );
};

/* ------------------------------------------------------------------ business logo */

/*
 * A business logo no wider than 1.25 × its height (square, or upright) prints in a 100 px
 * square instead of the wide logo's 200 × 48 box (user request). Its shape is only known once
 * it loads, so the logo is marked then (is-square, styles.css); load events do not bubble, so
 * the listener sits on the document's capture phase, ahead of every render.
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

export const registerApexLogo = (): void => {
  const state = window as typeof window & { axLogoRegistered?: boolean };
  if (state.axLogoRegistered || typeof document === "undefined") return;
  state.axLogoRegistered = true;
  document.addEventListener(
    "load",
    (event) => {
      const { target } = event;
      if (
        target instanceof HTMLImageElement &&
        target.classList.contains("ax-logo-image")
      ) {
        markLogoShape(target);
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

// 2 px to spare, so rounding never pushes the footer onto a page of its own.
const PAGE_EDGE_SLACK = 2;

/* The space to add above the footer so it ends on the page's bottom edge. */
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
  ".ax-doc > .ax-letterhead-footer:not(.ax-footer-fixed):not(.is-empty)";

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
    const [pageEnd, nextPageEnd] = breaks.map(pageTop);
    breaks.forEach((marker) => marker.remove());
    const pageHeight = nextPageEnd - pageEnd;
    // Not paginated yet (the PDF service switches to print media before it prints, so the
    // forced breaks collapse to a few pixels): the page edge cannot be measured, and the
    // footer stays after the content rather than be forced onto a page of its own.
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
 * Last resort in print: an item table still wider than its page at the 10 px text floor
 * (many columns of figures that never wrap) is scaled as a whole to the page's width, text,
 * padding and rules alike, rather than its last columns (the amounts) being cut off at the
 * page edge. Rules and rounding keep a pixel or two, so it settles in steps.
 */
const PRINT_SLACK = 0.5;

/*
 * Chrome before 128 (Refrens' PDF service runs 122) reports the size and place of anything inside
 * a CSS-zoomed element divided by that zoom; later Chrome reports what is drawn. The print fit zooms
 * the item table, so the fit, the totals' rule and the stretch rules measure the table through this
 * (2026-10-23: in real PDFs the table was shrunk to 0.689 where 0.957 fits, and the totals' rule
 * landed off the column). Elsewhere it returns the rect unchanged.
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
// The share of the page's width a fitted table may take (see fitPrintTable).
const PRINT_ROOM = 0.99;

/*
 * The totals carry on without the item headings (user, 2026-10-19): in print, the rows after
 * the items move into a table of their own right under the item table, so a page that holds
 * only them repeats no heading row. Its columns take the item columns' widths, so the TOTAL
 * row's figures stay under their columns. joinTotals puts them back in the one table.
 */
const TOTALS_SPLIT = "data-ax-totals-split";
const TOTALS_GROUPS = ":scope > tbody.ax-items-total";

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

export const splitTotals = (root: ParentNode = document): void => {
  joinTotals(root);
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  if (!printing) return;
  root.querySelectorAll<HTMLTableElement>(".ax-items").forEach((table) => {
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
    const split = document.createElement("table");
    split.className = table.className;
    split.setAttribute(TOTALS_SPLIT, "");
    const style = table.getAttribute("style");
    if (style) split.setAttribute("style", style);
    split.style.tableLayout = "fixed";
    split.style.width = `${table.offsetWidth}px`;
    const cols = document.createElement("colgroup");
    Array.from(row.cells).forEach((cell) => {
      const col = document.createElement("col");
      col.span = cell.colSpan || 1;
      col.style.width = `${cell.getBoundingClientRect().width / scale}px`;
      cols.appendChild(col);
    });
    split.appendChild(cols);
    groups[0].before(document.createComment(TOTALS_SPLIT));
    groups.forEach((group) => split.appendChild(group));
    table.after(split);
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
  // The summaries too (payments, batch, HSN, tax): on A5 the payments table's last column was
  // cut at the page edge (2026-10-23).
  root
    .querySelectorAll<HTMLElement>(".ax-items, .ax-widget-table .ceres-table")
    .forEach((table) => {
      table.style.removeProperty("zoom");
      const box = table.parentElement;
      if (!printing || !box) return;
      // 1 % kept back: Chrome sets the PDF's text a little wider than the layout measured it, and a
      // word on the table's edge ("Expiry", "Date") was cut there.
      const room = () => box.getBoundingClientRect().width * PRINT_ROOM;
      // The table fills its box (width 100 %), so its own width always exceeds 99 % of it: what
      // counts is how narrow its columns can go, measured at width 0 (a table is never narrower
      // than its content). Read as it stood, a table that fit was zoomed down to 0.9.
      const need = () => {
        const { width } = table.style;
        table.style.width = "0px";
        const narrowest = drawnRect(table).width;
        table.style.width = width;
        return narrowest;
      };
      const overflow = () => need() - room();
      let scale = 1;
      for (let step = 0; step < 10 && overflow() > PRINT_SLACK; step += 1) {
        const ratio = room() / need();
        scale = Math.min(
          scale - 0.005,
          Math.floor(scale * ratio * 1000) / 1000
        );
        table.style.setProperty("zoom", String(scale));
      }
    });
};

/*
 * The totals' rule lines up with the item table's columns, as in the Ecommerce template (user
 * request): the figure cell ends on the item column edge nearest the table's end that still
 * leaves room for the widest figure — the last column's edge when the figures fit it, further
 * in when one needs more. The cell's width is set in the totals table's own pixels (the print
 * zoom may scale the item table alone) and corrected once against the measured edge, as the
 * collapsed borders sit half a rule either side. The phone and tablet layouts keep their own.
 */
const TOTALS_ALIGN_SLACK = 0.5;
// The figures never take more than this share of the totals' width.
const TOTALS_MAX_SHARE = 0.6;

export const alignTotals = (root: ParentNode = document): void => {
  root.querySelectorAll<HTMLElement>(".ax-totals-table").forEach((totals) => {
    totals.style.removeProperty("--ax-totals-value");
    totals.style.removeProperty("--ax-totals-value-min");
    const table = totals
      .closest(".ax-items-scroll")
      ?.querySelector<HTMLTableElement>(`.ax-items:not([${TOTALS_SPLIT}])`);
    const values = Array.from(
      totals.querySelectorAll<HTMLElement>(".ceres-subtotal-value")
    ).filter((cell) => cell.getClientRects().length > 0);
    if (!table || !values.length || table.matches(".is-cards, .is-grid")) {
      return;
    }
    const row = Array.from(table.tBodies)
      .filter((body) => !body.matches(".ax-items-total"))
      .flatMap((body) => Array.from(body.rows))
      .reduce<HTMLTableRowElement | undefined>(
        (best, candidate) =>
          !best || candidate.cells.length > best.cells.length
            ? candidate
            : best,
        undefined
      );
    // Measured from the totals' own end: an item table wider than its box runs past it.
    const box = totals.getBoundingClientRect();
    const scale = box.width / (totals.offsetWidth || 1) || 1;
    if (!row || row.cells.length < 2 || box.width <= 0) return;
    const rtl = getComputedStyle(table).direction === "rtl";
    // Each figure's own width, without the design's 93 px floor.
    totals.style.setProperty("--ax-totals-value-min", "0px");
    const need = Math.max(
      ...values.map((cell) => cell.getBoundingClientRect().width)
    );
    // From the totals' end to each item column's start edge, the serial column's aside.
    const reaches = Array.from(row.cells)
      .slice(1)
      .map((cell) => {
        const rect = drawnRect(cell);
        return rtl ? rect.right - box.left : box.right - rect.left;
      })
      // Only the column edges inside the totals' box, leaving the labels most of the row: an
      // item table much wider than the page (it scrolls) has none near the end.
      .filter(
        (distance) => distance > 0 && distance <= box.width * TOTALS_MAX_SHARE
      )
      .sort((a, b) => a - b);
    const reach = reaches.find(
      (distance) => distance >= need - TOTALS_ALIGN_SLACK
    );
    // No column edge there: the figures keep their own width.
    if (reach === undefined) {
      totals.style.removeProperty("--ax-totals-value-min");
      return;
    }
    const edge = rtl ? box.left + reach : box.right - reach;
    let width = reach / scale;
    for (let step = 0; step < 2; step += 1) {
      totals.style.setProperty("--ax-totals-value", `${width}px`);
      totals.style.setProperty("--ax-totals-value-min", `${width}px`);
      const rect = values[0].getBoundingClientRect();
      const off = rtl ? edge - rect.right : rect.left - edge;
      if (Math.abs(off) <= TOTALS_ALIGN_SLACK) break;
      width += off / scale;
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
  const doc = root.querySelector<HTMLElement>(".ax-doc");
  if (!doc) return;
  const style = getComputedStyle(doc);
  // The document's printable width, or the browser's own (1 cm margins) where narrower.
  const width = Math.min(
    parseFloat(style.getPropertyValue("--ax-print-width")) ||
      doc.getBoundingClientRect().width,
    parseFloat(style.getPropertyValue("--ax-browser-print-width")) || Infinity
  );
  // The phone and tablet layouts are screen only.
  const fitted = Array.from(
    root.querySelectorAll<HTMLElement>(".ax-items:is(.is-cards, .is-grid)")
  ).map((table) => [table, table.className] as const);
  fitted.forEach(([table]) => table.classList.remove("is-cards", "is-grid"));
  const docWidth = doc.style.width;
  withPrintRules(width, () => {
    doc.style.width = `${width}px`;
    withPrintMedia(() => {
      if (layout) {
        layout();
        return;
      }
      fitPrintTable(root, true);
      alignTotals(root);
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
 * Stretch the item table to the page (view.print.stretchTable): in print, while the whole
 * document fits on one page, its empty filler row takes the page's spare height so the footer
 * sits at the page's foot, the column rules running down through it. A document longer than
 * a page keeps its natural height (Refrens stretches single-page PDFs only).
 *
 * The page's height is left to CSS (100vh): Refrens' PDF service lays the page out in a
 * window shorter than the paper and only then prints, so a height measured here was the
 * window's and the table never stretched in the PDF (user report). 100vh is the page area
 * when the PDF is made; the document's own height is measured here (the width is the
 * paper's already, styles.css). Under the print zoom Chrome scales the page margins as well,
 * hence 100vh / zoom, with a few px kept back. A document longer than a page comes out at 0.
 * As the Ecommerce template does.
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
      getComputedStyle(wrap).getPropertyValue("--ax-column-rule-width")
    ) || 1;
  const scale = box.width / (wrap.offsetWidth || box.width);
  const room = box.width - width * scale;
  const cells = Array.from(row.cells).map((cell) => drawnRect(cell));
  const edges = [
    ...cells.map((cell) => cell.left - box.left),
    cells[cells.length - 1].right - box.left,
  ];
  const layers = edges
    .map(
      (x) =>
        `linear-gradient(${color}, ${color}) ${compactDecimal(
          Math.min(100, Math.max(0, (x / room) * 100))
        )}% 0 / var(--ax-column-rule-width) 100% no-repeat`
    )
    .join(", ");
  return { layers, color };
};

export const stretchItemTable = (root: ParentNode = document): void => {
  const doc = root.querySelector<HTMLElement>(".ax-doc.is-stretch");
  const filler = doc?.querySelector<HTMLElement>(".ax-items .ax-filler");
  const frame = doc?.querySelector<HTMLElement>(".ax-page-frame");
  if (!doc || !filler || !frame) return;
  filler.style.removeProperty("--ax-filler-height");
  const wrap = doc.querySelector<HTMLElement>(".ax-items-scroll");
  const table = doc.querySelector<HTMLTableElement>(".ax-items");
  wrap?.style.removeProperty("--ax-column-rules");
  wrap?.style.removeProperty("--ax-column-rule-color");
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  if (!printing || !frame.parentElement) return;
  const rules = wrap && table ? columnRules(wrap, table) : undefined;
  if (wrap && rules) {
    wrap.style.setProperty("--ax-column-rules", rules.layers);
    wrap.style.setProperty("--ax-column-rule-color", rules.color);
  }
  const zoom =
    parseFloat(getComputedStyle(document.documentElement).zoom || "1") || 1;
  // The whole document: the frame, and the letterhead footer after it when it prints on the
  // last page only.
  const content =
    doc.getBoundingClientRect().height /
    layoutScale(frame.parentElement, frame);
  const slack =
    STRETCH_SLACK + (zoom > 1 ? STRETCH_ZOOM_SLACK * (1 - 1 / zoom) : 0);
  filler.style.setProperty(
    "--ax-filler-height",
    `max(0px, calc(100vh / ${compactDecimal(zoom)} - ${Math.ceil(
      content + slack
    )}px))`
  );
};

/*
 * The tax and HSN summaries' "Total Tax In Words" as refrens.com writes it: "ZERO RUPEE AND
 * EIGHTEEN PAISE ONLY" in rupees, and in the document's own currency otherwise ("… DOLLARS AND
 * EIGHTEEN CENTS ONLY") — the shared widgets spell every amount in rupees and their words
 * helper is fixed at build time, so each line is rewritten after the render from its table's
 * Total row (the last cell, the total tax).
 */
export const respellTaxWords = (root: ParentNode = document): void => {
  const doc = root.querySelector<HTMLElement>(".ax-doc");
  const currency = (doc?.dataset.axCurrency || "INR").toUpperCase();
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
 * The item table on a phone or tablet screen (styles.css, "phones and tablets"): on a screen
 * up to PHONE_WIDTH every item reads as a card (is-cards); on one narrower than an A4 page
 * (PAPER_WIDTH, 794 px) the table stays as on paper while it fits its box, and one that would
 * scroll sideways keeps its headings in a row over the items (is-grid), or reads as cards with
 * more figure columns than a tablet row holds (has-many-figures). A screen as wide as the
 * page, and print, keep the table as it is, so the preview at A4 width matches the PDF.
 */
const PHONE_WIDTH = 640;
const PAPER_WIDTH = 794;

/* A table that grows after it was fitted (a font, a style set late) is fitted again. */
let fitTimer = 0;
let tableWatch: ResizeObserver | undefined;
const refitSoon = (): void => {
  window.clearTimeout(fitTimer);
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  fitTimer = window.setTimeout(() => fitItemsToScreen(), 0);
};

export const fitItemsToScreen = (root: ParentNode = document): void => {
  const printing =
    typeof window.matchMedia === "function" &&
    window.matchMedia("print").matches;
  root.querySelectorAll<HTMLElement>(".ax-items").forEach((table) => {
    if (typeof ResizeObserver === "function") {
      tableWatch ??= new ResizeObserver(refitSoon);
      tableWatch.observe(table);
    }
    table.classList.remove("is-cards", "is-grid");
    const box = table.parentElement;
    if (printing || !box) return;
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
  alignTotals(root);
};

/* Runs the after-render fixes each time the renderer draws the document or the window resizes. */
export const registerApexWords = (): void => {
  const state = window as typeof window & { axWordsRegistered?: boolean };
  if (state.axWordsRegistered || typeof document === "undefined") return;
  state.axWordsRegistered = true;
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      respellTaxWords();
      fitItemsToScreen();
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
export const registerApexPrint = (): void => {
  const state = window as typeof window & { axPrintRegistered?: boolean };
  if (state.axPrintRegistered || typeof window.matchMedia !== "function") {
    return;
  }
  state.axPrintRegistered = true;

  const pageless = () => Boolean(document.querySelector(".ax-doc.is-pageless"));
  // A Pageless PDF (one page as tall as the content) places nothing on pages, but its table is
  // fitted to the paper's width all the same: a wide one was cut off by 28 px.
  const pagelessLayout = () => {
    fitPrintTable();
    alignTotals();
  };
  // The totals are lined up last, on the fitted and split item columns.
  const printLayout = () => {
    joinTotals();
    fitPrintTable();
    splitTotals();
    alignTotals();
    stretchItemTable();
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
      fitPrintTable();
      alignTotals();
      stretchItemTable();
      resetFootersOnPageEdge();
    }
  });
  // A browser's own print counts its pages before the listener above runs: the same layout is
  // prepared first (prepareBrowserPrint), so the count is the printed one.
  window.addEventListener("beforeprint", () =>
    prepareBrowserPrint(pageless() ? pagelessLayout : printLayout)
  );
  window.addEventListener("afterprint", () => resetFootersOnPageEdge());
};
