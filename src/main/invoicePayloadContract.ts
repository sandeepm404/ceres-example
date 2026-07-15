export interface CeresTemplatePayload {
  invoice: InvoiceData;
  ownerBusiness: BusinessData;
  store?: {
    asideCollapsed: boolean;
  };
  business?: BusinessData;
  payUrl?: string;
  hideEarlyPay?: boolean;
  template?: string;
  showExpenseNumber?: boolean;
  isEarlyPayApplicable?: boolean;
  showItemNameFullWidth?: boolean;
  invoiceValueProps?: Record<string, { visible: boolean }>;
  ownerTimeZone?: string;
  businessTimeZone?: string;
  showBankAccount?: boolean;
  showUpi?: boolean;
  businessLocale?: string;
  businessCurrency?: string;
  isBusinessUser?: boolean;
  hideHashInDocumentNumber?: boolean;
  showPaymentsTable?: boolean;
  isPublicView?: boolean;
  isDescriptionFullWidth?: boolean;
  irnPosition?: "ABOVE_LINEITEMS" | "BELOW_LINEITEMS" | string;
  showStockSummary?: boolean;
  showVendorBankAccount?: boolean;
  defaultBatchColumns?: Array<{
    key: string;
    label: string;
    system?: boolean;
    isHidden?: boolean;
  }>;
  query?: Record<string, string>;
  copy?: string;
  ewayConfig?: EwayConfig;
  einvoiceConfig?: EinvoiceConfig;
}

export interface InvoicePdfOptions {
  letterHeadOnFirstPage?: boolean;
  footerOnLastPage?: boolean;
  [key: string]: unknown;
}

export interface InvoiceTemplateConfig {
  parentTemplate?: string;
  template?: string;
  upiShrink?: boolean;
  pdfOptions?: InvoicePdfOptions;
  [key: string]: unknown;
}

export interface InvoiceAdvanceOptions {
  hideTaxes?: boolean;
  hideTotals?: boolean;
  hideCurrencyCode?: boolean;
  reverseCharge?: boolean;
  taxSummaryView?: "DETAILED" | "SUMMARY" | string;
  showSkuInInvoice?: boolean;
  showThumbnailAsColumn?: boolean;
  hideGroupSubTotal?: boolean;
  unitColumn?: string;
  hsnView?: string;
  itemNameFullWidth?: boolean;
  isDescriptionFullWidth?: boolean;
  hideCountryOfSupply?: boolean;
  showHSNSummaryInInvoice?: boolean;
  // The Lydia live-update bridge emits this alias instead of showHSNSummaryInInvoice;
  // declared so bridge deltas stay within the contract until the host sends the
  // canonical key.
  showHsnSummary?: boolean;
  showStockSummary?: boolean;
  showPaymentsTable?: boolean;
  [key: string]: unknown;
}

export interface InvoicePaymentOptions {
  accountTransfer?: boolean;
  upi?: boolean;
  vendorAccountTransfer?: boolean;
  [key: string]: unknown;
}

export interface InvoiceData {
  _id: string;
  billType: string;
  isExpenditure?: boolean;
  status: "DRAFT" | "UNPAID" | "PAID" | "PARTIAL" | "CANCELED" | string;
  isRemoved?: boolean;
  isOverdue?: boolean;
  invoiceNumber: string;
  expenseNumber?: string;
  purchaseOrderNumber?: string;
  quotationNumber?: string;
  dueDate?: string | Date;
  invoiceDate?: string | Date;
  invoiceTitle?: string;
  invoiceSubTitle?: string;
  currency: string;
  subUnitLength?: number;
  customCurrencySymbol?: string;
  billedBy?: BillerDetails;
  billedTo?: BillerDetails;
  shippedFrom?: BillerDetails;
  shippedTo?: BillerDetails;
  items?: LineItem[];
  taxSummary?: TaxSummary | TaxSummary[];
  hsnSummary?: HsnSummary | HsnSummary[];
  additionalCharges?: AdditionalCharge[];
  cesses?: CessCharge[];
  latePaymentFee?: {
    enabled?: boolean;
    showInInvoice?: boolean;
    isApplied?: boolean;
    when?: number;
    finalAmount?: number;
  };
  allPayments?: Payment[];
  payments?: Payment[];
  columns?: ColumnDef[];
  subTotal: number;
  discount?: number;
  toPay?: number | { full: number; [key: string]: any };
  finalTotal: Record<string, any>;
  totals?: Record<string, any>;
  balance?: {
    paid?: number | string;
    due?: number | string;
    transactionCharge?: number | string;
    settledAmount?: number | string;
    tds?: number | string;
    credit?: number | string;
    [key: string]: any;
  };
  taxType?: string;
  taxName?: string;
  isIgst?: boolean;
  isUtgst?: boolean;
  igst?: number;
  cgst?: number;
  sgst?: number;
  utgst?: number;
  irn?: IrnDetails;
  notes?: string;
  terms?: Array<{ label: string; terms: string[] }>;
  attachments?: string[];
  footers?: Array<{ _id: string; label: string; value: string }>;
  customFields?: CustomFieldValue[];
  customHeaders?: Array<{ label: string; value: string; [key: string]: any }>;
  customFooters?: Array<{
    label: string;
    value: string;
    defaultValue?: string;
    [key: string]: any;
  }>;
  customLabels?: Record<string, string>;
  contact?: { email?: string; phone?: string; [key: string]: any };
  owner?: BusinessData;
  invoiceAccepted?: string;
  roundOffQuantity?: boolean;
  roundOffRate?: boolean;
  showTotalsRow?: boolean;
  templateName?: string;
  transportDetails?: TransportDetails;
  bankAccount?: BankDetails;
  upi?: UpiDetails;
  signature?: string;
  advanceOptions?: InvoiceAdvanceOptions;
  paymentOptions?: InvoicePaymentOptions;
  reminders?: { sent?: boolean; [key: string]: any };
  creditNoteStatus?: string;
  linkedInvoices?: Array<any>;
  documentReason?: string;
  placeOfSupply?: string;
  pos?: string;
  invoiceType?: string;
  invoiceDateUserInput?: string;
  ownerOffset?: string;
  letterHead?: string;
  letterHeadFooter?: string;
  showBranding?: boolean;
  template?: InvoiceTemplateConfig;
  pdfOptions?: InvoicePdfOptions;
  zatcaQrCode?: string;
  lhdnQrCode?: string;
  documentQr?: string;
  // IRN QR data URL at the invoice root. Never part of the fetched payload — the Lydia
  // host overlays it at runtime, so templates must treat it as optional.
  qrCode?: string;
  sharedDocumentId?: string;
  share?: {
    link?: string;
    name?: string;
    fileName?: string;
    pdf?: string;
    printLabels?: Array<{ label: string; pdf: string }>;
  };
  // Document-level stock summary; the API includes it only for batch-tracked documents
  // with advanceOptions.showStockSummary enabled.
  batchSummary?: DocumentBatchSummaryEntry[];
  creditDiscount?: number;
  beforeDiscountPay?: number | { full: number; [key: string]: any };
  earlyPayDiscount?: {
    enabled?: boolean;
    applied?: boolean;
    totals?: Record<string, any>;
    [key: string]: any;
  };
  vendorFields?: Record<string, any>;
  hasPgPayments?: boolean;
  totalConversions?: Record<string, any>;
  lastPaymentDate?: string | Date;
}

export interface DocumentBatchSummaryEntry {
  inventory?: string;
  itemName?: string;
  sku?: string;
  batch?: Record<string, any>;
  warehouse?: string;
  warehouseName?: string;
  quantity?: number;
  [key: string]: any;
}

export interface BusinessData {
  _id: string;
  name?: string;
  country?: string;
  configuration?: {
    units?: any;
    einvoice?: any;
    eway?: any;
    indexedCustomFields?: any;
    [key: string]: any;
  };
  _systemMeta?: {
    indexedFieldsEnabled?: boolean;
    showExtraIndexedField?: boolean;
    [key: string]: any;
  };
}

export interface BillerDetails {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  building?: string;
  street?: string;
  city?: string;
  district?: string;
  state?: string;
  stateCode?: string;
  gstState?: string;
  country?: string;
  zipCode?: string;
  pincode?: string;
  gstin?: string;
  panNumber?: string;
  trnNumber?: string;
  tinNumber?: string;
  vatNumber?: string;
  vatLabel?: string;
  sstNumber?: string;
  emailShowInInvoice?: boolean;
  phoneShowInInvoice?: boolean;
  fieldVisibility?: Record<string, boolean>;
  logo?: string;
  additionalIds?: Array<{
    _id?: string;
    label: string;
    value: string;
    showInInvoice?: boolean;
  }>;
  customFields?: Array<{
    label: string;
    value: string;
    params?: { showInInvoice?: boolean; [key: string]: any };
  }>;
  customHeaders?: Array<{ label: string; value: string }>;
}

export interface LineItem {
  _id: string;
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
  subTotal?: number;
  discount?: number;
  hsn?: string;
  images?: string[];
  originalImages?: string[];
  thumbnail?: string;
  igst?: number;
  cgst?: number;
  sgst?: number;
  utgst?: number;
  cessAmount?: number;
  taxAmount?: number;
  gstRate?: number | string;
  taxRate?: number | string;
  tax?: number;
  group?: boolean;
  isGroupItemTotalRow?: boolean;
  isAdditionalCharge?: boolean;
  sku?: string;
  showSku?: boolean;
  unit?: string;
  classification?: string;
  inventoryTxn?: string;
  custom?: Record<string, any>;
  batchSummary?: Array<{
    _id?: string;
    itemName?: string;
    batchName?: string;
    quantity: number;
    manufacturingDate?: string;
    expiryDate?: string;
    warehouse?: string;
    warehouseName?: string;
  }>;
  customFields?: CustomFieldValue[];
}

export interface AdditionalCharge {
  _id: string;
  name?: string;
  label?: string;
  amount: number;
  multiplier?: number;
  amountType?: string;
  tax?: number;
  taxAmount?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  utgst?: number;
  hsn?: string;
}

export interface CessCharge {
  _id: string;
  amount?: number;
  name?: string;
  cessKey?: string;
  cessAmountKey?: string;
  cessName?: string;
  isApplied?: boolean;
}

export interface TaxSummary {
  tax: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  utgst: number;
  cessAmount?: number;
}

export interface HsnSummary extends TaxSummary {
  hsn: string;
}

export interface CustomFieldValue {
  _id?: string;
  label: string;
  name?: string;
  value: any;
  dataType: string;
  params?: {
    showInInvoice?: boolean;
    currency?: string;
    [key: string]: any;
  };
}

export interface IrnDetails {
  Irn?: string;
  AckNo?: string;
  AckDt?: string;
  CancelDate?: string;
  EwbNo?: string;
  EwbDt?: string;
  EwbValidTill?: string;
  ewayCancelDate?: string;
  qrCode?: string;
}

export interface EinvoiceConfig {
  irnNumber?: boolean;
  irnAcknowledgementNumber?: boolean;
  irnAcknowledgementDate?: boolean;
  irnCancelledDate?: boolean;
}

export interface EwayConfig {
  billNumber?: boolean;
  billDate?: boolean;
  billValidTillDate?: boolean;
  billCancelledDate?: boolean;
}

export interface TransportDetails {
  transport?: string;
  transportMode?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  challanNumber?: string;
  challanDate?: string;
  distance?: number | string;
  transactionType?: string;
  subSupplyType?: string;
  extraInformation?: string;
  transporterId?: string;
  transporterName?: string;
  transporter?: {
    name?: string;
    transporterId?: string;
  };
}

export interface BankDetails {
  name?: string;
  accountHolderName?: string;
  accountNo?: string;
  accountNumber?: string;
  ifsc?: string;
  ifscCode?: string;
  iban?: string;
  swift?: string;
  swiftCode?: string;
  accountType?: string;
  bank?: string;
  bankName?: string;
  sortCode?: string;
  branch?: string;
  country?: string;
  customLabels?: Record<string, string>;
  customFields?: CustomFieldValue[];
}

export interface UpiDetails {
  upiId?: string;
  upi?: string;
  vpa?: string;
  qrCode?: string;
  qr?: string;
}

export interface Payment {
  paymentDate?: string;
  date?: string;
  createdAt?: string;
  paymentMethod?: string;
  mode?: string;
  method?: string;
  amount?: number | string;
  status?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  dataType?: string;
  fxReturnType?: string;
  summarise?: boolean;
  isHidden?: boolean;
}

export interface FlattenedInvoicePayload extends InvoiceData {
  business?: BusinessData;
  ownerBusiness?: BusinessData;
  store?: CeresTemplatePayload["store"];
  payUrl?: string;
  hideEarlyPay?: boolean;
  showExpenseNumber?: boolean;
  isEarlyPayApplicable?: boolean;
  showItemNameFullWidth?: boolean;
  invoiceValueProps?: CeresTemplatePayload["invoiceValueProps"];
  ownerTimeZone?: string;
  businessTimeZone?: string;
  showBankAccount?: boolean;
  showUpi?: boolean;
  businessLocale?: string;
  businessCurrency?: string;
  isBusinessUser?: boolean;
  hideHashInDocumentNumber?: boolean;
  showPaymentsTable?: boolean;
  isPublicView?: boolean;
  isDescriptionFullWidth?: boolean;
  irnPosition?: CeresTemplatePayload["irnPosition"];
  showStockSummary?: boolean;
  showVendorBankAccount?: boolean;
  defaultBatchColumns?: CeresTemplatePayload["defaultBatchColumns"];
  query?: Record<string, string>;
  copy?: string;
  ewayConfig?: EwayConfig;
  einvoiceConfig?: EinvoiceConfig;
}

export type InvoicePayloadInput =
  | CeresTemplatePayload
  | FlattenedInvoicePayload;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
};

export const isWrappedInvoicePayload = (
  payload: InvoicePayloadInput
): payload is CeresTemplatePayload => {
  return isRecord(payload) && isRecord(payload.invoice);
};

const normalizeTemplateConfig = (
  templateName: CeresTemplatePayload["template"]
): InvoiceTemplateConfig | undefined => {
  if (typeof templateName !== "string") {
    return undefined;
  }

  const normalizedTemplateName = templateName.trim();
  if (!normalizedTemplateName) {
    return undefined;
  }

  return {
    template: normalizedTemplateName,
    parentTemplate: normalizedTemplateName,
  };
};

export const normalizeInvoicePayload = (
  payload: InvoicePayloadInput
): FlattenedInvoicePayload => {
  if (!isWrappedInvoicePayload(payload)) {
    return payload;
  }

  return {
    ...payload.invoice,
    business: payload.business,
    ownerBusiness: payload.ownerBusiness,
    store: payload.store,
    payUrl: payload.payUrl,
    hideEarlyPay: payload.hideEarlyPay,
    showExpenseNumber: payload.showExpenseNumber,
    isEarlyPayApplicable: payload.isEarlyPayApplicable,
    showItemNameFullWidth: payload.showItemNameFullWidth,
    invoiceValueProps: payload.invoiceValueProps,
    ownerTimeZone: payload.ownerTimeZone,
    businessTimeZone: payload.businessTimeZone,
    showBankAccount: payload.showBankAccount,
    showUpi: payload.showUpi,
    businessLocale: payload.businessLocale,
    businessCurrency: payload.businessCurrency,
    isBusinessUser: payload.isBusinessUser,
    hideHashInDocumentNumber: payload.hideHashInDocumentNumber,
    showPaymentsTable: payload.showPaymentsTable,
    isPublicView: payload.isPublicView,
    isDescriptionFullWidth: payload.isDescriptionFullWidth,
    irnPosition: payload.irnPosition,
    showStockSummary: payload.showStockSummary,
    showVendorBankAccount: payload.showVendorBankAccount,
    defaultBatchColumns: payload.defaultBatchColumns,
    query: payload.query,
    copy: payload.copy,
    ewayConfig: payload.ewayConfig,
    einvoiceConfig: payload.einvoiceConfig,
    template:
      payload.invoice.template ?? normalizeTemplateConfig(payload.template),
  };
};
