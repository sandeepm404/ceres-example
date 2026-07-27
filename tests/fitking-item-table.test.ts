import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

const basePayload = (extra: Record<string, unknown> = {}) => ({
  invoiceTitle: "Debit Note",
  invoiceNumber: "A00004",
  items: [
    {
      _id: "1",
      name: "Aerofit Elliptical Cross Trainer",
      description: "Dimension: 84 x 30 x 70",
      quantity: 1,
      rate: 163700,
      amount: 163700,
    },
  ],
  advanceOptions: { isDescriptionFullWidth: true },
  ...extra,
});

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

// Column count, not cell count — the item heading spans the name and photo
// cells, so a plain <th> tally would undercount by one.
const headerCount = (html: string) => {
  const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
  return (thead.match(/<th[^>]*>/g) ?? []).reduce((total, th) => {
    const span = /colspan="(\d+)"/.exec(th);
    return total + (span ? Number(span[1]) : 1);
  }, 0);
};
const colspanOf = (html: string) =>
  Number(/<td colspan="(\d+)" class="fk-desc-fullwidth-cell"/.exec(html)?.[1]);

beforeAll(registerFitkingHelpers);

describe("fitking full-width description colspan", () => {
  // A colspan wider than the header makes the browser invent extra columns,
  // which steal width from the auto-sized Item column and leave a dead strip.
  it("matches the header column count in the plain case", () => {
    const html = render(basePayload());

    expect(colspanOf(html)).toBe(headerCount(html));
  });

  it("matches when an IGST column is present", () => {
    const html = render(basePayload({ igst: true }));

    expect(colspanOf(html)).toBe(headerCount(html));
  });

  it("matches when CGST and SGST columns are present", () => {
    const html = render(basePayload({ taxName: "GST" }));

    expect(colspanOf(html)).toBe(headerCount(html));
  });

  it("matches when a discount column is present", () => {
    const html = render(
      basePayload({ finalTotal: { discount: 50, total: 163650 } })
    );

    expect(colspanOf(html)).toBe(headerCount(html));
  });

  it("never exceeds the header count, which is what caused the dead column", () => {
    const html = render(basePayload({ igst: true }));

    expect(colspanOf(html)).toBeLessThanOrEqual(headerCount(html));
  });
});

describe("fitking column labels", () => {
  // Payloads ship both `amount` and `total` columns, with `amount` first.
  // An alias-first lookup labelled Total with the Amount label.
  const columns = [
    { key: "name", label: "Item" },
    { key: "quantity", label: "كمية" },
    { key: "rate", label: "معدل" },
    { key: "amount", label: "Amount label" },
    { key: "total", label: "Total label" },
  ];

  it("prefers an exact key match over an alias match", () => {
    const html = render(basePayload({ columns }));

    expect(html).toContain("Total label");
    expect(html).not.toContain("Amount label");
  });

  it("still resolves via alias when no exact key exists", () => {
    const html = render(
      basePayload({ columns: [{ key: "amount", label: "Amount label" }] })
    );

    expect(html).toContain("Amount label");
  });

  it("passes through non-latin labels unchanged", () => {
    const html = render(basePayload({ columns }));

    expect(html).toContain("كمية");
    expect(html).toContain("معدل");
  });
});

describe("fitking tax summary", () => {
  it("is hidden when the view is on but there are no tax rows", () => {
    const html = render(basePayload({ advanceOptions: { taxSummaryView: "BOTH" } }));

    expect(html).not.toContain("Tax Details");
  });

  it("renders when the view is on and rows exist", () => {
    const html = render(
      basePayload({
        advanceOptions: { taxSummaryView: "BOTH" },
        taxSummary: { taxList: [{ rate: 18, taxableAmount: 100, totalTax: 18 }] },
      })
    );

    expect(html).toContain("Tax Details");
  });

  it("stays hidden when the view is off even with rows present", () => {
    const html = render(
      basePayload({
        advanceOptions: { taxSummaryView: "NONE" },
        taxSummary: { taxList: [{ rate: 18, taxableAmount: 100, totalTax: 18 }] },
      })
    );

    expect(html).not.toContain("Tax Details");
  });
});
