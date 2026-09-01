import amountInWords from "../../widgets/shared/amountInWords";
import {
  formatCountryName,
  formatQuantityWithUnit,
  formatSolvinCurrency,
  formatSolvinCurrencyMarkup,
  getItemColumnValue,
  getItemSerialNumbers,
  getItemSku,
  getItemUnit,
  getPartyAddressLines,
  shouldShowItemSku,
  solvinTaxAmountInWords,
  summarizeItemQuantity,
  toTitleCaseWords,
} from "../helpers";

type UnknownRecord = Record<string, any>;

const asRecord = (value: any): UnknownRecord =>
  value && typeof value === "object" ? value : {};

const numberValue = (value: any): number => {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const columnKey = (column: any): string =>
  String(asRecord(column).key ?? "").toLowerCase();

/** Registers the Handlebars helpers used only by the Solvin template. */
const registerSolvinHelpers = (hb: any): void => {
  if (!hb) return;

  const isKey = (column: any, keys: string[]) =>
    keys.includes(columnKey(column));
  const isCurrencyColumn = (column: any) => {
    const record = asRecord(column);
    const key = columnKey(column);
    return (
      record.semanticType === "currency" ||
      String(record.fxReturnType ?? "").toLowerCase() === "currency" ||
      [
        "rate",
        "unitrate",
        "unitprice",
        "price",
        "amount",
        "subtotal",
        "total",
        "discount",
        "cgst",
        "sgst",
        "utgst",
        "igst",
        "cess",
        "cessamount",
      ].includes(key)
    );
  };

  hb.registerHelper("addOne", (index: any) => numberValue(index) + 1);
  hb.registerHelper("amountInWords", (amount: any) =>
    amountInWords(numberValue(amount))
  );
  hb.registerHelper("titleCaseWords", toTitleCaseWords);
  hb.registerHelper("solvinTaxAmountInWords", (amount: any, invoice: any) =>
    solvinTaxAmountInWords(amount, invoice)
  );
  hb.registerHelper("formatCountryName", formatCountryName);
  hb.registerHelper("partyAddressLines", getPartyAddressLines);
  hb.registerHelper("formatSolvinCurrency", formatSolvinCurrency);
  hb.registerHelper(
    "formatSolvinCurrencyMarkup",
    (amount: any, invoice: any) =>
      new hb.SafeString(formatSolvinCurrencyMarkup(amount, invoice))
  );
  hb.registerHelper("columnAlignmentClass", (column: any) => {
    const record = asRecord(column);
    const dataType = String(record.dataType ?? "").toLowerCase();
    return isCurrencyColumn(column) || ["number", "numeric"].includes(dataType)
      ? "align-right"
      : "align-left";
  });
  hb.registerHelper("isRowNumberColumn", (column: any) =>
    isKey(column, ["sr", "srno", "sno", "rownumber", "index"])
  );
  hb.registerHelper("isDescriptionColumn", (column: any) =>
    isKey(column, ["item", "name", "description"])
  );
  hb.registerHelper("isQuantityColumn", (column: any) =>
    isKey(column, ["quantity", "qty"])
  );
  hb.registerHelper("isUnitColumn", (column: any) =>
    isKey(column, ["unit", "uom", "unitname"])
  );
  hb.registerHelper("isHsnColumn", (column: any) =>
    isKey(column, ["hsn", "sac", "hsncode", "hsnsac"])
  );
  hb.registerHelper("isCurrencyColumn", isCurrencyColumn);
  hb.registerHelper("isRateColumn", (column: any) =>
    isKey(column, ["gstrate", "tax", "taxrate", "cessrate"])
  );
  hb.registerHelper("isBooleanColumn", (column: any) =>
    ["boolean", "bool"].includes(
      String(asRecord(column).dataType ?? "").toLowerCase()
    )
  );
  hb.registerHelper("isNumericColumn", (column: any) =>
    ["number", "numeric"].includes(
      String(asRecord(column).dataType ?? "").toLowerCase()
    )
  );
  hb.registerHelper("isAmountColumn", (column: any) =>
    isKey(column, ["amount", "subtotal"])
  );
  hb.registerHelper("isTotalColumn", (column: any) => isKey(column, ["total"]));
  hb.registerHelper("itemColumnValue", getItemColumnValue);
  hb.registerHelper("itemCurrencyValue", getItemColumnValue);
  hb.registerHelper("itemSku", getItemSku);
  hb.registerHelper("itemHsn", (item: any) =>
    String(
      asRecord(item).hsn ?? asRecord(item).sac ?? asRecord(item).hsnCode ?? ""
    )
  );
  hb.registerHelper("itemSerialNumbers", getItemSerialNumbers);
  hb.registerHelper("itemUnit", (item: any, invoice: any) =>
    getItemUnit(item, invoice)
  );
  hb.registerHelper("showItemSku", shouldShowItemSku);
  hb.registerHelper(
    "quantityWithUnit",
    (item: any, invoice: any, showUnit: any) =>
      formatQuantityWithUnit(item, showUnit, invoice)
  );
  hb.registerHelper("formatSolvinHsn", (value: any) => String(value ?? ""));
  hb.registerHelper("formatBoolean", (value: any) => (value ? "Yes" : "No"));
  hb.registerHelper("formatItemNumber", (item: any, column: any) => {
    const value = getItemColumnValue(item, column);
    const invoice = asRecord((window as any).ceresInvoiceData?.invoice);
    const locale = invoice.locale || invoice.businessLocale || "en-IN";
    return numberValue(value).toLocaleString(locale, {
      maximumFractionDigits: Number(invoice.subUnitLength ?? 2),
    });
  });
  hb.registerHelper("formatTotalQuantity", summarizeItemQuantity);
  hb.registerHelper("columnSummaryValue", (items: any[], column: any) =>
    (Array.isArray(items) ? items : []).reduce(
      (sum, item) => sum + numberValue(getItemColumnValue(item, column)),
      0
    )
  );
  hb.registerHelper(
    "columnRateSummaryValue",
    (items: any[], column: any, invoiceValue: any) => {
      const invoice = asRecord(invoiceValue);
      const locale = invoice.locale || invoice.businessLocale || "en-IN";
      const rates = (Array.isArray(items) ? items : [])
        .filter((item) => {
          const record = asRecord(item);
          return (
            !record.isGroupItemTotalRow &&
            !record.isAdditionalCharge &&
            !record.group
          );
        })
        .map((item) =>
          Number(
            String(getItemColumnValue(item, column) ?? "").replace(
              /[,%\s]/g,
              ""
            )
          )
        )
        .filter((rate) => Number.isFinite(rate));

      return [...new Set(rates)]
        .map(
          (rate) =>
            `${rate.toLocaleString(locale, {
              maximumFractionDigits: Number(invoice.subUnitLength ?? 2),
            })}%`
        )
        .join(", ");
    }
  );
};

export default registerSolvinHelpers;
