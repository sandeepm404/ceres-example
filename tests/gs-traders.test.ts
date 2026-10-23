import fs from "node:fs";
import path from "node:path";
import HandlebarsRuntime from "handlebars/runtime";
import fixture from "./fixtures/gs-traders.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/gs-traders/template.hbs";
import {
  bankLines,
  boxValue,
  itemFoot,
  itemRows,
  otherCustomFields,
  partyAddressLines,
  partyFields,
  partyState,
  placeOfSupply,
  plainAmount,
  registerGsTradersTemplateHelpers,
} from "../src/templates/gs-traders/helpers";
import ceresImagePartial from "../src/widgets/image/CeresImage.hbs";
import brandingPartial from "../src/widgets/refrens-branding/RefrensBranding.hbs";
import { computeSubtotalRows } from "../src/widgets/subtotal/utils";
import { qrSrc } from "../src/widgets/qr-code";
import registerFormatCurrencyHelper from "../src/widgets/shared/registerFormatCurrencyHelper";
import registerTaxFlagHelpers from "../src/widgets/shared/registerTaxFlagHelpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * The fixture is the account's own invoice 201 (G S Traders): one item whose
 * gross quantity (100) and void percentage (5%) sit in custom columns, with the
 * built-in quantity as the formula-computed net (95). Intra-state, a buyer with
 * no GSTIN, bank details, no consignee, no transport, hideTotalInWords on.
 *
 * Subtotal's model, CeresImage, RefrensBranding and qrSrc render for real; only
 * partials with no importable logic are stubbed.
 */
beforeAll(() => {
  const HB = HandlebarsRuntime;
  registerGsTradersTemplateHelpers(HB);
  registerFormatCurrencyHelper(HB);
  registerTaxFlagHelpers(HB);

  HB.registerPartial("CeresImage", ceresImagePartial);
  HB.registerPartial("RefrensBranding", brandingPartial);
  HB.registerHelper(
    "computeSubtotalRows",
    (invoice: unknown, options: { hash?: Record<string, unknown> }) =>
      computeSubtotalRows(invoice, {
        columns: options?.hash?.columns,
        businessCurrency: options?.hash?.businessCurrency,
        businessLocale: options?.hash?.businessLocale,
      })
  );
  HB.registerHelper("qrSrc", (v: unknown) => qrSrc(v));
  HB.registerPartial(
    "MarkdownViewer",
    (ctx: any) => `<span>${ctx?.markdown ?? ""}</span>`
  );
  HB.registerHelper("prepareMarkdownViewerData", (v: unknown) => ({
    markdown: v,
  }));
  HB.registerHelper("formatPhoneNumber", (v: unknown) => String(v ?? ""));
  ["formateShortDateWithOffset", "formatDateInTimeZone"].forEach((name) =>
    HB.registerHelper(name, (v: unknown) => String(v ?? ""))
  );
  HB.registerPartial("TaxSummaryTable", () => "<div>TAX-SUMMARY</div>");
  HB.registerPartial("HsnSummaryTable", () => "<div>HSN-SUMMARY</div>");
  HB.registerPartial("PaymentTable", () => "<div>PAYMENT-TABLE</div>");
  HB.registerHelper("computeTaxSummary", () => ({}));
  HB.registerHelper("computeHsnSummary", () => ({}));
  HB.registerHelper("computePaymentColumns", () => ({}));
});

const basePayload = (): any => JSON.parse(JSON.stringify(fixture));

// Mirrors index.ts's data mapper.
const render = (over: Record<string, unknown> = {}): string =>
  template(normalizeInvoiceTemplateState({ ...basePayload(), ...over }));

const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// The text of the element opened by the tag carrying `marker`, up to `end`.
const within = (html: string, marker: string, end: string): string =>
  text(
    html
      .split(marker)[1]
      .replace(/^[^>]*>/, "")
      .split(end)[0]
  );

// The text of one detail box, label then value.
const box = (html: string, label: string): string => {
  const cells = html.split('<td class="gstr-box').slice(1);
  const cell = cells.find((c) => text(c.split("</td>")[0]).includes(label));
  return cell ? text(cell.split("</td>")[0].replace(/^[^>]*>/, "")) : "";
};

describe("gs-traders helpers", () => {
  it("names a place-of-supply code with its state", () => {
    expect(placeOfSupply("23")).toBe("Madhya Pradesh (23)");
    expect(placeOfSupply(7)).toBe("Delhi (07)");
    expect(placeOfSupply("29-KARNATAKA")).toBe("Karnataka (29)");
    expect(placeOfSupply("Overseas")).toBe("Overseas");
    expect(placeOfSupply(null)).toBe("");
  });

  it("finds the party's state code from its own code, GST state or GSTIN", () => {
    expect(partyState({ state: "Kerala", stateCode: "32" })).toEqual({
      name: "Kerala",
      code: "32",
    });
    expect(partyState({ gstState: "23" })).toEqual({
      name: "Madhya Pradesh",
      code: "23",
    });
    expect(partyState({ gstin: "27ABCDE1234F1Z5" })).toEqual({
      name: "Maharashtra",
      code: "27",
    });
    expect(partyState({ state: "Somewhere" })).toEqual({
      name: "Somewhere",
      code: "",
    });
    expect(partyState({})).toBeNull();
    expect(partyState(undefined)).toBeNull();
  });

  it("prints the address without repeating a city the street ends in", () => {
    expect(
      partyAddressLines({
        street: "00, MAHARAJPUR, ANGAN TIRAHA, Mandla",
        city: "Mandla",
        pincode: "481661",
      })
    ).toEqual(["00, MAHARAJPUR, ANGAN TIRAHA, Mandla", "481661"]);
    expect(
      partyAddressLines({
        building: "Plot 4",
        street: "Katra",
        district: "Jabalpur",
        city: "Jabalpur",
        zipCode: "482001",
        country: "IN",
      })
    ).toEqual(["Plot 4", "Katra", "Jabalpur", "Jabalpur - 482001"]);
    expect(partyAddressLines({})).toEqual([]);
  });

  it("names a foreign country and leaves an Indian one out", () => {
    expect(partyAddressLines({ city: "Dubai", country: "AE" })).toEqual([
      "Dubai",
      "United Arab Emirates",
    ]);
    expect(partyAddressLines({ country: "United Kingdom" })).toEqual([
      "United Kingdom",
    ]);
    expect(partyAddressLines({ country: "in" })).toEqual([]);
  });

  it("falls back to the bare code when the region name is unavailable", () => {
    const original = Intl.DisplayNames;
    try {
      (Intl as any).DisplayNames = jest.fn(() => ({ of: () => undefined }));
      expect(partyAddressLines({ country: "AE" })).toEqual(["AE"]);
      (Intl as any).DisplayNames = jest.fn(() => {
        throw new Error("unsupported");
      });
      expect(partyAddressLines({ country: "AE" })).toEqual(["AE"]);
    } finally {
      (Intl as any).DisplayNames = original;
    }
  });

  it("collects party fields, honouring the showInInvoice opt-out", () => {
    expect(
      partyFields({
        customFields: [
          { label: "Range", value: "East" },
          { name: "Division", value: 4 },
          { label: "Hidden", value: "x", params: { showInInvoice: false } },
        ],
        additionalIds: [
          { label: "TAN", value: "JBP01234A" },
          { label: "Old", value: "y", showInInvoice: false },
        ],
        customHeaders: [
          { label: "", value: "no label" },
          { label: "Gone", value: "z", showInInvoice: false },
        ],
      })
    ).toEqual([
      { label: "Range", value: "East" },
      { label: "Division", value: "4" },
      { label: "TAN", value: "JBP01234A" },
    ]);
    expect(partyFields(null)).toEqual([]);
  });

  it("fills a Tally box from a custom field of the same name", () => {
    const invoice = {
      customFields: [
        { label: "mode / terms of payment", value: "15 days" },
        { name: "Destination", value: "Katra" },
        {
          label: "Other References",
          value: "x",
          params: { showInInvoice: false },
        },
        { label: "Terms of Delivery", value: "" },
      ],
    };
    expect(boxValue(invoice, "paymentTerms")).toBe("15 days");
    expect(boxValue(invoice, "destination")).toBe("Katra");
    expect(boxValue(invoice, "otherReferences")).toBe("");
    expect(boxValue(invoice, "termsOfDelivery")).toBe("");
    expect(boxValue(invoice, "noSuchBox")).toBe("");
    expect(boxValue({}, "destination")).toBe("");
  });

  it("leaves the custom fields no box took for the detail strip", () => {
    expect(
      otherCustomFields({
        customFields: [
          { label: "Destination", value: "Katra" },
          { label: "Site Code", value: "S-9" },
          { name: "Lot", value: 12 },
        ],
      })
    ).toEqual([
      { label: "Site Code", value: "S-9" },
      { label: "Lot", value: "12" },
    ]);
  });

  describe("item rows", () => {
    const columns = [
      { key: "name", label: "Item", system: true },
      { key: "w2impv8lkwa", label: "Quantity", system: false },
      { key: "o78otpgwm3r", label: "Void (in %)", system: false },
      { key: "quantity", label: "Net Quantity", system: true },
      { key: "hsn", label: "HSN/SAC", system: true, isHidden: true },
    ];

    it("prints the gross / void / net breakdown from the custom columns", () => {
      const [row] = itemRows({
        columns,
        items: [
          {
            name: "KACCHA GOBAR",
            quantity: 1560,
            unit: "cft",
            rate: 19,
            amount: 29640,
            hsn: "3101",
            custom: { w2impv8lkwa: 1695.652, o78otpgwm3r: 8 },
          },
        ],
      });
      expect(row).toEqual({
        kind: "item",
        sr: 1,
        name: "KACCHA GOBAR",
        description: "",
        hsn: "",
        quantity: "1560.00",
        unit: "cft",
        rate: 19,
        amount: 29640,
        breakdown: {
          gross: "1695.652",
          voidPct: "8",
          voidQty: "135.652",
          net: "1560.000",
        },
      });
    });

    it("prints no breakdown when the item or the account lacks it", () => {
      const plain = { name: "Loading", quantity: 2, rate: 500, amount: 1000 };
      expect(
        (itemRows({ columns, items: [plain] })[0] as any).breakdown
      ).toBeNull();
      expect(
        (
          itemRows({
            columns: columns.filter((c) => !/void/i.test(c.label)),
            items: [{ ...plain, custom: { w2impv8lkwa: 3 } }],
          })[0] as any
        ).breakdown
      ).toBeNull();
      expect(
        (
          itemRows({
            columns,
            items: [
              {
                ...plain,
                quantity: "",
                custom: { w2impv8lkwa: 3, o78otpgwm3r: "abc" },
              },
            ],
          })[0] as any
        ).breakdown
      ).toBeNull();
    });

    it("prints inline HSN only while the account shows the HSN column", () => {
      const items = [{ name: "A", quantity: 1, hsn: "3101" }];
      expect((itemRows({ columns, items })[0] as any).hsn).toBe("");
      expect(
        (
          itemRows({
            columns: [{ key: "hsn", label: "HSN/SAC", system: true }],
            items,
          })[0] as any
        ).hsn
      ).toBe("3101");
    });

    it("numbers items only, skipping hidden rows and groups", () => {
      const rows = itemRows({
        items: [
          null,
          { name: "Section A", group: true },
          { name: "One", quantity: 1 },
          { name: "Secret", hidden: true },
          { name: "Two" },
          { name: "Section A total", isGroupItemTotalRow: true, amount: 40 },
          { name: "No amount", isGroupItemTotalRow: true },
        ],
      });
      expect(rows.map((r: any) => [r.kind, r.sr ?? null, r.name])).toEqual([
        ["group", null, "Section A"],
        ["item", 1, "One"],
        ["item", 2, "Two"],
        ["groupTotal", null, "Section A total"],
        ["groupTotal", null, "No amount"],
      ]);
      expect(rows[2]).toMatchObject({ quantity: "", rate: 0, amount: 0 });
      expect(rows[4]).toMatchObject({ amount: 0 });
      expect(itemRows(undefined)).toEqual([]);
    });
  });

  describe("item foot", () => {
    const model = (main: any[], extra: any[] = [], due: any[] = []) => ({
      hidden: false,
      hideTaxes: true,
      groups: { main, extra, due },
    });
    const items = [
      { name: "A", gstRate: 18 },
      { name: "B", gstRate: "18" },
      { name: "G", group: true, gstRate: 5 },
      { name: "T", isGroupItemTotalRow: true, gstRate: 5 },
      { name: "H", hidden: true, gstRate: 5 },
      null,
    ];

    it("keeps taxes, discounts and charges, dropping sub total and grand total", () => {
      const foot = itemFoot(
        model([
          { key: "subTotal", label: "Sub Total", value: "₹1,000" },
          { key: "amount", label: "Amount", value: "₹1,000" },
          { key: "discount", label: "Discount", value: "- ₹50.5" },
          { key: "cgst", label: "CGST", value: "₹85.50", isTaxRow: true },
          { key: "sgst", label: "SGST", value: "₹85.50", isTaxRow: true },
          {
            key: "cgst:18",
            label: "CGST (9%)",
            value: "₹85.50",
            isTaxRow: true,
          },
          {
            key: "charge:1",
            label: "Freight",
            value: "₹1,200",
            survivesHideTotals: true,
          },
          {
            key: "total",
            label: "Total (INR)",
            value: "₹1,121",
            emphasis: "grand",
          },
          {
            key: "conversion",
            label: "USD Total",
            value: "$13",
            emphasis: "grand",
          },
        ]),
        {
          items,
          finalTotal: { total: 1121, totalRoundOff: -0.5 },
          customLabels: { total: "Net" },
        }
      );
      expect(
        foot.body.map((r) => [
          r.label,
          r.value,
          r.isTaxRow,
          r.survivesHideTotals,
        ])
      ).toEqual([
        ["Discount", "-50.50", false, false],
        ["CGST 9%", "85.50", true, false],
        ["SGST 9%", "85.50", true, false],
        ["CGST (9%)", "85.50", true, false],
        ["Freight", "1200.00", false, true],
      ]);
      expect(foot).toMatchObject({
        hidden: false,
        hideTaxes: true,
        totalLabel: "Net",
        total: "1121.50",
        roundedTotal: "1121.00",
      });
    });

    it("rates IGST at the full rate and leaves mixed rates unrated", () => {
      const igst = itemFoot(
        model([{ key: "igst", label: "IGST", value: "₹180" }]),
        { items }
      );
      expect(igst.body[0].label).toBe("IGST 18%");
      const mixed = itemFoot(
        model([{ key: "cgst", label: "CGST", value: "₹1" }]),
        {
          items: [{ gstRate: 5 }, { gstRate: 12 }, { gstRate: "" }],
        }
      );
      expect(mixed.body[0].label).toBe("CGST");
    });

    it("keeps extra fields as text and plain-figures the balance rows", () => {
      const foot = itemFoot(
        model(
          [],
          [{ key: "extra:1", label: "Vehicle", value: "MP20 1234" }],
          [{ key: "dueAmount", label: "Due", value: "₹1,045" }]
        ),
        { subUnitLength: 3, locale: "en-IN" }
      );
      expect(foot.extra).toEqual([
        { key: "extra:1", label: "Vehicle", value: "MP20 1234" },
      ]);
      expect(foot.due).toEqual([
        { key: "dueAmount", label: "Due", value: "1045.000" },
      ]);
      expect(foot).toMatchObject({
        totalLabel: "Total",
        total: "0.000",
        roundedTotal: "0.000",
      });
    });

    it("keeps the model's formatting outside English locales and for non-figures", () => {
      const foot = itemFoot(
        model([
          { key: "cgst", label: "CGST", value: "1.045,50 €" },
          { key: "note", label: "Note", value: "n/a" },
        ]),
        { locale: "de-DE" }
      );
      expect(foot.body.map((r) => r.value)).toEqual(["1.045,50 €", "n/a"]);
      expect(
        itemFoot(model([{ key: "x", label: "X", value: "n/a" }]), {}).body[0]
          .value
      ).toBe("n/a");
      expect(itemFoot(undefined, undefined)).toMatchObject({
        body: [],
        extra: [],
        due: [],
        hidden: false,
      });
    });

    it("prints item figures plain at the document's sub-unit length", () => {
      expect(plainAmount(29640, {})).toBe("29640.00");
      expect(plainAmount("19", { subUnitLength: 3 })).toBe("19.000");
      expect(plainAmount(5.5, { subUnitLength: 0 })).toBe("6");
      expect(plainAmount("", {})).toBe("");
    });
  });

  it("writes bank lines in the reference's wording, payload keys or contract keys", () => {
    expect(
      bankLines(
        {
          bank: "INDIAN BANK",
          branch: "MAHARAJPUR",
          name: "G S TRADERS",
          accountNo: "8184213216",
          ifsc: "IDIB000M539",
          customFields: [
            { label: "MICR", value: "482019002" },
            { label: "Hidden", value: "x", params: { showInInvoice: false } },
            { label: "", value: "no label" },
          ],
        },
        {}
      )
    ).toEqual([
      { label: "BANK", value: "INDIAN BANK" },
      { label: "BRANCH", value: "MAHARAJPUR" },
      { label: "A/C NAME", value: "G S TRADERS" },
      { label: "A/C NO.", value: "8184213216" },
      { label: "IFSC", value: "IDIB000M539" },
      { label: "MICR", value: "482019002" },
    ]);
    expect(
      bankLines(
        {
          bankName: "SBI",
          accountHolderName: "X",
          accountNumber: "1",
          ifscCode: "SBIN0017101",
          iban: "IBAN1",
          swiftCode: "SBININBB",
          customLabels: { ifsc: "IFS Code" },
        },
        { bankName: "Bank Name" }
      )
    ).toEqual([
      { label: "Bank Name", value: "SBI" },
      { label: "A/C NAME", value: "X" },
      { label: "A/C NO.", value: "1" },
      { label: "IFS Code", value: "SBIN0017101" },
      { label: "IBAN", value: "IBAN1" },
      { label: "SWIFT", value: "SBININBB" },
    ]);
    expect(bankLines({ swift: "AAA" }, null)).toEqual([
      { label: "SWIFT", value: "AAA" },
    ]);
    expect(bankLines(undefined, undefined)).toEqual([]);
  });
});

describe("gs-traders reference document", () => {
  it("prints the seller with address, GSTIN, PAN and state code", () => {
    const html = render();
    const seller = within(html, 'data-party="billedBy"', "</td>");
    expect(seller).toContain("G S TRADERS");
    expect(seller).toContain("00, MAHARAJPUR, ANGAN TIRAHA, Mandla 481661");
    expect(seller).toContain("GSTIN/UIN : 23ABDFG7528F1ZK");
    expect(seller).toContain("PAN : ABDFG7528F");
    expect(seller).toContain("State Name: Madhya Pradesh, Code : 23");
  });

  it("prints URD for a buyer with no GSTIN, under the account's Billed To label", () => {
    const buyer = within(render(), 'data-party="billedTo"', "</td>");
    expect(buyer).toBe("Billed To DFO EAST DIVISION MANDLA GSTIN/UIN : URD");
  });

  it("lets the seller span the consignee's rows when there is no consignee", () => {
    const html = render();
    expect(html).not.toContain('data-party="shippedTo"');
    expect(html).toMatch(/data-party="billedBy" rowspan="5"/);
  });

  it("keeps all thirteen detail boxes, labelled from customLabels where a key exists", () => {
    const html = render();
    expect((html.match(/<td class="gstr-box/g) || []).length).toBe(13);
    expect(box(html, "Invoice No")).toBe("Invoice No 201");
    expect(box(html, "Challan Number")).toBe("Challan Number");
    expect(box(html, "Mode/Terms of Payment")).toBe("Mode/Terms of Payment");
    expect(box(html, "PO Number")).toBe("PO Number");
    expect(box(html, "Terms of Delivery")).toBe("Terms of Delivery");
  });

  it("prints the fixed Tally item headers whatever the account's columns", () => {
    const head = text(render().split("<thead>")[1].split("</thead>")[0]);
    expect(head).toBe("Sr No. Description of Goods Quantity Rate Amount");
  });

  it("prints the item's gross / void / net breakdown and its net quantity", () => {
    const row = within(render(), 'class="gstr-item"', "</tr>");
    expect(row).toBe(
      "1 Test - 100.000 5% VOID - - 5.000 NET - 95.000 95.00 10.00 950.00"
    );
  });

  it("prints taxes at the foot of the item body, rated, with plain figures", () => {
    const html = render();
    const taxes = [
      ...html.matchAll(
        /<tr\s+class="ceres-subtotal-row gstr-foot-row[^"]*"[\s\S]*?<\/tr>/g
      ),
    ].map(([row]) => text(row.replace(/^<tr[^>]*>/, "")));
    expect(taxes).toEqual(["CGST 5% 47.50", "SGST 5% 47.50"]);
    expect(html).toMatch(/gstr-foot-row gstr-foot-tax/);
  });

  it("prints Total before round off, then the Round off Total", () => {
    const totals = (html: string): string =>
      `${within(html, 'data-ceres-subtotal-row="total"', "</tr>")} ${within(
        html,
        'data-ceres-subtotal-row="roundedTotal"',
        "</tr>"
      )}`;
    expect(totals(render())).toBe("Total 1045.00 Round off Total 1045.00");
    const payload = basePayload();
    payload.finalTotal = {
      ...payload.finalTotal,
      total: 1045,
      totalRoundOff: 0.4,
    };
    expect(totals(template(normalizeInvoiceTemplateState(payload)))).toBe(
      "Total 1044.60 Round off Total 1045.00"
    );
  });

  it("heads the words line Amount Chargeable (in words)", () => {
    const words = within(
      render({ hideTotalInWords: false }),
      "data-ceres-total-in-words",
      "</div>"
    );
    expect(words).toBe(
      "Amount Chargeable (in words) one thousand forty five rupees only"
    );
  });

  it("honours hideTotalInWords and always prints E. & O.E", () => {
    const html = render();
    expect(html).toMatch(/gstr-words[^"]*is-hidden-by-words-setting/);
    expect(text(html)).toContain("E. & O.E");
    expect(render({ hideTotalInWords: false })).not.toContain(
      "is-hidden-by-words-setting"
    );
  });

  it("prints bank lines and signs for the seller", () => {
    const html = text(render());
    expect(html).toContain(
      "BANK - INDIAN BANK A/C NAME - G S TRADERS A/C NO. - 8184213216 IFSC - IDIB000M539"
    );
    expect(html).toContain("for G S TRADERS Authorised Signatory");
    expect(html).not.toContain("Computer Generated");
  });

  it("prints the place of supply in the detail strip", () => {
    const strip = within(render(), 'class="gstr-details"', "</dl>");
    expect(strip).toBe("Place of Supply Madhya Pradesh (23)");
  });
});

describe("gs-traders printed pages", () => {
  let html = "";
  let frame = "";
  beforeAll(() => {
    html = render();
    [, frame] = html.split('<table class="gstr-items">');
  });

  it("prints the document header once, above the frame table", () => {
    expect(html.indexOf('class="gstr-doc-head"')).toBeLessThan(
      html.indexOf('<table class="gstr-items">')
    );
    expect(frame).not.toContain("gstr-doc-head");
  });

  it("repeats only a top rule and the column headings as the table head", () => {
    expect(text(frame.split("<thead>")[1].split("</thead>")[0])).toBe(
      "Sr No. Description of Goods Quantity Rate Amount"
    );
    expect(frame.split("<thead>")[1]).toMatch(/^\s*<tr class="gstr-page-rule"/);
  });

  it("repeats bank and signature as the table foot, and nothing else", () => {
    expect(text(frame.split("<tfoot>")[1].split("</tfoot>")[0])).toBe(
      "BANK - INDIAN BANK A/C NAME - G S TRADERS A/C NO. - 8184213216 IFSC - IDIB000M539 for G S TRADERS Authorised Signatory"
    );
  });

  it("keeps totals, words, summaries and notes in the body, printed once", () => {
    const body = frame.split("</thead>")[1].split("<tfoot>")[0];
    expect(body).toContain('data-ceres-subtotal-row="roundedTotal"');
    expect(body).toContain("data-ceres-total-in-words");
    const withNotes = render({ notes: "Thanks", terms: [] })
      .split("</thead>")[1]
      .split("<tfoot>")[0];
    expect(text(withNotes)).toContain("Additional Notes Thanks");
  });
});

describe("gs-traders rows the reference does not show", () => {
  it("prints the consignee between seller and buyer", () => {
    const html = render({
      shippedTo: {
        name: "PRABHARI KATRA ROPANI",
        city: "Jabalpur",
        gstin: "23AAAAA0000A1Z5",
        state: "Madhya Pradesh",
      },
    });
    expect(html).toMatch(/data-party="billedBy" rowspan="3"/);
    const consignee = within(html, 'data-party="shippedTo"', "</td>");
    expect(consignee).toBe(
      "Shipped To PRABHARI KATRA ROPANI Jabalpur GSTIN/UIN : 23AAAAA0000A1Z5 State Name: Madhya Pradesh, Code : 23"
    );
  });

  it("fills the boxes from transport, PO number and custom fields", () => {
    const html = render({
      purchaseOrderNumber: "PO-55",
      transportDetails: {
        challanNumber: "DC-77",
        challanDate: "2026-10-20",
        transporterName: "Self",
        vehicleNumber: "MP20 GA 1234",
        transportMode: "Road",
        distance: 40,
        extraInformation: "Fragile",
      },
      customFields: [
        { label: "Mode/Terms of Payment", value: "15 days", dataType: "text" },
        { label: "Destination", value: "Katra", dataType: "text" },
        { label: "Site Code", value: "S-9", dataType: "text" },
      ],
    });
    expect(box(html, "Challan Number")).toBe("Challan Number DC-77");
    expect(box(html, "Challan Date")).toBe("Challan Date 2026-10-20");
    expect(box(html, "Transport")).toBe("Transport Self");
    expect(box(html, "PO Number")).toBe("PO Number PO-55");
    expect(box(html, "Mode/Terms of Payment")).toBe(
      "Mode/Terms of Payment 15 days"
    );
    expect(box(html, "Destination")).toBe("Destination Katra");
    const strip = within(html, 'class="gstr-details"', "</dl>");
    expect(strip).toContain("Mode of Transport Road");
    expect(strip).toContain("Vehicle No. MP20 GA 1234");
    expect(strip).toContain("Distance 40");
    expect(strip).toContain("Extra Information Fragile");
    expect(strip).toContain("Site Code S-9");
    expect(strip).not.toContain("Destination");
  });

  it("falls back to Tally box names and the custom fields when the contract is silent", () => {
    const payload = basePayload();
    payload.customLabels = {
      ...payload.customLabels,
      challanNumber: "",
      challanDate: "",
      transportName: "",
      purchaseOrderNumber: "",
    };
    payload.customFields = [
      { label: "Delivery Note", value: "DN-1", dataType: "text" },
      { label: "Delivery Note Date", value: "20-Oct-26", dataType: "text" },
      { label: "Dispatched through", value: "Truck", dataType: "text" },
    ];
    const html = template(normalizeInvoiceTemplateState(payload));
    expect(box(html, "Delivery Note")).toBe("Delivery Note DN-1");
    expect(box(html, "Delivery Note Date")).toBe(
      "Delivery Note Date 20-Oct-26"
    );
    expect(box(html, "Dispatched through")).toBe("Dispatched through Truck");
    expect(box(html, "Buyer's Order No.")).toBe("Buyer's Order No.");
  });

  it("reads the transporter from its nested name, then the transport name", () => {
    expect(
      box(
        render({ transportDetails: { transporter: { name: "VRL" } } }),
        "Transport"
      )
    ).toBe("Transport VRL");
    expect(
      box(render({ transportDetails: { transport: "By road" } }), "Transport")
    ).toBe("Transport By road");
  });

  it("prints IGST alone on an inter-state invoice", () => {
    const payload = basePayload();
    payload.igst = true;
    payload.finalTotal = { ...payload.finalTotal, cgst: 0, sgst: 0, igst: 95 };
    const html = template(normalizeInvoiceTemplateState(payload));
    expect(html).toContain('data-ceres-subtotal-row="igst"');
    expect(html).not.toContain('data-ceres-subtotal-row="cgst"');
    expect(text(html)).toContain("IGST 10% 95.00");
  });

  it("prints unit lines, descriptions and inline HSN on items", () => {
    const payload = basePayload();
    payload.items[0] = {
      ...payload.items[0],
      unit: "cft",
      description: "Dry",
      hsn: "3101",
    };
    payload.columns = payload.columns.map((c: any) =>
      c.key === "hsn" ? { ...c, isHidden: false } : c
    );
    const row = within(
      template(normalizeInvoiceTemplateState(payload)),
      'class="gstr-item"',
      "</tr>"
    );
    expect(row).toBe(
      "1 Test - 100.000 cft 5% VOID - - 5.000 cft NET - 95.000 cft HSN/SAC: 3101 Dry 95.00 cft 10.00 per cft 950.00"
    );
  });

  it("prints plain items, group headings and group totals", () => {
    const payload = basePayload();
    payload.items = [
      { name: "Section A", group: true },
      { name: "Loading", quantity: 2, rate: 500, amount: 1000 },
      { name: "Section A total", isGroupItemTotalRow: true, amount: 1000 },
    ];
    const body = text(
      template(normalizeInvoiceTemplateState(payload))
        .split("<tbody>")[2]
        .split('<tr class="ceres-subtotal-row gstr-total')[0]
    );
    expect(body).toBe(
      "Section A 1 Loading 2.00 500.00 1000.00 Section A total 1000.00 CGST 47.50 SGST 47.50"
    );
  });

  it("puts every other document detail in the strip", () => {
    const strip = within(
      render({
        dueDate: "2026-11-01",
        reverseCharge: true,
        creator: { name: "Sandeep" },
        advanceOptions: { showCreatorInInvoice: true },
        customHeaders: [
          { label: "Lot", value: "L-3" },
          { label: "Empty", value: "" },
        ],
        irn: {
          Irn: "abc123",
          AckNo: "112",
          AckDt: "2026-10-23",
          EwbNo: "331",
          EwbDt: "2026-10-23",
        },
      }),
      'class="gstr-details"',
      "</dl>"
    );
    expect(strip).toBe(
      "Due Date 2026-11-01 Place of Supply Madhya Pradesh (23) Reverse Charge Yes Created By Sandeep Lot L-3 IRN abc123 Ack No. 112 Ack Date 2026-10-23 E-Way Bill No. 331 E-Way Bill Date 2026-10-23"
    );
  });

  it("keeps the IRN but drops its acknowledgement and QR once cancelled", () => {
    const html = render({
      irn: {
        Irn: "abc123",
        AckNo: "112",
        CancelDate: "2026-10-24",
        qrCode: "data:image/png;base64,AAA",
      },
    });
    expect(text(html)).toContain("IRN abc123");
    expect(text(html)).not.toContain("Ack No.");
    expect(html).toMatch(
      /data-ceres-field-container="qrCode" class="gstr-qr is-empty"/
    );
  });

  it("hides the place of supply when the account hides it", () => {
    expect(
      render({ advanceOptions: { hideCountryOfSupply: true } })
    ).not.toContain("Place of Supply");
  });

  it("prints terms, notes, attachments, footers and the contact strip", () => {
    const html = text(
      render({
        terms: [
          { label: "Terms and Conditions", terms: ["No returns."] },
          { label: "", terms: ["Subject to Mandla jurisdiction."] },
          { label: "Empty", terms: [] },
        ],
        notes: "Thank you.",
        attachments: ["https://example.com/a.pdf"],
        customFooters: [{ label: "Declaration", value: "True and correct." }],
        footers: [{ _id: "1", label: "Reg.", value: "R-1" }],
      })
    );
    expect(html).toContain("Terms and Conditions No returns.");
    expect(html).toContain("Subject to Mandla jurisdiction.");
    expect(html).not.toContain("Empty");
    expect(html).toContain("Additional Notes Thank you.");
    expect(html).toContain("Attachments https://example.com/a.pdf");
    expect(html).toContain("Declaration True and correct. Reg. R-1");
  });

  it("shows the digital-signature placeholder until the document is signed", () => {
    expect(render({ signatureMethod: "DIGITAL" })).toContain(
      "data-ceres-signature-placeholder"
    );
    const signed = render({
      signatureMethod: "DIGITAL",
      documentSignatureRequest: {
        status: "SIGNED",
        signers: [{ signerName: "Gill" }],
      },
      share: { pdf: "https://example.com/doc.pdf" },
    });
    expect(text(signed)).toContain(
      "Gill https://example.com/doc.pdf Authorised Signatory"
    );
  });
});

describe("gs-traders styles", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/templates/gs-traders/styles.css"),
    "utf8"
  );
  const print = css.slice(css.indexOf("@media print"));

  it("never sets the page box; margins and size are the PDF service's", () => {
    expect(css).not.toMatch(/@page/);
  });

  it("keeps a blank body on screen and stretches it in print", () => {
    expect(css).toMatch(/\.gstr-filler > td \{\s*height: 240px;/);
    expect(print).toMatch(/tr\.gstr-filler \{\s*height: 100%;/);
    expect(print).toMatch(/\.gstr-filler > td \{\s*height: auto;/);
  });

  it("rules the void line across the cell and lowercases tax labels", () => {
    expect(css).toMatch(/\.gstr-void \{\s*border-bottom: 1px solid/);
    expect(css).toMatch(
      /\.gstr-foot-tax > \.gstr-col-label \{\s*text-transform: lowercase;/
    );
  });

  it("hides the detail strip when it holds no row", () => {
    expect(css).toContain(".gstr-details:not(:has(.gstr-detail))");
  });

  it("never resolves a font size below 10px, screen or print", () => {
    const sizes = [
      ...css.matchAll(
        /(?:font-size|--gstr-font-size-[a-z]+)\s*:\s*([\d.]+)px/g
      ),
    ].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(12);
    sizes.forEach((size) => expect(size).toBeGreaterThanOrEqual(10));
  });

  it("keeps every spacing value on the 4px grid", () => {
    const decls = [
      ...css.matchAll(
        /(?:^|[\s;{])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z-]+)?)\s*:\s*([^;]+);/g
      ),
    ];
    expect(decls.length).toBeGreaterThan(10);
    decls.forEach(([, , value]) => {
      [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].forEach(([, px]) => {
        expect(Math.abs(Number(px)) % 4).toBe(0);
      });
    });
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
