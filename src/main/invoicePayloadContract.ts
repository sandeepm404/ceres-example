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
  showDescriptionFullWidth?: boolean;
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
  // DEPRECATED here. On refrens.com these three sit at the invoice root, not under
  // advanceOptions — `hideTaxes`/`hideTotals` are destructured straight off the invoice
  // in lydia/src/components/widgets/invoice/balance.js, and `hideCurrencyCode` is not a
  // document field at all (it is BusinessData.configuration.experimental.hideCurrencyCode,
  // written by the "Hide Currency Code in Totals" business setting). Declared here only
  // so a host still sending the old shape stays within the contract; readers must prefer
  // the canonical homes. Remove once no host sends these.
  hideTaxes?: boolean;
  hideTotals?: boolean;
  hideCurrencyCode?: boolean;
  reverseCharge?: boolean;
  // Gates the informational reverse-charge tax row on an RCM document. Denormalised onto
  // the document from the business "Enable RCM Summary View" setting.
  rcmSummaryView?: boolean;
  // "TABLE"/"BOTH" render the tax summary table; "BOTH"/"INVOICE_SUMMARY" switch the
  // totals tax rows to a per-rate breakup. The named members are the values producers
  // actually send; the string fallback stays because the list is host-driven.
  taxSummaryView?:
    | "TABLE"
    | "BOTH"
    | "INVOICE_SUMMARY"
    | "DETAILED"
    | "SUMMARY"
    | string;
  showSkuInInvoice?: boolean;
  showThumbnailAsColumn?: boolean;
  hideGroupSubTotal?: boolean;
  unitColumn?: string;
  hsnView?: string;
  itemNameFullWidth?: boolean;
  isDescriptionFullWidth?: boolean;
  showDescriptionFullWidth?: boolean;
  hideCountryOfSupply?: boolean;
  showHSNSummaryInInvoice?: boolean;
  // The Lydia live-update bridge emits this alias instead of showHSNSummaryInInvoice;
  // declared so bridge deltas stay within the contract until the host sends the
  // canonical key.
  showHsnSummary?: boolean;
  showStockSummary?: boolean;
  showCreatorInInvoice?: boolean;
  showSerialNumbersInDescription?: boolean;
  showBatchColumnsInInvoice?: boolean;
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
  finalTotal: InvoiceTotals;
  totals?: InvoiceTotals;
  balance?: InvoiceBalance;
  // Canonical homes for the totals hide settings — the invoice root, matching
  // refrens.com. The advanceOptions copies above are the deprecated fallback.
  hideTotals?: boolean;
  hideTaxes?: boolean;
  // Multiplier per target currency, used to render the converted amount beside each
  // totals figure on a foreign-currency document: `amount * conversionRates[businessCurrency]`.
  // Distinct from `totalConversions`, which carries already-converted totals and cannot
  // produce a converted subtotal or tax row.
  conversionRates?: Record<string, number>;
  // "EXPWOP" = export without payment of tax. Suppresses a tax row whose figure is also
  // zero, which is the only case where refrens.com drops a tax row on a tax document.
  supplyType?: string;
  taxType?: string;
  taxName?: string;
  // Inter-state sale and union-territory flags. These are the real document fields —
  // lydia writes `igst: !!totalIgst` (src/helpers/getInvoiceDataFromEntry.js), serana
  // projects `igst` (src/lib/app-invoice-response.js), and both balance.js and serana's
  // report class rename them locally (`igst: igstTax`, `utgst: enableUtgst`). They are
  // booleans, not amounts: the tax figures live on `finalTotal`.
  igst?: boolean;
  utgst?: boolean;
  // DEPRECATED. No producer has ever sent these; they were ceres's own invention and
  // reading them meant the inter-state flag was always undefined. Kept as a fallback for
  // a host built against the older contract. Remove once none send them.
  isIgst?: boolean;
  isUtgst?: boolean;
  cgst?: number;
  sgst?: number;
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
  // Extra key/value rows rendered in the totals section.
  extraTotalFields?: Array<{
    label: string;
    value: string;
    key?: string;
    [key: string]: any;
  }>;
  customLabels?: Record<string, string>;
  contact?: { email?: string; phone?: string; [key: string]: any };
  owner?: BusinessData;
  invoiceAccepted?: string;
  roundOffQuantity?: boolean;
  roundOffRate?: boolean;
  showTotalsRow?: boolean;
  hideTotalInWords?: boolean;
  showPaymentsTable?: boolean;
  showDescriptionFullWidth?: boolean;
  templateName?: string;
  transportDetails?: TransportDetails;
  bankAccount?: BankDetails;
  upi?: UpiDetails;
  signature?: string;
  advanceOptions?: InvoiceAdvanceOptions;
  paymentOptions?: InvoicePaymentOptions;
  reminders?: { sent?: boolean; [key: string]: any };
  creditNoteStatus?: string;
  linkedInvoices?: LinkedInvoice[];
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

// Amount buckets are numbers in the API payload, but some hosts (and the Lydia
// live-update bridge) send them as numeric strings, and an unset bucket serialises
// as null. All three are accepted because every reader funnels them through
// toNumberValue, which coerces the lot to a number — the constraint that earns its
// keep is rejecting objects and arrays here, not rejecting null.
type MoneyValue = number | string | null;

export interface InvoiceTotals {
  subTotal?: MoneyValue;
  total?: MoneyValue;
  amount?: MoneyValue;
  discount?: MoneyValue;
  totalDiscount?: MoneyValue;
  cgst?: MoneyValue;
  sgst?: MoneyValue;
  igst?: MoneyValue;
  utgst?: MoneyValue;
  cess?: MoneyValue;
  totalCess?: MoneyValue;
  // Keyed by cess name — a Mongoose Map on the document, so it serialises to a
  // plain object and never to a scalar. The bucket values are read through
  // toNumberValue and are left unconstrained: the document declares the map as
  // `of: Boolean` while producers write numbers into it.
  cessTotal?: Record<string, any>;
  amountRoundOff?: MoneyValue;
  // Both round-off buckets exist in the payload but no refrens.com template renders a
  // round-off row — rounding is already folded into `total`. Kept declared, never rendered.
  totalRoundOff?: MoneyValue;
  // Reverse-charge tax on an RCM document, shown as a separate informational row.
  rcmTax?: MoneyValue;
  // Early-pay discount already applied to this document, shown under the Sub Total.
  earlyDiscount?: MoneyValue;
  // Suffixed onto the Discount row label as "(N%)" when the discount was entered as a rate.
  discountPercentage?: MoneyValue;
  [key: string]: any;
}

export interface InvoiceBalance {
  paid?: MoneyValue;
  due?: MoneyValue;
  transactionCharge?: MoneyValue;
  settledAmount?: MoneyValue;
  tds?: MoneyValue;
  credit?: MoneyValue;
  // Active refund principal on a credit note.
  refund?: MoneyValue;
  [key: string]: any;
}

export interface LinkedInvoice {
  _id?: string;
  billType?: string;
  invoiceNumber?: string;
  invoiceDate?: string | Date;
  finalTotal?: InvoiceTotals;
  [key: string]: any;
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
  // The iframe fetches the document with `populateBusiness: true`, which drops the field
  // projection and populates the whole business onto `owner`. These two are the only place
  // a ceres template can read the business's own currency and locale: the host's
  // `businessCurrency`/`businessLocale` live on CeresTemplatePayload and never reach the
  // iframe, so the converted-amount row would otherwise never render.
  currency?: string;
  locale?: string;
  configuration?: {
    units?: any;
    einvoice?: any;
    eway?: any;
    indexedCustomFields?: any;
    // Business-level experimental toggles. `hideCurrencyCode` is the canonical home of the
    // "Hide Currency Code in Totals" setting — it drops the "(INR)" suffix from the Total
    // row's label and is not a per-document field.
    experimental?: {
      hideCurrencyCode?: boolean;
      [key: string]: unknown;
    };
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
  // Generic tax identifier for non-GST / non-VAT geographies.
  taxId?: string;
  taxPayerType?: string;
  clientType?: string;
  industry?: string;
  // Contact-person block rendered alongside the biller details.
  contactPerson?: {
    contact?: string;
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    department?: string;
    displayFields?: string[];
  };
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
  hidden?: boolean;
  total?: number;
  taxCategory?: {
    label?: string;
    code?: string;
    reason?: { label?: string; code?: string };
  };
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
  cessType?: string;
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
  subSupplyDesc?: string;
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

// Host-level keys of the wrapped payload, minus the two that are resolved rather
// than copied: `invoice` is spread into the root and `template` (a bare name)
// collides with InvoiceData's template config. Derived rather than re-listed so a
// new field on CeresTemplatePayload cannot silently miss the flattened shape.
export type HostPayloadFields = Partial<
  Omit<CeresTemplatePayload, "invoice" | "template">
>;

export interface FlattenedInvoicePayload
  extends InvoiceData,
    HostPayloadFields {}
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
    // A flat payload may still carry the wrapped shape's bare template name. Left
    // as a string it reads back as an empty config, which silently resolves the
    // template to "default" and changes which columns render.
    const flatTemplate: unknown = payload.template;
    if (typeof flatTemplate === "string") {
      return { ...payload, template: normalizeTemplateConfig(flatTemplate) };
    }

    return payload;
  }

  // Rest capture rather than a hand-maintained key list: every host-level field
  // carries over by construction, so adding one to CeresTemplatePayload needs no
  // change here. Host fields are applied last, matching the precedence the explicit
  // assignments had.
  const { invoice, template, ...hostFields } = payload;

  return {
    ...invoice,
    ...hostFields,
    template: invoice.template ?? normalizeTemplateConfig(template),
  };
};
