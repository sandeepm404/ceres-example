import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

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

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

const isFullWidth = (html: string) => html.includes("fk-desc-fullwidth-row");
const isUnderTitle = (html: string) => html.includes("fk-item-desc");

beforeAll(registerFitkingHelpers);

describe("fitking description placement", () => {
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
