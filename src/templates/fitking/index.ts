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

function lookupUnitInInvoice(unitId: string, invoice: any): string {
  if (!invoice || !unitId) return "";
  const unitsSources = [
    invoice.units,
    invoice.unitList,
    invoice.unitMap,
    invoice.unitMapping,
    invoice.owner?.units,
    invoice.masterData?.units,
  ];

  for (const src of unitsSources) {
    if (!src) continue;
    if (typeof src === "object" && !Array.isArray(src)) {
      const match = src[unitId];
      if (typeof match === "string") return match;
      if (typeof match === "object" && match !== null) {
        return match.name || match.symbol || match.label || match.title || "";
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
            u.name === unitId ||
            u.code === unitId)
      );
      if (match) {
        if (typeof match === "string") return match;
        return match.name || match.symbol || match.label || match.title || match.code || "";
      }
    }
  }

  return "";
}

function resolveUnit(unitRaw: any, item?: any, invoice?: any): string {
  let val =
    unitRaw ||
    item?.unitName ||
    item?.unit_name ||
    item?.unitSymbol ||
    item?.unit_symbol ||
    item?.unitTitle ||
    item?.unitLabel;

  if (typeof val === "object" && val !== null) {
    val = val.name || val.symbol || val.label || val.title || val.code;
  }

  let unitStr = typeof val === "string" ? val.trim() : "";

  if (invoice) {
    const lookedUp = lookupUnitInInvoice(unitStr || item?.unit, invoice);
    if (lookedUp) {
      unitStr = lookedUp;
    }
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

  // MERGE_QUANTITY (default) -> place unit below quantity number
  const unit = resolveUnit(item.unit, item, invoice);
  if (unit) {
    return new Handlebars.SafeString(`<div class="fk-qty-num">${qty}</div><div class="fk-qty-unit">${unit}</div>`);
  }
  return String(qty);
});

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
