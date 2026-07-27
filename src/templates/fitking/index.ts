// @ts-ignore - compiled via handlebars-loader
import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import "./styles.css";

// Register widgets
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";

// Register custom helpers
declare const Handlebars: any;
Handlebars.registerHelper("increment", function (value: number) {
  return value + 1;
});
Handlebars.registerHelper("eq", function (a: any, b: any) {
  return a === b;
});
Handlebars.registerHelper("or", function (...args: any[]) {
  const values = args.slice(0, -1);
  return values.some((val) => Boolean(val) && val !== "0" && val !== 0);
});

function extractNumericValue(val: any): number | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  if (typeof val === "string") {
    const cleaned = val.replace(/,/g, "").trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  if (typeof val === "object" && val !== null) {
    const candidateKeys = ["amount", "total", "value", "totalDiscount", "discountAmount", "val", "price", "rate"];
    for (const k of candidateKeys) {
      if (val[k] !== undefined && val[k] !== null) {
        const res = extractNumericValue(val[k]);
        if (res !== null) return res;
      }
    }
  }
  return null;
}

Handlebars.registerHelper("hasValue", function (val: any) {
  const num = extractNumericValue(val);
  if (num !== null) return true;
  return val !== undefined && val !== null && val !== "";
});

Handlebars.registerHelper("isPositive", function (val: any) {
  const num = extractNumericValue(val);
  return num !== null && num > 0;
});

Handlebars.registerHelper("formatCurrency", function (value: any, invoiceOrSymbol?: any) {
  const num = extractNumericValue(value);
  if (num === null) {
    if (typeof value === "string") return value;
    return "";
  }

  const absNum = Math.abs(num);
  const formattedNum = absNum.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let sym = "";
  if (typeof invoiceOrSymbol === "string") {
    sym = invoiceOrSymbol.trim();
  } else if (typeof invoiceOrSymbol === "object" && invoiceOrSymbol !== null) {
    if (invoiceOrSymbol.customCurrencySymbol !== undefined && invoiceOrSymbol.customCurrencySymbol !== null && invoiceOrSymbol.customCurrencySymbol !== "") {
      sym = String(invoiceOrSymbol.customCurrencySymbol).trim();
    } else if (invoiceOrSymbol.currencySymbol) {
      sym = String(invoiceOrSymbol.currencySymbol).trim();
    } else if (invoiceOrSymbol.currency === "INR" || invoiceOrSymbol.businessCurrency === "INR") {
      sym = "₹";
    } else if (invoiceOrSymbol.currency) {
      sym = String(invoiceOrSymbol.currency).trim();
    } else {
      sym = "₹";
    }
  }

  const text = sym ? `${sym}${formattedNum}` : formattedNum;
  if (num < 0) {
    return `(${text})`;
  }
  return text;
});

Handlebars.registerHelper("formatPhone", function (phone: any) {
  if (!phone) return "";
  let str = String(phone).trim();
  if (!str) return "";

  if (str.includes(" ") || str.includes("-")) {
    return str;
  }

  const hasPlus = str.startsWith("+");
  const digits = str.replace(/\D/g, "");
  if (!digits) return str;

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  if (hasPlus) {
    if (digits.length === 12 && digits.startsWith("91")) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    return `+${digits}`;
  }

  return str;
});

Handlebars.registerHelper("getColumnLabel", function (key: string, fallback: string, options: any) {
  const root = options?.data?.root;
  const columns = root?.columns || root?.invoice?.columns;
  if (Array.isArray(columns)) {
    const col = columns.find((c: any) => {
      const k = (c.key || c.id || c.name || "").toLowerCase();
      const target = (key || "").toLowerCase();
      if (k === target) return true;
      if (target === "item" && ["name", "description", "item", "productdescription"].includes(k)) return true;
      if (target === "model" && ["model", "modelno", "model_no"].includes(k)) return true;
      if (target === "rate" && ["rate", "price", "unitprice", "unit_price"].includes(k)) return true;
      if (target === "quantity" && ["quantity", "qty"].includes(k)) return true;
      if (target === "total" && ["total", "amount", "linetotal"].includes(k)) return true;
      return false;
    });
    if (col && col.label && typeof col.label === "string" && col.label.trim()) {
      return col.label.trim();
    }
  }

  const customLabels = root?.invoice?.customLabels;
  if (customLabels && customLabels[key]) {
    return customLabels[key];
  }

  return fallback;
});

Handlebars.registerHelper("getTotalsLabel", function (key: string, fallback: string, options: any) {
  const root = options?.data?.root;
  const customLabels = root?.invoice?.customLabels;
  if (customLabels) {
    const k = (key || "").toLowerCase();
    for (const [ckey, cval] of Object.entries(customLabels)) {
      if (ckey.toLowerCase() === k && typeof cval === "string" && cval.trim()) {
        return cval.trim();
      }
    }
  }
  return fallback;
});

Handlebars.registerHelper("getChargeName", function (item: any, fallback?: string) {
  if (!item) return typeof fallback === "string" ? fallback : "Extra Charges";
  if (typeof item === "string") return item;

  const name =
    item.name ||
    item.label ||
    item.chargeName ||
    item.title ||
    item.description ||
    item.customLabel ||
    item.type;

  if (name && typeof name === "string" && name.trim()) {
    return name.trim();
  }

  return typeof fallback === "string" ? fallback : "Extra Charges";
});

function isDatabaseId(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return /^[a-z0-9]{10,}$/i.test(trimmed) || /^[0-9a-fA-F]{24}$/.test(trimmed);
}

function lookupUnitInObjectOrArray(unitId: string, src: any): string {
  if (!src || !unitId) return "";
  
  if (typeof src === "object" && !Array.isArray(src)) {
    const match = src[unitId];
    if (typeof match === "string" && !isDatabaseId(match)) return match;
    if (typeof match === "object" && match !== null) {
      const name = match.symbol || match.name || match.shortName || match.label || match.title;
      if (name && !isDatabaseId(name)) return name;
    }
  }

  if (Array.isArray(src)) {
    const match = src.find(
      (u: any) =>
        u &&
        (u.id === unitId ||
          u._id === unitId ||
          u.unitId === unitId ||
          u.key === unitId ||
          u.code === unitId)
    );
    if (match) {
      if (typeof match === "string" && !isDatabaseId(match)) return match;
      if (typeof match === "object" && match !== null) {
        const name = match.symbol || match.name || match.shortName || match.label || match.title || match.code;
        if (name && !isDatabaseId(name)) return name;
      }
    }
  }

  return "";
}

function resolveUnit(unitRaw: any, item?: any, invoice?: any): string {
  let candidates = [
    item?.unitName,
    item?.unit_name,
    item?.unitSymbol,
    item?.unit_symbol,
    item?.unitTitle,
    item?.unitLabel,
    item?.unitDetails?.symbol,
    item?.unitDetails?.name,
    item?.unit_details?.symbol,
    item?.unit_details?.name,
    item?.custom?.unit,
  ];

  for (const cand of candidates) {
    if (cand && typeof cand === "string" && !isDatabaseId(cand)) {
      return cand.trim();
    }
  }

  let rawStr = "";
  if (typeof unitRaw === "string") {
    rawStr = unitRaw.trim();
  } else if (typeof unitRaw === "object" && unitRaw !== null) {
    rawStr = unitRaw.symbol || unitRaw.name || unitRaw.shortName || unitRaw.label || "";
  }

  if (rawStr && !isDatabaseId(rawStr)) {
    return rawStr;
  }

  const unitIdToLookup = rawStr || (typeof item?.unit === "string" ? item.unit : "");
  if (unitIdToLookup && invoice) {
    const sources = [
      invoice.units,
      invoice.unitList,
      invoice.unitMap,
      invoice.unitMapping,
      invoice.masterUnits,
      invoice.owner?.units,
      invoice.business?.units,
      invoice.company?.units,
      invoice.masterData?.units,
      invoice.advanceOptions?.units,
    ];

    for (const src of sources) {
      const found = lookupUnitInObjectOrArray(unitIdToLookup, src);
      if (found) return found;
    }
  }

  if (isDatabaseId(unitIdToLookup)) {
    return "Nos";
  }

  return rawStr;
}

Handlebars.registerHelper("formatQtyCell", function (item: any, invoice: any, advanceOptions: any) {
  if (!item) return "";
  const qty = item.quantity !== undefined && item.quantity !== null ? item.quantity : item.qty;
  if (qty === undefined || qty === null) return "";

  const unitCol = (
    advanceOptions?.unitColumn ||
    invoice?.advanceOptions?.unitColumn ||
    "MERGE_QUANTITY"
  ).toUpperCase();

  if (["MERGE_NAME", "SEPARATE", "HIDE", "NONE", "FALSE"].includes(unitCol)) {
    return String(qty);
  }

  const unit = resolveUnit(item.unit, item, invoice);
  if (unit) {
    return new Handlebars.SafeString(`<div class="fk-qty-num">${qty}</div><div class="fk-qty-unit">${unit}</div>`);
  }
  return String(qty);
});

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
