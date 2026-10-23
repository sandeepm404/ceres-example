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
    // Real payloads always declare their columns; the widget prints none
    // it was not given.
    columns: [
      { key: "name", label: "Item" },
      { key: "quantity", label: "Qty" },
      { key: "rate", label: "Rate" },
      { key: "discount", label: "Discount" },
      { key: "amount", label: "Amount" },
    ],
    advanceOptions: { isDescriptionFullWidth: true },
    ...extra,
  });

  const bodyText = (html: string) =>
    (/<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  it("renders through the shared LineItemsTable widget", () => {
    const html = render(basePayload());

    expect(html).toContain('class="fk-items"');
    expect(html).toContain("line-items-table");
    expect(html).not.toContain("fk-item-table");
    expect(bodyText(html)).toContain("Aerofit Elliptical Cross Trainer");
  });

  describe("discount cells", () => {
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
      /<td class="col-discount"[^>]*>([\s\S]*?)<\/td>/
        .exec(html)?.[1]
        ?.trim() ?? "";

    it("prints a percentage discount as a rate", () => {
      const html = render(
        discounted({ discountType: "PERCENTAGE", amount: 10 })
      );

      expect(discountCell(html)).toContain("10%");
    });

    it("prints a flat discount as money", () => {
      const html = render(
        discounted({ discountType: "FIXED_AMOUNT", amount: 16370 })
      );

      expect(discountCell(html)).toContain("16,370");
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

describe("photo column", () => {
  const item = (extra: Record<string, unknown> = {}) => ({
    _id: "1",
    name: "Incline Chest Press",
    description: "Dim: 1540 x 1030 x 1685 mm",
    quantity: 1,
    rate: 100,
    amount: 100,
    ...extra,
  });
  const payload = (items: unknown[]) => ({
    invoiceTitle: "Quotation",
    invoiceNumber: "Q-1",
    columns: [
      { key: "name", label: "Item" },
      { key: "rate", label: "Rate" },
      { key: "amount", label: "Amount" },
    ],
    items,
  });

  const headerClasses = (html: string) =>
    [
      ...(/<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "").matchAll(
        /<th class="([^"]*)"/g
      ),
    ].map(([, cls]) => cls);
  const firstRowClasses = (html: string) =>
    [
      ...(
        /<tr class="row-even">([\s\S]*?)<\/tr>/.exec(html)?.[1] ?? ""
      ).matchAll(/<td class="([^"]*)"/g),
    ].map(([, cls]) => cls);
  const photoCells = (html: string) =>
    [...html.matchAll(/<td class="col-photo"[^>]*>([\s\S]*?)<\/td>/g)].map(
      ([, inner]) => inner.trim()
    );

  it("prints the first image in its own column right after the item", () => {
    const html = render(
      payload([item({ images: ["https://cdn/a.png", "https://cdn/b.png"] })])
    );

    expect(headerClasses(html)).toEqual([
      "col-index",
      "col-item",
      "col-photo",
      "col-rate",
      "col-amount",
    ]);
    expect(firstRowClasses(html)).toEqual([
      "col-index",
      "col-item",
      "col-photo",
      "col-rate",
      "col-amount",
    ]);
    expect(photoCells(html)).toEqual([
      '<img src="https://cdn/a.png" alt="Incline Chest Press" class="fk-product-img" />',
    ]);
    expect(html).not.toContain("https://cdn/b.png");
  });

  it("adds no column when no item has an image", () => {
    const html = render(payload([item()]));

    expect(headerClasses(html)).not.toContain("col-photo");
    expect(html).not.toContain("fk-product-img");
  });

  it("leaves the cell blank for an item without an image", () => {
    const html = render(
      payload([item({ images: ["https://cdn/a.png"] }), item({ _id: "2" })])
    );

    expect(photoCells(html)).toEqual([
      '<img src="https://cdn/a.png" alt="Incline Chest Press" class="fk-product-img" />',
      "",
    ]);
  });

  it("unwraps image objects and never uses the full-size originals", () => {
    const html = render(
      payload([
        item({
          images: [{ url: "https://cdn/thumb.png" }],
          originalImages: ["https://cdn/original.png"],
        }),
      ])
    );

    expect(photoCells(html)[0]).toContain('src="https://cdn/thumb.png"');
    expect(photoCells(html)[0]).not.toContain("original.png");
  });

  it("does not print the photo a second time under the line", () => {
    const html = render(payload([item({ images: ["https://cdn/a.png"] })]));

    expect(html).not.toContain("item-images-inline");
    expect(html).toContain("Dim: 1540 x 1030 x 1685 mm");
  });

  it("escapes the image URL and the alt text", () => {
    const html = render(
      payload([
        item({
          name: 'Bench "Pro"',
          images: ['https://cdn/a.png" onerror="x'],
        }),
      ])
    );

    expect(photoCells(html)[0]).toContain("&quot;");
    expect(photoCells(html)[0]).not.toContain('onerror="x"');
  });
});

describe("item descriptions", () => {
  const payload = (description: string) => ({
    invoiceTitle: "Quotation",
    invoiceNumber: "Q-1",
    columns: [
      { key: "name", label: "Item" },
      { key: "amount", label: "Amount" },
    ],
    items: [{ _id: "1", name: "Seated Bench", amount: 1, description }],
  });

  it("prints a multi-line description in full", () => {
    const html = render(
      payload("• Dim: 1220 × 760 × 800 mm<br>• Machine Weight: 23 kg.")
    );

    expect(html).toContain(
      "<span>• Dim: 1220 × 760 × 800 mm<br>• Machine Weight: 23 kg.</span>"
    );
  });

  it("drops trailing blank lines but keeps the breaks inside the text", () => {
    const html = render(payload("Line one<br>Line two<br><br> \n"));

    expect(html).toContain("<span>Line one<br>Line two</span>");
  });

  it("prints no description row when the description is only blank lines", () => {
    const html = render(payload("<br><br>"));

    expect(html).not.toContain("item-extras-row");
  });
});

describe("column widths", () => {
  const payload = {
    invoiceTitle: "Quotation",
    invoiceNumber: "Q-1",
    columns: [
      { key: "name", label: "Item" },
      {
        key: "inv_sku",
        label: "Model No.",
        dataType: "text",
        fxReturnType: "number",
      },
      { key: "rate", label: "Rate" },
      { key: "amount", label: "Amount" },
    ],
    items: [
      {
        _id: "1",
        name: "Treadmill",
        rate: 257800,
        amount: 257800,
        custom: { inv_sku: "W900M" },
      },
    ],
  };
  const widths = (html: string) =>
    Object.fromEntries(
      [...html.matchAll(/th\.([\w-]+) \{ width: ([\d.]+)%; \}/g)].map(
        ([, cls, pct]) => [cls, Number(pct)]
      )
    );

  it("sizes every column but the item, which takes the rest", () => {
    const sized = widths(render(payload));

    expect(Object.keys(sized)).toEqual([
      "col-index",
      "col-inv_sku",
      "col-rate",
      "col-amount",
    ]);
    const total = Object.values(sized).reduce((sum, pct) => sum + pct, 0);
    expect(total).toBeLessThanOrEqual(74);
  });

  it("treats an account's text column as text whatever its declared type", () => {
    const sized = widths(render(payload));

    // Text floor (70px), not the money floor (90px), of the 950px nominal.
    expect(sized["col-inv_sku"]).toBeCloseTo((70 / 950) * 100, 2);
  });
});

describe("description placement", () => {
  const basePayload = () => ({
    invoiceTitle: "Quotation",
    invoiceNumber: "Q-1",
    columns: [
      { key: "name", label: "Item" },
      { key: "amount", label: "Amount" },
    ],
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

  // Full width keeps the widget's own row under the item; otherwise the
  // description prints in the item cell, under the name.
  const itemCell = (html: string) =>
    /<td class="col-item"[^>]*>([\s\S]*?)<\/td>/.exec(html)?.[1] ?? "";
  const isFullWidth = (html: string) => html.includes("item-description-full");
  const isUnderTitle = (html: string) =>
    itemCell(html).includes('class="item-description"') &&
    !html.includes("item-extras-row");

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
