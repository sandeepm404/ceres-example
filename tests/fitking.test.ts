import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

beforeAll(registerFitkingHelpers);

describe("item table", () => {
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
    Number(
      /<td colspan="(\d+)" class="fk-desc-fullwidth-cell"/.exec(html)?.[1]
    );

  describe("full-width description colspan", () => {
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

  describe("column labels", () => {
    // `amount` (pre-tax) and `total` (tax-inclusive) are distinct columns, each
    // keeping its own declared label — they are no longer merged into one.
    const columns = [
      { key: "name", label: "Item" },
      { key: "quantity", label: "كمية" },
      { key: "rate", label: "معدل" },
      { key: "amount", label: "Amount label" },
      { key: "total", label: "Total label" },
    ];

    it("keeps amount and total as separate columns, each with its own label", () => {
      const html = render(basePayload({ columns }));

      expect(html).toContain("Total label");
      expect(html).toContain("Amount label");
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

  describe("amount vs total columns", () => {
    const columns = [
      { key: "name", label: "Item" },
      { key: "quantity", label: "Qty" },
      { key: "rate", label: "Unit Rate" },
      { key: "amount", label: "Amount" },
      { key: "total", label: "Total" },
    ];

    const bodyCells = (html: string) => {
      const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "";
      return [...tbody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(([, text]) =>
        text.replace(/\s+/g, " ").trim()
      );
    };

    it("keeps amount pre-tax and computes total as amount plus tax", () => {
      const html = render(
        basePayload({
          taxName: "GST",
          columns,
          items: [
            {
              _id: "1",
              name: "Item",
              quantity: 1,
              rate: 1200,
              amount: 1200,
              cgst: 108,
              sgst: 108,
            },
          ],
        })
      );

      const cells = bodyCells(html);
      expect(cells).toContain("₹1,200");
      expect(cells).toContain("₹1,416");
    });

    it("prefers taxAmount when the backend already summed it", () => {
      const html = render(
        basePayload({
          columns,
          items: [
            {
              _id: "1",
              name: "Item",
              quantity: 1,
              rate: 1000,
              amount: 1000,
              taxAmount: 180,
              igst: 999,
            },
          ],
        })
      );

      expect(bodyCells(html)).toContain("₹1,180");
    });

    // Only one tax regime applies per invoice — inter-state IGST, or intra-state
    // CGST+SGST — never both. A stale/leftover value in the field that does not
    // apply must not get summed in on top of the one that does.
    it("ignores a stale igst value on a CGST/SGST invoice", () => {
      const html = render(
        basePayload({
          taxName: "GST",
          columns,
          items: [
            {
              _id: "1",
              name: "Item",
              quantity: 1,
              rate: 1200,
              amount: 1200,
              cgst: 108,
              sgst: 108,
              igst: 216, // stale — must not be added on top of cgst+sgst
            },
          ],
        })
      );

      const cells = bodyCells(html);
      expect(cells).toContain("₹1,416");
      expect(cells).not.toContain("₹1,632");
    });

    it("ignores stale cgst/sgst values on an IGST invoice", () => {
      const html = render(
        basePayload({
          taxName: "GST",
          igst: 216,
          columns,
          items: [
            {
              _id: "1",
              name: "Item",
              quantity: 1,
              rate: 1200,
              amount: 1200,
              igst: 216,
              cgst: 108, // stale — must not be added on top of igst
              sgst: 108, // stale — must not be added on top of igst
            },
          ],
        })
      );

      const cells = bodyCells(html);
      expect(cells).toContain("₹1,416");
      expect(cells).not.toContain("₹1,632");
    });

    // Any non-GST taxName (VAT included) routes through the same bucket as
    // IGST — see `chargeAmount`'s `isIgstInvoice` for the established rule
    // this mirrors. The VAT amount is expected on `item.igst` (the field is
    // reused); stale cgst/sgst must still be ignored.
    it("treats a VAT invoice the same as IGST, ignoring stale cgst/sgst", () => {
      const html = render(
        basePayload({
          taxName: "VAT",
          taxRate: 5,
          columns,
          items: [
            {
              _id: "1",
              name: "Item",
              quantity: 1,
              rate: 1200,
              amount: 1200,
              igst: 60,
              cgst: 108, // stale — must not be added on top of the VAT amount
              sgst: 108, // stale — must not be added on top of the VAT amount
            },
          ],
        })
      );

      const cells = bodyCells(html);
      expect(cells).toContain("₹1,260");
    });
  });

  describe("tax summary", () => {
    it("is hidden when the view is on but there are no tax rows", () => {
      const html = render(
        basePayload({ advanceOptions: { taxSummaryView: "BOTH" } })
      );

      expect(html).not.toContain("Tax Details");
    });

    it("renders when the view is on and rows exist", () => {
      const html = render(
        basePayload({
          advanceOptions: { taxSummaryView: "BOTH" },
          taxSummary: {
            taxList: [{ rate: 18, taxableAmount: 100, totalTax: 18 }],
          },
        })
      );

      expect(html).toContain("Tax Details");
    });

    it("stays hidden when the view is off even with rows present", () => {
      const html = render(
        basePayload({
          advanceOptions: { taxSummaryView: "NONE" },
          taxSummary: {
            taxList: [{ rate: 18, taxableAmount: 100, totalTax: 18 }],
          },
        })
      );

      expect(html).not.toContain("Tax Details");
    });
  });
});

describe("custom columns", () => {
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
    items: [
      {
        _id: "1",
        name: "Elliptical Cross Trainer",
        quantity: 1,
        rate: 100,
        amount: 100,
      },
    ],
    columns: [systemColumn("name", "Item"), systemColumn("rate", "Rate")],
    ...extra,
  });

  const headerLabels = (html: string) => {
    const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
    return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(([, text]) =>
      text.trim()
    );
  };

  const customCells = (html: string) =>
    [
      ...html.matchAll(
        /<td class="text-center fk-custom-cell[^"]*">([\s\S]*?)<\/td>/g
      ),
    ].map(([, text]) => text.trim());

  // Cells whose value came out numeric are marked so they never wrap mid-number.
  const nowrapCells = (html: string) =>
    [
      ...html.matchAll(
        /<td class="text-center fk-custom-cell( fk-nowrap)?">([\s\S]*?)<\/td>/g
      ),
    ]
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
    (/<colgroup>([\s\S]*?)<\/colgroup>/.exec(html)?.[1].match(/<col /g) ?? [])
      .length;

  describe("user-defined item columns", () => {
    const withCustom = (columns: unknown[], items?: unknown[]) =>
      basePayload({
        columns: [
          systemColumn("name", "Item"),
          ...columns,
          systemColumn("rate", "Rate"),
        ],
        ...(items ? { items } : {}),
      });

    it("renders a custom column directly after the item name and photo", () => {
      const html = render(
        withCustom(
          [{ key: "warranty", label: "Warranty", dataType: "text" }],
          [
            {
              _id: "1",
              name: "Trainer",
              quantity: 1,
              rate: 100,
              amount: 100,
              custom: { warranty: "2 yrs" },
            },
          ]
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

      expect(headerLabels(html).slice(1)).toEqual([
        "Item",
        "Warranty",
        "Model No",
        "Total",
      ]);
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
            {
              key: "installation",
              label: "Installation",
              dataType: "currency",
            },
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
        "₹1,500",
        "",
        "",
        "₹200",
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
            {
              key: "installCost",
              label: "Install Cost",
              fxReturnType: "currency",
            },
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

      expect(customCells(html)).toEqual(["20,13,20,21,562", "₹500"]);
    });

    // A column the account configured but never filled in on any item — a
    // header over an empty strip — is dropped rather than printed blank.
    it("hides a custom column with no value on any item", () => {
      const html = render(
        withCustom(
          [{ key: "code", label: "Code" }],
          [
            { _id: "1", name: "Trainer", quantity: 1, rate: 100, amount: 100 },
            {
              _id: "2",
              name: "Trainer 2",
              quantity: 1,
              rate: 200,
              amount: 200,
              custom: { code: "" },
            },
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
            {
              _id: "2",
              name: "Trainer 2",
              quantity: 1,
              rate: 200,
              amount: 200,
              custom: { code: "C-2" },
            },
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
              custom: {
                grandTotalField: "20,13,20,21,562",
                note: "Some long remark",
              },
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
});

describe("description placement", () => {
  const basePayload = () => ({
    invoiceTitle: "Quotation",
    invoiceNumber: "Q-1",
    items: [
      {
        _id: "1",
        name: "INCLINE CHEST PRESS",
        description: "* Dim (LxWxH): 1540 x 1030 x 1685 mm",
        quantity: 1,
        rate: 1,
        amount: 1,
        sku: "Y915Z",
      },
    ],
  });

  const isFullWidth = (html: string) => html.includes("fk-desc-fullwidth-row");
  const isUnderTitle = (html: string) => html.includes("fk-item-desc");

  it("defaults to below the line item title when the flag is absent", () => {
    const html = render(basePayload());

    expect(isUnderTitle(html)).toBe(true);
    expect(isFullWidth(html)).toBe(false);
  });

  it("moves the description to a full-width row when the flag is true", () => {
    const html = render({
      ...basePayload(),
      advanceOptions: { showDescriptionFullWidth: true },
    });

    expect(isFullWidth(html)).toBe(true);
    expect(isUnderTitle(html)).toBe(false);
  });

  it("keeps it below the title when the flag is false", () => {
    const html = render({
      ...basePayload(),
      advanceOptions: { showDescriptionFullWidth: false },
    });

    expect(isUnderTitle(html)).toBe(true);
    expect(isFullWidth(html)).toBe(false);
  });

  it('treats the string "false" as false rather than a truthy string', () => {
    const html = render({
      ...basePayload(),
      advanceOptions: { showDescriptionFullWidth: "false" },
    });

    expect(isUnderTitle(html)).toBe(true);
    expect(isFullWidth(html)).toBe(false);
  });

  it("still honours the legacy isDescriptionFullWidth flag", () => {
    const html = render({
      ...basePayload(),
      isDescriptionFullWidth: true,
    });

    expect(isFullWidth(html)).toBe(true);
  });

  it("lets the current flag name win over the legacy one", () => {
    const html = render({
      ...basePayload(),
      advanceOptions: {
        showDescriptionFullWidth: false,
        isDescriptionFullWidth: true,
      },
    });

    expect(isUnderTitle(html)).toBe(true);
    expect(isFullWidth(html)).toBe(false);
  });
});

describe("party custom fields", () => {
  const basePayload = (extra: Record<string, unknown> = {}) => ({
    invoiceTitle: "Quotation",
    invoiceNumber: "A00004",
    items: [
      {
        _id: "1",
        name: "Elliptical Cross Trainer",
        quantity: 1,
        rate: 100,
        amount: 100,
      },
    ],
    ...extra,
  });

  // The rows the party blocks emit for operator-defined fields, as label/value.
  // Whitespace between attributes is insignificant HTML — the formatter is free
  // to wrap `template.hbs` however it likes — so the regex tolerates it rather
  // than pinning an exact line layout.
  const customRows = (html: string) =>
    [
      ...html.matchAll(
        /<div class="fk-info-kv fk-info-kv-custom"><span class="fk-kv-key">([^<]*):<\/span><span\s+class="fk-kv-val">([^<]*)<\/span><\/div>/g
      ),
    ].map(([, label, value]) => `${label}=${value}`);

  it("renders custom fields on every party block", () => {
    const html = render(
      basePayload({
        billedBy: {
          name: "Fitking",
          customFields: [{ label: "Client ID", value: "C-1" }],
        },
        billedTo: {
          name: "Buyer",
          customFields: [{ label: "Buyer Code", value: "B-2" }],
        },
        shippedFrom: {
          name: "Warehouse",
          customFields: [{ label: "Dock", value: "D-3" }],
        },
        shippedTo: {
          name: "Site",
          customFields: [{ label: "Site Ref", value: "S-4" }],
        },
      })
    );

    expect(customRows(html)).toEqual([
      "Client ID=C-1",
      "Buyer Code=B-2",
      "Dock=D-3",
      "Site Ref=S-4",
    ]);
  });

  it("reads all three field buckets a party can carry", () => {
    const html = render(
      basePayload({
        billedTo: {
          name: "Buyer",
          customFields: [{ label: "Client ID", value: "C-1" }],
          additionalIds: [{ label: "CIN", value: "U74999" }],
          customHeaders: [{ label: "Region", value: "West" }],
        },
      })
    );

    expect(customRows(html)).toEqual([
      "Client ID=C-1",
      "CIN=U74999",
      "Region=West",
    ]);
  });

  // showInInvoice is absent far more often than it is false, so it has to be
  // opt-out — treating it as opt-in would hide most real rows.
  it("hides a field only when showInInvoice is explicitly false", () => {
    const html = render(
      basePayload({
        billedTo: {
          name: "Buyer",
          customFields: [
            { label: "Shown", value: "yes", params: { showInInvoice: true } },
            { label: "Default", value: "yes" },
            {
              label: "Hidden",
              value: "no",
              params: { showInInvoice: false },
            },
          ],
          additionalIds: [
            { label: "HiddenId", value: "x", showInInvoice: false },
          ],
        },
      })
    );

    expect(customRows(html)).toEqual(["Shown=yes", "Default=yes"]);
  });

  it("skips empty values and values with no single-line form", () => {
    const html = render(
      basePayload({
        billedTo: {
          name: "Buyer",
          customFields: [
            { label: "Blank", value: "" },
            { label: "Missing", value: null },
            { label: "Nested", value: { deep: "object" } },
            { label: "", value: "unlabelled" },
            { label: "Count", value: 0 },
            { label: "Tags", value: ["a", "b"] },
          ],
        },
      })
    );

    expect(customRows(html)).toEqual(["Count=0", "Tags=a, b"]);
  });

  it("renders nothing when a party has no custom fields", () => {
    const html = render(basePayload({ billedTo: { name: "Buyer" } }));

    expect(customRows(html)).toEqual([]);
  });
});

describe("QR rendering", () => {
  const basePayload = () => ({
    invoiceTitle: "Invoice",
    invoiceNumber: "INV-1",
    items: [{ _id: "1", name: "Treadmill", quantity: 1, rate: 1, amount: 1 }],
    paymentOptions: { upi: true, accountTransfer: true },
    bankAccount: { accountNo: "32473093270", ifsc: "HDFC0000133" },
  });

  const srcOf = (html: string, className: string): string | null => {
    const match = new RegExp(
      `<img[^>]*src="([^"]*)"[^>]*class="${className}"`
    ).exec(html);
    return match ? match[1] : null;
  };

  describe("UPI QR", () => {
    it("renders a scannable image when the payload only supplies a VPA", () => {
      // The normaliser turns a bare VPA into a `upi://pay?pa=…` intent, which an
      // <img> cannot load — it has to be encoded before it reaches the document.
      const html = render({
        ...basePayload(),
        upi: { vpa: "someone@oksbi" },
      });

      const src = srcOf(html, "fk-upi-qr");
      expect(src).toMatch(/^data:image\/gif;base64,/);
      expect(html).not.toContain('src="upi://');
      expect(html).toContain("Scan to pay via UPI");
    });

    it("uses the supplied QR image when the payload has one", () => {
      const html = render({
        ...basePayload(),
        upi: { vpa: "someone@oksbi", qr: "https://cdn.example.com/upi.png" },
      });

      expect(srcOf(html, "fk-upi-qr")).toBe("https://cdn.example.com/upi.png");
    });

    it("falls back to labelled text when there is nothing to encode", () => {
      const html = render({
        ...basePayload(),
        upi: { vpa: "someone@oksbi" },
        // Force the encode to fail by making the intent exceed QR capacity.
        bankAccount: { accountNo: "1", qrCode: "z".repeat(5000) },
      });

      expect(html).not.toContain('fk-upi-qr"');
      // Whitespace between the literal "UPI:" and the id is insignificant HTML
      // (the formatter is free to wrap template.hbs across lines here), so this
      // matches on content rather than an exact run of spaces.
      expect(html).toMatch(/UPI:\s*someone@oksbi/);
    });

    it("omits the whole block when UPI is not an enabled payment option", () => {
      const html = render({
        ...basePayload(),
        paymentOptions: { upi: false, accountTransfer: true },
        upi: { vpa: "someone@oksbi" },
      });

      expect(html).not.toContain("fk-upi-qr-block");
    });
  });

  describe("document QR", () => {
    it("encodes a raw e-invoice payload instead of emitting a broken image", () => {
      const html = render({
        ...basePayload(),
        irn: { qrCode: "eyJEYXRhIjoiMS4xIiwiSXJuIjoiYWJjMTIzIn0=" },
      });

      expect(srcOf(html, "fk-qr-img")).toMatch(/^data:image\/gif;base64,/);
      expect(html).toContain("Document QR");
    });

    it("passes a hosted QR image through untouched", () => {
      const html = render({
        ...basePayload(),
        documentQr: "https://cdn.example.com/doc.png",
      });

      expect(srcOf(html, "fk-qr-img")).toBe("https://cdn.example.com/doc.png");
    });

    it("hides the block when the payload carries placeholder strings", () => {
      const html = render({ ...basePayload(), documentQr: "undefined" });

      expect(html).not.toContain("Document QR");
    });

    it("hides the block when there is no document QR at all", () => {
      const html = render(basePayload());

      expect(html).not.toContain("Document QR");
    });
  });
});

describe("summary visibility", () => {
  const base = {
    invoiceTitle: "Invoice",
    invoiceNumber: "0023",
    items: [{ _id: "1", name: "Chair", quantity: 1, rate: 10, amount: 10 }],
  };

  const taxRows = { taxList: [{ rate: 18, taxableAmount: 100, totalTax: 18 }] };
  const hsnRows = {
    hsnList: [{ hsn: "9403", taxableAmount: 100, totalTax: 18 }],
  };
  const payments = [
    { _id: "p1", amount: 50, mode: "UPI", referenceNumber: "R1" },
  ];

  const renderWithBase = (payload: Record<string, unknown>) =>
    template(normalizeInvoiceTemplateState({ ...base, ...payload } as any));

  const shows = (html: string, heading: string) => html.includes(heading);

  // Each table needs an opt-in from configuration AND rows. Configuration alone
  // renders a bare header strip; rows alone renders a table the user hid.
  describe("Tax Details visibility", () => {
    const on = { advanceOptions: { taxSummaryView: "BOTH" } };
    const off = { advanceOptions: { taxSummaryView: "NONE" } };

    it("shows when configured on and rows exist", () => {
      expect(
        shows(renderWithBase({ ...on, taxSummary: taxRows }), "Tax Details")
      ).toBe(true);
    });

    it("hides when configured on but there are no rows", () => {
      expect(shows(renderWithBase(on), "Tax Details")).toBe(false);
    });

    it("hides when configured off even though rows exist", () => {
      expect(
        shows(renderWithBase({ ...off, taxSummary: taxRows }), "Tax Details")
      ).toBe(false);
    });

    it("hides when the view setting is absent", () => {
      expect(
        shows(renderWithBase({ taxSummary: taxRows }), "Tax Details")
      ).toBe(false);
    });

    it("also accepts the TABLE view setting", () => {
      const html = renderWithBase({
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
      expect(
        shows(renderWithBase({ ...on, hsnSummary: hsnRows }), "HSN Summary")
      ).toBe(true);
    });

    it("hides when configured on but there are no rows", () => {
      expect(shows(renderWithBase(on), "HSN Summary")).toBe(false);
    });

    it("hides when configured off even though rows exist", () => {
      expect(
        shows(renderWithBase({ ...off, hsnSummary: hsnRows }), "HSN Summary")
      ).toBe(false);
    });

    it("hides when the flag is absent", () => {
      expect(
        shows(renderWithBase({ hsnSummary: hsnRows }), "HSN Summary")
      ).toBe(false);
    });

    it('treats the string "false" as off', () => {
      const html = renderWithBase({
        advanceOptions: { showHSNSummaryInInvoice: "false" },
        hsnSummary: hsnRows,
      });

      expect(shows(html, "HSN Summary")).toBe(false);
    });
  });

  describe("Payments History visibility", () => {
    it("shows when configured on and payments exist", () => {
      const html = renderWithBase({
        showPaymentsTable: true,
        allPayments: payments,
      });

      expect(shows(html, "Payments History")).toBe(true);
    });

    it("hides when configured on but there are no payments", () => {
      expect(
        shows(renderWithBase({ showPaymentsTable: true }), "Payments History")
      ).toBe(false);
    });

    it("hides when configured off even though payments exist", () => {
      const html = renderWithBase({
        showPaymentsTable: false,
        allPayments: payments,
      });

      expect(shows(html, "Payments History")).toBe(false);
    });

    it("hides when the flag is absent", () => {
      expect(
        shows(renderWithBase({ allPayments: payments }), "Payments History")
      ).toBe(false);
    });
  });
});
