// Handlebars helpers for the statement-vat-tax-invoices-two-ahez template: a
// bilingual English + Arabic VAT tax invoice.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = {
  key: string;
  label: string;
  arLabel: string;
  value: string;
  arValue: string;
};

const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const asText = (value: any): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
};

// ─── Fixed label set ──────────────────────────────────────────────────────
// Labels with no editable source in the payload, per language. The template
// never types these strings into its markup; it asks for them by key
// (`fixedLabel "seller"`). Only Arabic is filled; another language is a new
// entry here, picked by `lang`. Kept self-contained (no imports, plain data) so
// it can move to src/widgets/shared unchanged and be shared by every
// bilingual template.
export const FIXED_LABELS: Record<string, Record<string, string>> = {
  ar: {
    taxInvoice: "فاتورة ضريبية",
    invoiceNumber: "رقم الفاتورة",
    invoiceDate: "تاريخ الفاتورة",
    dueDate: "تاريخ الاستحقاق",
    purchaseOrderNumber: "رقم أمر الشراء",
    seller: "البائع",
    buyer: "المشتري",
    shippedFrom: "الشحن من",
    shippedTo: "الشحن إلى",
    building: "رقم المبنى",
    street: "اسم الشارع",
    district: "الحي",
    city: "المدينة",
    state: "المنطقة",
    country: "البلد",
    postalCode: "الرمز البريدي",
    vatNumber: "رقم ضريبة القيمة المضافة",
    gstin: "الرقم الضريبي",
    pan: "رقم الحساب الدائم",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    contactPerson: "الشخص المسؤول",
    transportDetails: "تفاصيل النقل",
    transport: "الناقل",
    transporterId: "معرف الناقل",
    challanNumber: "رقم إذن التسليم",
    challanDate: "تاريخ إذن التسليم",
    transportMode: "وسيلة النقل",
    vehicleNumber: "رقم المركبة",
    vehicleType: "نوع المركبة",
    distance: "المسافة",
    extraInformation: "معلومات إضافية",
    ewayBillDetails: "تفاصيل بوليصة الشحن",
    ewayBillNumber: "رقم بوليصة الشحن",
    ewayBillDate: "تاريخ بوليصة الشحن",
    ewayBillValidTill: "صالحة حتى",
    bankDetails: "تفاصيل البنك",
    bankName: "اسم البنك",
    accountHolderName: "اسم صاحب الحساب",
    accountNumber: "رقم الحساب",
    iban: "رقم الآيبان",
    swiftCode: "رمز السويفت",
    ifsc: "رمز IFSC",
    sortCode: "رمز الفرز",
    accountType: "نوع الحساب",
    upi: "UPI",
    terms: "الشروط والأحكام",
    notes: "ملاحظات إضافية",
    attachments: "المرفقات",
    subTotal: "المجموع الفرعي",
    discount: "الخصم",
    earlyPayDiscount: "خصم الدفع المبكر",
    amount: "المبلغ الخاضع للضريبة",
    vat: "ضريبة القيمة المضافة",
    cgst: "CGST",
    sgst: "SGST",
    cess: "ضريبة إضافية",
    latePaymentFee: "رسوم التأخير في السداد",
    total: "الإجمالي",
    totalInWords: "إجمالي الفاتورة بالأحرف",
    creditApplied: "الرصيد المطبق",
    creditUsed: "الرصيد المستخدم",
    refund: "المبلغ المسترد",
    availableCredits: "الرصيد المتاح",
    taxUnderRCM: "الضريبة وفق الاحتساب العكسي",
    tdsAmountWithheld: "المبلغ المستقطع",
    amountPaid: "المبلغ المدفوع",
    amountReceived: "المبلغ المستلم",
    transactionCharge: "رسوم المعاملة",
    settledAmount: "المبلغ المسوى",
    dueAmount: "المبلغ المستحق",
    forBusiness: "عن",
    signature: "المفوض بالتوقيع",
    createdBy: "تم الإنشاء من قبل",
  },
};

export const fixedLabel = (key: any, lang: any = "ar"): string => {
  const set = FIXED_LABELS[asText(lang)] ?? FIXED_LABELS.ar;
  return set[asText(key)] ?? "";
};

// ─── Document direction, script and font ──────────────────────────────────
// The same sources sami-contracting reads: Lydia's RTL toggle on the document,
// and the script and font the business picked for its PDFs.

export const documentDir = (invoice: any): "rtl" | "ltr" =>
  invoice?.template?.rtl === true ? "rtl" : "ltr";

export const documentScript = (invoice: any, pdfOptions: any): string =>
  [
    invoice?.owner?.configuration?.pdfOptions?.script,
    pdfOptions?.script,
    invoice?.owner?.configuration?.script,
  ]
    .map(asText)
    .find(Boolean) ?? "";

export const documentFont = (invoice: any, pdfOptions: any): string =>
  [invoice?.owner?.configuration?.pdfOptions?.fontFamily, pdfOptions?.fontFamily]
    .map(asText)
    .find(Boolean) ?? "";

const SCRIPT_LANG: Record<string, string> = { arabic: "ar", hebrew: "he" };

export const documentLang = (script: any): string =>
  SCRIPT_LANG[asText(script).toLowerCase()] ?? "";

// Google Fonts stylesheet for a family name; anything that is not a plain
// family name loads nothing.
export const googleFontHref = (family: any): string => {
  const name = asText(family);
  if (!/^[A-Za-z0-9 ]+$/.test(name)) return "";
  return `https://fonts.googleapis.com/css2?family=${name.replace(
    / /g,
    "+"
  )}:wght@400;500;600;700&display=swap`;
};

// ─── Rows ─────────────────────────────────────────────────────────────────
// Every detail row has four cells: the English label, the value, the value's
// Arabic-side copy and the fixed Arabic label. The payload carries one value
// per field, so the Arabic side repeats it only when it reads the same in both
// languages (numbers, codes, dates as digits); a worded value has no Arabic
// version to print, and that side stays empty.

const LETTERS = /\p{L}/u;

export const isLanguageNeutral = (value: any): boolean => {
  const text = asText(value);
  return Boolean(text) && !LETTERS.test(text.replace(/^[A-Z]{2,4}\d/u, "0"));
};

const sideValue = (value: string): string =>
  isLanguageNeutral(value) ? value : "";

const row = (
  key: string,
  label: string,
  fixedKey: string,
  value: any
): Row | null => {
  const text = asText(value);
  if (!text) return null;
  return {
    key,
    label,
    arLabel: fixedKey ? fixedLabel(fixedKey) : "",
    value: text,
    arValue: sideValue(text) || arabicEquivalent(key, text),
  };
};

const compact = (rows: Array<Row | null>): Row[] =>
  rows.filter((entry): entry is Row => entry !== null);

// A party's own labelled extras: custom fields, additional ids and party
// headers, as the account labelled them. `showInInvoice` is opt-out.
export const partyExtras = (party: any): Row[] => {
  const rows: Array<Row | null> = [];
  const add = (label: any, value: any, hidden: boolean) => {
    if (!hidden) rows.push(row("extra", asText(label), "", value));
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
  return compact(rows);
};

// Address and identity rows for one party, in the design's order. Empty fields
// drop out. `fieldVisibility` and the email/phone flags are opt-out.
export const partyRows = (party: any, customLabels: any): Row[] => {
  if (!party || typeof party !== "object") return [];
  const visibility = party.fieldVisibility ?? {};
  const rows = compact([
    row("building", "Building No.", "building", party.building),
    row("street", "Street Name", "street", party.street),
    row("district", "District", "district", party.district),
    row("city", "City", "city", party.city),
    row("state", "State", "state", party.state),
    row("country", "Country", "country", party.country),
    row(
      "postalCode",
      "Postal Code",
      "postalCode",
      party.pincode || party.zipCode
    ),
    row("vatNumber", asText(party.vatLabel), "vatNumber", party.vatNumber),
    visibility.gst === false
      ? null
      : row("gstin", "GSTIN", "gstin", party.gstin),
    visibility.pan === false
      ? null
      : row("pan", "PAN", "pan", party.panNumber),
    party.emailShowInInvoice === false
      ? null
      : row("email", asText(customLabels?.email), "email", party.email),
    party.phoneShowInInvoice === false
      ? null
      : row("phone", asText(customLabels?.phone), "phone", party.phone),
    row(
      "contactPerson",
      asText(customLabels?.contactPersonLabel),
      "contactPerson",
      party.contactPerson?.name
    ),
  ]);
  return [...rows, ...partyExtras(party)];
};

// Bank rows in the platform's order. Values come in two shapes (the
// contract's `bankName`/`accountHolderName` and the `bank`/`name` real
// payloads send), so both are read. The English label is the account's own
// (bank or document custom labels); a row without one prints its value alone.
const BANK_ROWS: Array<{ values: string[]; labels: string[]; fixed: string }> =
  [
    { values: ["bank", "bankName"], labels: ["bankName", "bank"], fixed: "bankName" },
    {
      values: ["name", "accountHolderName"],
      labels: ["accountHolderName"],
      fixed: "accountHolderName",
    },
    {
      values: ["accountNo", "accountNumber"],
      labels: ["accountNumber", "accountNo"],
      fixed: "accountNumber",
    },
    { values: ["iban"], labels: ["iban"], fixed: "iban" },
    { values: ["swift", "swiftCode"], labels: ["swiftCode", "swift"], fixed: "swiftCode" },
    { values: ["ifsc", "ifscCode"], labels: ["ifsc", "ifscCode"], fixed: "ifsc" },
    { values: ["sortCode"], labels: ["sortCode"], fixed: "sortCode" },
    { values: ["accountType"], labels: ["accountType"], fixed: "accountType" },
  ];

export const bankRows = (invoice: any): Row[] => {
  const account = invoice?.bankAccount;
  if (!account || typeof account !== "object") return [];
  const labelSources = [account.customLabels, invoice?.customLabels];
  const labelFor = (keys: string[]): string =>
    keys
      .flatMap((key) => labelSources.map((source) => asText(source?.[key])))
      .find(Boolean) ?? "";

  const rows: Array<Row | null> = BANK_ROWS.map((entry) =>
    row(
      entry.fixed,
      labelFor(entry.labels),
      entry.fixed,
      entry.values.map((key) => asText(account[key])).find(Boolean)
    )
  );
  asArray(account.customFields).forEach((field) => {
    if (field?.params?.showInInvoice !== false && asText(field?.label)) {
      rows.push(row("extra", asText(field.label), "", field?.value));
    }
  });
  return compact(rows);
};

// The English heading of the bank block: the account's own label, else the
// document's.
export const bankHeading = (invoice: any): string =>
  asText(invoice?.bankAccount?.customLabels?.bankDetails) ||
  asText(invoice?.customLabels?.bankDetails);

// ─── Totals ───────────────────────────────────────────────────────────────
// The Arabic label beside a totals row from the shared Subtotal model, by the
// row's key. A rate the English label carries in trailing parentheses
// is carried over, wrapped so it stays left to right inside Arabic text.

const TOTALS_KEYS: Record<string, string> = {
  subTotal: "subTotal",
  discount: "discount",
  earlyPayDiscount: "earlyPayDiscount",
  amount: "amount",
  igst: "vat",
  cgst: "cgst",
  sgst: "sgst",
  utgst: "sgst",
  cess: "cess",
  cessRate: "cess",
  latePaymentFee: "latePaymentFee",
  total: "total",
  creditApplied: "creditApplied",
  creditUsed: "creditUsed",
  refund: "refund",
  availableCredits: "availableCredits",
  rcmSales: "taxUnderRCM",
  rcmExpenditure: "taxUnderRCM",
  tds: "tdsAmountWithheld",
  amountPaid: "amountPaid",
  amountReceived: "amountReceived",
  transactionCharge: "transactionCharge",
  settledAmount: "settledAmount",
  dueAmount: "dueAmount",
};

export const totalsFixedLabel = (key: any): string => {
  const base = asText(key).split(":")[0];
  return TOTALS_KEYS[base] ? fixedLabel(TOTALS_KEYS[base]) : "";
};

export const labelRate = (label: any): string => {
  const match = /\(([^()]*\d[^()]*)\)\s*$/u.exec(asText(label));
  return match ? match[1] : "";
};

// ─── Items ────────────────────────────────────────────────────────────────
// With "show description in full width" off, an item's description prints in
// its item cell, under the name, rather than in the row the shared line-items
// model spans across every column. That row then carries only what is left
// (images, serials) and drops away when nothing is.
export const descriptionInItem = (extras: any): boolean =>
  Boolean(extras?.hasDescription) && !extras?.descriptionFullWidth;

export const extrasRow = (extras: any): boolean =>
  Boolean(
    (extras?.hasDescription && extras?.descriptionFullWidth) ||
      extras?.imagesInline ||
      extras?.imagesRow ||
      extras?.hasOriginalImages ||
      extras?.hasSerials
  );

// ─── Arabic equivalents of coded values ───────────────────────────────────
// Free text (names, streets, items) has no Arabic source in the payload, but a
// two-letter country code has one exact Arabic name, which the platform's own
// region names supply (Intl.DisplayNames). Anything else keeps its Arabic side
// empty rather than guessing.
export const arabicEquivalent = (key: any, value: any): string => {
  const text = asText(value);
  if (key !== "country" || !/^[A-Za-z]{2}$/.test(text)) return "";
  try {
    const code = text.toUpperCase();
    const name = new Intl.DisplayNames(["ar"], { type: "region" }).of(code);
    return name && name !== code ? name : "";
  } catch {
    return "";
  }
};

// ─── Total in words, in Arabic ────────────────────────────────────────────
// Spelled from finalTotal.total, like the English words the shared Subtotal
// model computes; the English line keeps the user's own override.

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

// [one, two, three-to-ten, eleven and above]
const SCALES: Array<[string, string, string, string]> = [
  ["", "", "", ""],
  ["ألف", "ألفان", "آلاف", "ألفاً"],
  ["مليون", "مليونان", "ملايين", "مليوناً"],
  ["مليار", "ملياران", "مليارات", "ملياراً"],
  ["تريليون", "تريليونان", "تريليونات", "تريليوناً"],
];

const belowThousand = (n: number): string => {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest >= 20) {
    const one = rest % 10;
    parts.push(
      one ? `${ONES[one]} و${TENS[Math.floor(rest / 10)]}` : TENS[rest / 10]
    );
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]);
  } else if (rest) {
    parts.push(ONES[rest]);
  }
  return parts.join(" و");
};

export const arabicNumberWords = (value: number): string => {
  let n = Math.floor(Math.abs(value));
  if (!n) return "صفر";
  const groups: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const group = n % 1000;
    if (group) {
      const [one, two, few, many] = SCALES[scale];
      let words: string;
      if (!scale) words = belowThousand(group);
      else if (group === 1) words = one;
      else if (group === 2) words = two;
      else if (group <= 10) words = `${belowThousand(group)} ${few}`;
      else words = `${belowThousand(group)} ${many}`;
      groups.unshift(words);
    }
    n = Math.floor(n / 1000);
    scale += 1;
  }
  return groups.join(" و");
};

const CURRENCY_AR: Record<string, [string, string]> = {
  SAR: ["ريال سعودي", "هللة"],
  AED: ["درهم إماراتي", "فلس"],
  KWD: ["دينار كويتي", "فلس"],
  BHD: ["دينار بحريني", "فلس"],
  OMR: ["ريال عماني", "بيسة"],
  QAR: ["ريال قطري", "درهم"],
  JOD: ["دينار أردني", "فلس"],
  EGP: ["جنيه مصري", "قرش"],
  USD: ["دولار أمريكي", "سنت"],
  EUR: ["يورو", "سنت"],
  GBP: ["جنيه إسترليني", "بنس"],
  INR: ["روبية هندية", "بيسة"],
};

export const arabicAmountInWords = (invoice: any): string => {
  const total = Number(invoice?.finalTotal?.total);
  if (!Number.isFinite(total)) return "";
  const decimals = Number.isInteger(invoice?.subUnitLength)
    ? Math.min(Math.max(invoice.subUnitLength, 0), 3)
    : 2;
  const factor = 10 ** decimals;
  const scaled = Math.round(Math.abs(total) * factor);
  const whole = Math.floor(scaled / factor);
  const fraction = scaled % factor;
  const code = asText(invoice?.currency).toUpperCase();
  const [unit, subUnit] = CURRENCY_AR[code] ?? [code, ""];
  let words = `${arabicNumberWords(whole)}${unit ? ` ${unit}` : ""}`;
  if (fraction) {
    words += ` و${arabicNumberWords(fraction)}${subUnit ? ` ${subUnit}` : ""}`;
  }
  return `${words} فقط`;
};

// ─── Misc ─────────────────────────────────────────────────────────────────

export const attachmentName = (url: any): string => {
  const path = asText(url).split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

// Any value in the list present: the gate for a card built from several
// optional fields.
export const anyOf = (...args: any[]): boolean =>
  args.slice(0, -1).some((value) => Boolean(asText(value)));

/**
 * Registers this template's helpers on the given Handlebars instance.
 * @param HB the Handlebars instance
 */
export function registerStatementVatTaxInvoicesTwoAhezHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  // Handlebars passes its options hash as the last argument; drop it.
  HB.registerHelper("or", (...args: any[]) => args.slice(0, -1).some(Boolean));
  HB.registerHelper("anyOf", anyOf);
  HB.registerHelper("fixedLabel", (key: any) => fixedLabel(key));
  HB.registerHelper("documentDir", documentDir);
  HB.registerHelper("documentScript", documentScript);
  HB.registerHelper("documentFont", documentFont);
  HB.registerHelper("documentLang", documentLang);
  HB.registerHelper("googleFontHref", googleFontHref);
  HB.registerHelper("partyRows", partyRows);
  HB.registerHelper("bankRows", bankRows);
  HB.registerHelper("bankHeading", bankHeading);
  HB.registerHelper("totalsFixedLabel", totalsFixedLabel);
  HB.registerHelper("labelRate", labelRate);
  HB.registerHelper("sideValue", (value: any) => sideValue(asText(value)));
  HB.registerHelper("attachmentName", attachmentName);
  HB.registerHelper("descriptionInItem", descriptionInItem);
  HB.registerHelper("extrasRow", extrasRow);
  HB.registerHelper("arabicAmountInWords", arabicAmountInWords);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
