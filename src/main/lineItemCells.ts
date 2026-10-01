import formatCurrency from "../widgets/shared/formatCurrency";
import type {
  InvoiceTemplateColumn,
  InvoiceTemplateCell,
} from "./invoiceTemplateNormalization";
import type { FlattenedInvoicePayload } from "./invoicePayloadContract";
// The business's unit list carries only its overrides (a business that never
// customised its units stores none at all), so the product's own shipped
// list has to be merged back in before a code can be looked up — mirrors
// @refrens/birds' getUnitsWithDefaults, which ceres has no dependency on.
// defaultUnits.json is a verbatim copy of @refrens/fence/inventory/defaultUnitsList.json.
// ceres has no @refrens dependencies, so the list cannot be imported and is vendored instead.
// It is a second copy: when a unit is added or renamed in fence, update this file too, or a
// business using the new unit prints nothing for it.
import shippedUnitsData from "./defaultUnits.json";
// A currency's own minor-unit length, used only when the document does not
// carry a `subUnitLength` of its own — refrens.com resolves it the same way
// (`defaultSubUnitLength ?? currencyData[currency]?.decimalDigits ?? 2`, lydia
// lineItems.js and customColumns/invoiceValue.js). Without it JPY and KWD
// print two decimals.
// Verbatim `key -> decimalDigits` projection of
// @refrens/fence/currencies/currency.json. ceres has no @refrens dependencies,
// so it is vendored rather than imported. Regenerate with:
//   jq 'with_entries(.value |= .decimalDigits)' \
//     node_modules/@refrens/fence/currencies/currency.json
import currencyDecimalsData from "./currencyDecimals.json";

type UnknownRecord = Record<string, unknown>;

interface UnitDefinition {
  key: string;
  code: string;
}

const shippedUnits = shippedUnitsData as UnitDefinition[];
const currencyDecimals = currencyDecimalsData as Record<string, number>;

// The money columns the product ships, kept printing as money rather than
// raw numbers: the hand-built table this replaces printed every one of them
// through formatCurrency. `rate` is money too but carries its own precision
// rule, so it is formatted separately below.
const MONEY_SYSTEM_COLUMN_KEYS = new Set([
  "amount",
  "sgst",
  "cgst",
  "igst",
  "utgst",
  "total",
  "tax",
]);

// System columns that are plain identifiers or free text — printed as stored.
// Everything outside both sets is a business-added column, formatted by its
// declared dataType. quantity/rate/gstRate/discount/unit get their own
// bespoke formatting below.
const TEXT_SYSTEM_COLUMN_KEYS = new Set([
  "name",
  "item",
  "hsn",
  "classification",
  "msic",
  "sku",
]);

const DEFAULT_LOCALE = "en-IN";
const DEFAULT_SUB_UNIT_LENGTH = 2;

export interface CellContext {
  locale: string;
  currency: string;
  subUnitLength: number;
  customCurrencySymbol?: string;
  roundOffQuantity: boolean;
  roundOffRate: boolean;
  applyNumberFormatToDiscounts: boolean;
  ownerTimeZone?: string;
  showUnitInQuantity: boolean;
  // Built once per document from the business's overrides over the shipped
  // list, so a unit lookup is O(1) per line rather than a fresh concat and
  // linear scan of ~380 entries on every cell that needs one.
  unitLabels: Map<string, string>;
  // The second-currency amount (S10) is gated on both a currency mismatch and
  // a usable rate — `rate` is null whenever either is missing, so callers
  // never have to re-derive the gate themselves.
  secondCurrency: { code: string; rate: number | null };
}

// Mirrors invoiceTemplateNormalization's own toStringValue: a plain string or
// primitive prints as itself, anything else (null, an object, an array)
// prints as nothing rather than "[object Object]" — the safe default for a
// column this phase does not reformat.
const toStringValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// Accepts a number, or a business-typed string that may carry thousands
// separators ("1,234.5"), and rejects everything else (null, objects,
// unparseable text) by returning null rather than NaN or 0 — the caller
// decides what "no value" prints as.
const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const stripped = value.replace(/,/g, "").trim();
    if (stripped.length === 0) {
      return null;
    }

    const parsed = Number(stripped);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

// Dates arrive as ISO strings on this contract (see invoicePayloadContract's
// `dueDate?: string | Date` and friends) — anything else, including a
// hostile object, is rejected up front rather than handed to `new Date()`.
const toValidDate = (value: unknown): Date | null => {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

// Where a document's own presentation settings actually come from. The
// wrapper that lydia hands its in-app templates (`businessLocale`,
// `businessCurrency`, `ownerTimeZone`, `invoice.applyNumberFormatToDiscounts`)
// does not exist in the iframe: it is pointed straight at serana
// (`{apiDomain}/invoices/{id}?_at=…&populateBusiness=true`, lydia
// components/utils/iframeUtils.js buildIframeSrc), which returns the raw
// document with the whole owning business populated on `invoice.owner`. So
// each of those is read from its wrapper name first — a template rendered
// through the wrapped shape keeps working — and then from the business on the
// document, which is the only one of the two the real iframe ever has.
//
// Exported because normalization resolves the same business for the unit list
// and the description-width switch. One chain, one place: two copies drifting
// would silently read a different business for units than for currency.
export const getOwnerBusiness = (
  invoice: FlattenedInvoicePayload
): UnknownRecord => {
  const record = invoice as unknown as UnknownRecord;
  return asRecord(record.ownerBusiness ?? record.business ?? record.owner);
};

// conversionRates never made it into ceres's own payload contract (it exists
// only on the unrelated payment-table type), so it is read here by the name
// refrens.com uses — invoice.conversionRates keyed by currency code, exactly
// as lydia's own line-items widget reads it (src/components/widgets/invoice/
// lineItems.js). A rate that is missing, zero or negative is "no usable rate":
// the caller prints the amount alone rather than a manufactured zero.
const getSecondCurrency = (
  invoice: FlattenedInvoicePayload
): { code: string; rate: number | null } => {
  const record = invoice as unknown as UnknownRecord;
  // `business?.currency || owner?.currency` is how refrens.com picks it
  // (lydia Invoice.js:243).
  const businessCurrency =
    toNonEmptyString(record.businessCurrency) ??
    toNonEmptyString(getOwnerBusiness(invoice).currency) ??
    "";
  const invoiceCurrency = toNonEmptyString(invoice.currency) ?? "";

  if (!businessCurrency || businessCurrency === invoiceCurrency) {
    return { code: businessCurrency, rate: null };
  }

  const conversionRates = asRecord(record.conversionRates);
  const rate = toFiniteNumber(conversionRates[businessCurrency]);

  return {
    code: businessCurrency,
    rate: rate !== null && rate > 0 ? rate : null,
  };
};

export const buildCellContext = (
  invoice: FlattenedInvoicePayload,
  unitColumnMode: string,
  unitLabels: Map<string, string>
): CellContext => {
  const record = invoice as unknown as UnknownRecord;
  const ownerBusiness = getOwnerBusiness(invoice);
  const currency = toNonEmptyString(invoice.currency) ?? "INR";

  return {
    // The document's own locale wins; the business's is the fallback —
    // refrens.com's `locale = businessLocale` default in lydia's LineItems,
    // where businessLocale is `business.locale` (Invoice.js:237).
    locale:
      toNonEmptyString(record.locale) ??
      toNonEmptyString(record.businessLocale) ??
      toNonEmptyString(ownerBusiness.locale) ??
      DEFAULT_LOCALE,
    currency,
    // A document without its own minor-unit length takes the currency's:
    // `defaultSubUnitLength ?? currencyData[currency]?.decimalDigits ?? 2`
    // (lydia lineItems.js:105). Without this JPY and KWD print two decimals.
    subUnitLength:
      typeof invoice.subUnitLength === "number" &&
      Number.isFinite(invoice.subUnitLength)
        ? invoice.subUnitLength
        : currencyDecimals[currency] ?? DEFAULT_SUB_UNIT_LENGTH,
    customCurrencySymbol:
      toNonEmptyString(invoice.customCurrencySymbol) ?? undefined,
    roundOffQuantity: Boolean(invoice.roundOffQuantity),
    roundOffRate: Boolean(invoice.roundOffRate),
    // A business-level experimental switch, not a document field — read off
    // the owning business's configuration the way refrens.com does
    // (`bizExperimental.applyNumberFormatToDiscounts`, lydia Invoice.js).
    applyNumberFormatToDiscounts: Boolean(
      invoice.applyNumberFormatToDiscounts ??
        asRecord(asRecord(ownerBusiness.configuration).experimental)
          .applyNumberFormatToDiscounts
    ),
    ownerTimeZone:
      toNonEmptyString(record.ownerTimeZone) ??
      toNonEmptyString(ownerBusiness.timeZone) ??
      undefined,
    showUnitInQuantity: unitColumnMode === "MERGE_QUANTITY",
    unitLabels,
    secondCurrency: getSecondCurrency(invoice),
  };
};

// Resolves a stored unit code to the business's own wording. The business's
// list carries only what it changed or added, so the shipped list is merged
// underneath — a business override always wins over the shipped entry with
// the same key. A code absent from both resolves to nothing: never the raw
// stored code (SC34).
// Builds the lookup once per document: the business's own units win over the
// shipped list, and a code the business has since deleted resolves to nothing
// rather than printing raw (S6).
export const buildUnitLabelMap = (units: unknown): Map<string, string> => {
  const map = new Map<string, string>();

  try {
    [...shippedUnits, ...(Array.isArray(units) ? units : [])].forEach(
      (entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }

        const { key, code } = entry as UnitDefinition;
        if (typeof key !== "string" || key.trim().length === 0) {
          return;
        }

        map.set(key, typeof code === "string" ? code.trim().toLowerCase() : "");
      }
    );
  } catch (_) {
    return map;
  }

  return map;
};

export const resolveUnitLabel = (
  unitCode: unknown,
  unitLabels: Map<string, string>
): string => {
  try {
    if (typeof unitCode !== "string" || unitCode.trim().length === 0) {
      return "";
    }

    return unitLabels.get(unitCode) ?? "";
  } catch (_) {
    return "";
  }
};

// The quantity/summary-row number format: refrens.com prints the magnitude
// (lydia's quantity getValue calls `Math.abs`) and lets the rounding setting
// decide the fraction digits.
const formatMagnitude = (
  value: unknown,
  context: CellContext,
  rounded: boolean
): string => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return "";
  }

  return Math.abs(numeric).toLocaleString(
    context.locale,
    rounded
      ? {
          minimumFractionDigits: context.subUnitLength,
          maximumFractionDigits: context.subUnitLength,
        }
      : { minimumFractionDigits: 0, maximumFractionDigits: 20 }
  );
};

// A business column's own number format. Unlike the quantity this keeps the
// sign — refrens.com's formateNumberByLocale (lydia helpers/invoice.js) does
// not take the magnitude, so a negative custom value must stay negative — and
// pins the fraction digits to the document's minor-unit length, which is what
// getCustomValue passes as its `formateOptions`.
const formatBusinessNumber = (value: unknown, context: CellContext): string => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return "";
  }

  return numeric.toLocaleString(context.locale, {
    minimumFractionDigits: context.subUnitLength,
    maximumFractionDigits: context.subUnitLength,
  });
};

// `subUnitLength` is `null` for the one caller that must NOT pin the
// precision: a flat discount without the business's number-format switch,
// where refrens.com passes `undefined` straight into formateCurrency and lets
// the currency's own default decide (₹5,000 rather than ₹5,000.00). A default
// parameter cannot express that — passing `undefined` would re-trigger it.
const formatMoney = (
  value: unknown,
  context: CellContext,
  subUnitLength: number | null = context.subUnitLength
): string => {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return "";
  }

  return formatCurrency(
    numeric,
    context.currency,
    context.locale,
    subUnitLength,
    context.customCurrencySymbol
  );
};

// A business date column prints as "Sep 08, 2026" on every document, in the
// owning business's own time zone. refrens.com formats it with moment —
// `formateShortDateWithOffset(value, offset)` when the owner has a time zone,
// plain `moment(value).format(SHORT_DATE_FORMAT)` otherwise — and
// SHORT_DATE_FORMAT ('MMM DD, YYYY', @refrens/birds format-time) is
// locale-independent. So the locale is pinned to en-US here rather than the
// document's, which would reorder the parts ("08 Sep 2026" on en-IN); the IANA
// zone on the business (`owner.timeZone`, e.g. "Asia/Kolkata") is what
// refrens.com turns into that offset, and Intl takes it directly.
const formatBusinessDate = (value: unknown, context: CellContext): string => {
  const date = toValidDate(value);
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: context.ownerTimeZone,
  }).format(date);
};

// A batch date is the one date refrens.com prints numerically — lydia's batch
// getValue is `new Date(value).toLocaleDateString(locale)`, not the custom
// column's moment format.
const formatBatchDate = (value: unknown, context: CellContext): string => {
  const date = toValidDate(value);
  if (!date) {
    return "";
  }

  return date.toLocaleDateString(context.locale);
};

const formatQuantity = (item: UnknownRecord, context: CellContext): string => {
  const formatted = formatMagnitude(
    item.quantity,
    context,
    context.roundOffQuantity
  );
  if (formatted.length === 0) {
    return "";
  }

  if (!context.showUnitInQuantity) {
    return formatted;
  }

  const unitLabel = resolveUnitLabel(item.unit, context.unitLabels);
  return unitLabel ? `${formatted} (${unitLabel})` : formatted;
};

// The rate is a currency column (`dataType: 'currency'` in
// @refrens/fence/invoices/lineItems.json), so it prints with the document's
// symbol like every other money cell. Its precision is the odd one out:
// refrens.com passes `roundOffRate ? subUnitLength : countDecimals(item.rate)`
// (lydia customColumns/invoiceValue.js), so an unrounded rate keeps exactly
// the decimals it was entered with instead of being padded to the minor unit.
const countDecimals = (value: number): number => {
  const text = String(Math.abs(value));
  const separator = text.indexOf(".");
  return separator === -1 ? 0 : text.length - separator - 1;
};

const formatRate = (item: UnknownRecord, context: CellContext): string => {
  const numeric = toFiniteNumber(item.rate);
  if (numeric === null) {
    return "";
  }

  return formatMoney(
    numeric,
    context,
    context.roundOffRate ? context.subUnitLength : countDecimals(numeric)
  );
};

const formatTaxRate = (item: UnknownRecord): string => {
  const numeric = toFiniteNumber(item.gstRate);
  return `${numeric === null ? 0 : numeric}%`;
};

// A bare number is talos/lydia's own shorthand for "a percentage with no
// declared type" (talos/src/invoices.js's `discount` field defaults to
// `{ discountType: 'PERCENTAGE' }`, and lydia's formateCommission defaults
// its own `type` parameter to 'PERCENTAGE' the same way) — so it is read as
// an amount with no type, not rejected as the wrong shape.
const formatDiscount = (item: UnknownRecord, context: CellContext): string => {
  const { discount } = item;

  let rawAmount: unknown;
  let discountType: string | null;

  if (typeof discount === "number") {
    rawAmount = discount;
    discountType = null;
  } else if (
    discount &&
    typeof discount === "object" &&
    !Array.isArray(discount)
  ) {
    const record = discount as UnknownRecord;
    rawAmount = record.amount;
    discountType = toNonEmptyString(record.discountType);
  } else {
    return "";
  }

  const amount = toFiniteNumber(rawAmount);
  // A zero discount is the same as no discount to the reader — SC29 asks for
  // an empty cell, not "0%" or a formatted zero amount.
  if (amount === null || amount === 0) {
    return "";
  }

  // Only FIXED_AMOUNT is money; every other value — PERCENTAGE, missing, or
  // unrecognised — reads as a percentage, matching formateCommission's own
  // default (lydia/src/lib/locale.js:45-56). formateCommission passes its
  // `subUnitLength` straight through, so without the business's number-format
  // switch a flat discount takes the currency's own default precision
  // (₹5,000, not ₹5,000.00) and a percentage keeps the digits it was entered
  // with.
  if (discountType === "FIXED_AMOUNT") {
    return formatMoney(
      amount,
      context,
      context.applyNumberFormatToDiscounts ? context.subUnitLength : null
    );
  }

  // The `&&` below is a falsy test on purpose, not a missing null-check. It
  // reproduces formateCommission's own `subUnitLength ? n.toFixed(…) : n`
  // exactly, so a zero-decimal currency (JPY resolves subUnitLength to 0 in
  // both codebases) skips the padding here the same way it does on
  // refrens.com. Turning it into `!= null` would print a different percentage
  // from the same document in the web app.
  return context.applyNumberFormatToDiscounts && context.subUnitLength
    ? `${amount.toFixed(context.subUnitLength)}%`
    : `${amount}%`;
};

// Batch data lives on the line the same way serials do (S8's own gated
// field, `item.allocations`) — lydia reads the first allocation's batchData
// the same way (InvoiceProps' showBatchColumns/getValue in
// customColumns/invoiceValue.js). Which batch columns are dates is decided
// once, where the columns are built (invoiceTemplateNormalization's
// injectBatchColumns sets dataType), so this reads the type off the column
// rather than keeping a second copy of the key list.

const getBatchData = (item: UnknownRecord): UnknownRecord => {
  const allocations = asArray(item.allocations).map((entry) => asRecord(entry));
  const first = allocations.length > 0 ? allocations[0] : {};
  return asRecord(first.batchData);
};

const formatBatchColumn = (
  column: InvoiceTemplateColumn,
  item: UnknownRecord,
  context: CellContext
): string => {
  const raw = getBatchData(item)[column.key];
  if (raw === null || raw === undefined || raw === "") {
    return "";
  }

  return column.dataType === "date"
    ? formatBatchDate(raw, context)
    : toStringValue(raw);
};

// A cess's rate and amount live on the line under the same keys the cess
// itself declares (`cessKey`/`cessAmountKey`), inside `item.custom` — matches
// lydia's InvoiceProps (`item.custom[cess.cessKey]`, `item.custom[cess.cessAmountKey]`).
const formatCessRate = (
  column: InvoiceTemplateColumn,
  item: UnknownRecord
): string => {
  const numeric = toFiniteNumber(asRecord(item.custom)[column.key]);
  return `${numeric === null ? 0 : numeric}%`;
};

const formatCessAmount = (
  column: InvoiceTemplateColumn,
  item: UnknownRecord,
  context: CellContext
): string => formatMoney(asRecord(item.custom)[column.key], context);

// A business-added column stores its value under the column's key inside
// `item.custom`, never on the line itself — refrens.com's getCustomValue
// (lydia helpers/invoice.js) reads `item.custom[key]` and nothing else, and
// the cess columns above already read the same place. The dataType names are
// the product's own (@refrens/fence/helpers/customDataTypes.json:
// text | number | date | currency | formula); a formula column declares what
// it returns in `fxReturnType`. A type with no formatter prints as stored,
// the way getCustomValue returns the raw value when its formatterMap misses.
const formatBusinessColumn = (
  column: InvoiceTemplateColumn,
  item: UnknownRecord,
  context: CellContext
): string => {
  const raw = asRecord(item.custom)[column.key];
  if (raw === null || raw === undefined || raw === "") {
    return "";
  }

  switch (column.dataType) {
    case "number":
      return formatBusinessNumber(raw, context);
    case "currency":
      return formatMoney(raw, context);
    case "date":
      return formatBusinessDate(raw, context);
    case "formula":
      return column.fxReturnType === "currency"
        ? formatMoney(raw, context)
        : formatBusinessNumber(raw, context);
    default:
      return toStringValue(raw);
  }
};

const formatByKind = (
  column: InvoiceTemplateColumn,
  item: UnknownRecord,
  context: CellContext
): string => {
  // Batch and cess columns are dynamic — their keys come from the payload
  // (defaultBatchColumns / a cess's own cessKey), not from a fixed set of
  // system names — so they're dispatched by the marker normalization stamped
  // on the column rather than by key.
  switch (column.cellKind) {
    case "batch":
      return formatBatchColumn(column, item, context);
    case "cess-rate":
      return formatCessRate(column, item);
    case "cess-amount":
      return formatCessAmount(column, item, context);
    default:
      break;
  }

  switch (column.key) {
    case "quantity":
      return formatQuantity(item, context);
    case "rate":
      return formatRate(item, context);
    case "gstRate":
      return formatTaxRate(item);
    case "discount":
      return formatDiscount(item, context);
    case "unit":
      // Never the raw stored code — a code the business has since deleted
      // must resolve to an empty cell, not leak the identifier (SC34).
      return resolveUnitLabel(item.unit, context.unitLabels);
    default:
      if (MONEY_SYSTEM_COLUMN_KEYS.has(column.key)) {
        const amount = toFiniteNumber(item[column.key]);
        return amount === null ? "" : formatMoney(amount, context);
      }

      if (TEXT_SYSTEM_COLUMN_KEYS.has(column.key)) {
        return toStringValue(item[column.key]);
      }

      return formatBusinessColumn(column, item, context);
  }
};

// Every exported function catches its own errors and returns "" — the
// renderer wraps the whole template in a try/catch that replaces the entire
// document with an error string on any throw, so one hostile cell value must
// never escape as an exception. See SC31.
export const formatCellValue = (
  column: InvoiceTemplateColumn,
  item: UnknownRecord,
  context: CellContext
): string => {
  try {
    return formatByKind(column, item, context);
  } catch (_) {
    return "";
  }
};

// The second-currency amount (S10) is presentational only — it rides under
// the "amount" cell's own text rather than becoming a column of its own, so
// it can never be mistaken for a real column when the table is walked by key.
const resolveSecondaryAmountText = (
  item: UnknownRecord,
  context: CellContext
): string | undefined => {
  try {
    if (context.secondCurrency.rate === null) {
      return undefined;
    }

    const amount = toFiniteNumber(item.amount);
    if (amount === null) {
      return undefined;
    }

    return formatCurrency(
      amount * context.secondCurrency.rate,
      context.secondCurrency.code,
      context.locale,
      context.subUnitLength,
      context.customCurrencySymbol
    );
  } catch (_) {
    return undefined;
  }
};

// The item/name column carries the row's own label ("Total"/"Sub total")
// rather than a sum.
const LABEL_COLUMN_KEYS = new Set(["name", "item"]);

export const buildRowCells = (
  context: CellContext,
  columns: InvoiceTemplateColumn[],
  item: UnknownRecord
): InvoiceTemplateCell[] => {
  return columns.map((column) => {
    const cell: InvoiceTemplateCell = {
      key: column.key,
      text: formatCellValue(column, item, context),
      className: column.className,
      label: column.label,
      isItemCell: LABEL_COLUMN_KEYS.has(column.key),
    };

    if (column.key === "amount") {
      const secondaryText = resolveSecondaryAmountText(item, context);
      if (secondaryText) {
        cell.secondaryText = secondaryText;
      }
    }

    return cell;
  });
};

// Columns this phase never totals: a rate or a tax rate summed is meaningless
// (S11), and the tax-amount columns (sgst/cgst/igst/utgst/tax/taxAmount) are
// deliberately left blank per the phase spec rather than summed the way
// lydia's own getGroupedLineItems.js happens to do it for its reducer.
const NEVER_TOTAL_KEYS = new Set([
  "rate",
  "gstRate",
  "tax",
  "taxAmount",
  "sgst",
  "cgst",
  "igst",
  "utgst",
  "discount",
  "hsn",
  "sku",
  "classification",
  "msic",
  "unit",
]);

// quantity, amount, line subtotal (subTotal) and the document total (total)
// are always summed when the row is configured to show one at all (S11).
const ALWAYS_TOTAL_KEYS = new Set(["quantity", "amount", "subTotal", "total"]);

const isAdditionalChargeRow = (row: UnknownRecord): boolean =>
  Boolean(row.isAdditionalCharge);

// Sums an always-totalled system column, treating a missing or hostile value
// on any one line as zero rather than disqualifying the whole column — these
// are core numeric fields the payload is expected to always carry.
const sumAlwaysTotalColumn = (rows: UnknownRecord[], key: string): number =>
  rows.reduce((sum, row) => {
    if (isAdditionalChargeRow(row)) {
      return sum;
    }

    return sum + (toFiniteNumber(row[key]) ?? 0);
  }, 0);

// Sums a business column the business set up to be summarised, reading each
// line's value out of `item.custom` where business columns live. A value that
// is present but not a number on even one line disqualifies the whole column
// (SC45) — dropping just that line's value would print a total that doesn't
// match the column above it. A line that simply has no value for the column
// contributes nothing rather than disqualifying it.
const sumBusinessColumn = (
  rows: UnknownRecord[],
  key: string
): number | null => {
  const presentValues = rows
    .filter((row) => !isAdditionalChargeRow(row))
    .map((row) => asRecord(row.custom)[key])
    .filter((raw) => raw !== null && raw !== undefined && raw !== "");

  if (presentValues.length === 0) {
    return null;
  }

  const hasNonNumericValue = presentValues.some(
    (raw) => toFiniteNumber(raw) === null
  );
  if (hasNonNumericValue) {
    return null;
  }

  return presentValues.reduce(
    (sum: number, raw) => sum + (toFiniteNumber(raw) ?? 0),
    0
  );
};

const isSummableBusinessColumn = (column: InvoiceTemplateColumn): boolean =>
  !column.cellKind &&
  !ALWAYS_TOTAL_KEYS.has(column.key) &&
  !NEVER_TOTAL_KEYS.has(column.key) &&
  !LABEL_COLUMN_KEYS.has(column.key) &&
  column.summarise === true;

const buildTotalsCells = (
  context: CellContext,
  columns: InvoiceTemplateColumn[],
  rows: UnknownRecord[],
  label: string
): InvoiceTemplateCell[] => {
  return columns.map((column) => {
    let text = "";

    try {
      if (LABEL_COLUMN_KEYS.has(column.key)) {
        text = label;
      } else if (column.key === "quantity") {
        // The same format the printed quantity cells use, so the row under
        // them does not tell a different story about the same document
        // (refrens.com reuses its own quantity getValue here).
        text = formatMagnitude(
          sumAlwaysTotalColumn(rows, column.key),
          context,
          context.roundOffQuantity
        );
      } else if (ALWAYS_TOTAL_KEYS.has(column.key)) {
        text = formatMoney(sumAlwaysTotalColumn(rows, column.key), context);
      } else if (isSummableBusinessColumn(column)) {
        const total = sumBusinessColumn(rows, column.key);
        text =
          total === null
            ? ""
            : formatBusinessColumn(
                column,
                { custom: { [column.key]: total } },
                context
              );
      }
    } catch (_) {
      text = "";
    }

    return {
      key: column.key,
      text,
      className: column.className,
      label: column.label,
      // A totals row prints its own label and sums; it never carries an item.
      isItemCell: false,
    };
  });
};

// The document summary row (S11): totals quantity, amount, line subtotal and
// the document total; leaves rate, tax rate and every tax-amount column
// blank; totals a business column only when it opted in and holds numbers
// throughout. Additional-charge lines are excluded from every total.
export const buildSummaryRow = (
  context: CellContext,
  columns: InvoiceTemplateColumn[],
  rows: UnknownRecord[]
): InvoiceTemplateCell[] => buildTotalsCells(context, columns, rows, "Total");

// A group's sub-total row (S11): the same totalling rules as the document
// summary, scoped to the one group's own lines.
export const buildGroupSubTotalRow = (
  context: CellContext,
  columns: InvoiceTemplateColumn[],
  rows: UnknownRecord[]
): InvoiceTemplateCell[] =>
  buildTotalsCells(context, columns, rows, "Sub total");
