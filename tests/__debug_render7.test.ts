import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import { registerFitkingHelpers } from "./support/fitkingHelpers";
import template from "../src/templates/fitking/template.hbs";
import fs from "fs";

const payload = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-sandeep-Documents-ceres-example2/6e31c693-fc43-4308-aa45-00c6d6391de6/scratchpad/invoice.json", "utf8"));

describe("debug render 7", () => {
  beforeAll(registerFitkingHelpers);
  it("item table header now reads CGST instead of IGST", () => {
    const state = normalizeInvoiceTemplateState(payload as any);
    const html = template(state);
    const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "NOT FOUND";
    const headers = [...thead.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1].trim()).filter(Boolean);
    console.log("headers:", headers);
  });
});
