import {
  normalizeInvoicePayload,
} from "./invoicePayloadContract";
import type {
  FlattenedInvoicePayload,
  InvoicePayloadInput,
} from "./invoicePayloadContract";

type UnknownRecord = Record<string, unknown>;

export interface InvoiceTemplateColumn {
  key: string;
  label: string;
  className: string;
  isHidden: boolean;
  dataType: string;
  fxReturnType: string;
  summarise: boolean;
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
  showStatusTagInPrint: boolean;
  visibleColumnCount: number;
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
  irn: {
    isCancelled: boolean;
  };
  visibility: InvoiceTemplateVisibility;
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
  return normalized.length > 0 ? normalized : null;
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

  return getNestedSummaryEntries(record[listKey], listKey).reduce<number>(
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

  const recordSum = (Object.values(cessTotalRecord) as unknown[]).reduce<number>(
    (sum, value) => sum + toNumberValue(value, 0),
    0
  );

  if (recordSum > 0) {
    return recordSum;
  }

  return toNumberValue(
    pickFirstValue(totals.totalCess, totals.cess, finalTotal.totalCess, finalTotal.cess),
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
  const showUnitInName =
    toStringValue(advanceOptions.unitColumn, "MERGE_QUANTITY") === "MERGE_NAME";

  return {
    invoiceTemplate,
    pdfOptions,
    advanceOptions,
    isTaxInvoice,
    igstTax,
    discountEnabled,
    taxType,
    showHsnColumn,
    showClassificationColumn,
    showInlineHsn,
    showInlineClassification,
    showSkuInName,
    showUnitInName,
  };
};

const normalizeInvoiceColumns = (
  invoice: FlattenedInvoicePayload,
  context: ReturnType<typeof getTemplateLayoutContext>
): InvoiceTemplateColumn[] => {
  return asArray(invoice.columns)
    .map((entry) => asRecord(entry))
    .map((column) => {
      const key = toStringValue(column.key);
      const dataType = toStringValue(column.dataType);
      const fxReturnType = toStringValue(column.fxReturnType);

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
        visible =
          context.isTaxInvoice &&
          !context.igstTax &&
          context.taxType === "INDIA";
      } else if (key === "igst") {
        visible =
          context.isTaxInvoice &&
          (context.igstTax || context.taxType === "GLOBAL");
      } else if (key === "total") {
        visible = context.isTaxInvoice;
      }

      return {
        key,
        label:
          key === "sgst" && Boolean(invoice.utgst)
            ? "UTGST"
            : toStringValue(column.label),
        className: getColumnClass(key),
        isHidden: Boolean(column.isHidden) || !visible,
        dataType,
        fxReturnType,
        summarise: Boolean(column.summarise),
      };
    });
};

export const normalizeInvoiceTemplateState = (
  payload: InvoicePayloadInput
): NormalizedInvoiceTemplateState => {
  const invoice = normalizeInvoicePayload(payload);
  const context = getTemplateLayoutContext(invoice);
  const columns = normalizeInvoiceColumns(invoice, context);
  const irn = asRecord(invoice.irn);
  const upi = asRecord(invoice.upi);
  const irnCancelDate = toNonEmptyString(irn.CancelDate);
  const irnQr = toNonEmptyString(irn.qrCode);
  const topQr =
    (irnQr && !irnCancelDate ? irnQr : null) ??
    toNonEmptyString(invoice.zatcaQrCode) ??
    toNonEmptyString(invoice.lhdnQrCode) ??
    toNonEmptyString(invoice.documentQr) ??
    "";

  const upiId =
    toNonEmptyString(pickFirstValue(upi.upi, upi.vpa, upi.upiId)) ?? "";
  const upiQr =
    toNonEmptyString(pickFirstValue(upi.qr, upi.qrCode)) ??
    (upiId ? buildUpiPayload(upiId) : "");

  const billType = toStringValue(invoice.billType);
  const status = toStringValue(invoice.status);
  const isExpenditure = Boolean(invoice.isExpenditure);
  const invoiceAccepted = toStringValue(invoice.invoiceAccepted);
  const paymentOptions = asRecord(invoice.paymentOptions);
  const bankAccount = asRecord(invoice.bankAccount);
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
  const showTaxTable = ["TABLE", "BOTH"].includes(
    toStringValue(context.advanceOptions.taxSummaryView)
  );
  const showHsnSummary = getNestedSummaryEntries(invoice.hsnSummary, "hsnList").length > 0;
  const showSummaryCess =
    asArray(invoice.cesses).some((entry) => Boolean(asRecord(entry).isApplied)) &&
    (
      getInvoiceCessTotal(invoice) > 0 ||
      getSummaryCessAmount(invoice.taxSummary, "taxList") > 0 ||
      getSummaryCessAmount(invoice.hsnSummary, "hsnList") > 0
    );
  const showIgst =
    Boolean(invoice.igst) || toStringValue(invoice.taxName) !== "GST";
  const showCgstSgst = !showIgst && toStringValue(invoice.taxName) === "GST";
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
      irn: {
        isCancelled: Boolean(irnCancelDate),
      },
      visibility: {
        shippedTo,
        shippedFrom,
        transport,
        showLogistics: shippedFrom || transport,
        singleLogistics: (shippedFrom && !transport) || (!shippedFrom && transport),
        showBankAccount,
        showUpi,
        showBankUpiSection:
          !["CREDITNOTE", "DEBITNOTE"].includes(billType) &&
          status !== "CANCELED" &&
          (showBankAccount || showUpi),
        contactStrip:
          hasValue(contact.email) || hasValue(contact.phone),
        showIgst,
        showCgstSgst,
        isUtgst: Boolean(invoice.utgst),
        showTaxTable,
        showHsnSummary,
        showSummaryCess,
        showSku: context.showSkuInName,
        showHsn: context.showHsnColumn,
        showThumbnailAsColumn: Boolean(context.advanceOptions.showThumbnailAsColumn),
        showInlineHsn: context.showInlineHsn,
        showInlineClassification: context.showInlineClassification,
        showSkuInName: context.showSkuInName,
        showUnitInName: context.showUnitInName,
        upiShrink: Boolean(asRecord(invoice.template).upiShrink),
        letterHeadOnFirstPage: Boolean(context.pdfOptions.letterHeadOnFirstPage),
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
        visibleColumnCount: columns.filter((column) => !column.isHidden).length + 1,
      },
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
