import sample from "../src/types/sample.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerSagaEngineeringHelpers } from "./support/sagaEngineeringHelpers";
import template from "../src/templates/saga-engineering/template.hbs";

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

beforeAll(registerSagaEngineeringHelpers);

describe("saga-engineering", () => {
  it("renders using the shared invoice normalization shape", () => {
    const html = render(sample as any);

    expect(html).toContain("Tax Invoice");
    expect(html).toContain("INV-2026-001");
    expect(html).toContain("Acme Corp Ltd.");
    expect(html).toContain("Enterprise Plan Subscription");
    expect(html).toContain("Project Code");
    expect(html).toContain("PRJ-SEC-26-09");
    expect(html).toContain("Payment Terms");
    expect(html).toContain("Support Portal");
  });

  it("shows the HSN column for a quotation whose items carry an HSN code", () => {
    // The sample fixture is billType "INVOICE", not a quotation, but the HSN
    // column must not depend on that: it's driven by whether the items
    // actually carry an hsn value, so a quotation with real HSN codes (this
    // template's primary use case) still gets the column.
    const html = render(sample as any);

    expect(html).toContain("998311");
    expect(html).toContain("998312");
  });

  it("keeps every item description inline, never as a full-width row", () => {
    const html = render(sample as any);

    expect(html).not.toContain("fullwidth");
    expect(html).toContain("Annual subscription for cloud productivity suite");
  });
});

describe("saga-engineering item description placement", () => {
  const basePayload = () => ({
    invoiceTitle: "Quotation",
    invoiceNumber: "SEE/QTN/26-27/0264",
    items: [
      {
        _id: "1",
        name: "ANTICO make End Suction Horizontal Centrifugal Metallic Single Mechanical seal Pump",
        description:
          "Q (m3/hr): 5.0 H (m): 60.0 Motor recommended: 10 HP(7.5kW)29N rpm:2900",
        quantity: 2,
        rate: 101750,
        amount: 203500,
        hsn: "84137091",
        unit: "set",
      },
    ],
  });

  it("renders the description inside the item's own cell, never as a separate full-width row", () => {
    const html = render(basePayload());

    expect(html).toContain("sg-item-desc");
    expect(html).not.toContain("fullwidth");
    // The description text should appear in the same table row as the item
    // name, i.e. before the row closes and a new one for the next item (or
    // the table footer) opens.
    const nameIndex = html.indexOf("ANTICO make End Suction");
    const descIndex = html.indexOf("Q (m3/hr)");
    const rowCloseAfterName = html.indexOf("</tr>", nameIndex);

    expect(nameIndex).toBeGreaterThan(-1);
    expect(descIndex).toBeGreaterThan(nameIndex);
    expect(descIndex).toBeLessThan(rowCloseAfterName);
  });

  it("still renders the item name and amount when the description is absent", () => {
    const payload = basePayload();
    delete (payload.items[0] as any).description;
    const html = render(payload);

    expect(html).toContain("ANTICO make End Suction");
    expect(html).not.toContain("sg-item-desc");
  });

  it('shows the quantity with its unit inline, matching the design\'s "2 (set)" style', () => {
    const html = render(basePayload());

    expect(html).toContain("2 (set)");
  });
});

describe("saga-engineering custom headers / salutation", () => {
  it("renders non-last entries inline as 'Label: value', with trailing punctuation stripped before the colon", () => {
    const html = render({
      invoiceTitle: "Quotation",
      customHeaders: [
        { label: "Sub", value: "RFQ OF DM WATER & ETP WATER TRANSFER PUMP" },
        { label: "Ref:", value: "Your Email dated 27.07.2026" },
        { label: "Dear Sir,", value: "Final line, own paragraph." },
      ],
      items: [],
    });

    expect(html).toContain("Sub:</strong> RFQ OF DM WATER");
    expect(html).toContain("Ref:</strong> Your Email dated");
    expect(html).not.toContain("Ref::");
  });

  it("renders the last customHeaders entry with its label on its own line and the value below", () => {
    const html = render({
      invoiceTitle: "Quotation",
      customHeaders: [
        { label: "Sub", value: "RFQ OF DM WATER & ETP WATER TRANSFER PUMP" },
        {
          label: "Dear Sir,",
          value:
            "With reference to above, we are pleased to quote our lowest prices for the supply of followings, subject to terms and conditions mentioned hereunder :-",
        },
      ],
      items: [],
    });

    // Comma, not colon, on the label's own line — and the value appears
    // exactly once, as a separate paragraph rather than inline.
    expect(html).toContain('<p class="sg-dear"><strong>Dear Sir,</strong></p>');
    const occurrences = html.split("With reference to above").length - 1;
    expect(occurrences).toBe(1);
    expect(html).not.toContain("Dear Sir,: With reference");
  });

  it("renders nothing when there are no customHeaders", () => {
    const html = render({ invoiceTitle: "Quotation", items: [] });

    expect(html).not.toContain("sg-salutation");
  });
});

describe("saga-engineering billed-to contact person (Kind Attn)", () => {
  it("groups the contact person with the billed-to party details, not the customHeaders box", () => {
    // Real account data (confirmed against a live invoice) never puts "Kind
    // Attn" in customHeaders — it lives at billedTo.contactPerson.name, with
    // customLabels.contactPersonLabel overriding the "Kind Attn" wording.
    const html = render({
      invoiceTitle: "Quotation",
      billedTo: {
        name: "Himadri Speciality Chemical Ltd",
        contactPerson: { name: "Mr. SAJAL MONDAL" },
      },
      customHeaders: [
        { label: "Sub:", value: "RFQ OF DM WATER & ETP WATER TRANSFER PUMP" },
      ],
      items: [],
    });

    expect(html).toContain("Kind Attn");
    expect(html).toContain("Mr. SAJAL MONDAL");

    // The contact person's own paragraph sits inside the sg-party box, not
    // inside sg-salutation.
    const partyBoxStart = html.indexOf('class="sg-box sg-party"');
    const contactIndex = html.indexOf("Mr. SAJAL MONDAL");
    const salutationStart = html.indexOf("sg-salutation");

    expect(contactIndex).toBeGreaterThan(partyBoxStart);
    expect(contactIndex).toBeLessThan(salutationStart);
  });

  it("still shows the contact person when there are no customHeaders at all", () => {
    const html = render({
      invoiceTitle: "Quotation",
      billedTo: { name: "Acme Corp", contactPerson: { name: "Jane Doe" } },
      items: [],
    });

    expect(html).not.toContain("sg-salutation");
    expect(html).toContain("Jane Doe");
  });

  it("honours a customLabels.contactPersonLabel override", () => {
    const html = render({
      invoiceTitle: "Quotation",
      customLabels: { contactPersonLabel: "Attention" },
      billedTo: { name: "Acme Corp", contactPerson: { name: "Jane Doe" } },
      items: [],
    });

    expect(html).toContain("Attention");
    expect(html).not.toContain("Kind Attn");
  });

  it("renders nothing when there is no contact person", () => {
    const html = render({
      invoiceTitle: "Quotation",
      billedTo: { name: "Acme Corp" },
      items: [],
    });

    expect(html).not.toContain("sg-contact-person");
  });
});

describe("saga-engineering total in words", () => {
  const basePayload = () => ({
    invoiceTitle: "Quotation",
    customLabels: {
      totalInWords: "Note",
      totalInWordsValue:
        "three lakh seven thousand eight hundred thirty one rupees only",
    },
    items: [],
  });

  it("shows the total-in-words line when there is a value and no hide flag", () => {
    const html = render(basePayload());

    expect(html).toContain(
      "three lakh seven thousand eight hundred thirty one rupees only"
    );
  });

  it("hides the total-in-words line when invoice.hideTotalInWords is true, even though a value is present", () => {
    // Confirmed against a live invoice payload: `hideTotalInWords: true` sits
    // on the invoice root, separate from customLabels, and must win even
    // when customLabels.totalInWordsValue is populated.
    const html = render({ ...basePayload(), hideTotalInWords: true });

    expect(html).not.toContain(
      "three lakh seven thousand eight hundred thirty one rupees only"
    );
    expect(html).not.toContain("sg-total-words");
  });
});
