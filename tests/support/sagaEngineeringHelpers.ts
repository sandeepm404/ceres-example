import HandlebarsRuntime from "handlebars/runtime";
import { qrSrc } from "../../src/widgets/qr-code";
import registerFormatCurrencyHelper from "../../src/widgets/shared/registerFormatCurrencyHelper";
import { registerSagaEngineeringTemplateHelpers } from "../../src/templates/saga-engineering/helpers";

/**
 * Registers everything `src/templates/saga-engineering/template.hbs` needs to
 * render.
 *
 * The template's own helpers come from the real implementation, so tests
 * exercise the shipping logic rather than a stub that agrees with them. Only
 * things owned by other widgets are faked: InvoiceStatus/DemoBadge/
 * MarkdownViewer partials and the date-time helpers, none of which register
 * against `window.Handlebars` under Jest. `qrSrc` and `formatCurrency` use
 * their real implementations.
 */
export function registerSagaEngineeringHelpers(): void {
  const HB = HandlebarsRuntime;

  registerFormatCurrencyHelper(HB);
  registerSagaEngineeringTemplateHelpers(HB);

  HB.registerPartial("DemoBadge", () => "");
  HB.registerPartial("InvoiceStatus", () => "<span>Partially Paid</span>");
  HB.registerPartial(
    "MarkdownViewer",
    (ctx: any) => `<span>${ctx?.markdown ?? ""}</span>`
  );
  HB.registerHelper("prepareMarkdownViewerData", (v: unknown) => ({
    markdown: v,
  }));

  HB.registerHelper("qrSrc", (v: unknown) => qrSrc(v));

  // Owned by the date-time widget; rendered as raw values here.
  [
    "formateShortDateWithOffset",
    "formateDateWithOffset",
    "formatDateInTimeZone",
  ].forEach((name) => HB.registerHelper(name, (v: unknown) => String(v ?? "")));

  // Owned by the tax-summary/hsn-summary widgets.
  HB.registerPartial("TaxSummaryTable", () => "");
  HB.registerPartial("HsnSummaryTable", () => "");
  HB.registerHelper("computeTaxSummary", () => ({ hasRows: false }));
  HB.registerHelper("computeHsnSummary", () => ({ hasRows: false }));
}
