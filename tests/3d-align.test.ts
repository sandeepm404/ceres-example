import fs from "node:fs";
import path from "node:path";
import HandlebarsRuntime from "handlebars/runtime";
import fixture from "./fixtures/3d-align.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/3d-align/template.hbs";
import {
  bankRows,
  countryName,
  partyAddressLines,
  partyFields,
  registerThreeDAlignTemplateHelpers,
} from "../src/templates/3d-align/helpers";
import lineItemsPartial from "../src/widgets/line-items/LineItemsTable.hbs";
import subtotalPartial from "../src/widgets/subtotal/Subtotal.hbs";
import ceresImagePartial from "../src/widgets/image/CeresImage.hbs";
import brandingPartial from "../src/widgets/refrens-branding/RefrensBranding.hbs";
import { computeSubtotalRows } from "../src/widgets/subtotal/utils";
import { qrSrc } from "../src/widgets/qr-code";
import registerFormatCurrencyHelper from "../src/widgets/shared/registerFormatCurrencyHelper";
import registerTaxFlagHelpers from "../src/widgets/shared/registerTaxFlagHelpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * The shared widgets this template is built from render for real —
 * LineItemsTable, Subtotal, CeresImage, RefrensBranding, qrSrc. Only partials
 * with no importable logic are stubbed.
 *
 * The fixture mirrors the account's reference PDF (invoice 3DA1218): a
 * non-tax invoice with one item, a fixed discount, bank + UPI, three terms
 * and a contact strip. It also carries letterhead and footer images, which
 * this template must never print.
 */
beforeAll(() => {
  const HB = HandlebarsRuntime;
  registerThreeDAlignTemplateHelpers(HB);
  registerFormatCurrencyHelper(HB);
  registerTaxFlagHelpers(HB);

  HB.registerPartial("LineItemsTable", lineItemsPartial);
  HB.registerPartial("Subtotal", subtotalPartial);
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
  HB.registerPartial("CeresImageGallery", () => "");
  HB.registerHelper("prepareImageGallery", () => ({}));
  HB.registerHelper("formatPhoneNumber", (v: unknown) => String(v ?? ""));
  [
    "formateShortDateWithOffset",
    "formateDateWithOffset",
    "formatDateInTimeZone",
  ].forEach((name) => HB.registerHelper(name, (v: unknown) => String(v ?? "")));
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
    .replace(/\s+/g, " ")
    .trim();

describe("3d-align helpers", () => {
  it("prints the country name for an ISO code", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("in")).toBe("India");
    expect(countryName("United Arab Emirates")).toBe("United Arab Emirates");
    expect(countryName("")).toBe("");
  });

  it("lays the address out street, city, then state, country - pincode", () => {
    expect(
      partyAddressLines({
        street: "1st Floor - Shikhar Appartment, Bodakdev",
        city: "Ahmedabad",
        state: "Gujarat",
        country: "IN",
        pincode: "380015",
      })
    ).toEqual([
      "1st Floor - Shikhar Appartment, Bodakdev,",
      "Ahmedabad,",
      "Gujarat, India - 380015",
    ]);
  });

  it("drops absent address parts with their punctuation", () => {
    expect(partyAddressLines({ state: "Maharashtra", country: "IN" })).toEqual([
      "Maharashtra, India",
    ]);
    expect(partyAddressLines({ street: "MG Road", city: "Pune" })).toEqual([
      "MG Road,",
      "Pune",
    ]);
    expect(partyAddressLines({ pincode: "380015" })).toEqual(["380015"]);
    expect(partyAddressLines({})).toEqual([]);
  });

  it("collects party fields, honouring the showInInvoice opt-out", () => {
    expect(
      partyFields({
        customFields: [
          { label: "Clinic", value: "Smile Care" },
          { label: "Hidden", value: "x", params: { showInInvoice: false } },
        ],
        additionalIds: [{ label: "Reg. No", value: "G-1234" }],
        customHeaders: [{ label: "", value: "no label" }],
      })
    ).toEqual([
      { label: "Clinic", value: "Smile Care" },
      { label: "Reg. No", value: "G-1234" },
    ]);
  });

  it("builds bank rows in the design's order with the platform's labels", () => {
    expect(
      bankRows(
        {
          name: "3D ALIGN",
          accountNo: "38445234884",
          ifsc: "SBIN0004423",
          accountType: "CURRENT",
          bank: "State Bank of India",
        },
        {}
      )
    ).toEqual({
      heading: "Bank Details",
      rows: [
        { label: "Account Name", value: "3D ALIGN" },
        { label: "Account Number", value: "38445234884" },
        { label: "IFSC", value: "SBIN0004423" },
        { label: "Account Type", value: "Current" },
        { label: "Bank", value: "State Bank of India" },
      ],
    });
  });

  it("reads the contract key names too, and the account's own labels", () => {
    const { heading, rows } = bankRows(
      {
        accountHolderName: "Holder",
        accountNumber: "123",
        bankName: "HDFC",
        swiftCode: "HDFCINBB",
        customFields: [
          { label: "Branch", value: "Satellite" },
          { label: "Off", value: "x", params: { showInInvoice: false } },
        ],
      },
      { bankDetails: "Pay to", accountHolderName: "Beneficiary" }
    );
    expect(heading).toBe("Pay to");
    expect(rows).toEqual([
      { label: "Beneficiary", value: "Holder" },
      { label: "Account Number", value: "123" },
      { label: "SWIFT Code", value: "HDFCINBB" },
      { label: "Bank", value: "HDFC" },
      { label: "Branch", value: "Satellite" },
    ]);
  });
});

describe("3d-align reference document", () => {
  it("prints the header block from the payload", () => {
    const out = text(render());
    expect(out).toContain("Invoice Invoice No # 3DA1218");
    expect(out).toContain("Invoice Date");
    expect(out).toContain("Created By Align 3D");
  });

  it("prints both parties with the design's address lines", () => {
    const out = text(render());
    expect(out).toContain(
      "Billed By 3D ALIGN 1st Floor - Shikhar Appartment, Opposite Prestige Tower, Bodakdev, Ahmedabad, Ahmedabad, Gujarat, India - 380015 Phone: +919925428288"
    );
    expect(out).toContain(
      "Billed To Dr. Shrinath Bhavsar C-4, 1st Floor, Ishwarcharan Complex, Jodhpur Gam, Satellite, AHMEDABAD, Gujarat, India - 380015"
    );
    // billedBy.emailShowInInvoice is false in the reference.
    expect(out).not.toContain("Email:");
  });

  it("takes the item table's columns and labels from the account", () => {
    const html = render();
    const head = text(html.match(/<thead>[\s\S]*?<\/thead>/)![0]);
    expect(head).toBe("Item Quantity Rate Amount");
    expect(text(html)).toContain(
      "Intraoral Scan & Simulation Charges 1 ₹3,500 ₹3,500.00"
    );
    expect(html).toContain("**Patient :-** Khushi Ahuja");
  });

  it("prints bank, UPI and totals side by side", () => {
    const html = render();
    expect(html).not.toContain("is-totals-only");
    const out = text(html);
    expect(out).toContain(
      "Bank Details Account Name 3D ALIGN Account Number 38445234884 IFSC SBIN0004423 Account Type Current Bank State Bank of India"
    );
    expect(out).toContain(
      "Scan to pay via UPI Maximum of 1 lakh can be transferred via upi in a single day"
    );
    expect(out).toContain("9898928288-1@okbizaxis");
    expect(html).toMatch(/class="tda-upi-qr" src="data:image\//);
    expect(out).toContain(
      "Amount ₹3,500.00 Discounts (₹1,500.00) Total (INR) ₹2,000.00"
    );
  });

  it("signs with the account's signature label", () => {
    const html = render();
    expect(html).toContain('class="ceres-image tda-signature-img"');
    expect(html).toContain('<p class="tda-signature-label">3D ALIGN</p>');
    const unlabelled = render({
      customLabels: { ...basePayload().customLabels, signature: "" },
    });
    expect(unlabelled).not.toContain("tda-signature-label");
  });

  it("sizes the terms, notes and attachments headings like Bank Details", () => {
    const html = render({
      notes: "Note",
      attachments: ["https://x.test/a.pdf"],
    });
    const headings = [...html.matchAll(/<h2 class="([^"]+)">([^<]+)<\/h2>/g)];
    const byText = Object.fromEntries(
      headings.map(([, cls, txt]) => [txt.trim(), cls])
    );
    [
      "Bank Details",
      "Terms and Conditions",
      "Additional Notes",
      "Attachments",
    ].forEach((h) => expect(byText[h]).toBe("tda-heading tda-heading-s"));
  });

  it("heads the payment side with the total in words, on one line", () => {
    const customLabels = {
      ...basePayload().customLabels,
      totalInWordsValue: "two thousand rupees only",
    };
    const html = render({ hideTotalInWords: false, customLabels });
    const pay = html.slice(
      html.indexOf('class="tda-pay"'),
      html.indexOf('class="tda-pay-row"')
    );
    expect(text(pay)).toContain("Total (in words) : two thousand rupees only");
    expect(pay).toContain("data-ceres-total-in-words");
    // The account's "hide total in words" setting still hides it.
    const hidden = render({ hideTotalInWords: true, customLabels });
    expect(hidden).toMatch(
      /ceres-subtotal-words tda-words is-hidden-by-words-setting/
    );
  });

  it("keeps the total in words under the total when there is no payment side", () => {
    const customLabels = {
      ...basePayload().customLabels,
      totalInWordsValue: "two thousand rupees only",
    };
    const html = render({
      hideTotalInWords: false,
      customLabels,
      paymentOptions: { accountTransfer: false, upi: false },
    });
    expect(html).not.toContain("tda-words");
    expect(html).toMatch(/class="tda-totals"[\s\S]*data-ceres-total-in-words/);
  });

  it("prints terms and the contact strip", () => {
    const out = text(render());
    expect(out).toContain(
      "Terms and Conditions Aligner Fabrication & Dispatch will be initiated after receiving the complete payment in advance. Please quote invoice number when remitting funds. Courier charges will be levied extra as applicable if 3D Aligners are demanded phase-wise."
    );
    expect(render()).toContain(
      "For any enquiry, reach out via email at <b>3d.alignsolutions@gmail.com</b>, call on <b>+91 99254 28288</b>"
    );
  });

  it("never prints the account's letterhead or footer images", () => {
    const payload = basePayload();
    expect(payload.letterHead).toBeTruthy();
    expect(payload.letterHeadFooter).toBeTruthy();
    [false, true].forEach((flag) => {
      const html = render({
        template: {
          ...payload.template,
          pdfOptions: { letterHeadOnFirstPage: flag, footerOnLastPage: flag },
        },
      });
      expect(html).not.toContain(payload.letterHead);
      expect(html).not.toContain(payload.letterHeadFooter);
      expect(html).not.toMatch(/invoice-letterhead|data-ceres-height/);
    });
  });
});

describe("3d-align rows the reference does not show", () => {
  it("hides Created By unless the account shows the creator", () => {
    expect(text(render({ advanceOptions: {} }))).not.toContain("Created By");
  });

  it("prints due date, PO number and custom headers when present", () => {
    const out = text(
      render({
        dueDate: "2026-10-31T00:00:00.000Z",
        purchaseOrderNumber: "PO-77",
        customHeaders: [{ label: "Case ID", value: "C-19" }],
      })
    );
    expect(out).toContain("Due Date 2026-10-31T00:00:00.000Z");
    expect(out).toContain("PO Number PO-77");
    expect(out).toContain("Case ID C-19");
  });

  it("prints GSTIN and PAN, honouring the business field-visibility opt-out", () => {
    const billedBy = {
      ...basePayload().billedBy,
      gstin: "24ABCDE1234F1Z5",
      panNumber: "ABCDE1234F",
    };
    expect(text(render({ billedBy }))).toContain(
      "GSTIN: 24ABCDE1234F1Z5 PAN: ABCDE1234F"
    );
    const owner = {
      ...basePayload().owner,
      configuration: {
        experimental: { fieldVisibility: { gst: { showInDocument: false } } },
      },
    };
    const out = text(render({ billedBy, owner }));
    expect(out).not.toContain("GSTIN: 24ABCDE1234F1Z5");
    expect(out).toContain("PAN: ABCDE1234F");
  });

  it("prints tax rows on a tax invoice, split or inter-state", () => {
    const finalTotal = {
      ...basePayload().finalTotal,
      cgst: 90,
      sgst: 90,
      igst: 180,
      total: 2180,
    };
    const intra = text(render({ invoiceType: "INVOICE", finalTotal }));
    expect(intra).toMatch(
      /Amount ₹2,000\.00 CGST ₹90\.00 SGST ₹90\.00 Total \(INR\) ₹2,180\.00/
    );
    const inter = text(
      render({ invoiceType: "INVOICE", igst: true, finalTotal })
    );
    expect(inter).toMatch(
      /Amount ₹2,000\.00 IGST ₹180\.00 Total \(INR\) ₹2,180\.00/
    );
  });

  it("moves the totals to the end when there is nothing to pay into", () => {
    const html = render({
      paymentOptions: { accountTransfer: false, upi: false },
    });
    expect(html).toContain("tda-summary is-totals-only");
    expect(html).not.toContain("tda-bank");
    expect(html).not.toContain("tda-upi");
    expect(text(html)).toContain("Total (INR) ₹2,000.00");
  });

  it("prints shipping and transport boxes when the document carries them", () => {
    const out = text(
      render({
        shippedTo: {
          name: "Clinic Store",
          city: "Surat",
          state: "Gujarat",
          country: "IN",
        },
        transportDetails: { challanNumber: "CH-9" },
      })
    );
    expect(out).toContain("Shipped To Clinic Store Surat, Gujarat, India");
    expect(out).toContain("Challan Number: CH-9");
  });

  it("shows the digital-signature placeholder until the document is signed", () => {
    expect(render({ signatureMethod: "DIGITAL" })).toContain(
      "data-ceres-signature-placeholder"
    );
    const signed = text(
      render({
        signatureMethod: "DIGITAL",
        documentSignatureRequest: {
          status: "SIGNED",
          signers: [{ signerName: "Dr. Mehta" }],
        },
      })
    );
    expect(signed).toContain("Dr. Mehta");
  });

  it("keeps the IRN QR container in the DOM, empty once the IRN is cancelled", () => {
    const html = render({
      irn: {
        Irn: "abc123",
        AckNo: "1122",
        qrCode: "data:image/png;base64,AAAA",
        CancelDate: "2026-10-18",
      },
    });
    expect(text(html)).toContain("IRN abc123");
    expect(text(html)).not.toContain("Ack No.");
    expect(html).toMatch(
      /data-ceres-field-container="qrCode" class="tda-qr is-empty"/
    );
  });

  it("prints notes and attachments under the account's labels", () => {
    const out = text(
      render({
        notes: "Bring the retainer",
        attachments: ["https://x.test/a.pdf"],
      })
    );
    expect(out).toContain("Additional Notes Bring the retainer");
    expect(out).toContain("Attachments https://x.test/a.pdf");
  });
});

describe("3d-align styles", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/templates/3d-align/styles.css"),
    "utf8"
  );
  const pageRule = css.match(/@page\s*\{([^}]*)\}/)?.[1] ?? "";

  it("keeps 38mm clear at the top and 45mm at the bottom of every printed page", () => {
    expect(pageRule).toMatch(/margin-top:\s*38mm;/);
    expect(pageRule).toMatch(/margin-bottom:\s*45mm;/);
  });

  it("leaves the side margins and page size to the PDF service", () => {
    expect(pageRule).not.toMatch(
      /margin(-left|-right|-inline)?\s*:|margin\s*:|size\s*:/
    );
    expect(css.match(/@page\s*\{/g)).toHaveLength(1);
  });

  it("shows the same bands on screen and drops them in print", () => {
    expect(css).toMatch(/--tda-band-top:\s*38mm;/);
    expect(css).toMatch(/--tda-band-bottom:\s*45mm;/);
    expect(css).toMatch(
      /\.tda-shell \{[^}]*padding-block: var\(--tda-band-top\) var\(--tda-band-bottom\);/
    );
    expect(css).toMatch(
      /@media print \{[\s\S]*?\.tda-shell \{[^}]*padding-block: 0;/
    );
  });

  it("previews at the same 1000px page width as the other templates", () => {
    expect(css).toMatch(
      /\.tda-shell \{[^}]*max-width: 1000px;\s*margin: 0 auto;/
    );
    expect(css).toMatch(
      /@media print \{[\s\S]*?\.tda-shell \{[^}]*max-width: none;/
    );
  });

  it("keeps content-sized columns when the account turns text wrap on", () => {
    expect(css).toMatch(
      /\.tda-items \.line-items-table\.is-wrap-enabled \{\s*table-layout: auto;/
    );
  });

  it("stripes item rows white then lavender, with no rules or dividers", () => {
    expect(css).toMatch(/tbody tr\.row-even \{\s*background: #fff;/);
    expect(css).toMatch(
      /tbody tr\.row-odd \{\s*background: var\(--tda-row-tint\);/
    );
    expect(css).toMatch(/--tda-row-tint: #efebf8;/);
    expect(css).not.toMatch(/tbody td[^{]*\{[^}]*border-(block|inline)/);
  });

  it("adds no side gutter of its own; the host's side margins frame the page", () => {
    const page = css.match(/\.tda-page \{([^}]*)\}/)?.[1] ?? "";
    expect(page).toContain("gap: 12px;");
    expect(page).not.toMatch(/padding/);
  });

  it("frames the item table in faint lavender on the sides and foot", () => {
    expect(css).toMatch(/--tda-frame: #e6e0f3;/);
    const table =
      css.match(/\.tda-items \.line-items-table \{([^}]*)\}/)?.[1] ?? "";
    expect(table).toContain("border: 1px solid var(--tda-frame);");
    expect(table).toContain("border-top: 0;");
  });

  it("smooths text antialiased", () => {
    const shell = css.match(/\.tda-shell \{([^}]*)\}/)?.[1] ?? "";
    expect(shell).toContain("-webkit-font-smoothing: antialiased;");
    expect(shell).toContain("-moz-osx-font-smoothing: grayscale;");
  });

  it("rules the grand total with 1px lines above and below", () => {
    const grand =
      css.match(
        /\.ceres-subtotal-row-grand > \.ceres-subtotal-value \{([^}]*)\}/
      )?.[1] ?? "";
    expect(grand).toContain("border-block: 1px solid var(--tda-ink);");
  });

  it("sets the total in words at 13px bold, label and value alike", () => {
    expect(css).toMatch(
      /\.ceres-subtotal-words\.tda-words \{[^}]*font-size: var\(--tda-font-size-base\);/
    );
    expect(css).toMatch(
      /\.ceres-subtotal-words\.tda-words \{[^}]*font-weight: 600;/
    );
    expect(css).toMatch(
      /\.tda-words \.ceres-subtotal-words-label \{\s*font-weight: 600;/
    );
  });

  it("sets the UPI note at the body's 1.5 line height", () => {
    expect(css).toMatch(/\.tda-upi-note \{[^}]*line-height: 1\.5;/);
  });

  it("hides the widget's own total in words while the payment side shows it", () => {
    expect(css).toMatch(
      /\.tda-summary:not\(\.is-totals-only\) \.tda-totals \.ceres-subtotal-words \{\s*display: none;/
    );
    expect(css).toMatch(
      /\.tda-words \.ceres-subtotal-words-value \{\s*text-transform: uppercase;/
    );
  });

  it("rounds the boxes and the item table at 8px", () => {
    const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map(
      (m) => m[1]
    );
    expect(radii.length).toBeGreaterThanOrEqual(2);
    radii.forEach((r) => expect(r).toBe("8px"));
  });

  it("prints the line number as 1.", () => {
    expect(css).toMatch(
      /tbody td\.col-index:not\(:empty\)::after \{\s*content: "\.";/
    );
  });

  it("pads the item table's cells 8px", () => {
    expect(css).toMatch(
      /\.line-items-table th,\s*\.tda-items \.line-items-table td \{\s*padding: 8px;/
    );
    // The figure columns are spread by width, never by extra padding.
    expect(css).not.toMatch(/padding-inline: 32px/);
    expect(css).toMatch(
      /:is\(th, td\):not\(\.col-index, \.col-item, \.item-extras-cell\) \{\s*min-width: 120px;/
    );
  });

  it("sets the item description right under the item name", () => {
    expect(css).toMatch(/tr\.item-extras-row td \{\s*padding-block-start: 0;/);
    expect(css).toMatch(
      /\.toastui-editor-contents > :first-child \{\s*margin-block-start: 0;/
    );
    expect(css).toMatch(
      /\.toastui-editor-contents > :last-child \{\s*margin-block-end: 0;/
    );
  });

  it("never resolves a font size below 10px, screen or print", () => {
    const sizes = [
      ...css.matchAll(/(?:font-size|--tda-font-size-[a-z]+)\s*:\s*([\d.]+)px/g),
    ].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(9);
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
