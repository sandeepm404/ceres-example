import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";

const basePayload = (extra: Record<string, unknown> = {}) => ({
  invoiceTitle: "Quotation",
  invoiceNumber: "A00004",
  items: [{ _id: "1", name: "Elliptical Cross Trainer", quantity: 1, rate: 100, amount: 100 }],
  ...extra,
});

const render = (payload: Record<string, unknown>) =>
  template(normalizeInvoiceTemplateState(payload as any));

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

beforeAll(registerFitkingHelpers);

describe("fitking party custom fields", () => {
  it("renders custom fields on every party block", () => {
    const html = render(
      basePayload({
        billedBy: { name: "Fitking", customFields: [{ label: "Client ID", value: "C-1" }] },
        billedTo: { name: "Buyer", customFields: [{ label: "Buyer Code", value: "B-2" }] },
        shippedFrom: { name: "Warehouse", customFields: [{ label: "Dock", value: "D-3" }] },
        shippedTo: { name: "Site", customFields: [{ label: "Site Ref", value: "S-4" }] },
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

    expect(customRows(html)).toEqual(["Client ID=C-1", "CIN=U74999", "Region=West"]);
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
            { label: "Hidden", value: "no", params: { showInInvoice: false } },
          ],
          additionalIds: [{ label: "HiddenId", value: "x", showInInvoice: false }],
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
