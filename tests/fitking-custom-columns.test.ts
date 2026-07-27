import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

const systemColumn = (key: string, label: string) => ({
  key,
  label,
  system: true,
  isHidden: false,
  private: false,
});

const basePayload = (extra: Record<string, unknown> = {}) => ({
  invoiceTitle: "Quotation",
  invoiceNumber: "A00004",
  items: [{ _id: "1", name: "Elliptical Cross Trainer", quantity: 1, rate: 100, amount: 100 }],
  columns: [systemColumn("name", "Item"), systemColumn("rate", "Rate")],
  ...extra,
});

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

const headerLabels = (html: string) => {
  const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
  return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(([, text]) => text.trim());
};

const customCells = (html: string) =>
  [...html.matchAll(/<td class="text-center fk-custom-cell[^"]*">([\s\S]*?)<\/td>/g)].map(
    ([, text]) => text.trim()
  );

// Cells whose value came out numeric are marked so they never wrap mid-number.
const nowrapCells = (html: string) =>
  [...html.matchAll(/<td class="text-center fk-custom-cell( fk-nowrap)?">([\s\S]*?)<\/td>/g)]
    .filter(([, nowrap]) => nowrap)
    .map(([, , text]) => text.trim());

// Column count, not cell count — the item heading spans the name and photo cells.
const headerCount = (html: string) => {
  const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
  return (thead.match(/<th[^>]*>/g) ?? []).reduce((total, th) => {
    const span = /colspan="(\d+)"/.exec(th);
    return total + (span ? Number(span[1]) : 1);
  }, 0);
};
const colCount = (html: string) =>
  (/<colgroup>([\s\S]*?)<\/colgroup>/.exec(html)?.[1].match(/<col /g) ?? []).length;

beforeAll(registerFitkingHelpers);

describe("fitking user-defined item columns", () => {
  const withCustom = (columns: unknown[], items?: unknown[]) =>
    basePayload({
      columns: [systemColumn("name", "Item"), ...columns, systemColumn("rate", "Rate")],
      ...(items ? { items } : {}),
    });

  it("renders a custom column directly after the item name and photo", () => {
    const html = render(
      withCustom(
        [{ key: "warranty", label: "Warranty", dataType: "text" }],
        [{ _id: "1", name: "Trainer", quantity: 1, rate: 100, amount: 100, custom: { warranty: "2 yrs" } }]
      )
    );

    const labels = headerLabels(html);
    // The item heading spans name and photo; the custom column follows it.
    expect(labels[1]).toBe("Item");
    expect(labels[2]).toBe("Warranty");
    expect(customCells(html)).toEqual(["2 yrs"]);
  });

  it("follows the declared column order", () => {
    const html = render(
      basePayload({
        columns: [
          { key: "name", label: "Item" },
          { key: "warranty", label: "Warranty" },
          { key: "rate", label: "Rate", system: true },
          { key: "colour", label: "Colour" },
          { key: "total", label: "Total", system: true },
        ],
        items: [
          {
            _id: "1",
            name: "Elliptical Cross Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { warranty: "2 yrs", colour: "Red" },
          },
        ],
      })
    );

    expect(headerLabels(html).slice(1)).toEqual([
      "Item",
      "Warranty",
      "Rate",
      "Colour",
      "Total",
    ]);
  });

  // A pinned Model No column duplicated the document's own model column when
  // that column was declared under a key this template does not recognise.
  it("adds no column the document did not declare", () => {
    const html = render(
      basePayload({
        columns: [
          { key: "name", label: "Item" },
          { key: "modelNumberField", label: "Model No" },
          { key: "grandTotalField", label: "Total" },
        ],
        items: [
          {
            _id: "1",
            name: "Elliptical Cross Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { modelNumberField: "AF-139", grandTotalField: "100" },
          },
        ],
      })
    );

    const labels = headerLabels(html).slice(1);
    expect(labels).toEqual(["Item", "Model No", "Total"]);
    expect(labels.filter((label) => label === "Model No")).toHaveLength(1);
    expect(labels.filter((label) => label === "Total")).toHaveLength(1);
  });

  it("honours a declared position for the model column", () => {
    const html = render(
      basePayload({
        columns: [
          { key: "name", label: "Item" },
          { key: "warranty", label: "Warranty" },
          { key: "model", label: "Model No" },
          { key: "total", label: "Total", system: true },
        ],
        items: [
          {
            _id: "1",
            name: "Elliptical Cross Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { warranty: "2 yrs" },
          },
        ],
      })
    );

    expect(headerLabels(html).slice(1)).toEqual(["Item", "Warranty", "Model No", "Total"]);
  });

  it("keeps the colgroup, header and description colspan in step", () => {
    const html = render(
      withCustom([
        { key: "warranty", label: "Warranty" },
        { key: "colour", label: "Colour" },
      ])
    );

    expect(colCount(html)).toBe(headerCount(html));
  });

  it("reads values from custom, customFields or the item itself", () => {
    const html = render(
      withCustom(
        [
          { key: "warranty", label: "Warranty" },
          { key: "batch", label: "Batch" },
          { key: "origin", label: "Origin" },
        ],
        [
          {
            _id: "1",
            name: "Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { warranty: "2 yrs" },
            customFields: [{ key: "batch", value: "B-77" }],
            origin: "India",
          },
        ]
      )
    );

    expect(customCells(html)).toEqual(["2 yrs", "B-77", "India"]);
  });

  it("formats currency columns and blanks unusable values", () => {
    // A second item carries real "meta"/"absent" values so those columns stay
    // declared (a column with nothing on any item is dropped — see "hides a
    // custom column with no value on any item" below); this item's own values
    // are still unusable and must blank rather than borrow the other row's.
    const html = render(
      withCustom(
        [
          { key: "installation", label: "Installation", dataType: "currency" },
          { key: "meta", label: "Meta" },
          { key: "absent", label: "Absent" },
        ],
        [
          {
            _id: "1",
            name: "Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { installation: 1500, meta: { nested: true } },
          },
          {
            _id: "2",
            name: "Trainer 2",
            quantity: 1,
            rate: 200,
            amount: 200,
            custom: { installation: 200, meta: "ok", absent: "here" },
          },
        ]
      )
    );

    expect(customCells(html)).toEqual([
      "₹1,500.00",
      "",
      "",
      "₹200.00",
      "ok",
      "here",
    ]);
  });

  // A `number` column prints as the document stores it — only a column that
  // declares itself currency gets the currency treatment.
  it("leaves number columns unformatted", () => {
    const html = render(
      withCustom(
        [
          { key: "grandTotalField", label: "Total", dataType: "number" },
          { key: "installCost", label: "Install Cost", fxReturnType: "currency" },
        ],
        [
          {
            _id: "1",
            name: "Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { grandTotalField: "20,13,20,21,562", installCost: 500 },
          },
        ]
      )
    );

    expect(customCells(html)).toEqual(["20,13,20,21,562", "₹500.00"]);
  });

  // A column the account configured but never filled in on any item — a
  // header over an empty strip — is dropped rather than printed blank.
  it("hides a custom column with no value on any item", () => {
    const html = render(
      withCustom(
        [{ key: "code", label: "Code" }],
        [
          { _id: "1", name: "Trainer", quantity: 1, rate: 100, amount: 100 },
          { _id: "2", name: "Trainer 2", quantity: 1, rate: 200, amount: 200, custom: { code: "" } },
        ]
      )
    );

    expect(headerLabels(html)).not.toContain("Code");
    expect(customCells(html)).toEqual([]);
  });

  it("keeps a custom column when only some items have a value", () => {
    const html = render(
      withCustom(
        [{ key: "code", label: "Code" }],
        [
          { _id: "1", name: "Trainer", quantity: 1, rate: 100, amount: 100 },
          { _id: "2", name: "Trainer 2", quantity: 1, rate: 200, amount: 200, custom: { code: "C-2" } },
        ]
      )
    );

    expect(headerLabels(html)).toContain("Code");
    expect(customCells(html)).toEqual(["", "C-2"]);
  });

  // "20,13,20,21,562" broken across two lines reads as two separate numbers.
  it("marks numeric values so they do not wrap, and leaves text wrappable", () => {
    const html = render(
      withCustom(
        [
          { key: "grandTotalField", label: "Total", dataType: "number" },
          { key: "note", label: "Note" },
        ],
        [
          {
            _id: "1",
            name: "Trainer",
            quantity: 1,
            rate: 100,
            amount: 100,
            custom: { grandTotalField: "20,13,20,21,562", note: "Some long remark" },
          },
        ]
      )
    );

    expect(nowrapCells(html)).toEqual(["20,13,20,21,562"]);
  });

  it("omits system, hidden and private columns", () => {
    const html = render(
      withCustom([
        { key: "internalCost", label: "Internal Cost", private: true },
        { key: "draftNote", label: "Draft Note", isHidden: true },
        systemColumn("total", "Total"),
      ])
    );

    const labels = headerLabels(html);
    expect(labels).not.toContain("Internal Cost");
    expect(labels).not.toContain("Draft Note");
    expect(customCells(html)).toEqual([]);
  });

  // A user-defined column duplicating a built-in would print the value twice.
  it("skips custom columns that duplicate a built-in column", () => {
    const html = render(
      withCustom([
        { key: "Model No", label: "Model No" },
        { key: "hsn", label: "HSN" },
      ])
    );

    expect(customCells(html)).toEqual([]);
  });

  it("renders no custom columns when the document declares none", () => {
    const html = render(basePayload());

    expect(customCells(html)).toEqual([]);
    expect(colCount(html)).toBe(headerCount(html));
  });
});
