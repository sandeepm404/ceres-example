import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

const base = {
  invoiceTitle: "Invoice",
  invoiceNumber: "0023",
  items: [{ _id: "1", name: "Chair", quantity: 1, rate: 10, amount: 10 }],
};

const taxRows = { taxList: [{ rate: 18, taxableAmount: 100, totalTax: 18 }] };
const hsnRows = { hsnList: [{ hsn: "9403", taxableAmount: 100, totalTax: 18 }] };
const payments = [{ _id: "p1", amount: 50, mode: "UPI", referenceNumber: "R1" }];

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState({ ...base, ...payload } as any));

const shows = (html: string, heading: string) => html.includes(heading);

beforeAll(registerFitkingHelpers);

// Each table needs an opt-in from configuration AND rows. Configuration alone
// renders a bare header strip; rows alone renders a table the user hid.
describe("Tax Details visibility", () => {
  const on = { advanceOptions: { taxSummaryView: "BOTH" } };
  const off = { advanceOptions: { taxSummaryView: "NONE" } };

  it("shows when configured on and rows exist", () => {
    expect(shows(render({ ...on, taxSummary: taxRows }), "Tax Details")).toBe(true);
  });

  it("hides when configured on but there are no rows", () => {
    expect(shows(render(on), "Tax Details")).toBe(false);
  });

  it("hides when configured off even though rows exist", () => {
    expect(shows(render({ ...off, taxSummary: taxRows }), "Tax Details")).toBe(false);
  });

  it("hides when the view setting is absent", () => {
    expect(shows(render({ taxSummary: taxRows }), "Tax Details")).toBe(false);
  });

  it("also accepts the TABLE view setting", () => {
    const html = render({
      advanceOptions: { taxSummaryView: "TABLE" },
      taxSummary: taxRows,
    });

    expect(shows(html, "Tax Details")).toBe(true);
  });
});

describe("HSN Summary visibility", () => {
  const on = { advanceOptions: { showHSNSummaryInInvoice: true } };
  const off = { advanceOptions: { showHSNSummaryInInvoice: false } };

  it("shows when configured on and rows exist", () => {
    expect(shows(render({ ...on, hsnSummary: hsnRows }), "HSN Summary")).toBe(true);
  });

  it("hides when configured on but there are no rows", () => {
    expect(shows(render(on), "HSN Summary")).toBe(false);
  });

  it("hides when configured off even though rows exist", () => {
    expect(shows(render({ ...off, hsnSummary: hsnRows }), "HSN Summary")).toBe(false);
  });

  it("hides when the flag is absent", () => {
    expect(shows(render({ hsnSummary: hsnRows }), "HSN Summary")).toBe(false);
  });

  it('treats the string "false" as off', () => {
    const html = render({
      advanceOptions: { showHSNSummaryInInvoice: "false" },
      hsnSummary: hsnRows,
    });

    expect(shows(html, "HSN Summary")).toBe(false);
  });
});

describe("Payments History visibility", () => {
  it("shows when configured on and payments exist", () => {
    const html = render({ showPaymentsTable: true, allPayments: payments });

    expect(shows(html, "Payments History")).toBe(true);
  });

  it("hides when configured on but there are no payments", () => {
    expect(shows(render({ showPaymentsTable: true }), "Payments History")).toBe(false);
  });

  it("hides when configured off even though payments exist", () => {
    const html = render({ showPaymentsTable: false, allPayments: payments });

    expect(shows(html, "Payments History")).toBe(false);
  });

  it("hides when the flag is absent", () => {
    expect(shows(render({ allPayments: payments }), "Payments History")).toBe(false);
  });
});
