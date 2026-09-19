import formatCurrency from "./formatCurrency";

export default function registerFormatCurrencyHelper(HB: any): void {
  HB.registerHelper("formatCurrency", function (amount: any, ...rest: any[]) {
    const options = rest[rest.length - 1];
    // Prefer options.data.root (set when compiled with data:true), fall back to ceresInvoiceData
    const root = options?.data?.root || (window as any).ceresInvoiceData || {};

    /*
     * A template's root context is whatever its data mapper returns. With
     * normalizeInvoiceTemplateState the currency fields sit one level down under `invoice`, so
     * reading them off the root resolved undefined and every amount silently formatted as INR
     * with the default symbol — which is why the shipped fork pasted
     * `customCurrencySymbol` onto raw numbers instead of using this helper at all.
     */
    const source =
      root.invoice && typeof root.invoice === "object" ? root.invoice : root;

    // Positional overrides take precedence; otherwise fall back to root context
    const currency =
      typeof rest[0] === "string" && rest[0] ? rest[0] : source.currency;
    const locale =
      typeof rest[1] === "string" && rest[1] ? rest[1] : source.locale;
    const subUnitLength =
      typeof rest[2] === "number" ? rest[2] : source.subUnitLength ?? null;
    const customCurrencySymbol =
      typeof rest[3] === "string" && rest[3]
        ? rest[3]
        : source.customCurrencySymbol ?? null;

    return formatCurrency(
      amount,
      currency,
      locale,
      subUnitLength,
      customCurrencySymbol
    );
  });
}
