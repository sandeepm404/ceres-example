import HandlebarsRuntime from "handlebars/runtime";
import sample from "../src/types/sample.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/default-template/template.hbs";

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
});
