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

Handlebars.registerHelper("formatCurrency", function (value: any, invoiceOrSymbol?: any) {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
  if (isNaN(num)) return String(value);

  const formattedNum = num.toLocaleString("en-IN", {
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

  return sym ? `${sym} ${formattedNum}` : formattedNum;
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

function resolveUnit(unitRaw: any, item?: any, invoice?: any): string {
  if (!unitRaw && item) {
    unitRaw = item.unitName || item.unit_name || item.unitSymbol || item.unit_symbol;
    if (typeof item.unit === "object" && item.unit !== null) {
      unitRaw = item.unit.name || item.unit.symbol || item.unit.label;
    }
  }

  if (typeof unitRaw === "object" && unitRaw !== null) {
    unitRaw = unitRaw.name || unitRaw.symbol || unitRaw.label;
  }

  let unitStr = typeof unitRaw === "string" ? unitRaw.trim() : "";

  // Lookup in units map if provided
  if (unitStr && invoice) {
    const unitsMap = invoice.units || invoice.unitMap || invoice.unitMapping;
    if (unitsMap && unitsMap[unitStr]) {
      const mapped = unitsMap[unitStr];
      if (typeof mapped === "string") unitStr = mapped;
      else if (typeof mapped === "object" && mapped !== null) {
        unitStr = mapped.name || mapped.symbol || mapped.label || unitStr;
      }
    }
  }

  // Filter out raw MongoDB / hash IDs (e.g. "vlr32e4cnnb" or 24-hex characters)
  if (/^[a-z0-9]{10,}$/i.test(unitStr) || /^[0-9a-fA-F]{24}$/.test(unitStr)) {
    return "";
  }

  return unitStr;
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

  // If unit placement is MERGE_NAME, SEPARATE, HIDE, FALSE, or NONE -> do not merge unit in Qty cell
  if (["MERGE_NAME", "SEPARATE", "HIDE", "NONE", "FALSE"].includes(unitCol)) {
    return String(qty);
  }

  // MERGE_QUANTITY (default)
  const unit = resolveUnit(item.unit, item, invoice);
  return unit ? `${qty} ${unit}` : String(qty);
});

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
