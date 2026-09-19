import HandlebarsRuntime from "handlebars/runtime";
import sample from "../src/types/sample.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/default-template/template.hbs";
import subtotalPartial from "../src/widgets/subtotal/Subtotal.hbs";
import { computeSubtotalRows } from "../src/widgets/subtotal/utils";
import registerFormatCurrencyHelper from "../src/widgets/shared/registerFormatCurrencyHelper";
import registerTaxFlagHelpers from "../src/widgets/shared/registerTaxFlagHelpers";

beforeAll(() => {
  HandlebarsRuntime.registerPartial("DemoBadge", () => "");
  HandlebarsRuntime.registerPartial(
    "InvoiceStatus",
    () => "<span>Partially Paid</span>"
  );
  HandlebarsRuntime.registerPartial("MarkdownViewer", () => "");
  HandlebarsRuntime.registerHelper("prepareMarkdownViewerData", () => ({}));
  HandlebarsRuntime.registerHelper(
    "formateShortDateWithOffset",
    (value: unknown) => String(value ?? "")
  );
  HandlebarsRuntime.registerHelper("formateDateWithOffset", (value: unknown) =>
    String(value ?? "")
  );
  HandlebarsRuntime.registerHelper("formatDateInTimeZone", (value: unknown) =>
    String(value ?? "")
  );
  HandlebarsRuntime.registerHelper("formatDateAddDays", (value: unknown) =>
    String(value ?? "")
  );

  /*
   * The real widget, not a stub. This test never actually ran before REF-25603 — the hbs
   * transform returned a bare string, which Jest 28 rejects — so the shipped customer template
   * had no render coverage at all. Wiring the genuine partial and helper in means a regression
   * in either now fails here.
   */
  HandlebarsRuntime.registerPartial("Subtotal", subtotalPartial);
  HandlebarsRuntime.registerHelper(
    "computeSubtotalRows",
    (invoice: unknown, options: { hash?: Record<string, unknown> }) =>
      computeSubtotalRows(invoice, {
        columns: options?.hash?.columns,
        businessCurrency: options?.hash?.businessCurrency,
        businessLocale: options?.hash?.businessLocale,
      })
  );
  registerFormatCurrencyHelper(HandlebarsRuntime);
  registerTaxFlagHelpers(HandlebarsRuntime);
});

describe("default-template", () => {
  it("renders using the shared invoice normalization shape", () => {
    const model = normalizeInvoiceTemplateState(sample);
    const html = template(model);

    expect(html).toContain("Tax Invoice");
    expect(html).toContain("INV-2026-001");
    expect(html).toContain("BlueDart Logistics");
    expect(html).toContain("Enterprise Plan Subscription");
    expect(html).toContain("Terms and Conditions");
    expect(html).toContain("Powered by Refrens.com");
  });

  describe("totals block", () => {
    const render = () => template(normalizeInvoiceTemplateState(sample));

    it("renders the shared widget rather than hand-written markup", () => {
      const html = render();
      expect(html).toContain("data-ceres-subtotal");
      expect(html).not.toContain("totals-full-width-section");
    });

    it("formats every amount instead of pasting a symbol onto a raw number", () => {
      /*
       * This template used to print 13 amounts as `{{customCurrencySymbol}}{{value}}`, so a
       * total rendered as "₹147500" with no separator and no decimals.
       */
      const html = render();
      expect(html).toContain("1,47,500.00");
      expect(html).not.toMatch(/₹\s*147500/);
    });

    it("reads finalTotal, not the optional totals object", () => {
      const withDecoyTotals = {
        ...sample,
        invoice: { ...sample.invoice, totals: { total: 999999 } },
      };
      const html = template(normalizeInvoiceTemplateState(withDecoyTotals));
      expect(html).toContain("1,47,500.00");
      expect(html).not.toContain("9,99,999");
    });

    it("emits the live-update hooks the host patches", () => {
      const html = render();
      expect(html).toContain("data-ceres-subtotal-taxes");
      expect(html).toContain("data-ceres-total-in-words");
    });

    it("renders no round-off row", () => {
      expect(render()).not.toMatch(/Round Off/i);
    });

    it("formats the item table through the currency helper too", () => {
      // The mapper puts currency one level down, which used to make the helper default to INR.
      const html = render();
      expect(html).not.toMatch(/>\s*₹\d+\s*</);
    });
  });
});
