import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

const basePayload = () => ({
  invoiceTitle: "Invoice",
  invoiceNumber: "INV-1",
  items: [{ _id: "1", name: "Treadmill", quantity: 1, rate: 1, amount: 1 }],
  paymentOptions: { upi: true, accountTransfer: true },
  bankAccount: { accountNo: "32473093270", ifsc: "HDFC0000133" },
});

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

const srcOf = (html: string, className: string): string | null => {
  const match = new RegExp(
    `<img[^>]*src="([^"]*)"[^>]*class="${className}"`
  ).exec(html);
  return match ? match[1] : null;
};

beforeAll(registerFitkingHelpers);

describe("fitking UPI QR", () => {
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

describe("fitking document QR", () => {
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
