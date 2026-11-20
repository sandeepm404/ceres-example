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

  describe("discount cells", () => {
    // The line discount is an object, so the cell has to read
    // `discount.amount` and print it per `discountType` — an earlier version
    // bound a `discountLabel` field the payload never sends, which left every
    // cell of a visible Discount column blank.
    const discounted = (discount: Record<string, unknown>) =>
      basePayload({
        items: [
          {
            _id: "1",
            name: "Aerofit Elliptical Cross Trainer",
            quantity: 1,
            rate: 163700,
            amount: 147330,
            discount,
          },
        ],
        finalTotal: { discount: 16370, total: 147330 },
      });

    const discountCell = (html: string) =>
      /<td class="text-center fk-disc-cell">([\s\S]*?)<\/td>/
        .exec(html)?.[1]
        ?.trim() ?? "";

    it("prints a percentage discount as a rate", () => {
      const html = render(
        discounted({ discountType: "PERCENTAGE", amount: 10 })
      );

      expect(discountCell(html)).toBe("10%");
    });

    it("prints a flat discount as money", () => {
      const html = render(discounted({ discountType: "FLAT", amount: 16370 }));

      expect(discountCell(html)).toContain("16,370");
    });

    it("leaves an undiscounted row blank rather than printing 0%", () => {
      const html = render(
        discounted({ discountType: "PERCENTAGE", amount: 0 })
      );

      expect(discountCell(html)).toBe("");
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
    // IGST — the same rule normalizeInvoiceTemplateState uses for
    // showIgst/showCgstSgst. The VAT amount is expected on `item.igst` (the field is
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

describe("signature block", () => {
  // `customLabels.signature` ships as the default "Authorised Signatory" on
  // documents that carry no signature at all, so it cannot be what opens the
  // block — only an actual image can. The label is subordinate to the image.
  const base = {
    invoiceTitle: "Quotation",
    invoiceNumber: "A00017",
    items: [
      {
        _id: "1",
        name: "Treadmill",
        quantity: 1,
        rate: 196000,
        amount: 196000,
      },
    ],
  };

  const renderWith = (payload: Record<string, unknown>) =>
    template(normalizeInvoiceTemplateState({ ...base, ...payload } as any));

  const hasBox = (html: string) => html.includes("fk-signature-container");
  const hasLabel = (html: string) => html.includes("fk-sig-label");

  it("prints nothing when the document carries no signature", () => {
    const html = renderWith({});

    expect(hasBox(html)).toBe(false);
    expect(hasLabel(html)).toBe(false);
  });

  it("prints nothing when only the default label is present", () => {
    const html = renderWith({
      signature: null,
      customLabels: { signature: "Authorised Signatory" },
    });

    expect(hasBox(html)).toBe(false);
    expect(html).not.toContain("Authorised Signatory");
  });

  it("prints the box and label when a signature image exists", () => {
    const html = renderWith({
      signature: "https://example.com/sign.png",
      customLabels: { signature: "Authorised Signatory" },
    });

    expect(hasBox(html)).toBe(true);
    expect(html).toContain("https://example.com/sign.png");
    expect(html).toContain("Authorised Signatory");
  });

  it("prints the image without a label when the account left the label empty", () => {
    const html = renderWith({
      signature: "https://example.com/sign.png",
      customLabels: { signature: "" },
    });

    expect(hasBox(html)).toBe(true);
    expect(hasLabel(html)).toBe(false);
  });

  it("still falls back to the billedBy signature spelling", () => {
    const html = renderWith({
      billedBy: { name: "Acme", signature: "https://example.com/bb.png" },
    });

    expect(hasBox(html)).toBe(true);
    expect(html).toContain("https://example.com/bb.png");
  });
});

describe("totals visibility", () => {
  // "Show Totals" and "Show Total in Words" in the document settings arrive as
  // the top-level opt-outs `hideTotals` / `hideTotalInWords`. The Subtotal
  // widget keeps every row in the DOM and hides it with a class per reason, so
  // Lydia can flip either setting live without a re-render.
  const base = {
    invoiceTitle: "Quotation",
    invoiceNumber: "A00017",
    items: [
      {
        _id: "1",
        name: "Treadmill",
        quantity: 1,
        rate: 196000,
        amount: 196000,
      },
    ],
    finalTotal: { subTotal: 196000, cgst: 34803, sgst: 34803, total: 456306 },
    customLabels: { totalInWordsValue: "Four Lakh Fifty Six Thousand Only" },
  };

  const renderWith = (payload: Record<string, unknown>) =>
    template(normalizeInvoiceTemplateState({ ...base, ...payload } as any));

  const rowClass = (html: string, key: string) => {
    const match = html.match(
      new RegExp(`class="([^"]*)"\\s*data-ceres-subtotal-row="${key}"`)
    );
    return match ? match[1] : null;
  };
  const wordsClass = (html: string) => {
    const match = html.match(/class="([^"]*)"\s*data-ceres-total-in-words/);
    return match ? match[1] : null;
  };

  it("renders totals through the shared Subtotal widget", () => {
    const html = renderWith({});

    expect(html).toContain("data-ceres-subtotal");
    expect(html).not.toContain("fk-totals-table");
    expect(rowClass(html, "total")).toContain("ceres-subtotal-row-grand");
  });

  const taxed = (tax: Record<string, number>) => ({
    invoiceType: "INVOICE",
    taxType: "INDIA",
    taxName: "GST",
    isIgst: Boolean(tax.igst),
    items: [
      {
        _id: "1",
        name: "Treadmill",
        quantity: 1,
        rate: 196000,
        amount: 196000,
        total: 196000,
        gstRate: 18,
        ...tax,
      },
    ],
    finalTotal: { subTotal: 196000, amount: 196000, ...tax, total: 231280 },
  });

  it("prints the rate beside the CGST and SGST rows", () => {
    const html = renderWith(taxed({ cgst: 17640, sgst: 17640 }));

    expect(html).toMatch(/CGST \(9%\)/);
    expect(html).toMatch(/SGST \(9%\)/);
  });

  it("prints the rate beside the IGST row", () => {
    const html = renderWith(taxed({ igst: 35280 }));

    expect(html).toMatch(/IGST \(18%\)/);
  });

  it("prints the totals breakdown when the flag is absent", () => {
    expect(rowClass(renderWith({}), "total")).not.toContain(
      "is-hidden-by-totals"
    );
  });

  it("hides the totals breakdown when hideTotals is set", () => {
    expect(rowClass(renderWith({ hideTotals: true }), "total")).toContain(
      "is-hidden-by-totals"
    );
  });

  it("keeps the totals breakdown when hideTotals is explicitly false", () => {
    expect(rowClass(renderWith({ hideTotals: false }), "total")).not.toContain(
      "is-hidden-by-totals"
    );
  });

  it("prints the total in words when the flag is absent", () => {
    const html = renderWith({});

    expect(html).toContain("Four Lakh Fifty Six Thousand Only");
    expect(wordsClass(html)).not.toContain("is-hidden-by-words-setting");
  });

  it("hides the total in words when hideTotalInWords is set", () => {
    expect(wordsClass(renderWith({ hideTotalInWords: true }))).toContain(
      "is-hidden-by-words-setting"
    );
  });

  it("hides the words without hiding the totals", () => {
    const html = renderWith({ hideTotalInWords: true });

    expect(rowClass(html, "total")).not.toContain("is-hidden-by-totals");
    expect(wordsClass(html)).toContain("is-hidden-by-words-setting");
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

describe("contact details", () => {
  const base = {
    invoiceTitle: "Invoice",
    invoiceNumber: "0023",
    items: [{ _id: "1", name: "Chair", quantity: 1, rate: 10, amount: 10 }],
  };
  const contactLine = (payload: Record<string, unknown>) => {
    const html = render({ ...base, ...payload });
    const match = html.match(/<p class="fk-contact-line">([\s\S]*?)<\/p>/);
    return match
      ? match[1]
          .replace(/<[^>]+>/g, "")
          .replace(/[\u2066-\u2069]/g, "")
          .replace(/\s+/g, " ")
          .trim()
      : null;
  };

  it("prints the email and phone from invoice.contact", () => {
    expect(
      contactLine({
        contact: { email: "hi@fitking.in", phone: "+919999988888" },
      })
    ).toBe(
      "For any enquiry, reach out via email at hi@fitking.in, call on +91 99999 88888"
    );
  });

  it("prints only the email when there is no phone", () => {
    expect(contactLine({ contact: { email: "hi@fitking.in" } })).toBe(
      "For any enquiry, reach out via email at hi@fitking.in"
    );
  });

  it("prints only the phone when there is no email", () => {
    expect(contactLine({ contact: { phone: "+919999988888" } })).toBe(
      "For any enquiry, reach out via call on +91 99999 88888"
    );
  });

  it("uses the business's own labels", () => {
    expect(
      contactLine({
        contact: { email: "hi@fitking.in" },
        customLabels: {
          contact: "Questions? Reach us by",
          contactEmail: "mail at",
        },
      })
    ).toBe("Questions? Reach us by mail at hi@fitking.in");
  });

  it("is absent without an email or phone", () => {
    expect(contactLine({})).toBeNull();
    expect(contactLine({ contact: { email: "", phone: "" } })).toBeNull();
  });
});

describe("missing blocks and ignored switches", () => {
  const base = {
    invoiceTitle: "Invoice",
    invoiceNumber: "0023",
    items: [{ _id: "1", name: "Chair", quantity: 1, rate: 10, amount: 10 }],
  };
  const html = (payload: Record<string, unknown>) =>
    render({ ...base, ...payload });
  const textOf = (markup: string) =>
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/[⁦-⁩]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const rowsOf = (markup: string, testId: string) =>
    [
      ...markup.matchAll(
        new RegExp(
          `data-testid="${testId}"[^>]*>([\\s\\S]*?)</(?:div|tr)>`,
          "g"
        )
      ),
    ].map((match) => textOf(match[1]));

  describe("letterhead and footer", () => {
    const letterheadClass = (markup: string, slot: string) =>
      markup.match(new RegExp(`class="([^"]*)invoice-${slot}[" ]`))?.[1] ?? "";

    it("leave both to the PDF service by default", () => {
      const markup = html({});
      expect(letterheadClass(markup, "letterhead")).toContain("no-dibella");
      expect(letterheadClass(markup, "letterhead-footer")).toContain(
        "no-dibella"
      );
    });

    it("print them in the page when shown only on the first / last page", () => {
      const markup = html({
        pdfOptions: { letterHeadOnFirstPage: true, footerOnLastPage: true },
      });
      expect(letterheadClass(markup, "letterhead")).not.toContain("no-dibella");
      expect(letterheadClass(markup, "letterhead-footer")).not.toContain(
        "no-dibella"
      );
    });
  });

  describe("party phone and email", () => {
    const party = { name: "Acme", phone: "+919999988888", email: "a@acme.in" };

    it("print by default", () => {
      const text = textOf(html({ billedTo: party }));
      expect(text).toContain("a@acme.in");
      expect(text).toContain("+91 99999 88888");
    });

    it("hide when switched off for the document", () => {
      const text = textOf(
        html({
          billedTo: {
            ...party,
            phoneShowInInvoice: false,
            emailShowInInvoice: "false",
          },
        })
      );
      expect(text).not.toContain("a@acme.in");
      expect(text).not.toContain("+91 99999 88888");
    });
  });

  describe("party tax numbers", () => {
    it("print PAN for Billed To too", () => {
      expect(
        rowsOf(
          html({
            billedTo: { name: "Acme", country: "IN", panNumber: "AAAPA1234A" },
          }),
          "tax-id"
        )
      ).toEqual(["PAN: AAAPA1234A"]);
    });

    it("hide GSTIN and PAN when the business switches them off", () => {
      const rows = rowsOf(
        html({
          owner: {
            configuration: {
              experimental: {
                fieldVisibility: { gst: { showInDocument: false } },
              },
            },
          },
          billedBy: {
            name: "Us",
            gstin: "29AAAAA0000A1Z5",
            panNumber: "AAAAA0000A",
          },
        }),
        "tax-id"
      );
      expect(rows).toEqual(["PAN: AAAAA0000A"]);
    });

    it("print a foreign party's VAT, TIN, SST and Tax ID, not its GSTIN", () => {
      const rows = rowsOf(
        html({
          billedTo: {
            name: "Gulf Co",
            country: "AE",
            gstin: "29AAAAA0000A1Z5",
            vatNumber: "100200300400500",
            trnNumber: "TRN-1",
            tinNumber: "TIN-1",
            sstNumber: "SST-1",
            taxId: "TX-1",
          },
        }),
        "tax-id"
      );
      expect(rows).toEqual([
        "VAT Number: 100200300400500",
        "TRN: TRN-1",
        "TIN: TIN-1",
        "SST: SST-1",
        "Tax ID: TX-1",
      ]);
    });

    it("never print VAT or TRN for a party in India", () => {
      expect(
        rowsOf(
          html({
            billedTo: {
              name: "Acme",
              country: "IN",
              trnNumber: "TRN-1",
              vatNumber: "V1",
            },
          }),
          "tax-id"
        )
      ).toEqual([]);
    });

    it("hide a foreign tax number its switch turns off", () => {
      expect(
        rowsOf(
          html({
            billedTo: {
              name: "Gulf Co",
              country: "AE",
              vatNumber: "V1",
              vatShowInInvoice: false,
            },
          }),
          "tax-id"
        )
      ).toEqual([]);
    });

    it("use the business's own label", () => {
      expect(
        rowsOf(
          html({
            customLabels: { vat: "VAT Reg. No." },
            billedTo: { name: "Gulf Co", country: "AE", vatNumber: "V1" },
          }),
          "tax-id"
        )
      ).toEqual(["VAT Reg. No.: V1"]);
    });
  });

  describe("contact person", () => {
    it("prints the name, and the email and phone the contact asks for", () => {
      const rows = rowsOf(
        html({
          billedTo: {
            name: "Acme",
            contactPerson: {
              name: "Ravi Kumar",
              email: "ravi@acme.in",
              phone: "+919876543210",
              displayFields: ["name", "email", "phone"],
            },
          },
        }),
        "contact-person"
      );
      expect(rows).toEqual([
        "Contact Person: Ravi Kumar",
        "Contact Email: ravi@acme.in",
        "Contact Phone: +91 98765 43210",
      ]);
    });

    it("prints only the name when no other fields are asked for", () => {
      expect(
        rowsOf(
          html({
            billedTo: {
              name: "Acme",
              contactPerson: { name: "Ravi Kumar", email: "ravi@acme.in" },
            },
          }),
          "contact-person"
        )
      ).toEqual(["Contact Person: Ravi Kumar"]);
    });

    it("skips the name when a party field already carries it", () => {
      expect(
        rowsOf(
          html({
            billedTo: {
              name: "Acme",
              contactPerson: { name: "Ravi Kumar" },
              customFields: [{ label: "Attn", value: "Ravi Kumar" }],
            },
          }),
          "contact-person"
        )
      ).toEqual([]);
    });
  });

  describe("e-invoice and e-way bill", () => {
    const irn = {
      Irn: "a".repeat(64),
      AckNo: "112510123456789",
      AckDt: "2025-07-30 12:34:00",
      EwbNo: "331009876543",
      EwbDt: "2025-07-30 13:00:00",
      EwbValidTill: "2025-07-31 23:59:00",
    };

    it("prints the IRN, acknowledgement and e-way bill", () => {
      const markup = html({ irn });
      expect(rowsOf(markup, "irn")).toEqual([`IRN: ${irn.Irn}`]);
      expect(rowsOf(markup, "compliance-row")).toEqual([
        "Ack No 112510123456789",
        "IRN Ack Date 2025-07-30 12:34:00",
        "Eway Bill 331009876543",
        "E-Way Bill Date 2025-07-30 13:00:00",
        "Valid Till 2025-07-31 23:59:00",
      ]);
    });

    it("drops the acknowledgement once the IRN is cancelled", () => {
      expect(
        rowsOf(
          html({ irn: { ...irn, CancelDate: "2025-08-01" } }),
          "compliance-row"
        )
      ).toEqual([
        "IRN Cancelled 2025-08-01",
        "Eway Bill 331009876543",
        "E-Way Bill Date 2025-07-30 13:00:00",
        "Valid Till 2025-07-31 23:59:00",
      ]);
    });

    it("hides what the business's e-invoice and e-way settings turn off", () => {
      const markup = html({
        irn,
        owner: { configuration: { einvoice: { irnNumber: false } } },
        ewayConfig: { billDate: false, billValidTillDate: false },
      });
      expect(rowsOf(markup, "irn")).toEqual([]);
      expect(rowsOf(markup, "compliance-row")).toEqual([
        "Ack No 112510123456789",
        "IRN Ack Date 2025-07-30 12:34:00",
        "Eway Bill 331009876543",
      ]);
    });
  });

  describe("details rows", () => {
    it("print a note's linked invoice and reason", () => {
      const markup = html({
        linkedInvoices: [{ _id: "x", invoiceNumber: "INV-7" }, { _id: "y" }],
        documentReason: "Product Return",
      });
      expect(rowsOf(markup, "linked-document")).toEqual([
        "Linked Document INV-7",
      ]);
      expect(rowsOf(markup, "document-reason")).toEqual([
        "Reason Product Return",
      ]);
    });

    it("print the creator only when the document asks for it", () => {
      const creator = { name: "Sandeep" };
      expect(rowsOf(html({ creator }), "created-by")).toEqual([]);
      expect(
        rowsOf(
          html({ creator, advanceOptions: { showCreatorInInvoice: true } }),
          "created-by"
        )
      ).toEqual(["Created By Sandeep"]);
    });
  });

  it("prints the document subtitle", () => {
    expect(html({})).not.toContain('data-testid="subtitle"');
    expect(html({ invoiceSubTitle: "Original for Recipient" })).toContain(
      '<p class="fk-subtitle" data-testid="subtitle">Original for Recipient</p>'
    );
  });

  it("lists the attachments by file name", () => {
    const markup = html({
      attachments: [
        "https://cdn.example.com/files/Spec%20Sheet.pdf?token=abc",
        { url: "https://cdn.example.com/files/drawing.png" },
      ],
    });
    expect(rowsOf(markup, "attachments")).toEqual([
      "Attachments Spec Sheet.pdf drawing.png",
    ]);
  });

  describe("batch summary", () => {
    const batchSummary = [
      {
        itemName: "Chair",
        batchName: "B-01",
        quantity: 4,
        warehouseName: "Main",
        expiryDate: "2027-01-01",
      },
    ];
    const table = (markup: string) => rowsOf(markup, "batch-summary");

    it("prints the document's batches, leaving out empty columns", () => {
      const markup = html({ batchSummary });
      expect(textOf(markup)).toContain(
        "Batch Summary Item Name Batch Name Qty Warehouse Expiry Date Chair B-01 4 Main 2027-01-01"
      );
    });

    it("hides when the setting is explicitly off", () => {
      expect(
        table(
          html({ batchSummary, advanceOptions: { showStockSummary: false } })
        )
      ).toEqual([]);
      expect(
        textOf(
          html({ batchSummary, advanceOptions: { showStockSummary: false } })
        )
      ).not.toContain("Batch Summary");
    });

    it("falls back to the items' batches only when explicitly on", () => {
      const items = [
        {
          _id: "1",
          name: "Chair",
          quantity: 1,
          rate: 10,
          amount: 10,
          batchSummary: [{ batchName: "B-09", quantity: 1 }],
        },
      ];
      expect(textOf(html({ items }))).not.toContain("Batch Summary");
      expect(
        textOf(html({ items, advanceOptions: { showStockSummary: true } }))
      ).toContain("Batch Summary Item Name Batch Name Qty Chair B-09 1");
    });

    it("follows the business's batch columns", () => {
      const markup = html({
        batchSummary,
        stockSummaryConfig: {
          batchSummaryColumns: [
            { key: "batchName", label: "Lot" },
            { key: "quantity", label: "Units" },
            { key: "warehouse", label: "Store", isHidden: true },
          ],
        },
      });
      expect(textOf(markup)).toContain("Batch Summary Lot Units B-01 4");
    });
  });
});
