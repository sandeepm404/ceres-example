const SPECIAL_SYMBOLS: Record<string, string> = {
  SLE: "SLE",
  SAR: "⃁",
};

function isHbOptions(val: any): boolean {
  return (
    val != null && typeof val === "object" && "hash" in val && "data" in val
  );
}

export default function formatCurrency(
  number?: any,
  currency?: any,
  locale?: any,
  subUnitLength?: any,
  customCurrencySymbol?: any
): string {
  // When called directly by handlebars-loader, the HB options object is passed as `currency`.
  // Detect this and extract the real currency/locale values from data.root or ceresInvoiceData.
  if (isHbOptions(currency)) {
    const root =
      currency?.data?.root ||
      (typeof window !== "undefined" && (window as any).ceresInvoiceData) ||
      {};
    customCurrencySymbol = root.customCurrencySymbol ?? null;
    subUnitLength = root.subUnitLength ?? null;
    locale = root.locale;
    currency = root.currency;
  }

  let c = parseFloat(number);
  const localString = typeof locale === "string" && locale ? locale : "en-IN";
  if (!c) c = 0;

  const resolvedCurrency =
    typeof currency === "string" && currency ? currency : "INR";
  const currencySymbol =
    typeof customCurrencySymbol === "string" && customCurrencySymbol
      ? customCurrencySymbol
      : SPECIAL_SYMBOLS[resolvedCurrency] || null;

  if (resolvedCurrency === "RC") {
    return `🅲 ${c.toLocaleString(localString, {})}`;
  }

  const formatOptions: Intl.NumberFormatOptions = {
    style: "currency",
    currency: resolvedCurrency,
  };

  if (Number.isInteger(c)) {
    formatOptions.minimumFractionDigits = 0;
  }

  if (typeof subUnitLength === "number" && Number.isInteger(subUnitLength)) {
    formatOptions.minimumFractionDigits = subUnitLength;
    formatOptions.maximumFractionDigits = subUnitLength;
  }

  let result: string;
  try {
    result = Math.abs(c).toLocaleString(localString, formatOptions);
  } catch (_) {
    result = `${resolvedCurrency} ${Math.abs(c).toFixed(2)}`;
  }

  if (currencySymbol) {
    const numberMatch = /[\d,. ]+/;
    const matchedElements = result.match(numberMatch);
    /* istanbul ignore else */
    if (matchedElements) {
      result = `${currencySymbol} ${matchedElements.join("").trim()}`;
    }
  }

  if (c < 0) return `(${result})`;
  return result;
}
