import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";
import fs from "fs";

const payload = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-sandeep-Documents-ceres-example2/6e31c693-fc43-4308-aa45-00c6d6391de6/scratchpad/invoice.json", "utf8"));

describe("debug render 6", () => {
  beforeAll(registerFitkingHelpers);
  it("inspects item table columns", () => {
    console.log("RAW invoice.columns:", JSON.stringify(payload.columns, null, 2));
    const state = normalizeInvoiceTemplateState(payload as any);
    console.log("NORMALIZED columns:", JSON.stringify((state as any).mapped.columns, null, 2));
    const html = template(state);
    const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "NOT FOUND";
    console.log("=== HEADER ROW ===");
    console.log(thead);
    const firstRow = /<tbody>([\s\S]*?)<\/tr>/.exec(html)?.[1] ?? "NOT FOUND";
    console.log("=== FIRST ITEM ROW ===");
    console.log(firstRow);
  });
});
