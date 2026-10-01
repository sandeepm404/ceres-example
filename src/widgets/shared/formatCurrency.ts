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
    /*
     * Same two root shapes as registerFormatCurrencyHelper: a template using
     * normalizeInvoiceTemplateState nests the currency fields under `invoice`.
     */
    const source =
      root.invoice && typeof root.invoice === "object" ? root.invoice : root;
    customCurrencySymbol = source.customCurrencySymbol ?? null;
    subUnitLength = source.subUnitLength ?? null;
    locale = source.locale;
    currency = source.currency;
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
    // Rebuild the string from Intl's own formatted parts rather than scraping
    // the formatted output with a number regex, which is what @refrens/mudra's
    // formateCurrency used to do and deliberately stopped doing: /[\d,. ]+/
    // drops anything that is not a digit, comma, dot or space, so a compact
    // suffix is lost ("SAR 460K" -> "460") and a locale that groups with a
    // narrow/no-break space truncates the number ("1 234 567" -> "1").
    // Keeping everything except the native currency label preserves the
    // grouping, the digits and any suffix.
    // The separator is a no-break space (\u00a0), matching both mudra and
    // toLocaleString's own behaviour for currencies like AED, so the symbol
    // never wraps away from its number.
    try {
      const parts = new Intl.NumberFormat(
        localString,
        formatOptions
      ).formatToParts(Math.abs(c));
      const numberString = parts
        .filter(
          (part) =>
            part.type !== "currency" &&
            part.type !== "plusSign" &&
            part.type !== "minusSign"
        )
        .map((part) => part.value)
        .join("")
        // trim edge whitespace and the bidi/format marks left where the label was
        .replace(/^[\s\u200e\u200f\u061c]+|[\s\u200e\u200f\u061c]+$/g, "");
      result = `${currencySymbol}\u00a0${numberString}`;
    } catch {
      result = `${currencySymbol}\u00a0${Math.abs(c).toFixed(2)}`;
    }
  }

  if (c < 0) return `(${result})`;
  return result;
}
