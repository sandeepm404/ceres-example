import { normalizeInvoicePayload } from "./invoicePayloadContract";
import { resolveTaxVisibility } from "../widgets/shared/taxVisibility";
import type {
  FlattenedInvoicePayload,
  InvoicePayloadInput,
} from "./invoicePayloadContract";
import {
  buildRowCells,
  buildCellContext,
  buildUnitLabelMap,
  resolveUnitLabel,
  buildSummaryRow,
  buildGroupSubTotalRow,
  getOwnerBusiness,
} from "./lineItemCells";

type UnknownRecord = Record<string, unknown>;

export interface InvoiceTemplateColumn {
  key: string;
  label: string;
  className: string;
  isHidden: boolean;
  dataType: string;
  fxReturnType: string;
  summarise: boolean;
  // Set on the batch and cess columns this phase synthesises — their keys
  // are dynamic (a business's own cessKey, or a standard batch field), so a
  // cell can't be formatted correctly from the key alone the way a system
  // column can.
  cellKind?: "batch" | "cess-rate" | "cess-amount";
}

export interface InvoiceTemplateCell {
  key: string;
  text: string;
  className: string;
  // True on the one cell that carries the item itself — its name, SKU, merged
  // notes and thumbnail. Which column that is, is a document decision, so it
  // is made here once rather than re-derived from the key in the template.
  isItemCell: boolean;
  // The column's own resolved header label (already renamed/relabelled per
  // S1) carried onto every cell — the narrow-width stacked view (S13) prints
  // it beside the value via CSS attr(), so a cell never has to be matched
  // back to its column by position to know what to call itself.
  label: string;
  // The business's own currency, shown under the amount when the document's
  // currency differs and a usable rate is present (S10). Presentational only:
  // never totalled, never on the summary row.
  secondaryText?: string;
}

// The item cell's own decorations — kept off InvoiceTemplateCell because they
// need conditional markup (a <small> note vs. an inline bracket) that a flat
// text cell can't carry; the template branches on these fields directly.
export interface InvoiceTemplateItemCell {
  name: string;
  showSku: boolean;
  sku: string;
  // true when the SKU is also shown, so mergedNotes print as small notes;
  // false prints the same strings inline, in brackets, beside the name.
  mergedAsNote: boolean;
  mergedNotes: string[];
  showThumbnail: boolean;
  thumbnailImages: string[];
}

// What prints under the line rather than in a column — gated on presence so
// a line carrying none of these renders as a single row (SC40).
export interface InvoiceTemplateExtras {
  hasAny: boolean;
  hasDescription: boolean;
  description: string;
  descriptionFullWidth: boolean;
  images: string[];
  // A line's images sit beside its description when there's room for them
  // (five or fewer); more than that and they move to their own row (SC38).
  imagesInline: boolean;
  imagesRow: boolean;
  originalImages: string[];
  hasOriginalImages: boolean;
  hasSerials: boolean;
  serials: string[];
  serialsLabel: string;
}

export interface InvoiceTemplateRow {
  cells: InvoiceTemplateCell[];
  // Named lineNumber rather than the more obvious `index`: handlebars-loader's
  // partialDirs auto-require resolves any mustache expression it can't prove is
  // a plain property against every widget directory, and "index" always
  // resolves there (every widget ships an index.ts) — so `{{index}}` silently
  // compiles to a require() of an unrelated widget module instead of a lookup.
  lineNumber: number | null;
  isGroupHeading: boolean;
  isAdditionalCharge: boolean;
  rowClass: string;
  item: InvoiceTemplateItemCell;
  extras: InvoiceTemplateExtras;
  // True for the document summary row and a group's sub-total row (S11) —
  // both print every cell's own text, rather than routing the name-ish
  // column through the item-cell markup a real line uses.
  isTotalsRow: boolean;
  // The stretch filler (S12): a single row of empty cells, one per visible
  // column, so the table's vertical dividers stay unbroken through the added
  // blank space (SC49) rather than one merged cell breaking them. Carries no
  // real line, so it renders through the same cell markup every other row
  // uses — never a second markup path.
  isFillerRow: boolean;
}

export interface InvoiceTemplateVisibility {
  shippedTo: boolean;
  shippedFrom: boolean;
  transport: boolean;
  showLogistics: boolean;
  singleLogistics: boolean;
  showBankAccount: boolean;
  showUpi: boolean;
  showBankUpiSection: boolean;
  contactStrip: boolean;
  showIgst: boolean;
  showCgstSgst: boolean;
  isUtgst: boolean;
  showTaxTable: boolean;
  showHsnSummary: boolean;
  showPaymentsTable: boolean;
  showSummaryCess: boolean;
  showSku: boolean;
  showHsn: boolean;
  showThumbnailAsColumn: boolean;
  showInlineHsn: boolean;
  showInlineClassification: boolean;
  showSkuInName: boolean;
  showUnitInName: boolean;
  upiShrink: boolean;
  letterHeadOnFirstPage: boolean;
  footerOnLastPage: boolean;
  itemNameFullWidth: boolean;
  isDescriptionFullWidth: boolean;
  showDescriptionFullWidth: boolean;
  // S13: true while the business has not customised its columns, so the
  // stacked view shows the standard short set for the document type.
  usesShortSet: boolean;
  showStatusTagInPrint: boolean;
  visibleColumnCount: number;
  // S12: a short table grows to fill the page's blank space instead of
  // leaving it bare. Gated on both the business switch and the document's
  // own toggle — either one off means nothing changes (SC50).
  tableStretchEnabled: boolean;
  // S13: a long value wraps within its column instead of forcing the table
  // (and the page) wider.
  textWrapEnabled: boolean;
}

export interface InvoiceTemplateMappedState {
  qr: {
    top: string;
    upi: string;
  };
  upi: {
    id: string;
  };
  columns: InvoiceTemplateColumn[];
  rows: InvoiceTemplateRow[];
  irn: {
    isCancelled: boolean;
  };
  visibility: InvoiceTemplateVisibility;
  payments: {
    tds: number;
    received: number;
    transactionCharge: number;
    paid: number;
    due: number;
  };
}

export interface InvoiceTemplateDerivedState {
  showHsnColumn: boolean;
  showClassificationColumn: boolean;
  showInlineHsn: boolean;
  showInlineClassification: boolean;
  showSkuInName: boolean;
  showUnitInName: boolean;
}

export interface NormalizedInvoiceTemplateState {
  invoice: FlattenedInvoicePayload;
  advanceOptions: UnknownRecord;
  pdfOptions: UnknownRecord;
  mapped: InvoiceTemplateMappedState;
  derived: InvoiceTemplateDerivedState;
}

// The column that names the line, and the unit column that qualifies its
// quantity. Both are read by the layout context (the S13 short set) and by
// the column injectors further down, so they are declared once, up here.
const ITEM_COLUMN_KEYS = new Set(["name", "item"]);
const UNIT_COLUMN_KEY = "unit";

const COLUMN_CLASS_MAP: Record<string, string> = {
  item: "col-item",
  name: "col-item",
  quantity: "col-qty",
  qty: "col-qty",
  rate: "col-rate",
  amount: "col-amount",
  discount: "col-discount",
  gstrate: "col-gst-rate",
  tax: "col-tax",
  igst: "col-igst",
  total: "col-total",
  hsn: "col-hsn-sac",
  cess: "col-cess",
  cessrate: "col-cess",
  cessamount: "col-cess",
};

const asRecord = (value: unknown): UnknownRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as UnknownRecord;
};

const asArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
};

const pickFirstValue = (...values: unknown[]): unknown =>
  values.find((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    return !(typeof value === "string" && value.trim().length === 0);
  });

const toStringValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
};

const toNumberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};
const toBooleanValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].indexOf(normalized) !== -1) {
      return true;
    }

    // "false" is a truthy string, so never hand these to Boolean()
    if (["false", "0", "no", "off", ""].indexOf(normalized) !== -1) {
      return false;
    }

    return fallback;
  }

  return fallback;
};


const toNonEmptyString = (value: unknown): string | null => {
  const normalized = toStringValue(value);
  return normalized.length > 0 &&
    normalized !== "null" &&
    normalized !== "undefined"
    ? normalized
    : null;
};

const hasValue = (value: unknown): boolean => {
  const str = toStringValue(value);
  return str.length > 0 && str !== "null" && str !== "undefined";
};

const getColumnClass = (key: string): string => {
  const normalizedKey = key.toLowerCase();
  return COLUMN_CLASS_MAP[normalizedKey] || `col-${normalizedKey}`;
};

const buildUpiPayload = (upiId: string): string => {
  return `upi://pay?pa=${upiId}`;
};

const hasTransportData = (value: unknown): boolean => {
  const transport = asRecord(value);
  const transporter = asRecord(transport.transporter);

  return (
    hasValue(transport.transport) ||
    hasValue(transport.challanDate) ||
    hasValue(transport.challanNumber) ||
    hasValue(transport.extraInformation) ||
    hasValue(transport.distance) ||
    hasValue(transport.vehicleNumber) ||
    hasValue(transport.vehicleType) ||
    hasValue(transport.transportMode) ||
    hasValue(transport.transactionType) ||
    hasValue(transport.subSupplyType) ||
    hasValue(pickFirstValue(transporter.name, transport.transporterName)) ||
    hasValue(pickFirstValue(transporter.transporterId, transport.transporterId))
  );
};

const getNestedSummaryEntries = (
  value: unknown,
  listKey: "taxList" | "hsnList"
): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  return asArray(asRecord(value)[listKey]);
};

const getSummaryCessAmount = (
  value: unknown,
  listKey: "taxList" | "hsnList"
): number => {
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => {
      const record = asRecord(entry);
      return (
        sum +
        toNumberValue(
          pickFirstValue(
            record.totalCessAmountValue,
            record.totalCessAmount,
            record.cessAmount,
            record.totalCess
          ),
          0
        )
      );
    }, 0);
  }

  const record = asRecord(value);
  const directAmount = toNumberValue(
    pickFirstValue(
      record.totalCessAmountValue,
      record.totalCessAmount,
      record.cessAmount,
      record.totalCess
    ),
    0
  );

  if (directAmount > 0) {
    return directAmount;
  }

  return getNestedSummaryEntries(record, listKey).reduce<number>(
    (sum, entry) => {
      const row = asRecord(entry);
      return (
        sum +
        toNumberValue(
          pickFirstValue(
            row.totalCessAmountValue,
            row.totalCessAmount,
            row.cessAmount,
            row.totalCess
          ),
          0
        )
      );
    },
    0
  );
};

const getInvoiceCessTotal = (invoice: FlattenedInvoicePayload): number => {
  const totals = asRecord(invoice.totals);
  const finalTotal = asRecord(invoice.finalTotal);
  const cessTotalRecord = asRecord(
    pickFirstValue(totals.cessTotal, finalTotal.cessTotal)
  );

  const recordSum = (
    Object.values(cessTotalRecord) as unknown[]
  ).reduce<number>((sum, value) => sum + toNumberValue(value, 0), 0);

  if (recordSum > 0) {
    return recordSum;
  }

  return toNumberValue(
    pickFirstValue(
      totals.totalCess,
      totals.cess,
      finalTotal.totalCess,
      finalTotal.cess
    ),
    0
  );
};

const getTemplateLayoutContext = (invoice: FlattenedInvoicePayload) => {
  const invoiceTemplate = asRecord(invoice.template);
  const pdfOptions = asRecord(
    pickFirstValue(invoiceTemplate.pdfOptions, invoice.pdfOptions)
  );
  const advanceOptions = asRecord(invoice.advanceOptions);
  const finalTotal = asRecord(invoice.finalTotal);
  const invoiceType = toStringValue(invoice.invoiceType);
  const taxType = toStringValue(invoice.taxType);
  const isTaxInvoice = invoiceType === "INVOICE";

  const discountEnabled = Boolean(
    toNumberValue(
      pickFirstValue(finalTotal.discount, finalTotal.totalDiscount),
      0
    )
  );
  // S13: until a business customises its columns, the narrow-width view shows
  // a short set for the document type rather than every column — the same
  // split refrens.com makes from this flag (lydia InvoiceTable's
  // `isColumnsModified` branch). Absent flag means untouched columns.
  // Fail open: the short set applies only when the payload positively says the
  // columns are untouched. An absent flag is not a "no" — treating it as one
  // hid genuinely configured columns on a phone for every document the server
  // has not stamped, which is worse than showing more columns than needed.
  const columnsCustomised = invoice.isColumnsModified !== false;
  const shortSetKeys = new Set<string>(
    isTaxInvoice
      ? ["amount", "gstRate", "sgst", "cgst", "igst", "total"]
      : ["quantity", "rate", "amount"]
  );
  if (discountEnabled) {
    shortSetKeys.add("discount");
  }
  // The unit qualifies the quantity rather than competing with it: dropping it
  // from the stacked view would print "3" where the table says "3 ctn", which
  // is the ambiguity S6 exists to remove. S13's own unit rule says the stacked
  // view resolves the business's wording, so it has to survive the short set.
  shortSetKeys.add(UNIT_COLUMN_KEY);

  const hsnView = toStringValue(advanceOptions.hsnView, "DEFAULT");
  const ownerCountry =
    toStringValue(asRecord(invoice.owner).country) ||
    toStringValue(asRecord(invoice.billedBy).country);
  const templateName = toStringValue(
    pickFirstValue(
      invoiceTemplate.parentTemplate,
      invoiceTemplate.template,
      invoice.templateName,
      "default"
    ),
    "default"
  );
  const allowRenderHSN = [
    "classic",
    "crisp",
    "minimal",
    "simple",
    "minimal_v2",
    "enterprise",
  ].includes(templateName);

  const showHsnColumn =
    isTaxInvoice &&
    ownerCountry === "IN" &&
    taxType === "INDIA" &&
    (hsnView === "SPLIT" || (hsnView === "DEFAULT" && allowRenderHSN));
  const showClassificationColumn =
    ownerCountry === "MY" &&
    (hsnView === "SPLIT" || (hsnView === "DEFAULT" && allowRenderHSN));
  const showInlineHsn =
    isTaxInvoice &&
    taxType === "INDIA" &&
    (hsnView === "MERGE" || (hsnView === "DEFAULT" && !allowRenderHSN));
  const showInlineClassification =
    ownerCountry === "MY" &&
    (hsnView === "MERGE" || (hsnView === "DEFAULT" && !allowRenderHSN));
  const showSkuInName = Boolean(advanceOptions.showSkuInInvoice);
  // A separate unit column is what a business gets unless it changes the
  // setting (S6) — matches refrens.com's own default (lydia's InvoiceProps
  // and withUnitColumn.js both default to SEPARATE_COLUMN). Merging into the
  // quantity or the name is opt-in from here on.
  const unitColumnMode = toStringValue(
    advanceOptions.unitColumn,
    "SEPARATE_COLUMN"
  );
  const showUnitInName = unitColumnMode === "MERGE_NAME";
  const showUnitInQuantity = unitColumnMode === "MERGE_QUANTITY";
  // `ownerBusiness`/`business` are host-wrapper keys. The real iframe is
  // pointed straight at serana with `populateBusiness=true`, which populates
  // the whole owning business onto the document as `invoice.owner` (its
  // configuration `$select` includes `units` and `experimental` —
  // serana hooks/optimized-populate-document-owner-config.js) and sends no
  // wrapper at all. Reading only the wrapper names left every unit
  // unresolvable in production while the wrapped-shape tests stayed green.
  const businessConfiguration = asRecord(
    getOwnerBusiness(invoice).configuration
  );
  const businessUnits = businessConfiguration.units;
  // One lookup for the whole document — every later unit resolution, in the
  // cells and in the item cell, reads this rather than rebuilding the merge.
  const unitLabels = buildUnitLabelMap(businessUnits);
  const hasAnyUnit = asArray(invoice.items).some((entry) =>
    Boolean(resolveUnitLabel(asRecord(entry).unit, unitLabels))
  );

  // Batch columns are gated twice (S9): the business switch, and at least one
  // line actually carrying batch data — matches lydia's own
  // `showBatchColumns` in customColumns/invoiceValue.js, which reads batch
  // data off `item.allocations[].batchData` the same way S8's serials read
  // `item.allocations[].serials`. Gating on the switch alone would print a
  // set of empty columns on every document that has the feature on but no
  // batched lines.
  const hasBatchedItem = asArray(invoice.items).some((entry) =>
    asArray(asRecord(entry).allocations).some((allocation) =>
      Boolean(asRecord(allocation).batchData)
    )
  );
  const showBatchColumns =
    Boolean(advanceOptions.showBatchColumnsInInvoice) && hasBatchedItem;
  // The column definitions arrive on the payload itself — no new source of
  // column definitions is needed (design D13).
  const defaultBatchColumns = asArray(
    (invoice as unknown as UnknownRecord).defaultBatchColumns
  ).map((entry) => asRecord(entry));

  // Every cess applied to the document contributes a rate and an amount
  // column; one that is set up but not applied contributes nothing (S9).
  const appliedCesses = asArray(invoice.cesses)
    .map((entry) => asRecord(entry))
    .filter((cess) => Boolean(cess.isApplied));

  // showTotalsRow/hideGroupSubTotal are top-level invoice fields, matching
  // lydia's own Invoice.js (`const { showTotalsRow = false } = invoice`) and
  // getGroupedLineItems' `hideGroupSubTotal` (read off advanceOptions there).
  const showTotalsRow = Boolean(
    (invoice as unknown as UnknownRecord).showTotalsRow
  );
  const hideGroupSubTotal = Boolean(advanceOptions.hideGroupSubTotal);

  // Stretch is a template layout choice read the same way as everything else
  // in this function (S12/D-style reuse): the business's own switch, plus
  // the document's own toggle — matches refrens.com's own gating in
  // lydia's line-items widget (`experimental.stretchInvoiceTable` &&
  // `pdfOptions.fullHeightTable`). Either one absent leaves the table
  // unchanged (SC50).
  const businessExperimental = asRecord(businessConfiguration.experimental);
  const tableStretchEnabled =
    Boolean(businessExperimental.stretchInvoiceTable) &&
    Boolean(pdfOptions.fullHeightTable);

  // Text wrap is a per-document template choice (`invoice.template.textWrap`),
  // the same place lydia reads it from for its own line-items widget.
  const textWrapEnabled = Boolean(invoiceTemplate.textWrap);

  // Structural only — no `hideTaxes` and no export suppression. The item-table columns are
  // a property of the document's shape, so they must not move when a user toggles a
  // display setting; the totals rows apply both suppressions on top of this.
  const taxVisibility = resolveTaxVisibility({
    invoiceType,
    taxType,
    // `igst` is the document's inter-state boolean; `isIgst` never existed on a real
    // document and stays only as a fallback for a host on the older ceres contract.
    isInterState: pickFirstValue(invoice.igst, invoice.isIgst),
  });

  return {
    invoiceTemplate,
    pdfOptions,
    advanceOptions,
    isTaxInvoice,
    columnsCustomised,
    shortSetKeys,
    discountEnabled,
    taxType,
    showHsnColumn,
    taxVisibility,
    showClassificationColumn,
    showInlineHsn,
    showInlineClassification,
    showSkuInName,
    showUnitInName,
    unitColumnMode,
    showUnitInQuantity,
    unitLabels,
    hasAnyUnit,
    showBatchColumns,
    defaultBatchColumns,
    appliedCesses,
    showTotalsRow,
    hideGroupSubTotal,
    tableStretchEnabled,
    textWrapEnabled,
  };
};
// TDS/paid/due only exist per-currency, under the invoice's own settlement
// currency — `invoice.totalPaid`/`invoice.balanceAmount` are absent on
// invoices settled this way, so this is the only place those figures live.
const getPaymentConversion = (invoice: FlattenedInvoicePayload) => {
  const totalConversions = asRecord(invoice.totalConversions);
  const currency = toStringValue(invoice.currency);
  const conversion = asRecord(totalConversions[currency]);
  const received = toNumberValue(conversion.paid, 0);
  const transactionCharge = toNumberValue(conversion.transactionCharge, 0);

  return {
    tds: toNumberValue(conversion.tds, 0),
    received,
    transactionCharge,
    paid: received + transactionCharge,
    due: toNumberValue(conversion.due, 0),
  };
};


// Reconciles the business's saved column list with the unit column before
// printing, the way lydia's withUnitColumn.js does for the same reason: a
// business switched into separate-column mode, or one that saved its columns
// before the unit column existed, has no `unit` entry stored at all. Adding
// it here — beside quantity, unless the business moved it — keeps the
// printed header and body in step without writing anything back to the
// document. A business with no saved columns at all stays that way (SC4);
// injecting a lone unit column would print a table whose only column is Unit.

const injectUnitColumn = (
  columns: UnknownRecord[],
  unitColumnMode: string
): UnknownRecord[] => {
  if (unitColumnMode !== "SEPARATE_COLUMN" || columns.length === 0) {
    return columns;
  }

  if (columns.some((column) => toStringValue(column.key) === UNIT_COLUMN_KEY)) {
    return columns;
  }

  const definition: UnknownRecord = {
    key: UNIT_COLUMN_KEY,
    label: "Unit",
    dataType: "text",
  };

  const anchorIndex = columns.findIndex(
    (column) => toStringValue(column.key) === "quantity"
  );

  if (anchorIndex === -1) {
    return [...columns, definition];
  }

  return [
    ...columns.slice(0, anchorIndex + 1),
    definition,
    ...columns.slice(anchorIndex + 1),
  ];
};

// Only expiry and manufacturing dates print as a date; every other standard
// batch column (batch code/name, manufacturer name, manufacturer batch
// number) is free text — mirrors fence's own invoices/batchColumns.json.
const BATCH_DATE_COLUMN_KEYS = new Set(["expiryDate", "manufacturingDate"]);

// Batch columns are resolved only when both S9 conditions hold — the caller
// (getTemplateLayoutContext) has already combined them into `showBatchColumns`.
// A column already present in the business's own saved list wins over the
// standard definition rather than being duplicated.
const injectBatchColumns = (
  columns: UnknownRecord[],
  showBatchColumns: boolean,
  defaultBatchColumns: UnknownRecord[]
): UnknownRecord[] => {
  // A document with no saved columns stays with none (S1) — injecting batch
  // columns into an empty list prints the table of defaults the story forbids.
  if (
    !showBatchColumns ||
    defaultBatchColumns.length === 0 ||
    columns.length === 0
  ) {
    return columns;
  }

  const existingKeys = new Set(
    columns.map((column) => toStringValue(column.key))
  );

  const batchColumns: UnknownRecord[] = [];
  defaultBatchColumns.forEach((definition) => {
    const key = toStringValue(definition.key);
    if (key.length === 0 || existingKeys.has(key)) {
      return;
    }

    batchColumns.push({
      key,
      label: toStringValue(definition.label),
      dataType: BATCH_DATE_COLUMN_KEYS.has(key) ? "date" : "text",
      // A line with no batch shows empty batch cells rather than a
      // placeholder — that's a per-cell concern (lineItemCells), not a
      // reason to hide the column. The column's own default visibility
      // (a business can hide e.g. "Mfg. Date" by default) still applies.
      isHidden: Boolean(definition.isHidden),
      cellKind: "batch",
    });
    existingKeys.add(key);
  });

  return [...columns, ...batchColumns];
};

// Every applied cess contributes a rate and an amount column; an unapplied
// one contributes nothing at all (S9) — `context.appliedCesses` has already
// dropped those.
const injectCessColumns = (
  columns: UnknownRecord[],
  appliedCesses: UnknownRecord[]
): UnknownRecord[] => {
  // Same rule as the batch columns: an empty saved column list stays empty (S1).
  if (appliedCesses.length === 0 || columns.length === 0) {
    return columns;
  }

  const existingKeys = new Set(
    columns.map((column) => toStringValue(column.key))
  );
  const cessColumns: UnknownRecord[] = [];

  appliedCesses.forEach((cess) => {
    const rateKey = toStringValue(cess.cessKey);
    const amountKey = toStringValue(cess.cessAmountKey);
    const label =
      toNonEmptyString(pickFirstValue(cess.cessName, cess.name)) ?? "Cess";

    if (rateKey.length > 0 && !existingKeys.has(rateKey)) {
      cessColumns.push({
        key: rateKey,
        label,
        dataType: "number",
        isHidden: false,
        cellKind: "cess-rate",
      });
      existingKeys.add(rateKey);
    }

    if (amountKey.length > 0 && !existingKeys.has(amountKey)) {
      cessColumns.push({
        key: amountKey,
        label: `${label} Amount`,
        dataType: "amount",
        isHidden: false,
        cellKind: "cess-amount",
      });
      existingKeys.add(amountKey);
    }
  });

  return [...columns, ...cessColumns];
};

const normalizeInvoiceColumns = (
  invoice: FlattenedInvoicePayload,
  context: ReturnType<typeof getTemplateLayoutContext>
): InvoiceTemplateColumn[] => {
  const rawColumns = asArray(invoice.columns).map((entry) => asRecord(entry));
  const withUnit = injectUnitColumn(rawColumns, context.unitColumnMode);
  const withBatch = injectBatchColumns(
    withUnit,
    context.showBatchColumns,
    context.defaultBatchColumns
  );
  const withCess = injectCessColumns(withBatch, context.appliedCesses);

  return withCess.map((column) => {
    const key = toStringValue(column.key);
    const dataType = toStringValue(column.dataType);
    const fxReturnType = toStringValue(column.fxReturnType);
    const cellKind = column.cellKind as InvoiceTemplateColumn["cellKind"];

    let visible = true;
    if (key === "msic") {
      visible = false;
    } else if (key === "hsn") {
      visible = context.showHsnColumn;
    } else if (key === "classification") {
      visible = context.showClassificationColumn;
    } else if (key === "gstRate") {
      visible = context.isTaxInvoice;
    } else if (key === "discount") {
      visible = context.discountEnabled;
    } else if (key === "sgst" || key === "cgst") {
      visible = context.taxVisibility.showCgstSgst;
    } else if (key === "igst") {
      visible = context.taxVisibility.showIgst;
    } else if (key === "total") {
      visible = context.isTaxInvoice;
    } else if (key === "unit") {
      // The business's display mode always wins over a unit column sitting
      // in the stored column list (SC35); and a document where no line
      // carries a resolvable unit gets no empty column (SC33).
      visible =
        context.unitColumnMode === "SEPARATE_COLUMN" && context.hasAnyUnit;
    } else if (cellKind === "batch") {
      // Both S9 gates already decided whether batch columns exist at all
      // (injectBatchColumns); what's left is each column's own default, so a
      // business can keep e.g. "Mfg. Date" hidden until it turns it on.
      visible = true;
    }

    return {
      key,
      label:
        // `utgst` is the document field (talos/src/invoices.js:1454) and is what
        // lydia's InvoiceTable relabels the SGST header on (`utgst` destructured
        // off the invoice, lineItems.js:92). `isUtgst` is the deprecated
        // ceres-only name no producer sends, kept only as a fallback for a host
        // built against the older contract. Held in step with
        // mapped.visibility.isUtgst and with the widget's own label resolver
        // (src/widgets/shared/taxRowLabels.ts), so a template printing these
        // headers cannot disagree with one printing the totals block.
        key === "sgst" &&
        Boolean(pickFirstValue(invoice.utgst, invoice.isUtgst))
          ? "UTGST"
          : toStringValue(column.label),
      // S13: the narrow-width view shows only the short set until the
      // business customises its columns. Marking the column here means the
      // cells inherit it — one markup, one visibility decision, so a column
      // hidden on the desktop table cannot reappear on a phone.
      className: [
        getColumnClass(key),
        !context.columnsCustomised &&
        (context.shortSetKeys.has(key) || ITEM_COLUMN_KEYS.has(key))
          ? "col-short-set"
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      isHidden: Boolean(column.isHidden) || !visible,
      dataType,
      fxReturnType,
      summarise: Boolean(column.summarise),
      ...(cellKind ? { cellKind } : {}),
    };
  });
};

// A merged code prints as a small note beside the SKU when one is shown, and
// inline in brackets otherwise (S7) — the same text either way, just wrapped
// differently, so the choice is made once here rather than duplicated per
// caller.
const formatMergedNote = (showSku: boolean, text: string): string =>
  showSku ? text : `(${text})`;

// The name always prints; the SKU, a merged unit/HSN/classification and a
// thumbnail are added only where the business allows them and the line
// carries them (S7). Every field defaults to empty/false so a hostile item
// never leaves the name cell malformed.
const buildItemCell = (
  item: UnknownRecord,
  context: ReturnType<typeof getTemplateLayoutContext>
): InvoiceTemplateItemCell => {
  try {
    const name = toStringValue(item.name);
    const showSku =
      context.showSkuInName && Boolean(item.showSku) && hasValue(item.sku);
    const sku = showSku ? toStringValue(item.sku) : "";

    const mergedNotes: string[] = [];

    if (context.showUnitInName) {
      const unitLabel = resolveUnitLabel(item.unit, context.unitLabels);
      if (unitLabel) {
        mergedNotes.push(
          formatMergedNote(showSku, showSku ? `Unit: ${unitLabel}` : unitLabel)
        );
      }
    }

    const hsn = toStringValue(item.hsn);
    if (context.showInlineHsn && hsn) {
      mergedNotes.push(formatMergedNote(showSku, `HSN/SAC: ${hsn}`));
    }

    const classification = toStringValue(item.classification);
    if (context.showInlineClassification && classification) {
      mergedNotes.push(
        formatMergedNote(showSku, `Classification Code: ${classification}`)
      );
    }

    const showThumbnail =
      Boolean(context.advanceOptions.showThumbnailAsColumn) &&
      hasValue(item.thumbnail);

    return {
      name,
      showSku,
      sku,
      mergedAsNote: showSku,
      mergedNotes,
      showThumbnail,
      thumbnailImages: showThumbnail ? [toStringValue(item.thumbnail)] : [],
    };
  } catch (_) {
    return {
      name: "",
      showSku: false,
      sku: "",
      mergedAsNote: false,
      mergedNotes: [],
      showThumbnail: false,
      thumbnailImages: [],
    };
  }
};

// ceres has never typed serial data — there is no `allocations`, `serials`
// or `trackingMethod` anywhere in the payload contract — so it is read here
// by the names refrens.com uses, and only trusted when trackingMethod says
// this line is serial-tracked at all.
const getItemSerials = (item: UnknownRecord): string[] => {
  if (toStringValue(item.trackingMethod) !== "SERIAL") {
    return [];
  }

  return asArray(item.allocations)
    .map((allocation) => asRecord(allocation))
    .flatMap((allocation) => asArray(allocation.serials))
    .map((serial) => toStringValue(serial))
    .filter((serial) => serial.length > 0);
};

// What prints under the line: description, images, originals and serials —
// each gated on its own switch and its own data, so a line carrying none of
// them renders as a single row with nothing left behind (SC40).
const buildExtras = (
  item: UnknownRecord,
  context: ReturnType<typeof getTemplateLayoutContext>,
  isDescriptionFullWidth: boolean
): InvoiceTemplateExtras => {
  try {
    const description = toStringValue(item.description);
    const images = asArray(item.images)
      .map((image) => toStringValue(image))
      .filter((image) => image.length > 0);
    const originalImages = asArray(item.originalImages)
      .map((image) => toStringValue(image))
      .filter((image) => image.length > 0);

    const hasDescription = description.length > 0;
    const hasOriginalImages = originalImages.length > 0;
    // Up to five images sit beside the description where there is room;
    // more than five move to their own row under the line (SC38).
    const imagesInline = images.length > 0 && images.length <= 5;
    const imagesRow = images.length > 5;

    const serials = getItemSerials(item);
    const hasSerials =
      Boolean(context.advanceOptions.showSerialNumbersInDescription) &&
      serials.length > 0;

    return {
      hasAny:
        hasDescription ||
        imagesInline ||
        imagesRow ||
        hasOriginalImages ||
        hasSerials,
      hasDescription,
      description,
      descriptionFullWidth: isDescriptionFullWidth,
      images,
      imagesInline,
      imagesRow,
      originalImages,
      hasOriginalImages,
      hasSerials,
      serials,
      serialsLabel: serials.join(", "),
    };
  } catch (_) {
    return {
      hasAny: false,
      hasDescription: false,
      description: "",
      descriptionFullWidth: false,
      images: [],
      imagesInline: false,
      imagesRow: false,
      originalImages: [],
      hasOriginalImages: false,
      hasSerials: false,
      serials: [],
      serialsLabel: "",
    };
  }
};

// Cells are built from the already-visible columns so a column can never be
// hidden in the header and present in the body — filtering happens once, here.
// A totals row (a group sub-total, or the document summary) carries no real
// line item — these stand-ins keep InvoiceTemplateRow's shape whole without
// pretending the row is a line (SC40's "gated on presence" logic never fires
// on empty extras).
const EMPTY_ITEM_CELL: InvoiceTemplateItemCell = {
  name: "",
  showSku: false,
  sku: "",
  mergedAsNote: false,
  mergedNotes: [],
  showThumbnail: false,
  thumbnailImages: [],
};

const EMPTY_EXTRAS: InvoiceTemplateExtras = {
  hasAny: false,
  hasDescription: false,
  description: "",
  descriptionFullWidth: false,
  images: [],
  imagesInline: false,
  imagesRow: false,
  originalImages: [],
  hasOriginalImages: false,
  hasSerials: false,
  serials: [],
  serialsLabel: "",
};

const buildTotalsRow = (
  cells: InvoiceTemplateCell[],
  rowClass: string
): InvoiceTemplateRow => ({
  cells,
  lineNumber: null,
  isGroupHeading: false,
  isAdditionalCharge: false,
  rowClass,
  item: EMPTY_ITEM_CELL,
  extras: EMPTY_EXTRAS,
  isTotalsRow: true,
  isFillerRow: false,
});

// The stretch filler row (S12): one empty cell per visible column, carrying
// that column's own label so the narrow-width stacked view (which is scoped
// off the print path entirely) never has to special-case it. Rendered
// through the exact same cell/row markup every other row uses — an empty
// item cell and no extras mean it prints as a single blank row, and CSS
// alone (`height: 100%` on the row) decides whether that row carries any
// visible height at all (SC50: nothing changes when the page is already full).
const buildFillerRow = (
  visibleColumns: InvoiceTemplateColumn[]
): InvoiceTemplateRow => ({
  cells: visibleColumns.map((column) => ({
    key: column.key,
    text: "",
    className: column.className,
    label: column.label,
    // Blank by construction — the filler row carries no item.
    isItemCell: false,
  })),
  lineNumber: null,
  isGroupHeading: false,
  isAdditionalCharge: false,
  rowClass: "row-filler",
  item: EMPTY_ITEM_CELL,
  extras: EMPTY_EXTRAS,
  isTotalsRow: false,
  isFillerRow: true,
});

// Groups and totals follow lydia's own getGroupedLineItems.js loop shape: a
// group's sub-total is closed the moment the next item is a new group
// heading, or the list ends — never on `item.group` alone, since a group
// that ends the document still needs its sub-total (SC46).
const buildRows = (
  invoice: FlattenedInvoicePayload,
  visibleColumns: InvoiceTemplateColumn[],
  context: ReturnType<typeof getTemplateLayoutContext>,
  isDescriptionFullWidth: boolean
): InvoiceTemplateRow[] => {
  const rawItems = asArray(invoice.items).map((entry) => asRecord(entry));
  const rows: InvoiceTemplateRow[] = [];
  // Built once per document, not per row: every value on it is immutable for
  // the whole render, and it carries the unit lookup the cells need.
  const cellContext = buildCellContext(
    invoice,
    context.unitColumnMode,
    context.unitLabels
  );

  let nextIndex = 1;
  let isGroupItem = false;
  let groupItems: UnknownRecord[] = [];

  rawItems.forEach((item, position) => {
    const isGroupHeading = Boolean(item.group);
    const isAdditionalCharge = Boolean(item.isAdditionalCharge);

    if (isGroupHeading) {
      isGroupItem = true;
    } else if (isGroupItem) {
      groupItems.push(item);
    }

    const cells: InvoiceTemplateCell[] = buildRowCells(
      cellContext,
      visibleColumns,
      item
    );

    let lineNumber: number | null = null;
    if (!isGroupHeading && !isAdditionalCharge) {
      lineNumber = nextIndex;
      nextIndex += 1;
    } else if (isGroupHeading) {
      // A group heading closes the previous group, so the next ordinary
      // row starts a fresh count rather than continuing the last one.
      nextIndex = 1;
    }

    rows.push({
      cells,
      lineNumber,
      isGroupHeading,
      isAdditionalCharge,
      rowClass: position % 2 === 0 ? "row-even" : "row-odd",
      // A group heading row carries its own images/description via this
      // same item object, so it is never confused with its members' —
      // each row builds extras from its own item, nothing shared.
      item: buildItemCell(item, context),
      extras: buildExtras(item, context, isDescriptionFullWidth),
      isTotalsRow: false,
      isFillerRow: false,
    });

    const nextItem = rawItems[position + 1];
    const nextIsGroupHeading = Boolean(nextItem?.group);
    if (
      !context.hideGroupSubTotal &&
      isGroupItem &&
      (!nextItem || nextIsGroupHeading) &&
      groupItems.length > 0
    ) {
      rows.push(
        buildTotalsRow(
          buildGroupSubTotalRow(cellContext, visibleColumns, groupItems),
          "row-group-subtotal"
        )
      );
      groupItems = [];
    }
  });

  // The filler sits above the summary row so the totals stay pinned to the
  // bottom (SC48); with no summary row it is simply the last row (S12).
  if (context.tableStretchEnabled && rows.length > 0) {
    rows.push(buildFillerRow(visibleColumns));
  }

  if (context.showTotalsRow) {
    rows.push(
      buildTotalsRow(
        buildSummaryRow(cellContext, visibleColumns, rawItems),
        "row-summary"
      )
    );
  }

  return rows;
};

export const normalizeInvoiceTemplateState = (
  payload: InvoicePayloadInput
): NormalizedInvoiceTemplateState => {
  const invoice = normalizeInvoicePayload(payload);
  const context = getTemplateLayoutContext(invoice);
  const columns = normalizeInvoiceColumns(invoice, context);
  // Off unless the payload explicitly opts in; `showDescriptionFullWidth` is the
  // current flag name, `isDescriptionFullWidth` the legacy one.
  const descriptionFullWidth = toBooleanValue(
    pickFirstValue(
      context.advanceOptions.showDescriptionFullWidth,
      invoice.showDescriptionFullWidth,
      context.advanceOptions.isDescriptionFullWidth,
      invoice.isDescriptionFullWidth
    )
  );
  const rows = buildRows(
    invoice,
    columns.filter((column) => !column.isHidden),
    context,
    descriptionFullWidth
  );
  const irn = asRecord(invoice.irn);
  const upi = asRecord(invoice.upi);
  const irnCancelDate = toNonEmptyString(irn.CancelDate);
  // Root qrCode is the same IRN QR delivered by the Lydia host overlay, so the
  // CancelDate guard below applies to it equally.
  const irnQr = toNonEmptyString(pickFirstValue(invoice.qrCode, irn.qrCode));
  const topQr =
    (irnQr && !irnCancelDate ? irnQr : null) ??
    toNonEmptyString(invoice.zatcaQrCode) ??
    toNonEmptyString(invoice.lhdnQrCode) ??
    toNonEmptyString(invoice.documentQr) ??
    "";

  const bankAccount = asRecord(invoice.bankAccount);
  const upiId =
    toNonEmptyString(pickFirstValue(upi.upi, upi.vpa, upi.upiId)) ?? "";
  const upiQr =
    toNonEmptyString(pickFirstValue(upi.qr, upi.qrCode, bankAccount.qrCode)) ??
    (upiId ? buildUpiPayload(upiId) : "");

  const billType = toStringValue(invoice.billType);
  const status = toStringValue(invoice.status);
  const isExpenditure = Boolean(invoice.isExpenditure);
  const invoiceAccepted = toStringValue(invoice.invoiceAccepted);
  const paymentOptions = asRecord(invoice.paymentOptions);
  const bankAccountNo = toStringValue(
    pickFirstValue(bankAccount.accountNo, bankAccount.accountNumber)
  );
  const contact = asRecord(invoice.contact);
  const shippedTo = hasValue(asRecord(invoice.shippedTo).name);
  const shippedFrom = hasValue(asRecord(invoice.shippedFrom).name);
  const transport = hasTransportData(invoice.transportDetails);
  const showBankAccount =
    (!isExpenditure || invoiceAccepted === "ACCEPTED") &&
    Boolean(paymentOptions.accountTransfer) &&
    hasValue(bankAccountNo);
  const showUpi =
    (!isExpenditure || invoiceAccepted === "ACCEPTED") &&
    Boolean(paymentOptions.upi) &&
    hasValue(upiId);
  // Each summary table needs BOTH an opt-in from the document's configuration
  // and rows to put in it. Configuration alone renders a bare header strip;
  // rows alone renders a table the user asked to hide.
  const showTaxTable =
    ["TABLE", "BOTH"].includes(
      toStringValue(context.advanceOptions.taxSummaryView)
    ) && getNestedSummaryEntries(invoice.taxSummary, "taxList").length > 0;
  // The business toggle gates the section; the data check only avoids rendering an
  // empty table. The alias is checked first because it is what the Lydia live-update
  // bridge emits, so when both keys are present it carries the newer user action —
  // an explicit false from either key still hides the section.
  const hsnSummaryEnabled = toBooleanValue(
    pickFirstValue(
      context.advanceOptions.showHsnSummary,
      context.advanceOptions.showHSNSummaryInInvoice
    )
  );
  const showHsnSummary =
    hsnSummaryEnabled &&
    getNestedSummaryEntries(invoice.hsnSummary, "hsnList").length > 0;
  const showPaymentsTable =
    toBooleanValue(invoice.showPaymentsTable) &&
    asArray(invoice.allPayments).length > 0;
  const showSummaryCess =
    asArray(invoice.cesses).some((entry) =>
      Boolean(asRecord(entry).isApplied)
    ) &&
    (getInvoiceCessTotal(invoice) > 0 ||
      getSummaryCessAmount(invoice.taxSummary, "taxList") > 0 ||
      getSummaryCessAmount(invoice.hsnSummary, "hsnList") > 0);
  // Same predicate the item-table columns use, so a template gating cells on
  // mapped.visibility and headers on mapped.columns can never disagree.
  let { showIgst, showCgstSgst } = context.taxVisibility;
  if (!showIgst && !showCgstSgst && !invoice.invoiceType) {
    showIgst =
      Boolean(invoice.igst) ||
      (toStringValue(invoice.taxName) !== "GST" && Boolean(invoice.taxName));
    showCgstSgst = !showIgst && toStringValue(invoice.taxName) === "GST";
  }

  return {
    invoice,
    advanceOptions: context.advanceOptions,
    pdfOptions: context.pdfOptions,
    mapped: {
      qr: {
        top: topQr,
        upi: upiQr,
      },
      upi: {
        id: upiId,
      },
      columns,
      rows,
      irn: {
        isCancelled: Boolean(irnCancelDate),
      },
      visibility: {
        shippedTo,
        shippedFrom,
        transport,
        showLogistics: shippedFrom || transport,
        singleLogistics:
          (shippedFrom && !transport) || (!shippedFrom && transport),
        showBankAccount,
        showUpi,
        showBankUpiSection:
          !["CREDITNOTE", "DEBITNOTE"].includes(billType) &&
          status !== "CANCELED" &&
          (showBankAccount || showUpi),
        contactStrip: hasValue(contact.email) || hasValue(contact.phone),
        showIgst,
        showCgstSgst,
        isUtgst: Boolean(pickFirstValue(invoice.utgst, invoice.isUtgst)),
        showTaxTable,
        showHsnSummary,
        showPaymentsTable,
        showSummaryCess,
        showSku: context.showSkuInName,
        showHsn: context.showHsnColumn,
        showThumbnailAsColumn: Boolean(
          context.advanceOptions.showThumbnailAsColumn
        ),
        showInlineHsn: context.showInlineHsn,
        showInlineClassification: context.showInlineClassification,
        showSkuInName: context.showSkuInName,
        showUnitInName: context.showUnitInName,
        upiShrink: Boolean(asRecord(invoice.template).upiShrink),
        letterHeadOnFirstPage: Boolean(
          context.pdfOptions.letterHeadOnFirstPage
        ),
        footerOnLastPage: Boolean(context.pdfOptions.footerOnLastPage),
        itemNameFullWidth: Boolean(
          pickFirstValue(
            context.advanceOptions.itemNameFullWidth,
            invoice.showItemNameFullWidth
          )
        ),
        isDescriptionFullWidth: descriptionFullWidth,
        showDescriptionFullWidth: descriptionFullWidth,
        showStatusTagInPrint: billType === "INVOICE" && status === "PAID",
        visibleColumnCount:
          columns.filter((column) => !column.isHidden).length + 1,
        tableStretchEnabled: context.tableStretchEnabled,
        textWrapEnabled: context.textWrapEnabled,
        usesShortSet: !context.columnsCustomised,
      },
      payments: getPaymentConversion(invoice),
    },
    derived: {
      showHsnColumn: context.showHsnColumn,
      showClassificationColumn: context.showClassificationColumn,
      showInlineHsn: context.showInlineHsn,
      showInlineClassification: context.showInlineClassification,
      showSkuInName: context.showSkuInName,
      showUnitInName: context.showUnitInName,
    },
  };
};
