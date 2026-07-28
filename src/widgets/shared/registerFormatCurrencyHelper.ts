import formatCurrency from "./formatCurrency";

export default function registerFormatCurrencyHelper(HB: any): void {
  HB.registerHelper("formatCurrency", function (amount: any, ...rest: any[]) {
    const options = rest[rest.length - 1];
    // Prefer options.data.root (set when compiled with data:true), fall back to ceresInvoiceData
    const root = options?.data?.root || (window as any).ceresInvoiceData || {};

    // Positional overrides take precedence; otherwise fall back to root context
    const currency =
      typeof rest[0] === "string" && rest[0] ? rest[0] : root.currency;
    const locale =
      typeof rest[1] === "string" && rest[1] ? rest[1] : root.locale;
    const subUnitLength =
      typeof rest[2] === "number" ? rest[2] : root.subUnitLength ?? null;
    const customCurrencySymbol =
      typeof rest[3] === "string" && rest[3]
        ? rest[3]
        : root.customCurrencySymbol ?? null;

    return formatCurrency(
      amount,
      currency,
      locale,
      subUnitLength,
      customCurrencySymbol
    );
  });
}
