import {
  DEFAULT_INVOICE_TEMPLATE_CONTRACT,
  getDefaultInvoicePayloadFieldPathIndex,
} from "../../main/defaultInvoiceTemplateContract";
import type {
  CeresTemplateDataMapper,
  TemplateFieldMap,
  TemplateFieldMapEntry,
} from "../../main/templateDataMapping";
import currencies from "./currency.json";

type UnknownRecord = Record<string, unknown>;

interface SagaLabelValuePair {
  label: string;
  value: string;
}

interface SagaPartyCustomField extends SagaLabelValuePair {
  params: {
    showInInvoice: boolean;
  };
}

interface SagaParty {
  name: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  building?: string;
  district?: string;
  stateCode?: string;
  gstState?: string;
  vatNumber?: string;
  vatLabel?: string;
  sstNumber?: string;
  tinNumber?: string;
  panNumber?: string;
  email: string;
  phone: string;
  emailShowInInvoice?: boolean;
  phoneShowInInvoice?: boolean;
  customFields: SagaPartyCustomField[];
  customHeaders: SagaLabelValuePair[];
  additionalIds?: SagaLabelValuePair[];
}

interface SagaTransportDetails {
  transport: string;
  challanDate: string;
  challanNumber: string;
  extraInformation: string;
  distance: string;
  vehicleNumber: string;
  vehicleType: string;
  transportMode: string;
  transactionType: string;
  subSupplyType: string;
  transporter: {
    name: string;
    transporterId: string;
  };
}

interface SagaCell {
  key: string;
  value: string;
  className: string;
  isHidden: boolean;
  isItemInfo: boolean;
}

interface SagaItem {
  id: string; // item._id or inventoryTxn
  name: string;
  isGroup: boolean;
  displayIndex: string;
  description: string;
  hsn: string;
  classification: string;
  sku: string;
  showSku: boolean;
  unit: string;
  unitLabel: string;
  images: string[];
  originalImages: string[];
  thumbnail: string;
  cells: SagaCell[];
  // Keep some raw values for HSN Summary logic
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  gstRateNum: number;
  hsnRaw: string;
  isSummaryRow: boolean;
}

interface SagaBankAccount {
  name: string;
  accountNo: string;
  sortCode: string;
  ifsc: string;
  iban: string;
  swift: string;
  accountType: string;
  bank: string;
  customLabels: Record<string, string>;
  customFields: SagaLabelValuePair[];
}

interface SagaUpi {
  upi: string;
  vpa: string;
  qr: string;
}

interface SagaTotals {
  amountLabel: string;
  igstLabel: string;
  cgstLabel: string;
  sgstLabel: string;
  showIgst: boolean;
  showCgstSgst: boolean;
  showRoundOffAmount?: boolean;
  cesses?: Array<{
    cessKey: string;
    cessAmountKey: string;
    cessName: string;
    isApplied: boolean;
  }>;
  additionalCharges?: Array<{
    label: string;
    amount: number;
    multiplier: number;
  }>;
  amount: string;
  subTotal: string;
  discount: string;
  igst: string;
  cgst: string;
  sgst: string;
  totalCess: number;
  cessRows: Array<{ label: string; value: string }>;
  additionalChargeRows: Array<{ label: string; value: string }>;
  amountRoundOff: string;
  totalRoundOff: string;
  total: string;
  extraTotalFields: Array<{ label: string; value: unknown }>;
}

interface SagaBalance {
  paid: string;
  due: string;
}

interface SagaInvoiceDetailRow {
  label: string;
  value: string;
  rowClass?: string;
  isDue?: boolean;
}

interface SagaInvoiceDetails {
  mainRows: SagaInvoiceDetailRow[];
  extraRows: SagaInvoiceDetailRow[];
  dueRows: SagaInvoiceDetailRow[];
}

interface SagaCustomLabels {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  purchaseOrderNumber: string;
  billedTo: string;
  shippedTo: string;
  shippedFrom: string;
  transportName: string;
  challanNumber: string;
  challanDate: string;
  transportExtraInfo: string;
  taxName: string;
  totalInWords: string;
  totalInWordsValue: string;
  terms: string;
  notes: string;
  attachment: string;
  subTotal: string;
  total: string;
  signature: string;
  contact: string;
  contactEmail: string;
  contactPhone: string;
}

interface SagaTaxSummaryRow {
  gstRate: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  cessRate: string;
  cessAmount: string;
  taxAmount: string;
}

interface SagaTaxSummary {
  taxList: SagaTaxSummaryRow[];
  totalCgstAmount: string;
  totalSgstAmount: string;
  totalIgstAmount: string;
  totalCessAmount: string;
  totalCessAmountValue: number;
  totalTaxAmount: string;
  totalTaxAmountValue: number;
  totalTaxInWords: string;
}

interface SagaHsnSummaryRow {
  hsn: string;
  taxableValue: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  cessRate: string;
  cessAmount: string;
  taxAmount: string;
  showIgst: boolean;
  showCgstSgst: boolean;
}

interface SagaHsnSummary {
  hsnList: SagaHsnSummaryRow[];
  totalTaxableValue: string;
  totalCgstAmount: string;
  totalSgstAmount: string;
  totalIgstAmount: string;
  totalCessAmount: string;
  totalCessAmountValue: number;
  totalTaxAmount: string;
  totalTaxInWords: string;
}

interface SagaPayment {
  paymentDate: string;
  paymentMethod: string;
  amount: string;
  status: string;
}

interface SagaIrn {
  Irn: string;
  AckNo: string;
  AckDt: string;
  CancelDate: string;
  EwbNo: string;
  EwbDt: string;
  EwbValidTill: string;
  ewayCancelDate: string;
  qrCode: string;
}

interface SagaColumn {
  key: string;
  label: string;
  className: string;
  isHidden: boolean;
  dataType: string;
  fxReturnType: string;
  summarise: boolean;
}

interface SagaMappedModel {
  qr: {
    top: string;
    upi: string;
  };
  upi: {
    id: string;
  },
  columns: SagaColumn[];
  irn: {
    isCancelled: boolean;
  };
  visibility: {
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
    showStatusTagInPrint: boolean;
    visibleColumnCount: number;
  };
}

export interface SagaEngineeringTemplateModel extends Record<string, unknown> {
  currencySymbol: string;
  letterHead: string;
  letterHeadFooter: string;
  invoiceTitle: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateUserInput: string;
  invoiceSubTitle: string;
  dueDate: string;
  purchaseOrderNumber: string;
  ownerOffset: string;
  customHeaders: SagaLabelValuePair[];
  customLabels: SagaCustomLabels;
  irn: SagaIrn;
  pdfOptions: UnknownRecord;
  advanceOptions: UnknownRecord;
  billedBy: SagaParty;
  billedTo: SagaParty;
  shippedTo: SagaParty;
  shippedFrom: SagaParty;
  transportDetails: SagaTransportDetails;
  items: SagaItem[];
  totals: SagaTotals;
  balance: SagaBalance;
  invoiceDetails: SagaInvoiceDetails;
  bankAccount: SagaBankAccount;
  upi: SagaUpi;
  terms: Array<{ terms: string[] }>;
  notes: string;
  allPayments: SagaPayment[];
  customFooters: Array<{ label: string; value: string }>;
  attachments: Array<{ name: string; url: string; attachmentIndex: number }>;
  signature: string;
  hsnSummary: SagaHsnSummary;
  taxSummary: SagaTaxSummary;
  contact: {
    email: string;
    phone: string;
  };
  status: string;
  isOverdue: boolean;
  mapped: SagaMappedModel;
}

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

const pickFirstValue = (...values: unknown[]): unknown => {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      continue;
    }

    return value;
  }

  return undefined;
};

const toStringValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
};

const getUnitsRecord = (invoice: UnknownRecord): Record<string, string> => {
  const businessConfig = asRecord(asRecord(invoice.business).configuration);
  const ownerBusinessConfig = asRecord(asRecord(invoice.ownerBusiness).configuration);
  const ownerConfig = asRecord(asRecord(invoice.owner).configuration);
  const unitsValue = pickFirstValue(
    businessConfig.units,
    ownerBusinessConfig.units,
    ownerConfig.units
  );

  if (Array.isArray(unitsValue)) {
    return unitsValue.reduce<Record<string, string>>((acc, entry) => {
      const unit = asRecord(entry);
      const key = toStringValue(pickFirstValue(unit.value, unit.key));
      const label = toStringValue(pickFirstValue(unit.label, unit.name));
      if (key && label) {
        acc[key] = label;
      }
      return acc;
    }, {});
  }

  const unitsRecord = asRecord(unitsValue);
  return Object.entries(unitsRecord).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const label = toStringValue(value);
      if (label) {
        acc[key] = label;
      }
      return acc;
    },
    {}
  );
};

const formatNumberByLocale = (
  value: unknown,
  locale: string,
  formateOptions: Intl.NumberFormatOptions
): string => {
  let normalizedValue = value;

  if (typeof value === "string") {
    normalizedValue = value.replace(/,/g, "");
  }

  const numericValue = Number(normalizedValue);
  if (Number.isNaN(numericValue)) {
    return toStringValue(value);
  }

  if (locale) {
    return numericValue.toLocaleString(locale, formateOptions);
  }

  return String(numericValue);
};

const formatShortDateWithOffset = (value: unknown, offset: unknown): string => {
  const date = new Date(toStringValue(value));
  if (Number.isNaN(date.getTime())) {
    return toStringValue(value);
  }

  const offsetStr = toStringValue(offset);
  const match = offsetStr.match(/^([+-]?)(\d{1,2}):?(\d{2})?$/);
  let adjustedDate = date;

  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const targetOffsetMinutes = sign * (hours * 60 + minutes);
    const localOffsetMinutes = -date.getTimezoneOffset();
    const deltaMs = (targetOffsetMinutes - localOffsetMinutes) * 60_000;
    adjustedDate = new Date(date.getTime() + deltaMs);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(adjustedDate);
};

const countDecimals = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  const asString = String(value);
  if (!asString.includes(".")) {
    return 0;
  }

  return asString.split(".")[1].length;
};

const formatCommission = (
  amount: unknown,
  discountType: unknown,
  invoice: UnknownRecord
): string => {
  if (toStringValue(discountType, "PERCENTAGE") === "PERCENTAGE") {
    return `${amount ?? 0}%`;
  }

  return formatCurrency(amount, invoice);
};

const formatCurrency = (val: any, invoice: UnknownRecord): string => {
  if (val === undefined || val === null) return "";
  const amount = Number(val);
  if (isNaN(amount)) return String(val);

  const currencyCode = toStringValue(invoice.currency) || "INR";
  const currencyInfo = (currencies as any)[currencyCode] || (currencies as any).INR;
  const locale = toStringValue(invoice.locale, "en-IN");
  const numDecimals = toNumberValue(
    invoice.subUnitLength,
    currencyInfo.decimalDigits ?? 2
  );
  const customSymbol = invoice.customCurrencySymbol;
  const symbol = customSymbol || currencyInfo.symbolNative || currencyCode;

  const isNegative = amount < 0;
  const formattedAmount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: numDecimals,
    maximumFractionDigits: numDecimals,
  }).format(Math.abs(amount));

  return isNegative ? `(${symbol}${formattedAmount})` : `${symbol}${formattedAmount}`;
};

const formatCurrencyWithPrecision = (
  val: unknown,
  invoice: UnknownRecord,
  decimalDigits: number
): string => {
  if (val === undefined || val === null) return "";
  const amount = Number(val);
  if (isNaN(amount)) return String(val);

  const currencyCode = toStringValue(invoice.currency) || "INR";
  const currencyInfo = (currencies as any)[currencyCode] || (currencies as any).INR;
  const locale = toStringValue(invoice.locale, "en-IN");
  const customSymbol = invoice.customCurrencySymbol;
  const symbol = customSymbol || currencyInfo.symbolNative || currencyCode;
  const safeDigits = Number.isFinite(decimalDigits) ? Math.max(decimalDigits, 0) : 2;

  const isNegative = amount < 0;
  const formattedAmount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  }).format(Math.abs(amount));

  return isNegative ? `(${symbol}${formattedAmount})` : `${symbol}${formattedAmount}`;
};
const getCurrencySymbol = (invoice: UnknownRecord): string => {
  if (invoice.customCurrencySymbol) {
    return toStringValue(invoice.customCurrencySymbol);
  }

  const currencyCode = toStringValue(invoice.currency) || "INR";
  const currencyInfo = (currencies as any)[currencyCode] || (currencies as any).INR;
  return currencyInfo.symbolNative || currencyCode;
};

const toNumberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const toNonEmptyString = (value: unknown): string | null => {
  const normalized = toStringValue(value);
  return normalized.length > 0 ? normalized : null;
};

const toStringArray = (value: unknown): string[] => {
  return asArray(value)
    .map((entry) => toStringValue(entry))
    .filter((entry) => entry.length > 0);
};

const hasValue = (value: unknown): boolean => {
  const str = toStringValue(value);
  return str.length > 0 && str !== "null" && str !== "undefined";
};

const toLabelValuePair = (value: unknown): SagaLabelValuePair => {
  const record = asRecord(value);

  return {
    label: toStringValue(record.label),
    value: toStringValue(record.value),
  };
};

const toPartyCustomField = (value: unknown): SagaPartyCustomField => {
  const record = asRecord(value);
  const params = asRecord(record.params);
  const showInInvoice =
    typeof params.showInInvoice === "boolean" ? params.showInInvoice : true;

  return {
    label: toStringValue(record.label),
    value: toStringValue(record.value),
    params: {
      showInInvoice,
    },
  };
};

const normalizeParty = (value: unknown): SagaParty => {
  const record = asRecord(value);

  return {
    name: toStringValue(record.name),
    street: toStringValue(record.street),
    city: toStringValue(record.city),
    state: toStringValue(record.state),
    pincode: toStringValue(record.pincode),
    country: toStringValue(record.country),
    building: toStringValue(record.building),
    district: toStringValue(record.district),
    stateCode: toStringValue(record.stateCode),
    gstState: toStringValue(record.gstState),
    vatNumber: toStringValue(record.vatNumber),
    vatLabel: toStringValue(record.vatLabel),
    sstNumber: toStringValue(record.sstNumber),
    tinNumber: toStringValue(record.tinNumber),
    panNumber: toStringValue(record.panNumber),
    email: toStringValue(record.email),
    phone: toStringValue(record.phone),
    emailShowInInvoice:
      typeof record.emailShowInInvoice === "boolean" ? record.emailShowInInvoice : true,
    phoneShowInInvoice:
      typeof record.phoneShowInInvoice === "boolean" ? record.phoneShowInInvoice : true,
    customFields: asArray(record.customFields).map(toPartyCustomField),
    customHeaders: asArray(record.customHeaders).map(toLabelValuePair),
    additionalIds: asArray(record.additionalIds).map(toLabelValuePair),
  };
};

const normalizeTransportDetails = (value: unknown): SagaTransportDetails => {
  const record = asRecord(value);
  const transporter = asRecord(record.transporter);

  return {
    transport: toStringValue(record.transport),
    challanDate: toStringValue(record.challanDate),
    challanNumber: toStringValue(record.challanNumber),
    extraInformation: toStringValue(record.extraInformation),
    distance: toStringValue(record.distance),
    vehicleNumber: toStringValue(record.vehicleNumber),
    vehicleType: toStringValue(record.vehicleType),
    transportMode: toStringValue(record.transportMode),
    transactionType: toStringValue(record.transactionType),
    subSupplyType: toStringValue(record.subSupplyType),
    transporter: {
      name: toStringValue(transporter.name),
      transporterId: toStringValue(transporter.transporterId),
    },
  };
};

const hasTransportData = (transport: SagaTransportDetails): boolean => {
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
    hasValue(transport.transporter.name) ||
    hasValue(transport.transporter.transporterId)
  );
};

const COLUMN_CLASS_MAP: Record<string, string> = {
  item: "col-item",
  name: "col-item",
  quantity: "col-qty",
  qty: "col-qty",
  rate: "col-rate",
  amount: "col-amount",
  discount: "col-discount",
  gstRate: "col-gst-rate",
  tax: "col-tax",
  igst: "col-igst",
  total: "col-total",
  hsn: "col-hsn-sac",
  cess: "col-cess",
  cessrate: "col-cess",
  cessamount: "col-cess",
};

const getColumnClass = (key: string): string => {
  const normalizedKey = key.toLowerCase();
  return COLUMN_CLASS_MAP[normalizedKey] || `col-${normalizedKey}`;
};

const getFormattedCellValue = (
  col: SagaColumn,
  record: UnknownRecord,
  invoice: UnknownRecord
): string => {
  const { key, dataType, fxReturnType, summarise } = col;
  const isSummary = Boolean(record.isGroupItemTotalRow);
  const discount = asRecord(record.discount);
  const hasDiscount = record.discount !== undefined && record.discount !== null;
  const advanceOptions = asRecord(invoice.advanceOptions);
  const units = getUnitsRecord(invoice);
  const locale = toStringValue(invoice.locale) || "en-IN";
  const roundOffQuantity = Boolean(invoice.roundOffQuantity);
  const roundOffRate = Boolean(invoice.roundOffRate);
  const unitColumn = toStringValue(advanceOptions.unitColumn, "MERGE_QUANTITY");
  const subUnitLength = toNumberValue(
    invoice.subUnitLength,
    (currencies as any)[toStringValue(invoice.currency) || "INR"]?.decimalDigits ?? 2
  );
  const formateOptions = {
    minimumFractionDigits: subUnitLength,
    maximumFractionDigits: subUnitLength,
  };

  const cesses = asArray(invoice.cesses).map((c) => asRecord(c));
  const isCessKey = cesses.some((c) => toStringValue(c.cessKey) === key);
  const isCessAmountKey = cesses.some((c) => toStringValue(c.cessAmountKey) === key);

  if (
    isSummary &&
    !col.summarise &&
    !isCessKey &&
    !isCessAmountKey &&
    !["name", "item", "quantity", "amount", "total"].includes(key)
  ) {
    return "";
  }

  switch (key) {
    case "name":
    case "item":
      return toStringValue(record.name);
    case "quantity": {
      const quantity = Math.abs(
        toNumberValue(pickFirstValue(record.quantity, record.qty), 0)
      );
      const unitKey = toStringValue(record.unit);
      const unitLabel = unitKey && units[unitKey] ? String(units[unitKey]) : "";
      const formattedQ = quantity.toLocaleString(locale, roundOffQuantity
        ? {
          minimumFractionDigits: subUnitLength,
          maximumFractionDigits: subUnitLength,
        }
        : {
          minimumFractionDigits: 0,
          maximumFractionDigits: 20,
        });
      const showUnitInQuantity = unitColumn === "MERGE_QUANTITY" && unitLabel;
      return `${formattedQ}${showUnitInQuantity ? ` (${unitLabel.toLowerCase()})` : ""}`;
    }
    case "rate":
      if (isSummary) return "";
      return formatCurrencyWithPrecision(
        record.rate,
        invoice,
        roundOffRate ? subUnitLength : countDecimals(record.rate)
      );
    case "amount":
      return formatCurrency(record.amount, invoice);
    case "discount":
      if (!hasDiscount) {
        return "";
      }
      return formatCommission(
        pickFirstValue(discount.amount, discount.value),
        pickFirstValue(discount.discountType, discount.type, "PERCENTAGE"),
        invoice
      );
    case "gstRate": {
      if (isSummary) return "";
      const rate = toNumberValue(
        pickFirstValue(record.gstRate, record.taxRate),
        0
      );
      return `${rate}%`;
    }
    case "cgst":
      if (isSummary) return "";
      return formatCurrency(record.cgst, invoice);
    case "sgst":
      if (isSummary) return "";
      return formatCurrency(record.sgst, invoice);
    case "igst":
      if (isSummary) return "";
      return formatCurrency(record.igst, invoice);
    case "total":
      return formatCurrency(record.total, invoice);
    case "hsn":
      return isSummary ? "" : toStringValue(record.hsn);
    case "classification":
      return isSummary ? "" : toStringValue(record.classification);
    default: {
      const custom = asRecord(record.custom);
      let val = custom[key];

      if (isCessKey) {
        return `${toNumberValue(val)}%`;
      }
      if (isCessAmountKey) {
        return formatCurrency(val, invoice);
      }

      if (dataType === "formula" && fxReturnType === "currency") {
        return formatCurrency(val, invoice);
      }
      if (dataType === "date") {
        return formatShortDateWithOffset(val, invoice.ownerOffset);
      }
      if (dataType === "formula" || dataType === "number") {
        return formatNumberByLocale(val, locale, formateOptions);
      }

      // Fallback for numbered cess columns like cessAmount_3423
      if (key.includes("cess")) {
        if (key.includes("Rate")) {
          return `${toNumberValue(val)}%`;
        }
        return formatCurrency(val, invoice);
      }

      return toStringValue(val);
    }
  }
};

const normalizeItem = (
  value: unknown,
  invoice: UnknownRecord,
  columns: SagaColumn[],
  showSku: boolean,
  showHsn: boolean,
  displayIndex = "",
  showSkuInInvoice = false
): SagaItem => {
  const record = asRecord(value);
  const units = getUnitsRecord(invoice);
  const unitKey = toStringValue(record.unit);
  const unitLabel = unitKey && units[unitKey] ? String(units[unitKey]) : "";
  const showSkuMeta =
    showSkuInInvoice &&
    Boolean(record.showSku) &&
    Boolean(toStringValue(record.sku));

  const cells: SagaCell[] = columns.map((col) => {
    return {
      key: col.key,
      value: getFormattedCellValue(col, record, invoice),
      className: col.className,
      isHidden: col.isHidden,
      isItemInfo: col.key === "name" || col.key === "item",
    };
  });

  return {
    id: toStringValue(pickFirstValue(record.inventoryTxn, record._id)),
    name: toStringValue(record.name),
    isGroup: Boolean(record.group),
    displayIndex,
    description: toStringValue(record.description),
    hsn: (showHsn && record.showHsn !== false) ? toStringValue(record.hsn) : "",
    classification: toStringValue(record.classification),
    sku: (showSku && showSkuMeta) ? toStringValue(record.sku) : "",
    showSku: showSkuMeta && showSku && Boolean(toStringValue(record.sku)),
    unit: toStringValue(record.unit),
    unitLabel: unitLabel ? unitLabel.toLowerCase() : "",
    images: toStringArray(record.images),
    originalImages: toStringArray(record.originalImages),
    thumbnail: toStringValue(record.thumbnail),
    cells,
    taxableValue: toNumberValue(record.amount),
    igstAmount: toNumberValue(record.igst),
    cgstAmount: toNumberValue(record.cgst),
    sgstAmount: toNumberValue(record.sgst),
    taxAmount: toNumberValue(record.tax),
    gstRateNum: toNumberValue(pickFirstValue(record.gstRate, record.taxRate)),
    hsnRaw: (showHsn && record.showHsn !== false) ? toStringValue(record.hsn) : "",
    isSummaryRow: Boolean(record.isGroupItemTotalRow),
  };
};

const normalizeBankAccountLabels = (value: unknown): Record<string, string> => {
  const labels = asRecord(value);

  return {
    bankDetails: toStringValue(labels.bankDetails),
    accountHolderName: toStringValue(labels.accountHolderName),
    accountNumber: toStringValue(labels.accountNumber),
    sortCode: toStringValue(labels.sortCode),
    ifsc: toStringValue(labels.ifsc),
    iban: toStringValue(labels.iban),
    swiftCode: toStringValue(labels.swiftCode),
    accountType: toStringValue(labels.accountType),
    bankName: toStringValue(labels.bankName),
  };
};

const normalizeBankAccount = (value: unknown): SagaBankAccount => {
  const record = asRecord(value);

  return {
    name: toStringValue(record.name),
    accountNo: toStringValue(record.accountNo),
    sortCode: toStringValue(record.sortCode),
    ifsc: toStringValue(record.ifsc),
    iban: toStringValue(record.iban),
    swift: toStringValue(record.swift),
    accountType: toStringValue(record.accountType),
    bank: toStringValue(record.bank),
    customLabels: normalizeBankAccountLabels(record.customLabels),
    customFields: asArray(record.customFields).map(toLabelValuePair),
  };
};

const normalizeUpi = (value: unknown): SagaUpi => {
  const record = asRecord(value);

  return {
    upi: toStringValue(record.upi),
    vpa: toStringValue(record.vpa),
    qr: toStringValue(record.qr),
  };
};

const normalizeTerms = (value: unknown): Array<{ terms: string[] }> => {
  const rawTerms = asArray(value).map((entry) => asRecord(entry));
  if (rawTerms.length === 0) {
    return [{ terms: [] }];
  }

  return rawTerms.map((entry) => ({
    terms: toStringArray(entry.terms),
  }));
};

const normalizeCustomLabels = (
  value: unknown,
  fallbackTaxName: string
): SagaCustomLabels => {
  const labels = asRecord(value);

  return {
    invoiceNumber: toStringValue(labels.invoiceNumber, "Invoice No"),
    invoiceDate: toStringValue(labels.invoiceDate, "Invoice Date"),
    dueDate: toStringValue(labels.dueDate, "Due Date"),
    purchaseOrderNumber: toStringValue(labels.purchaseOrderNumber, "PO No"),
    billedTo: toStringValue(labels.billedTo, "Billed To"),
    shippedTo: toStringValue(labels.shippedTo, "Shipped To"),
    shippedFrom: toStringValue(labels.shippedFrom, "Shipped From"),
    transportName: toStringValue(labels.transportName, "Transport Name"),
    challanNumber: toStringValue(labels.challanNumber, "Challan Number"),
    challanDate: toStringValue(labels.challanDate, "Challan Date"),
    transportExtraInfo: toStringValue(
      labels.transportExtraInfo,
      "Transport Extra Info"
    ),
    taxName: toStringValue(labels.taxName, fallbackTaxName || "Tax"),
    totalInWords: toStringValue(labels.totalInWords, "Total (in words)"),
    totalInWordsValue: toStringValue(labels.totalInWordsValue),
    terms: toStringValue(labels.terms, "Terms and Conditions"),
    notes: toStringValue(labels.notes, "Additional Notes"),
    attachment: toStringValue(labels.attachment, "Attachments"),
    subTotal: toStringValue(labels.subTotal, "Sub Total"),
    total: toStringValue(labels.total, "Total"),
    signature: toStringValue(labels.signature, "Authorised Signatory"),
    contact: toStringValue(labels.contact, "For any enquiry, reach out via"),
    contactEmail: toStringValue(labels.contactEmail, "email at"),
    contactPhone: toStringValue(labels.contactPhone, "call on"),
  };
};

const normalizeTotals = (invoice: UnknownRecord): SagaTotals => {
  const totals = asRecord(invoice.totals);
  const finalTotal = asRecord(invoice.finalTotal);
  const cesses = asArray(invoice.cesses).map((entry) => asRecord(entry));
  const columns = asArray(invoice.columns).map((entry) => asRecord(entry));
  const finalCessTotal = asRecord(
    pickFirstValue(totals.cessTotal, finalTotal.cessTotal)
  );
  const columnLabelByKey = new Map(
    columns.map((column) => [toStringValue(column.key), toStringValue(column.label)])
  );
  const useUtgst = Boolean(invoice.utgst);
  const isIgst =
    Boolean(invoice.igst) || toStringValue(invoice.taxName) !== "GST";
  const showIgst = isIgst;
  const showCgstSgst = !isIgst && toStringValue(invoice.taxName) === "GST";

  const extraTotalFields = asArray(invoice.extraTotalFields)
    .map((entry) => asRecord(entry))
    .filter((field) => hasValue(field.value))
    .map((field) => ({
      label: toStringValue(field.label),
      value: toStringValue(field.value),
    }));

  const additionalChargeRows = asArray(invoice.additionalCharges)
    .map((entry) => asRecord(entry))
    .map((charge) => {
      const amount = toNumberValue(charge.amount);
      const multiplier = toNumberValue(charge.multiplier, 1);
      return {
        label: toStringValue(charge.label, "Additional Charge"),
        value: amount * multiplier,
      };
    })
    .filter((charge) => charge.value !== 0);
  const cessRows = cesses
    .filter((cess) => Boolean(cess.isApplied))
    .map((cess) => {
      const cessAmountKey = toStringValue(cess.cessAmountKey);
      const cessLabelFromColumn = columnLabelByKey.get(cessAmountKey) || "";
      const cessName = toStringValue(cess.cessName);
      return {
        label: cessName || cessLabelFromColumn || "Cess",
        value: toNumberValue(finalCessTotal[cessAmountKey]),
      };
    })
    .filter((cess) => cess.value !== 0);

  return {
    amountLabel: columnLabelByKey.get("amount") || "Amount",
    igstLabel: columnLabelByKey.get("igst") || "IGST",
    cgstLabel: columnLabelByKey.get("cgst") || "CGST",
    sgstLabel: useUtgst ? "UTGST" : columnLabelByKey.get("sgst") || "SGST",
    showIgst,
    showCgstSgst,
    amount: formatCurrency(
      pickFirstValue(totals.amount, finalTotal.amount),
      invoice
    ),
    subTotal: formatCurrency(
      pickFirstValue(
        totals.subTotal,
        finalTotal.subTotal,
        finalTotal.subtotal,
        finalTotal.taxableValue
      ),
      invoice
    ),
    discount: formatCurrency(
      pickFirstValue(totals.discount, finalTotal.discount, finalTotal.totalDiscount),
      invoice
    ),
    igst: formatCurrency(pickFirstValue(totals.igst, finalTotal.igst), invoice),
    cgst: formatCurrency(pickFirstValue(totals.cgst, finalTotal.cgst), invoice),
    sgst: formatCurrency(
      pickFirstValue(totals.sgst, totals.utgst, finalTotal.sgst, finalTotal.utgst),
      invoice
    ),
    totalCess: toNumberValue(pickFirstValue(totals.totalCess, totals.cess, finalTotal.totalCess, finalTotal.cess)),
    cessRows: cessRows.map(row => ({
      label: row.label,
      value: formatCurrency(row.value, invoice)
    })),
    additionalChargeRows: additionalChargeRows.map(row => ({
      label: row.label,
      value: formatCurrency(row.value, invoice)
    })),
    amountRoundOff: formatCurrency(
      pickFirstValue(totals.amountRoundOff, finalTotal.amountRoundOff),
      invoice
    ),
    totalRoundOff: formatCurrency(
      pickFirstValue(totals.totalRoundOff, finalTotal.totalRoundOff),
      invoice
    ),
    total: formatCurrency(
      pickFirstValue(
        totals.total,
        finalTotal.total,
        finalTotal.grandTotal,
        finalTotal.payableAmount
      ),
      invoice
    ),
    extraTotalFields,
  };
};

const normalizeBalance = (invoice: UnknownRecord): SagaBalance => {
  const balance = asRecord(invoice.balance);
  const toPay = asRecord(invoice.toPay);
  const paid = toNumberValue(balance.paid, 0);
  const transactionCharge = toNumberValue(balance.transactionCharge, 0);
  const amountPaid = Math.abs(paid + transactionCharge);
  const due = toNumberValue(pickFirstValue(balance.due, toPay.full, toPay.amount), 0);

  return {
    paid: formatCurrency(amountPaid, invoice),
    due: formatCurrency(due, invoice),
  };
};

const getAggregateTaxTotals = (
  lineItems: UnknownRecord[],
  key: "cgst" | "sgst" | "igst",
  isIgst: boolean
): Array<{ gstRate: number; amount: number }> => {
  const aggregated: Record<string, { gstRate: number; amount: number }> = {};

  lineItems.forEach((lineItem) => {
    const taxAmount = toNumberValue(lineItem[key], 0);
    const gstRate = toNumberValue(lineItem.gstRate, 0);

    if (!taxAmount || !gstRate) {
      return;
    }

    const aggregateKey = `gst:${gstRate},isIgst:${isIgst}`;
    const normalizedRate = isIgst ? gstRate : gstRate / 2;

    if (aggregated[aggregateKey]) {
      aggregated[aggregateKey].amount += taxAmount;
      return;
    }

    aggregated[aggregateKey] = {
      gstRate: normalizedRate,
      amount: taxAmount,
    };
  });

  return Object.values(aggregated);
};

const getCessBreakupTotals = (
  cesses: UnknownRecord[],
  items: UnknownRecord[]
): Array<{ rate: number; amount: number; cessKey: string; cessName: string }> => {
  const aggregated: Record<
    string,
    { rate: number; amount: number; cessKey: string; cessName: string }
  > = {};

  cesses
    .filter((cess) => Boolean(cess.isApplied))
    .forEach((cess) => {
      const cessKey = toStringValue(cess.cessKey);
      const cessAmountKey = toStringValue(cess.cessAmountKey);
      const cessName = toStringValue(cess.cessName, "Cess");

      if (!cessKey || !cessAmountKey) {
        return;
      }

      items.forEach((item) => {
        const custom = asRecord(item.custom);
        const rate = toNumberValue(custom[cessKey], 0);
        const amount = toNumberValue(custom[cessAmountKey], 0);
        const aggregateKey = `cessVal:${rate},cessKey:${cessKey}`;

        if (aggregated[aggregateKey]) {
          aggregated[aggregateKey].amount += amount;
          return;
        }

        aggregated[aggregateKey] = {
          rate,
          amount,
          cessKey,
          cessName,
        };
      });
    });

  return Object.values(aggregated);
};

const normalizeInvoiceDetails = (
  invoice: UnknownRecord,
  customLabels: SagaCustomLabels
): SagaInvoiceDetails => {
  const totals = asRecord(invoice.totals);
  const finalTotal = asRecord(invoice.finalTotal);
  const balance = asRecord(invoice.balance);
  const toPay = asRecord(invoice.toPay);
  const advanceOptions = asRecord(invoice.advanceOptions);
  const latePaymentFee = asRecord(invoice.latePaymentFee);
  const earlyPayDiscount = asRecord(invoice.earlyPayDiscount);
  const params = asRecord(invoice.params);
  const billedBy = asRecord(invoice.billedBy);

  const columns = asArray(invoice.columns).map((entry) => asRecord(entry));
  const items = asArray(invoice.items).map((entry) => asRecord(entry));
  const cesses = asArray(invoice.cesses).map((entry) => asRecord(entry));
  const additionalCharges = asArray(invoice.additionalCharges).map((entry) =>
    asRecord(entry)
  );

  const columnLabelByKey = new Map(
    columns.map((column) => [toStringValue(column.key), toStringValue(column.label)])
  );
  const finalCessTotal = asRecord(
    pickFirstValue(finalTotal.cessTotal, totals.cessTotal)
  );

  const discount = toNumberValue(
    pickFirstValue(finalTotal.discount, finalTotal.totalDiscount, totals.discount),
    0
  );
  const discountPercentage = toStringValue(finalTotal.discountPercentage);
  const earlyDiscount = toNumberValue(finalTotal.earlyDiscount, 0);
  const subTotal = toNumberValue(
    pickFirstValue(
      finalTotal.subTotal,
      finalTotal.subtotal,
      finalTotal.taxableValue,
      totals.subTotal
    ),
    0
  );
  const amount = toNumberValue(pickFirstValue(finalTotal.amount, totals.amount), 0);
  const cgst = toNumberValue(pickFirstValue(finalTotal.cgst, totals.cgst), 0);
  const sgst = toNumberValue(
    pickFirstValue(finalTotal.sgst, finalTotal.utgst, totals.sgst, totals.utgst),
    0
  );
  const igst = toNumberValue(pickFirstValue(finalTotal.igst, totals.igst), 0);
  const total = toNumberValue(
    pickFirstValue(
      finalTotal.total,
      finalTotal.grandTotal,
      finalTotal.payableAmount,
      totals.total
    ),
    0
  );
  const dueAmount = toNumberValue(
    pickFirstValue(balance.due, toPay.full, toPay.amount),
    0
  );
  const paidAmount = toNumberValue(balance.paid, 0);
  const transactionCharge = toNumberValue(balance.transactionCharge, 0);
  const settledAmount = toNumberValue(balance.settledAmount, 0);
  const tds = toNumberValue(balance.tds, 0);
  const credit = toNumberValue(balance.credit, 0);

  const mainRows: SagaInvoiceDetailRow[] = [];
  const extraRows: SagaInvoiceDetailRow[] = [];
  const dueRows: SagaInvoiceDetailRow[] = [];
  const pushMainRow = (label: string, value: number, rowClass = "", isDue = false): void => {
    mainRows.push({
      label,
      value: formatCurrency(value, invoice),
      rowClass,
      isDue,
    });
  };
  const pushExtraRow = (label: string, value: string | number): void => {
    extraRows.push({
      label,
      value: typeof value === "number" ? formatCurrency(value, invoice) : value,
    });
  };
  const pushDueRow = (label: string, value: number, rowClass = "", isDue = false): void => {
    dueRows.push({
      label,
      value: formatCurrency(value, invoice),
      rowClass,
      isDue,
    });
  };

  const invoiceType = toStringValue(invoice.invoiceType);
  const billType = toStringValue(invoice.billType);
  const taxSummaryView = toStringValue(advanceOptions.taxSummaryView);
  const taxType = toStringValue(invoice.taxType, "INDIA");
  const taxName = toStringValue(invoice.taxName, "GST");
  const showSummaryTaxRows =
    taxSummaryView === "BOTH" || taxSummaryView === "INVOICE_SUMMARY";
  const igstTax = Boolean(invoice.igst);
  const useUtgst = Boolean(invoice.utgst);
  const hideTaxes = Boolean(invoice.hideTaxes);
  const hideTotals = Boolean(invoice.hideTotals);
  const reverseCharge = Boolean(invoice.reverseCharge);
  const isExpenditure = Boolean(invoice.isExpenditure);
  const isMalaysia = toStringValue(billedBy.country) === "MY";
  const partnerOffer = Boolean(params.partnerOffer);

  const itemTotal = items
    .filter((item) => !Boolean(item.isGroupItemTotalRow))
    .reduce((acc, item) => acc + toNumberValue(item.total, 0), 0);

  const additionalChargeRows = additionalCharges
    .map((charge) => {
      const amountVal = toNumberValue(charge.amount, 0);
      const multiplier = toNumberValue(charge.multiplier, 1);
      const amountType = toStringValue(charge.amountType);
      const computedAmount =
        amountType === "PERCENTAGE"
          ? (amountVal * multiplier * itemTotal) / 100
          : amountVal * multiplier;

      return {
        label: toStringValue(charge.label, "Additional Charge"),
        value: computedAmount,
      };
    });

  if (hideTotals) {
    additionalChargeRows.forEach((charge) => {
      pushMainRow(charge.label, charge.value);
    });

    return {
      mainRows,
      extraRows,
      dueRows,
    };
  }

  items
    .filter((item) => Boolean(item.isAdditionalCharge))
    .forEach((item) => {
      const itemName = toStringValue(item.name, "Additional Charge");
      const itemRate = toNumberValue(item.rate, 0);
      const itemTax = toNumberValue(item.igst, 0);
      const gstRate = toNumberValue(item.gstRate, 0);
      const hsnOrClassification = toStringValue(
        pickFirstValue(item.classification, item.hsn)
      );
      const itemTaxLabel = `${taxName} ${gstRate}%${hsnOrClassification
        ? ` (${isMalaysia ? "Code" : "HSN"} ${hsnOrClassification})`
        : ""
        }`;

      pushMainRow(itemName, itemRate);
      pushMainRow(itemTaxLabel, itemTax);
    });

  if (discount !== 0 || Boolean(earlyPayDiscount.applied)) {
    pushMainRow(customLabels.subTotal || "Sub Total", subTotal);

    if (discount !== 0) {
      pushMainRow(
        `${columnLabelByKey.get("discount") || "Discount"}${discountPercentage ? `(${discountPercentage}%)` : ""
        }`,
        discount
      );
    }

    if (Boolean(earlyPayDiscount.applied)) {
      pushMainRow("Early Pay Discount", earlyDiscount);
    }
  }

  if (invoiceType === "INVOICE") {
    pushMainRow(columnLabelByKey.get("amount") || "Amount", amount);

    if (!hideTaxes) {
      if (!showSummaryTaxRows) {
        if (!igstTax && taxType === "INDIA") {
          pushMainRow(columnLabelByKey.get("cgst") || "CGST", cgst);
          pushMainRow(useUtgst ? "UTGST" : columnLabelByKey.get("sgst") || "SGST", sgst);
        } else {
          pushMainRow(columnLabelByKey.get("igst") || "IGST", igst);
        }
      } else {
        if (!igstTax && taxType === "INDIA") {
          const aggCgst = getAggregateTaxTotals(
            items,
            "cgst",
            igstTax || taxName !== "GST"
          );
          const aggSgst = getAggregateTaxTotals(
            items,
            "sgst",
            igstTax || taxName !== "GST"
          );

          if (aggCgst.length > 0) {
            aggCgst.forEach((tax) => {
              pushMainRow(
                `${columnLabelByKey.get("cgst") || "CGST"} (${tax.gstRate}%)`,
                tax.amount
              );
            });
          } else {
            pushMainRow(columnLabelByKey.get("cgst") || "CGST", cgst);
          }

          if (aggSgst.length > 0) {
            aggSgst.forEach((tax) => {
              pushMainRow(
                `${useUtgst ? "UTGST" : columnLabelByKey.get("sgst") || "SGST"} (${tax.gstRate
                }%)`,
                tax.amount
              );
            });
          } else {
            pushMainRow(useUtgst ? "UTGST" : columnLabelByKey.get("sgst") || "SGST", sgst);
          }
        } else {
          const aggIgst = getAggregateTaxTotals(
            items,
            "igst",
            igstTax || taxName !== "GST"
          );

          if (aggIgst.length > 0) {
            aggIgst.forEach((tax) => {
              pushMainRow(
                `${columnLabelByKey.get("igst") || "IGST"} (${tax.gstRate}%)`,
                tax.amount
              );
            });
          } else {
            pushMainRow(columnLabelByKey.get("igst") || "IGST", igst);
          }
        }
      }
    }

    if (!showSummaryTaxRows) {
      cesses
        .filter((cess) => Boolean(cess.isApplied))
        .forEach((cess) => {
          const cessAmountKey = toStringValue(cess.cessAmountKey);
          const cessLabel = toStringValue(cess.cessName, "Cess");
          pushMainRow(cessLabel, toNumberValue(finalCessTotal[cessAmountKey], 0));
        });
    } else {
      getCessBreakupTotals(cesses, items)
        .filter((cess) => cess.amount > 0)
        .forEach((cess) => {
          pushMainRow(`${cess.cessName} (${cess.rate}%)`, cess.amount);
        });
    }
  }

  additionalChargeRows.forEach((charge) => {
    pushMainRow(charge.label, charge.value);
  });

  if (Boolean(latePaymentFee.enabled) && Boolean(latePaymentFee.isApplied)) {
    pushMainRow("Late Payment Fee", toNumberValue(latePaymentFee.finalAmount, 0));
  }

  const currencyCode = toStringValue(invoice.currency);
  const totalLabel = customLabels.total || columnLabelByKey.get("total") || "Total";
  pushMainRow(
    `${totalLabel}${currencyCode ? ` (${currencyCode})` : ""}`,
    total,
    "grand"
  );

  asArray(invoice.extraTotalFields)
    .map((entry) => asRecord(entry))
    .filter((field) => hasValue(field.value))
    .forEach((field) => {
      pushExtraRow(toStringValue(field.label), toStringValue(field.value));
    });

  if (billType !== "CREDITNOTE" && billType !== "DEBITNOTE" && credit !== 0) {
    pushExtraRow("Credit Applied", credit * -1);
  }

  if (billType === "CREDITNOTE") {
    if (credit !== 0) {
      pushExtraRow("Credit Used", credit * -1);
    }
    if (dueAmount !== 0) {
      pushExtraRow("Available Credits", dueAmount);
    }
  }

  if (billType !== "CREDITNOTE" && paidAmount !== 0) {
    const getPaidAmount = (paid = 0, tsCharge = 0): number => {
      if (!partnerOffer) {
        return paid + tsCharge;
      }
      return toNumberValue(finalTotal.total, paid) + tsCharge;
    };

    if (tds !== 0) {
      pushDueRow("TDS Amount Withheld", tds * -1);
    }

    pushDueRow("Amount Paid", getPaidAmount(paidAmount, transactionCharge) * -1, "amount-row");

    if (reverseCharge && isExpenditure && (igst !== 0 || cgst !== 0 || sgst !== 0)) {
      pushDueRow("Tax Under RCM", igst || cgst + sgst, "amount-row");
    }

    if (transactionCharge !== 0) {
      pushDueRow("Amount Received", getPaidAmount(paidAmount));
      pushDueRow("Transaction Charge", transactionCharge);
    }

    if (settledAmount !== 0) {
      pushDueRow("Settled Amount", settledAmount);
    }

    if (dueAmount !== 0) {
      pushDueRow("Due Amount", dueAmount, "amount-row", true);
    }
  }

  return {
    mainRows,
    extraRows,
    dueRows,
  };
};

const normalizeTaxSummary = (invoice: UnknownRecord): SagaTaxSummary => {
  const items = asArray(invoice.items);
  const cesses = asArray(invoice.cesses).map((c) => asRecord(c));
  interface CessDefs {
    amountKeys: Set<string>;
    rateKeys: Set<string>;
  }
  const cessDefs = cesses.reduce((acc: CessDefs, c) => {
    const cessAmountKey = toStringValue(c.cessAmountKey);
    const cessKey = toStringValue(c.cessKey);
    if (cessAmountKey) acc.amountKeys.add(cessAmountKey);
    if (cessKey) acc.rateKeys.add(cessKey);
    return acc;
  }, { amountKeys: new Set<string>(), rateKeys: new Set<string>() });

  interface SummaryType {
    taxList: Record<string, any>;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalCess: number;
    totalTax: number;
  }

  const initialSummary: SummaryType = {
    taxList: {},
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
  };

  const summary = items.reduce(
    (acc: SummaryType, item) => {
      const record = asRecord(item);
      const custom = asRecord(record.custom);
      const gstRate = toNumberValue(pickFirstValue(record.gstRate, record.taxRate), 0);

      let itemTotalCessRate = 0;
      let itemTotalCessAmount = 0;
      for (const key of Object.keys(custom)) {
        if (cessDefs.rateKeys.has(key)) itemTotalCessRate += toNumberValue(custom[key], 0);
        if (cessDefs.amountKeys.has(key)) itemTotalCessAmount += toNumberValue(custom[key], 0);
      }

      if (gstRate === 0 && itemTotalCessAmount === 0) return acc;

      const key = `gst:${gstRate},cess:${itemTotalCessRate}`;
      const existing = acc.taxList[key];

      const cgst = toNumberValue(record.cgst, 0);
      const sgst = toNumberValue(record.sgst, 0);
      const igst = toNumberValue(record.igst, 0);
      const taxAmount = cgst + sgst + igst + itemTotalCessAmount;

      if (existing) {
        existing.cgstAmount += cgst;
        existing.sgstAmount += sgst;
        existing.igstAmount += igst;
        existing.cessAmount += itemTotalCessAmount;
        existing.taxAmount += taxAmount;
      } else {
        acc.taxList[key] = {
          gstRate: `${gstRate}%`,
          cgstRate: `${gstRate / 2}%`,
          cgstAmount: cgst,
          sgstRate: `${gstRate / 2}%`,
          sgstAmount: sgst,
          igstRate: `${gstRate}%`,
          igstAmount: igst,
          cessRate: `${itemTotalCessRate}%`,
          cessAmount: itemTotalCessAmount,
          taxAmount: taxAmount,
        };
      }

      acc.totalCgst += cgst;
      acc.totalSgst += sgst;
      acc.totalIgst += igst;
      acc.totalCess += itemTotalCessAmount;
      acc.totalTax += taxAmount;

      return acc;
    },
    initialSummary
  );

  return {
    taxList: Object.values(summary.taxList).map((row: any) => ({
      ...row,
      cgstAmount: formatCurrency(row.cgstAmount, invoice),
      sgstAmount: formatCurrency(row.sgstAmount, invoice),
      igstAmount: formatCurrency(row.igstAmount, invoice),
      cessAmount: formatCurrency(row.cessAmount, invoice),
      taxAmount: formatCurrency(row.taxAmount, invoice),
    })),
    totalCgstAmount: formatCurrency(summary.totalCgst, invoice),
    totalSgstAmount: formatCurrency(summary.totalSgst, invoice),
    totalIgstAmount: formatCurrency(summary.totalIgst, invoice),
    totalCessAmount: formatCurrency(summary.totalCess, invoice),
    totalCessAmountValue: summary.totalCess,
    totalTaxAmountValue: summary.totalTax,
    totalTaxAmount: formatCurrency(summary.totalTax, invoice),
    totalTaxInWords: toStringValue(asRecord(invoice.taxSummary).totalTaxInWords),
  };
};

const normalizeHsnSummary = (value: unknown, invoice: UnknownRecord): SagaHsnSummary => {
  const record = asRecord(value);
  const hsnList = asArray(record.hsnList).map((entry) => {
    const row = asRecord(entry);

    const isIgst =
      Boolean(invoice.igst) || toStringValue(invoice.taxName) !== "GST";
    const showIgst = isIgst;
    const showCgstSgst = !isIgst && toStringValue(invoice.taxName) === "GST";

    return {
      hsn: toStringValue(row.hsn),
      taxableValue: formatCurrency(row.taxableValue, invoice),
      cgstRate: toStringValue(row.cgstRate),
      cgstAmount: formatCurrency(row.cgstAmount, invoice),
      sgstRate: toStringValue(row.sgstRate),
      sgstAmount: formatCurrency(row.sgstAmount, invoice),
      igstRate: toStringValue(row.igstRate),
      igstAmount: formatCurrency(row.igstAmount, invoice),
      cessRate: `${toNumberValue(
        pickFirstValue(row.totalCess, row.cessRate)
      )}%`,
      cessAmount: formatCurrency(
        pickFirstValue(row.totalCessAmount, row.cessAmount),
        invoice
      ),
      taxAmount: formatCurrency(row.taxAmount, invoice),
      showIgst,
      showCgstSgst,
    };
  });

  return {
    hsnList,
    totalTaxableValue: formatCurrency(record.totalTaxableValue, invoice),
    totalCgstAmount: formatCurrency(record.totalCgstAmount, invoice),
    totalSgstAmount: formatCurrency(record.totalSgstAmount, invoice),
    totalIgstAmount: formatCurrency(record.totalIgstAmount, invoice),
    totalCessAmount: formatCurrency(record.totalCessAmount, invoice),
    totalCessAmountValue: toNumberValue(record.totalCessAmount),
    totalTaxAmount: formatCurrency(record.totalTaxAmount, invoice),
    totalTaxInWords: toStringValue(record.totalTaxInWords),
  };
};

const normalizePayments = (value: unknown, invoice: UnknownRecord): SagaPayment[] => {
  return asArray(value).map((entry) => {
    const payment = asRecord(entry);

    return {
      paymentDate: toStringValue(
        pickFirstValue(payment.paymentDate, payment.date, payment.createdAt)
      ),
      paymentMethod: toStringValue(
        pickFirstValue(payment.paymentMethod, payment.mode, payment.method)
      ),
      amount: formatCurrency(payment.amount, invoice),
      status: toStringValue(payment.status),
    };
  });
};

const normalizeIrn = (value: unknown): SagaIrn => {
  const irn = asRecord(value);

  return {
    Irn: toStringValue(irn.Irn),
    AckNo: toStringValue(irn.AckNo),
    AckDt: toStringValue(irn.AckDt),
    CancelDate: toStringValue(irn.CancelDate),
    EwbNo: toStringValue(irn.EwbNo),
    EwbDt: toStringValue(irn.EwbDt),
    EwbValidTill: toStringValue(irn.EwbValidTill),
    ewayCancelDate: toStringValue(irn.ewayCancelDate),
    qrCode: toStringValue(irn.qrCode),
  };
};

const buildUpiPayload = (upiId: string): string => {
  return `upi://pay?pa=${upiId}`;
};

const toNumberByLocale = (value: unknown): number => {
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "");
    return Number(cleaned);
  }

  return Number(value);
};

const getGroupedLineItems = ({
  items,
  showTotalsRow,
  columns,
  hideGroupSubTotal,
}: {
  items: UnknownRecord[];
  showTotalsRow: boolean;
  columns: SagaColumn[];
  hideGroupSubTotal: boolean;
}): UnknownRecord[] => {
  const lineItems: UnknownRecord[] = [];
  const groupItems: UnknownRecord[] = [];
  const invalidNumberColumnKeys = new Set<string>();
  let isGroupItem = false;
  let endTotalsRow: UnknownRecord = {};

  const columnDataTypeMap = columns.reduce<Record<string, string>>((acc, column) => {
    if (!column.key) return acc;
    if (!acc[column.key]) {
      acc[column.key] = column.dataType;
    }
    return acc;
  }, {});

  items.forEach((item, index) => {
    lineItems.push(item);

    if (Boolean(item.group)) {
      isGroupItem = true;
    } else if (isGroupItem) {
      groupItems.push(item);
    }

    const nextItem = items[index + 1];
    if (
      !hideGroupSubTotal &&
      isGroupItem &&
      (!nextItem || Boolean(nextItem.group)) &&
      groupItems.length
    ) {
      const groupTotalItem = groupItems.reduce<UnknownRecord>(
        (acc, curr) => {
          if (Boolean(curr.isAdditionalCharge)) {
            return acc;
          }

          return {
            name: "Sub total",
            amount: toNumberValue(acc.amount) + toNumberValue(curr.amount),
            subTotal: toNumberValue(acc.subTotal) + toNumberValue(curr.subTotal),
            total: toNumberValue(acc.total) + toNumberValue(curr.total),
            quantity: toNumberValue(acc.quantity) + toNumberValue(curr.quantity),
            cgst: toNumberValue(acc.cgst) + toNumberValue(curr.cgst),
            sgst: toNumberValue(acc.sgst) + toNumberValue(curr.sgst),
            igst: toNumberValue(acc.igst) + toNumberValue(curr.igst),
            isGroupItemTotalRow: true,
          };
        },
        {
          amount: 0,
          subTotal: 0,
          total: 0,
          quantity: 0,
          isGroupItemTotalRow: true,
          cgst: 0,
          igst: 0,
          sgst: 0,
        }
      );

      lineItems.push(groupTotalItem);
      groupItems.length = 0;
    }

    if (!nextItem && showTotalsRow) {
      endTotalsRow = items.reduce<UnknownRecord>(
        (acc, curr) => {
          if (Boolean(curr.isAdditionalCharge)) {
            return acc;
          }

          const value = {
            name: "Total",
            amount: toNumberValue(acc.amount) + toNumberValue(curr.amount),
            subTotal: toNumberValue(acc.subTotal) + toNumberValue(curr.subTotal),
            total: toNumberValue(acc.total) + toNumberValue(curr.total),
            quantity: toNumberValue(acc.quantity) + toNumberValue(curr.quantity),
            cgst: toNumberValue(acc.cgst) + toNumberValue(curr.cgst),
            sgst: toNumberValue(acc.sgst) + toNumberValue(curr.sgst),
            igst: toNumberValue(acc.igst) + toNumberValue(curr.igst),
            isGroupItemTotalRow: true,
            custom: { ...asRecord(acc.custom) },
          } as UnknownRecord;

          const customValues = asRecord(curr.custom);
          Object.entries(customValues).forEach(([key, customValue]) => {
            const columnDataType = columnDataTypeMap[key];
            if (["date", "text"].includes(columnDataType)) {
              return;
            }

            const parsed = toNumberByLocale(customValue);
            if (Number.isNaN(parsed)) {
              invalidNumberColumnKeys.add(key);
              return;
            }

            const accumulatorCustom = asRecord(value.custom);
            accumulatorCustom[key] =
              toNumberValue(accumulatorCustom[key]) +
              (Number(customValue) || 0);
            value.custom = accumulatorCustom;
          });

          return value;
        },
        {
          amount: 0,
          subTotal: 0,
          total: 0,
          quantity: 0,
          isGroupItemTotalRow: true,
          cgst: 0,
          igst: 0,
          sgst: 0,
          custom: {},
        }
      );
    }
  });

  if (showTotalsRow && Object.keys(endTotalsRow).length) {
    const custom = asRecord(endTotalsRow.custom);
    invalidNumberColumnKeys.forEach((columnKey) => {
      delete custom[columnKey];
    });
    endTotalsRow.custom = custom;

    return [...lineItems, endTotalsRow];
  }

  return lineItems;
};

const defaultInvoicePayloadFieldIndex = getDefaultInvoicePayloadFieldPathIndex();

const defaultContractEntries: TemplateFieldMapEntry[] =
  DEFAULT_INVOICE_TEMPLATE_CONTRACT.renderOrder.map((componentId) => ({
    uiComponent: componentId,
    source: defaultInvoicePayloadFieldIndex[componentId],
    purpose: "Canonical payload paths from Lydia default.js",
  }));

export const sagaEngineeringFieldMap: TemplateFieldMap = {
  templateName: "saga-engineering",
  version: "2.0.0",
  sections: [
    {
      section: "Canonical Default.js Component Mapping",
      entries: defaultContractEntries,
    },
    {
      section: "Saga Required Model Fields",
      entries: [
        {
          uiComponent: "Top QR",
          source: ["irn.qrCode", "zatcaQrCode", "lhdnQrCode", "documentQr"],
          fallbackOrder: [
            "irn.qrCode (if IRN not cancelled)",
            "zatcaQrCode",
            "lhdnQrCode",
            "documentQr",
            "empty string",
          ],
        },
        {
          uiComponent: "UPI QR",
          source: ["upi.qr", "upi.upi", "upi.vpa"],
          fallbackOrder: ["upi.qr", "upi://pay?pa=(upi.upi|upi.vpa)", "empty string"],
        },
        {
          uiComponent: "Totals and Balance",
          source: ["totals.*", "finalTotal.*", "balance.*", "toPay.*"],
        },
        {
          uiComponent: "Payments Table",
          source: ["allPayments[]", "payments[]"],
        },
      ],
    },
  ],
};

export const mapInvoiceToSagaEngineeringModel: CeresTemplateDataMapper = (
  payload
) => {
  const invoice = asRecord(payload);
  const currencySymbol = getCurrencySymbol(invoice);
  const irn = normalizeIrn(invoice.irn);
  const upi = normalizeUpi(invoice.upi);
  const invoiceSubTitle = toStringValue(invoice.invoiceSubTitle);
  const taxName = toStringValue(invoice.taxName, "Tax");

  const irnCancelDate = toNonEmptyString(irn.CancelDate);
  const irnQr = toNonEmptyString(irn.qrCode);
  const zatcaQrCode = toNonEmptyString(invoice.zatcaQrCode);
  const lhdnQrCode = toNonEmptyString(invoice.lhdnQrCode);
  const documentQr = toNonEmptyString(invoice.documentQr);

  const topQr =
    (irnQr && !irnCancelDate ? irnQr : null) ??
    zatcaQrCode ??
    lhdnQrCode ??
    documentQr ??
    "";

  const upiId =
    toNonEmptyString(upi.upi) ?? toNonEmptyString(upi.vpa) ?? "";
  const upiQr =
    toNonEmptyString(upi.qr) ?? (upiId ? buildUpiPayload(upiId) : "");

  const customLabels = normalizeCustomLabels(invoice.customLabels, taxName);
  const billedBy = normalizeParty(invoice.billedBy);
  const billedTo = normalizeParty(invoice.billedTo);
  const shippedTo = normalizeParty(invoice.shippedTo);
  const shippedFrom = normalizeParty(invoice.shippedFrom);
  const transportDetails = normalizeTransportDetails(invoice.transportDetails);

  const rawColumns = asArray(invoice.columns).map((entry) => asRecord(entry));
  const invoiceTemplate = asRecord(invoice.template);
  const pdfOptions = asRecord(
    pickFirstValue(invoiceTemplate.pdfOptions, invoice.pdfOptions)
  );
  const advanceOptions = asRecord(invoice.advanceOptions);
  const finalTotal = asRecord(invoice.finalTotal);
  const invoiceType = toStringValue(invoice.invoiceType);
  const taxType = toStringValue(invoice.taxType);
  const isTaxInvoice = invoiceType === "INVOICE";
  const igstTax = Boolean(invoice.igst);
  const discountEnabled = Boolean(
    toNumberValue(pickFirstValue(finalTotal.discount, finalTotal.totalDiscount), 0)
  );
  const hsnView = toStringValue(advanceOptions.hsnView, "DEFAULT");
  const ownerCountry =
    toStringValue(asRecord(invoice.owner).country) ||
    toStringValue(asRecord(invoice.billedBy).country);
  const templateName = toStringValue(
    pickFirstValue(
      asRecord(invoice.template).parentTemplate,
      asRecord(invoice.template).template,
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
  const showUnitInName = toStringValue(advanceOptions.unitColumn, "MERGE_QUANTITY") === "MERGE_NAME";

  const columns: SagaColumn[] = rawColumns.map((col) => {
    const key = toStringValue(col.key);
    const dataType = toStringValue(col.dataType);
    const fxReturnType = toStringValue(col.fxReturnType);

    let visible = true;
    if (key === "msic") {
      visible = false;
    } else if (key === "hsn") {
      visible = showHsnColumn;
    } else if (key === "classification") {
      visible = showClassificationColumn;
    } else if (key === "gstRate") {
      visible = isTaxInvoice;
    } else if (key === "discount") {
      visible = discountEnabled;
    } else if (key === "sgst" || key === "cgst") {
      visible = isTaxInvoice && !igstTax && taxType === "INDIA";
    } else if (key === "igst") {
      visible = isTaxInvoice && (igstTax || taxType === "GLOBAL");
    } else if (key === "total") {
      visible = isTaxInvoice;
    }

    const isHidden = Boolean(col.isHidden) || !visible;
    const label =
      key === "sgst" && Boolean(invoice.utgst) ? "UTGST" : toStringValue(col.label);

    return {
      key,
      label,
      className: getColumnClass(key),
      isHidden,
      dataType,
      fxReturnType,
      summarise: Boolean(col.summarise),
    };
  });

  const showTotalsRow = Boolean(invoice.showTotalsRow);
  const hideGroupSubTotal = Boolean(advanceOptions.hideGroupSubTotal);
  const groupedItems = getGroupedLineItems({
    items: asArray(invoice.items).map((entry) => asRecord(entry)),
    showTotalsRow,
    columns,
    hideGroupSubTotal,
  });
  const renderItems = groupedItems.filter(
    (item) => !Boolean(asRecord(item).isAdditionalCharge)
  );

  let displayIndex = 0;
  const items = renderItems.map((item) => {
    const record = asRecord(item);
    const isGroup = Boolean(record.group);
    const isSummaryRow = Boolean(record.isGroupItemTotalRow);

    if (isGroup) {
      displayIndex = 0;
    } else if (!isSummaryRow) {
      displayIndex += 1;
    }

    return normalizeItem(
      record,
      invoice,
      columns,
      showSkuInName,
      showHsnColumn || showInlineHsn,
      !isGroup && !isSummaryRow ? `${displayIndex}.` : "",
      showSkuInName
    );
  });
  const totals = normalizeTotals(invoice);
  const balance = normalizeBalance(invoice);
  const invoiceDetails = normalizeInvoiceDetails(invoice, customLabels);
  const bankAccount = normalizeBankAccount(invoice.bankAccount);
  const terms = normalizeTerms(invoice.terms);
  const allPayments = normalizePayments(
    pickFirstValue(invoice.allPayments, invoice.payments),
    invoice
  );
  const customFooters = asArray(invoice.customFooters)
    .map((entry) => asRecord(entry))
    .filter((footer) => Boolean(pickFirstValue(footer.value, footer.defaultValue)))
    .map((footer) => ({
      label: toStringValue(footer.label),
      value: toStringValue(pickFirstValue(footer.value, footer.defaultValue)),
    }));
  const attachments = toStringArray(invoice.attachments).map((url, idx) => {
    let [fileName] = url.split("?");
    const lastSlashIndex = fileName.lastIndexOf("/");
    fileName = decodeURI(fileName.substring(lastSlashIndex + 1));
    return {
      name: fileName || `Attachment ${idx + 1}`,
      url,
      attachmentIndex: idx + 1,
    };
  });
  const hasShippedTo = hasValue(shippedTo.name);
  const hasShippedFrom = hasValue(shippedFrom.name);
  const hasTransport = hasTransportData(transportDetails);
  const contact = {
    email: toStringValue(asRecord(invoice.contact).email),
    phone: toStringValue(asRecord(invoice.contact).phone),
  };
  const hasContactStrip = hasValue(contact.email) || hasValue(contact.phone);
  const showLogistics = hasShippedFrom || hasTransport;
  const singleLogistics =
    (hasShippedFrom && !hasTransport) || (!hasShippedFrom && hasTransport);

  const invoiceAccepted = toStringValue(invoice.invoiceAccepted);
  const billType = toStringValue(invoice.billType);
  const status = toStringValue(invoice.status);
  const isExpenditure = Boolean(invoice.isExpenditure);
  const paymentOptions = asRecord(invoice.paymentOptions);

  const showBankAccount =
    (!isExpenditure || invoiceAccepted === "ACCEPTED") &&
    Boolean(paymentOptions.accountTransfer) &&
    hasValue(bankAccount.accountNo);

  const showUpi =
    (!isExpenditure || invoiceAccepted === "ACCEPTED") &&
    Boolean(paymentOptions.upi) &&
    (hasValue(upi.upi) || hasValue(upi.vpa));

  const showBankUpiSection =
    !["CREDITNOTE", "DEBITNOTE"].includes(billType) &&
    status !== "CANCELED" &&
    (showBankAccount || showUpi);

  const showStatusTagInPrint = billType === "INVOICE" && status === "PAID";


  const model: SagaEngineeringTemplateModel = {
    currencySymbol,
    letterHead: toStringValue(invoice.letterHead),
    letterHeadFooter: toStringValue(invoice.letterHeadFooter),
    invoiceTitle: toStringValue(invoice.invoiceTitle),
    invoiceNumber: toStringValue(invoice.invoiceNumber),
    invoiceDate: toStringValue(invoice.invoiceDate),
    invoiceDateUserInput: toStringValue(invoice.invoiceDateUserInput),
    invoiceSubTitle,
    dueDate: toStringValue(invoice.dueDate),
    purchaseOrderNumber: toStringValue(invoice.purchaseOrderNumber),
    ownerOffset: toStringValue(invoice.ownerOffset),
    customHeaders: asArray(invoice.customHeaders).map(toLabelValuePair),
    customLabels,
    irn,
    pdfOptions,
    advanceOptions,
    billedBy,
    billedTo,
    shippedTo,
    shippedFrom,
    transportDetails,
    items,
    totals,
    balance,
    invoiceDetails,
    bankAccount,
    upi,
    terms,
    notes: hasValue(invoice.notes) ? toStringValue(invoice.notes) : "",
    allPayments,
    customFooters,
    attachments,
    signature: toStringValue(invoice.signature),
    hsnSummary: normalizeHsnSummary(invoice.hsnSummary, invoice),
    taxSummary: normalizeTaxSummary(invoice),
    contact,
    status,
    isOverdue: Boolean(invoice.isOverdue),
    mapped: {
      qr: {
        top: topQr,
        upi: upiQr,
      },
      upi: {
        id: upiId,
      },
      columns,
      irn: {
        isCancelled: Boolean(irnCancelDate),
      },
      visibility: {
        shippedTo: hasShippedTo,
        shippedFrom: hasShippedFrom,
        transport: hasTransport,
        showLogistics,
        singleLogistics,
        showBankAccount,
        showUpi,
        showBankUpiSection,
        contactStrip: hasContactStrip,
        showIgst: totals.showIgst,
        showCgstSgst: totals.showCgstSgst,
        isUtgst: Boolean(invoice.utgst),
        showTaxTable:
          ["TABLE", "BOTH"].includes(
            toStringValue(asRecord(invoice.advanceOptions).taxSummaryView)
          ),
        showHsnSummary:
          asArray(asRecord(invoice.hsnSummary).hsnList).length > 0,
        showSummaryCess:
          totals.totalCess > 0 ||
          normalizeTaxSummary(invoice).totalCessAmountValue > 0 ||
          normalizeHsnSummary(invoice.hsnSummary, invoice).totalCessAmountValue >
          0,
        showSku: showSkuInName,
        showHsn: showHsnColumn,
        showThumbnailAsColumn: Boolean(advanceOptions.showThumbnailAsColumn),
        showInlineHsn,
        showInlineClassification,
        showSkuInName,
        showUnitInName,
        upiShrink: Boolean(invoiceTemplate.upiShrink),
        letterHeadOnFirstPage: Boolean(pdfOptions.letterHeadOnFirstPage),
        footerOnLastPage: Boolean(pdfOptions.footerOnLastPage),
        itemNameFullWidth: Boolean(pickFirstValue(asRecord(invoice.advanceOptions).itemNameFullWidth, invoice.showItemNameFullWidth)),
        isDescriptionFullWidth: Boolean(pickFirstValue(asRecord(invoice.advanceOptions).isDescriptionFullWidth, invoice.isDescriptionFullWidth)),
        showStatusTagInPrint,
        visibleColumnCount: columns.filter(c => !c.isHidden).length + 1, // +1 for the serial column
      },
    },
  };

  return model;
};
