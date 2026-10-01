import type { InvoicePayloadInput } from "../src/main/invoicePayloadContract";
import fixture from "./fixtures/columns-basic.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";

// SC54 (REF-25643 phase 7) — ceres and ceres-example keep two hand-maintained
// copies of the same contract and normalization (docs/learnings/ceres/
// contract-is-two-hand-copies.md). There is no automated way to import one
// repo's code from the other's test suite — they are separate repositories
// with separate CI — so parity is proven the way a contract test proves
// compatibility with an external system: against a pinned oracle.
//
// fixtures/columns-basic.json is byte-identical to ceres's own
// e2e/fixtures/columns-basic.json (used by its "basic-invoice-example — line
// items table (SC8)" spec). The expected values below were captured by
// running ceres's normalizeInvoiceTemplateState against this exact fixture
// on this ticket's branch (re-captured at commit 9ec04da, after money
// formatting was corrected) — they are ceres's real output,
// not a guess. If either repo's normalization changes what it resolves for
// this fixture, this test or ceres's SC8 spec (or both) will catch the drift.
describe("line items contract parity with ceres (SC54)", () => {
  const state = normalizeInvoiceTemplateState(fixture as any);
  const visibleColumns = state.mapped.columns.filter(
    (column) => !column.isHidden
  );

  it("resolves the same columns, in the same order, with the same labels and hidden state as ceres", () => {
    expect(
      visibleColumns.map((column) => ({ key: column.key, label: column.label }))
    ).toEqual([
      { key: "rate", label: "Rate" },
      { key: "name", label: "Item" },
      { key: "quantity", label: "Qty" },
      { key: "amount", label: "Line Total" },
      { key: "warranty", label: "Warranty" },
    ]);

    // The business switched SKU off — it resolves as hidden, not dropped from
    // the list, matching ceres's own SC33/SC35-style column resolution.
    const skuColumn = state.mapped.columns.find(
      (column) => column.key === "sku"
    );
    expect(skuColumn?.isHidden).toBe(true);
  });

  it("resolves the same cell text as ceres for every visible column, on every row", () => {
    const rowTexts = state.mapped.rows.map((row) => ({
      cells: row.cells
        .filter((cell) =>
          visibleColumns.some((column) => column.key === cell.key)
        )
        .map((cell) => ({ key: cell.key, text: cell.text })),
      lineNumber: row.lineNumber,
      isGroupHeading: row.isGroupHeading,
      isAdditionalCharge: row.isAdditionalCharge,
    }));

    expect(rowTexts).toEqual([
      {
        cells: [
          { key: "rate", text: "" },
          { key: "name", text: "Group A" },
          { key: "quantity", text: "" },
          { key: "amount", text: "" },
          { key: "warranty", text: "" },
        ],
        lineNumber: null,
        isGroupHeading: true,
        isAdditionalCharge: false,
      },
      {
        cells: [
          { key: "rate", text: "\u20b9\u00a010,000" },
          { key: "name", text: "Design Retainer" },
          { key: "quantity", text: "2" },
          { key: "amount", text: "\u20b9\u00a020,000.00" },
          { key: "warranty", text: "12 months" },
        ],
        lineNumber: 1,
        isGroupHeading: false,
        isAdditionalCharge: false,
      },
      {
        cells: [
          { key: "rate", text: "\u20b9\u00a05,000" },
          { key: "name", text: "Onboarding Service" },
          { key: "quantity", text: "1" },
          { key: "amount", text: "\u20b9\u00a05,000.00" },
          { key: "warranty", text: "6 months" },
        ],
        lineNumber: 2,
        isGroupHeading: false,
        isAdditionalCharge: false,
      },
      {
        cells: [
          { key: "rate", text: "" },
          { key: "name", text: "Sub total" },
          { key: "quantity", text: "3" },
          { key: "amount", text: "\u20b9\u00a025,000.00" },
          { key: "warranty", text: "" },
        ],
        lineNumber: null,
        isGroupHeading: false,
        isAdditionalCharge: false,
      },
      {
        cells: [
          { key: "rate", text: "" },
          { key: "name", text: "Group B" },
          { key: "quantity", text: "" },
          { key: "amount", text: "" },
          { key: "warranty", text: "" },
        ],
        lineNumber: null,
        isGroupHeading: true,
        isAdditionalCharge: false,
      },
      {
        cells: [
          { key: "rate", text: "\u20b9\u00a03,000" },
          { key: "name", text: "Support Plan" },
          { key: "quantity", text: "4" },
          { key: "amount", text: "\u20b9\u00a012,000.00" },
          { key: "warranty", text: "" },
        ],
        lineNumber: 1,
        isGroupHeading: false,
        isAdditionalCharge: false,
      },
      {
        cells: [
          { key: "rate", text: "" },
          { key: "name", text: "Packing Charges" },
          { key: "quantity", text: "" },
          { key: "amount", text: "\u20b9\u00a0500.00" },
          { key: "warranty", text: "" },
        ],
        lineNumber: null,
        isGroupHeading: false,
        isAdditionalCharge: true,
      },
      {
        cells: [
          { key: "rate", text: "" },
          { key: "name", text: "Sub total" },
          { key: "quantity", text: "4" },
          { key: "amount", text: "\u20b9\u00a012,000.00" },
          { key: "warranty", text: "" },
        ],
        lineNumber: null,
        isGroupHeading: false,
        isAdditionalCharge: false,
      },
    ]);
  });

  it("keeps every configured column at narrow width when the payload does not say the columns are untouched", () => {
    // An absent isColumnsModified must not be read as "untouched" — doing so
    // hid genuinely configured columns on a phone for every document the
    // server had not stamped.
    const fixtureInvoice = (fixture as Record<string, unknown>)
      .invoice as Record<string, unknown>;
    expect(fixtureInvoice.isColumnsModified).toBeUndefined();
    expect(state.mapped.visibility.usesShortSet).toBe(false);
    expect(
      state.mapped.columns.some((column) =>
        column.className.includes("col-short-set")
      )
    ).toBe(false);

    // And it does apply when the payload says so explicitly, so the assertion
    // above is proving the gate rather than a feature that never runs.
    // The payload is wrapped, and normalizeInvoicePayload spreads `invoice`
    // over a fixed list of host fields — so the flag has to sit on `invoice`,
    // which is where the server puts it and where refrens.com reads it.
    const untouched = normalizeInvoiceTemplateState({
      ...(fixture as Record<string, unknown>),
      invoice: { ...fixtureInvoice, isColumnsModified: false },
    } as any);
    expect(untouched.mapped.visibility.usesShortSet).toBe(true);
    expect(
      untouched.mapped.columns.some((column) =>
        column.className.includes("col-short-set")
      )
    ).toBe(true);
  });

  it("a group heading carrying its own numbers is summed into the document total, the way refrens.com sums it", () => {
    // Parity, not an oversight. lydia's endTotalsRow reduces over the whole
    // item array and skips exactly one kind of line —
    // `if (b.isAdditionalCharge) return a;`
    // (lydia/src/helpers/getGroupedLineItems.js:99-101). A group heading is
    // not excluded there, so it must not be excluded here either: a document
    // whose heading rows carry stray amounts has to print the same total in
    // the PDF as it does in the web app, right or wrong.
    //
    // The group SUB-total is a different array and is already heading-free —
    // buildRows only collects non-heading lines into `groupItems` — so this
    // asserts both halves at once.
    const grouped = normalizeInvoiceTemplateState({
      items: [
        { _id: "g1", name: "Group 1", group: true, quantity: 5, amount: 999 },
        { _id: "i1", name: "Item 1", quantity: 1, amount: 100 },
        {
          _id: "c1",
          name: "Delivery",
          isAdditionalCharge: true,
          quantity: 3,
          amount: 50,
        },
      ],
      columns: [{ key: "name" }, { key: "quantity" }, { key: "amount" }],
      showTotalsRow: true,
      // FlattenedInvoicePayload declares dozens of required fields the
      // normalizer never reads; a partial document is the whole point here.
    } as unknown as InvoicePayloadInput);

    const textAt = (rowClass: string, key: string) =>
      grouped.mapped.rows
        .find((row) => row.rowClass === rowClass)!
        .cells.find((cell) => cell.key === key)!.text;

    // 999 + 100, and the additional charge's 50 left out.
    expect(textAt("row-summary", "amount")).toBe("₹1,099.00");
    expect(textAt("row-summary", "quantity")).toBe("6");

    // The sub-total saw only Item 1: no heading, no additional charge.
    expect(textAt("row-group-subtotal", "amount")).toBe("₹100.00");
    expect(textAt("row-group-subtotal", "quantity")).toBe("1");
  });
});
