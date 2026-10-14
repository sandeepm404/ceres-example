/**
 * @jest-environment jsdom
 */
// A line-item column linked to the item's SKU (key `inv_sku`, see
// invoicePayloadContract.ts ColumnDef.source) prints like any other business
// column: the label as its header and the line's own `item.custom.inv_sku`
// value, which can differ from the item's SKU.
import { TextEncoder, TextDecoder } from "util";
import basicFixture from "./fixtures/columns-basic.json";
import sampleFixture from "../src/types/sample.json";

// modern-manufacturing-template's widgets need these, which jsdom leaves out.
Object.assign(globalThis, { TextEncoder, TextDecoder });

const templates = [
  "basic-invoice-example",
  "default-template",
  "fitking",
  "frigo-pro-eood",
  "modern-manufacturing-template",
  "saga-engineering",
  "sami-contracting",
  "shree-vaishnavi-infratech",
  "sr-trading",
];

const withSkuColumn = (fixture: unknown, isHidden = false) => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.invoice.columns.push({
    key: "inv_sku",
    label: "Part No",
    dataType: "text",
    system: false,
    isHidden,
    source: { entity: "INVENTORY", field: "sku" },
  });
  data.invoice.items.forEach((item: any) => {
    if (!item.group) {
      item.sku = "SR-01";
      item.custom = { ...(item.custom || {}), inv_sku: "SR-01-CUST" };
    }
  });
  return data;
};

const render = (name: string, payload: unknown): string => {
  let html = "";
  jest.isolateModules(() => {
    // A fresh Handlebars and template per test, the way the browser loads one
    // template bundle per page.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    (window as any).Handlebars = require("handlebars/runtime");
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(`../src/templates/${name}`);
    const mapped = (window as any).CeresTemplateDataMapper(payload);
    (window as any).ceresInvoiceData = mapped;
    html = (window as any).CeresTemplate(mapped);
  });
  return html;
};

describe.each(templates)("%s — SKU column", (name) => {
  it.each([
    ["columns-basic", basicFixture],
    ["sample", sampleFixture],
  ])("prints the column header and the line's own value (%s)", (_, fixture) => {
    const html = render(name, withSkuColumn(fixture));

    expect(html).toContain("Part No");
    expect(html).toContain("SR-01-CUST");
  });

  it("prints nothing for a hidden SKU column", () => {
    const html = render(name, withSkuColumn(sampleFixture, true));

    expect(html).not.toContain("SR-01-CUST");
  });
});
