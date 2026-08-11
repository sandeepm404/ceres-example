import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import "./styles.css";

import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/qr-code";
import "../../widgets/image";
import "../../widgets/tax-summary";
import "../../widgets/hsn-summary";
import "../../widgets/payment-table";
import "../../widgets/invoice-status";
import "../../widgets/refrens-branding";
import "../../widgets/watermark";

import registerFormatCurrencyHelper from "../../widgets/shared/registerFormatCurrencyHelper";
import formatPhoneNumberIntl from "../../widgets/phone-number";
import amountInWords from "../../widgets/shared/amountInWords";

const CORE_COLUMNS = [
  { key: "name", label: "Item" },
  { key: "quantity", label: "Quantity" },
  { key: "rate", label: "Rate" },
  { key: "amount", label: "Amount" },
];

const GST_STATE_CODES: Record<string, string> = {
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
  "22": "Chattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
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

function asText(value: any): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  return "";
}

function asBoolean(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value !== "string") return false;

  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

function asFiniteNumber(value: any): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/,/g, "");
  if (!normalized || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalPlaces(value: any): number | null {
  const parsed = asFiniteNumber(value);
  return parsed !== null &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 20
    ? parsed
    : null;
}

function formatCustomNumber(value: any, invoice: any): string {
  const number = asFiniteNumber(value);
  const precision = decimalPlaces(invoice?.subUnitLength) ?? 2;
  if (number === null) return asText(value);

  const locale = asText(invoice?.locale) || "en-IN";
  try {
    return number.toLocaleString(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  } catch (_) {
    return number.toFixed(precision);
  }
}

function isDecimalCustomColumn(column: any): boolean {
  const declaredType = `${asText(column?.dataType)} ${asText(
    column?.fxReturnType
  )}`.toLowerCase();
  if (/\b(?:number|numeric|decimal|float|double)\b/.test(declaredType)) {
    return true;
  }

  // Some API payloads omit the type metadata for these computed tax columns.
  // Their stable key/label still identifies the decimal fields shown by the
  // platform renderer.
  const identity = `${asText(column?.key)} ${asText(column?.label)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return identity.includes("taxrate") || identity.includes("taxamount");
}

function firstFiniteNumber(...values: any[]): number | null {
  return values.map(asFiniteNumber).find((value) => value !== null) ?? null;
}

function subTotalAmount(invoice: any): number {
  return (
    firstFiniteNumber(invoice?.finalTotal?.subTotal, invoice?.subTotal) ?? 0
  );
}

function discountAmount(invoice: any): number {
  return (
    firstFiniteNumber(
      invoice?.discount,
      invoice?.finalTotal?.discount,
      invoice?.finalTotal?.totalDiscount
    ) ?? 0
  );
}

function formatTaxRate(value: number): string {
  // Tax percentages are displayed to at most two decimal places. Converting
  // the fixed value back to a number removes insignificant zeroes (18.00 -> 18).
  return String(Number(value.toFixed(2)));
}

function formatCountryName(value: any): string {
  const raw = asText(value);
  if (!raw) return "";

  const code = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return raw;

  try {
    const { DisplayNames } = Intl as any;
    return DisplayNames
      ? new DisplayNames(["en"], { type: "region" }).of(code) || raw
      : raw;
  } catch (_) {
    return raw;
  }
}

function formatGstStateName(value: any): string {
  const raw = asText(value);
  if (!raw) return "";

  const code = (raw.match(/^\d+/)?.[0] || "").padStart(2, "0");
  if (GST_STATE_CODES[code]) return GST_STATE_CODES[code];

  const dashIndex = raw.indexOf("-");
  return dashIndex === -1 ? raw : raw.slice(dashIndex + 1).trim();
}

function partyState(party: any): string {
  const gstin = asText(party?.gstin);
  const gstinStateCode = /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : "";
  const state = [
    party?.gstState,
    party?.stateCode,
    gstinStateCode,
    party?.state,
  ]
    .map(asText)
    .find(Boolean);

  return formatGstStateName(state);
}

function partyAddressLines(party: any): string[] {
  if (!party || typeof party !== "object") return [];

  const street = [party.building, party.street, party.address]
    .map(asText)
    .filter(Boolean)
    .join(", ");
  const postal = asText(party.pincode ?? party.zipCode);
  const locality = [
    party.city,
    partyState(party),
    formatCountryName(party.country),
    postal,
  ]
    .map(asText)
    .filter(Boolean)
    .join(", ");

  return [street, locality].filter(Boolean);
}

type TransportRow = {
  key: string;
  label: string;
  value: string;
  isDate?: boolean;
};

function transportRows(invoice: any): TransportRow[] {
  const details = invoice?.transportDetails;
  if (!details || typeof details !== "object") return [];

  const labels =
    invoice?.customLabels && typeof invoice.customLabels === "object"
      ? invoice.customLabels
      : {};
  const transporter =
    details.transporter && typeof details.transporter === "object"
      ? details.transporter
      : {};
  const label = (keys: string[], fallback: string): string =>
    keys.map((key) => asText(labels[key])).find(Boolean) || fallback;
  const rows: TransportRow[] = [];
  const add = (
    key: string,
    labelKeys: string[],
    fallbackLabel: string,
    value: any,
    isDate = false
  ) => {
    const text = asText(value);
    if (!text) return;
    rows.push({
      key,
      label: label(labelKeys, fallbackLabel),
      value: text,
      isDate,
    });
  };

  // Keep each contract field independent so a payload that contains both the
  // carrier name and the legacy `transport` value does not silently lose data.
  add(
    "transportName",
    ["transportName", "transporterName"],
    "Transport Name",
    transporter.name ?? details.transporterName
  );
  add("transport", ["transport"], "Transport", details.transport);
  add(
    "transporterId",
    ["transporterId"],
    "Transporter ID",
    transporter.transporterId ?? details.transporterId
  );
  add(
    "transportMode",
    ["transportMode"],
    "Transport Mode",
    details.transportMode
  );
  add(
    "vehicleNumber",
    ["vehicleNumber", "vehicleNo"],
    "Vehicle No",
    details.vehicleNumber
  );
  add("vehicleType", ["vehicleType"], "Vehicle Type", details.vehicleType);
  add("distance", ["distance"], "Distance", details.distance);
  add(
    "transactionType",
    ["transactionType"],
    "Transaction Type",
    details.transactionType
  );
  add(
    "subSupplyType",
    ["subSupplyType"],
    "Sub Supply Type",
    details.subSupplyType
  );
  add(
    "challanNumber",
    ["challanNumber"],
    "Challan Number",
    details.challanNumber
  );
  add(
    "challanDate",
    ["challanDate"],
    "Challan Date",
    details.challanDate,
    true
  );
  add(
    "extraInformation",
    ["transportExtraInfo", "extraInformation"],
    "Extra Information",
    details.extraInformation
  );

  return rows;
}

function visibleColumns(columns: any): any[] {
  const declared = Array.isArray(columns) ? columns.filter(Boolean) : [];
  if (!declared.length) return CORE_COLUMNS;
  return declared.filter((column: any) => !column.isHidden);
}

function unitLabel(unit: any): string {
  if (typeof unit === "string") return unit.trim();
  if (!unit || typeof unit !== "object") return "";

  return asText(
    unit.symbol ??
      unit.shortName ??
      unit.code ??
      unit.name ??
      unit.label ??
      unit.title
  );
}

function resolveUnit(item: any, invoice: any): string {
  const displayValue = [
    item?.unitName,
    item?.unit_name,
    item?.unitSymbol,
    item?.unit_symbol,
    item?.unitLabel,
    item?.unitDetails,
    item?.unit_details,
  ]
    .map(unitLabel)
    .find(Boolean);
  if (displayValue) return displayValue;

  const rawUnit = item?.unit;
  const rawLabel = unitLabel(rawUnit);
  const unitId = asText(
    typeof rawUnit === "object"
      ? rawUnit?._id ?? rawUnit?.id ?? rawUnit?.unitId ?? rawUnit?.key
      : rawUnit
  );
  const units = invoice?.owner?.configuration?.units;

  if (unitId && units && typeof units === "object") {
    const directMatch = !Array.isArray(units) ? units[unitId] : undefined;
    const arrayMatch = Array.isArray(units)
      ? units.find((unit: any) =>
          [unit?._id, unit?.id, unit?.unitId, unit?.key, unit?.code]
            .map(asText)
            .includes(unitId)
        )
      : undefined;
    const mappedLabel = unitLabel(directMatch ?? arrayMatch);
    if (mappedLabel) return mappedLabel;
  }

  return rawLabel;
}

function splitBankValue(value: any): { primary: string; secondary: string } {
  const text = asText(value);
  // A spaced slash is an authoring delimiter only; it creates the secondary
  // bank column but must not be printed in the invoice. Keep the older
  // two-space delimiter working for existing saved invoices.
  const separator = text.match(/\s+\/\s+|\s{2,}/);

  if (!separator || separator.index === undefined) {
    return { primary: text, secondary: "" };
  }

  return {
    primary: text.slice(0, separator.index).trim(),
    secondary: text.slice(separator.index + separator[0].length).trim(),
  };
}

type CustomFieldRow = {
  label: string;
  value: string;
  key: string;
  name: string;
};

function customFieldRows(fields: any): CustomFieldRow[] {
  return (Array.isArray(fields) ? fields : []).reduce(
    (rows: CustomFieldRow[], field: any) => {
      if (
        field?.params?.showInInvoice === false ||
        field?.showInInvoice === false
      ) {
        return rows;
      }

      const label = asText(field?.label) || asText(field?.name);
      const value = asText(field?.value);
      if (label && value) {
        rows.push({
          label,
          value,
          key: asText(field?.key),
          name: asText(field?.name),
        });
      }
      return rows;
    },
    []
  );
}

function bankDetails(account: any): {
  rows: Array<{ label: string; primary: string; secondary: string }>;
  hasSecondary: boolean;
} {
  const bankAccount = account && typeof account === "object" ? account : {};
  const rows: Array<{ label: string; primary: string; secondary: string }> = [];
  const add = (label: string, value: any, always = false) => {
    const parts = splitBankValue(value);
    if (always || parts.primary || parts.secondary)
      rows.push({ label, ...parts });
  };

  add("Account Name", bankAccount.name ?? bankAccount.accountHolderName);
  add("Account Number", bankAccount.accountNo ?? bankAccount.accountNumber);
  add("IFSC", bankAccount.ifsc);
  add("IBAN", bankAccount.iban);
  add("SWIFT Code", bankAccount.swift);
  add("Account Type", bankAccount.accountType);
  add("Bank", bankAccount.bank ?? bankAccount.bankName);
  customFieldRows(bankAccount.customFields).forEach((field) =>
    add(field.label, field.value)
  );

  return {
    rows,
    hasSecondary: rows.some((row) => Boolean(row.secondary)),
  };
}

function registerSrTradingTemplateHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  HB.registerHelper("not", (value: any) => !value);
  HB.registerHelper("or", (...args: any[]) =>
    args.slice(0, -1).some((value) => Boolean(value))
  );
  HB.registerHelper("increment", (value: number) => Number(value || 0) + 1);
  HB.registerHelper("summaryPayments", (invoice: any) => {
    if (Array.isArray(invoice?.allPayments) && invoice.allPayments.length) {
      return invoice.allPayments;
    }
    return Array.isArray(invoice?.payments) ? invoice.payments : [];
  });
  HB.registerHelper("showTaxSummaryTable", (invoice: any, options: any) => {
    const view = asText(options?.taxSummaryView).toUpperCase();
    const isEnabled = view === "TABLE" || view === "BOTH";
    const hasTaxRows = (
      Array.isArray(invoice?.items) ? invoice.items : []
    ).some((item: any) => Number(item?.gstRate) > 0);

    return isEnabled && hasTaxRows;
  });
  HB.registerHelper("visibleColumns", visibleColumns);
  HB.registerHelper("visibleColumnCount", (columns: any) =>
    Math.max(visibleColumns(columns).length, 1)
  );
  HB.registerHelper(
    "columnLabel",
    (columns: any, key: string, fallback: string) => {
      const match = (Array.isArray(columns) ? columns : []).find(
        (column: any) => column?.key === key
      );
      return asText(match?.label) || fallback;
    }
  );
  HB.registerHelper("subTotalAmount", subTotalAmount);
  HB.registerHelper("discountAmount", discountAmount);

  // The payload has per-item gstRate values, but no dependable invoice-level
  // IGST/CGST/SGST rate. Derive the totals-row rate from the aggregate tax
  // amount and taxable subtotal. This also gives the correct effective rate
  // when an invoice contains items taxed at different rates.
  HB.registerHelper("taxRatePercent", (taxAmount: any, invoice: any) => {
    const amount = asFiniteNumber(taxAmount);
    const subTotal = subTotalAmount(invoice);
    if (amount === null || subTotal === 0) return "";

    return formatTaxRate((amount / subTotal) * 100);
  });

  HB.registerHelper("formatQty", (item: any, options: any) => {
    const quantity = item?.quantity ?? item?.qty;
    if (quantity === undefined || quantity === null) return "";
    const invoice = options?.data?.root?.invoice ?? options?.data?.root;
    const unit = resolveUnit(item, invoice);
    return unit ? `${quantity} (${unit})` : String(quantity);
  });

  HB.registerHelper("formatPhone", (phone: any) => {
    const text = asText(phone);
    return text ? formatPhoneNumberIntl(text) ?? text : "";
  });

  HB.registerHelper("documentLogo", (invoice: any) => {
    const logo = invoice?.logo;
    if (typeof logo === "string") return logo.trim();
    if (!logo || typeof logo !== "object") return "";
    return asText(logo.url ?? logo.src ?? logo.href);
  });

  HB.registerHelper("partyAddressLines", partyAddressLines);
  HB.registerHelper("transportRows", transportRows);
  HB.registerHelper("bankDetails", bankDetails);
  HB.registerHelper("customFields", customFieldRows);

  HB.registerHelper("countryOfSupply", (invoice: any) =>
    formatCountryName(invoice?.billedBy?.country)
  );

  HB.registerHelper("placeOfSupply", (invoice: any) =>
    formatGstStateName(invoice?.placeOfSupply ?? invoice?.pos)
  );

  HB.registerHelper("partyFields", (party: any) => {
    if (!party || typeof party !== "object") return [];
    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: any, value: any, hidden: boolean) => {
      const labelText = asText(label);
      const valueText = asText(value);
      if (!hidden && labelText && valueText)
        fields.push({ label: labelText, value: valueText });
    };
    customFieldRows(party.customFields).forEach((field) =>
      add(field.label, field.value, false)
    );
    (Array.isArray(party.additionalIds) ? party.additionalIds : []).forEach(
      (field: any) =>
        add(field?.label, field?.value, field?.showInInvoice === false)
    );
    (Array.isArray(party.customHeaders) ? party.customHeaders : []).forEach(
      (field: any) =>
        add(field?.label, field?.value, field?.showInInvoice === false)
    );
    return fields;
  });

  HB.registerHelper(
    "customColumnValue",
    (item: any, column: any, options: any) => {
      if (!item || !column?.key) return "";
      const key = String(column.key);
      let value = item.custom?.[key];
      if (value === undefined || value === null || value === "") {
        const match = customFieldRows(item.customFields).find((field) =>
          [field.label, field.name, field.key].some(
            (candidate) =>
              asText(candidate).toLowerCase() === key.trim().toLowerCase()
          )
        );
        value = match?.value;
      }
      if (value === undefined || value === null || value === "")
        value = item[key];

      if (isDecimalCustomColumn(column)) {
        const invoice = options?.data?.root?.invoice ?? options?.data?.root;
        return formatCustomNumber(value, invoice);
      }

      return asText(value);
    }
  );

  HB.registerHelper("itemCustomFields", (item: any, columns: any) => {
    const represented = new Set<string>();
    (Array.isArray(columns) ? columns : []).forEach((column: any) => {
      [column?.key, column?.label].forEach((candidate) => {
        const text = asText(candidate).toLowerCase();
        if (text) represented.add(text);
      });
    });

    return customFieldRows(item?.customFields).filter((field) =>
      [field.label, field.name, field.key].every(
        (candidate) => !represented.has(candidate.toLowerCase())
      )
    );
  });

  HB.registerHelper("totalWords", (invoice: any) => {
    const override = asText(invoice?.customLabels?.totalInWordsValue);
    if (override) return override;
    const total = Number(invoice?.finalTotal?.total);
    return Number.isFinite(total) ? amountInWords(total) : "";
  });

  HB.registerHelper("settlement", (invoice: any, mappedPayments: any) => {
    const balance =
      invoice?.balance && typeof invoice.balance === "object"
        ? invoice.balance
        : {};
    const conversion =
      invoice?.totalConversions?.[invoice?.currency] || undefined;
    const source = conversion || balance;
    const number = (value: any) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const received = number(source.paid ?? mappedPayments?.received);
    const transactionCharge = number(
      source.transactionCharge ?? mappedPayments?.transactionCharge
    );
    const due = number(source.due ?? mappedPayments?.due);
    const total = number(invoice?.finalTotal?.total);

    return {
      settledAmount: number(balance.settledAmount),
      tds: number(source.tds ?? mappedPayments?.tds),
      received,
      transactionCharge,
      paid: received + transactionCharge,
      due,
      credit: number(balance.credit),
      hasPaid: received !== 0,
      showDue: due > 0 && due !== total,
    };
  });

  HB.registerHelper("showPaymentsTable", (invoice: any, options: any) => {
    const visibilityFlag =
      invoice?.showPaymentsTable ?? options?.showPaymentsTable;
    const hasPayments =
      (Array.isArray(invoice?.allPayments) && invoice.allPayments.length > 0) ||
      (Array.isArray(invoice?.payments) && invoice.payments.length > 0);

    return asBoolean(visibilityFlag) && hasPayments;
  });

  HB.registerHelper("signedName", (request: any) =>
    asText(request?.signers?.[0]?.signerName)
  );
  HB.registerHelper("filenameFromUrl", (url: any) => {
    const text = asText(url);
    if (!text) return "";
    const tail = text.split("?")[0].split("/").pop() || text;
    try {
      return decodeURIComponent(tail);
    } catch (_) {
      return tail;
    }
  });
}

declare const Handlebars: any;
registerFormatCurrencyHelper(Handlebars);
registerSrTradingTemplateHelpers(Handlebars);

window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
