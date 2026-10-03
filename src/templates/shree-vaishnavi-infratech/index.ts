import template from "./template.hbs";
import amountInWords from "../../widgets/shared/amountInWords";
import {
  asRecord,
  formatCountryName,
  formatQuantityWithUnit,
  formatVaishnaviCurrency,
  formatVaishnaviPercentage,
  getItemColumnValue,
  getItemSerialNumbers,
  getItemSku,
  getItemUnit,
  getPartyAddressLines,
  hasValue,
  isCurrencyColumn,
  isDateColumn,
  isKey,
  isVaishnaviPercentageColumn,
  mapVaishnaviTemplateData,
  normalizeKey,
  shouldShowItemSku,
  summarizeItemQuantity,
} from "./helpers";
import "./styles.css";

import "../../widgets/date-time";
import "../../widgets/invoice-status";
import "../../widgets/demo-badge";
import "../../widgets/markdown-viewer";
import "../../widgets/watermark";
import "../../widgets/refrens-branding";
import "../../widgets/phone-number";
import "../../widgets/tax-summary";
import "../../widgets/hsn-summary";
import "../../widgets/payment-table";
import "../../widgets/currency-format";
import "../../widgets/image";
import "../../widgets/qr-code";

const numericValue = (value: any): number => {
  const parsed = Number(String(value ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalNumericValue = (value: any): number | undefined => {
  if (!hasValue(value)) return undefined;
  const parsed = Number(String(value).replace(/[,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const hb = (window as any).Handlebars;
if (hb) {
  hb.registerHelper("addOne", (index: any) => Number(index ?? 0) + 1);
  hb.registerHelper("hasValue", hasValue);
  hb.registerHelper("partyAddressLines", getPartyAddressLines);
  hb.registerHelper("formatCountryName", formatCountryName);
  hb.registerHelper("formatVaishnaviCurrency", formatVaishnaviCurrency);
  hb.registerHelper("itemColumnValue", getItemColumnValue);
  hb.registerHelper("itemSerialNumbers", getItemSerialNumbers);
  hb.registerHelper("itemSku", getItemSku);
  hb.registerHelper("showItemSku", shouldShowItemSku);
  hb.registerHelper("itemDisplayValue", (itemValue: any, columnValue: any) => {
    const item = asRecord(itemValue);
    const key = normalizeKey(asRecord(columnValue).key);
    if (key === "total") {
      return item.total ?? item.subTotal ?? item.amount;
    }
    if (["gstrate", "taxrate"].includes(key)) {
      return item.gstRate ?? item.taxRate ?? item.tax;
    }
    return getItemColumnValue(item, columnValue);
  });
  hb.registerHelper("itemUnit", getItemUnit);
  hb.registerHelper("isRowNumberColumn", (column: any) =>
    isKey(column, ["sr", "srno", "sno", "rownumber", "index"])
  );
  hb.registerHelper("isDescriptionColumn", (column: any) =>
    isKey(column, ["item", "name", "description"])
  );
  hb.registerHelper("isQuantityColumn", (column: any) =>
    isKey(column, ["quantity", "qty"])
  );
  hb.registerHelper("isAmountColumn", (column: any) =>
    isKey(column, ["amount", "subtotal"])
  );
  hb.registerHelper("isTotalColumn", (column: any) => isKey(column, ["total"]));
  hb.registerHelper("isUnitColumn", (column: any) =>
    isKey(column, ["unit", "uom", "unitname"])
  );
  hb.registerHelper("isCurrencyColumn", isCurrencyColumn);
  hb.registerHelper("isDateColumn", isDateColumn);
  hb.registerHelper("isPercentageColumn", isVaishnaviPercentageColumn);
  hb.registerHelper("formatVaishnaviPercentage", formatVaishnaviPercentage);
  hb.registerHelper("quantityWithUnit", (item: any, invoice: any) =>
    formatQuantityWithUnit(item, false, invoice)
  );
  hb.registerHelper("quantityOnly", (item: any, invoice: any) =>
    formatQuantityWithUnit(item, false, invoice)
  );
  hb.registerHelper("formatTotalQuantity", summarizeItemQuantity);
  hb.registerHelper("columnSummaryValue", (items: any[], column: any) =>
    (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const record = asRecord(item);
      if (
        record.isGroupItemTotalRow ||
        record.isAdditionalCharge ||
        record.group
      ) {
        return sum;
      }
      return sum + numericValue(getItemColumnValue(item, column));
    }, 0)
  );
  hb.registerHelper(
    "columnRateSummaryValue",
    (items: any[], column: any, invoiceValue: any) => {
      const invoice = asRecord(invoiceValue);
      const rates = (Array.isArray(items) ? items : [])
        .filter((item) => {
          const record = asRecord(item);
          return (
            !record.isGroupItemTotalRow &&
            !record.isAdditionalCharge &&
            !record.group
          );
        })
        .map((item) => optionalNumericValue(getItemColumnValue(item, column)))
        .filter((rate): rate is number => rate !== undefined);
      return [...new Set(rates)]
        .map((rate) =>
          rate.toLocaleString(
            invoice.locale || invoice.businessLocale || "en-IN",
            { maximumFractionDigits: Number(invoice.subUnitLength ?? 2) }
          )
        )
        .map((rate) => `${rate}%`)
        .join(", ");
    }
  );
  hb.registerHelper("columnAlignmentClass", (column: any) => {
    if (isDateColumn(column)) return "align-left is-date-column";
    return isCurrencyColumn(column) ||
      ["number", "numeric", "decimal", "integer"].includes(
        String(asRecord(column).dataType ?? "").toLowerCase()
      )
      ? "align-right"
      : "align-left";
  });
  hb.registerHelper("amountInWords", (value: any) =>
    amountInWords(Number(String(value ?? 0).replace(/,/g, "")) || 0)
  );
}

window.CeresTemplateDataMapper = mapVaishnaviTemplateData as any;
window.CeresTemplate = template;

if (typeof document !== "undefined") {
  document.addEventListener(
    "error",
    (event) => {
      const { target } = event;
      if (!(target instanceof HTMLImageElement)) return;
      if (!target.closest(".vaishnavi-invoice")) return;
      const failedQr = target.closest(".document-qr, .compliance-qr");
      if (failedQr instanceof HTMLElement) {
        failedQr.classList.add("is-empty");
        return;
      }
      const failedComplianceQr = target.closest(".compliance-qr-grid");
      if (failedComplianceQr instanceof HTMLElement) {
        failedComplianceQr.style.display = "none";
        return;
      }
      target.style.display = "none";
    },
    true
  );
}
