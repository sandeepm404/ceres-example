import fs from "node:fs";
import path from "node:path";
import HandlebarsRuntime from "handlebars/runtime";
import sample from "../src/types/sample.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/statement-vat-tax-invoices-two-ahez/template.hbs";
import {
  FIXED_LABELS,
  arabicAmountInWords,
  arabicEquivalent,
  arabicNumberWords,
  bankRows,
  descriptionInItem,
  documentDir,
  extrasRow,
  fixedLabel,
  isLanguageNeutral,
  labelRate,
  labelPair,
  partyAddress,
  partyRows,
  registerStatementVatTaxInvoicesTwoAhezHelpers,
  splitBilingual,
  splitBilingualList,
  totalsFixedLabel,
} from "../src/templates/statement-vat-tax-invoices-two-ahez/helpers";
import ceresImagePartial from "../src/widgets/image/CeresImage.hbs";
import brandingPartial from "../src/widgets/refrens-branding/RefrensBranding.hbs";
import { computeSubtotalRows } from "../src/widgets/subtotal/utils";
import { qrSrc } from "../src/widgets/qr-code";
import registerFormatCurrencyHelper from "../src/widgets/shared/registerFormatCurrencyHelper";
import registerTaxFlagHelpers from "../src/widgets/shared/registerTaxFlagHelpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

/*
 * Built on the synthetic payload in src/types/sample.json. The shared pieces
 * with importable logic render for real (Subtotal model, CeresImage, branding,
 * qrSrc); partials with no logic of their own are stubbed.
 */
beforeAll(() => {
  const HB = HandlebarsRuntime;
  registerStatementVatTaxInvoicesTwoAhezHelpers(HB);
  registerFormatCurrencyHelper(HB);
  registerTaxFlagHelpers(HB);

  HB.registerPartial("CeresImage", ceresImagePartial);
  HB.registerPartial("RefrensBranding", brandingPartial);
  HB.registerHelper(
    "computeSubtotalRows",
    (invoice: unknown, options: { hash?: Record<string, unknown> }) =>
      computeSubtotalRows(invoice, { columns: options?.hash?.columns })
  );
  HB.registerHelper("qrSrc", (v: unknown) => qrSrc(v));
  HB.registerPartial("InvoiceStatus", () => "<span>STATUS</span>");
  HB.registerPartial(
    "MarkdownViewer",
    (ctx: any) => `<span>${ctx?.markdown ?? ""}</span>`
  );
  HB.registerHelper("prepareMarkdownViewerData", (v: unknown) => ({
    markdown: v,
  }));
  HB.registerPartial("CeresImageGallery", () => "");
  HB.registerHelper("prepareImageGallery", () => ({}));
  HB.registerHelper("formatFullDateWithOffset", (v: unknown) =>
    String(v ?? "")
  );
  HB.registerPartial("TaxSummaryTable", () => "<div>TAX-SUMMARY</div>");
  HB.registerPartial("HsnSummaryTable", () => "<div>HSN-SUMMARY</div>");
  HB.registerPartial("PaymentTable", () => "<div>PAYMENT-TABLE</div>");
  HB.registerHelper("computeTaxSummary", () => ({}));
  HB.registerHelper("computeHsnSummary", () => ({}));
  HB.registerHelper("computePaymentColumns", () => ({}));
});

const basePayload = (): any => JSON.parse(JSON.stringify(sample));

const withInvoice = (over: Record<string, unknown>): any => {
  const payload = basePayload();
  payload.invoice = { ...payload.invoice, ...over };
  return payload;
};

// Mirrors index.ts's data mapper.
const render = (payload: any = basePayload()): string =>
  template(normalizeInvoiceTemplateState(payload));

const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const ARABIC = /[؀-ۿﭐ-﷿ﹰ-﻿]/u;

describe("fixed label set", () => {
  it("holds Arabic text for every key and nothing else", () => {
    Object.values(FIXED_LABELS.ar).forEach((label) => {
      expect(label.trim()).not.toBe("");
    });
    expect(fixedLabel("total")).toMatch(ARABIC);
    expect(fixedLabel("no-such-label")).toBe("");
  });

  it("is never typed into the layout", () => {
    const markup = fs.readFileSync(
      path.join(
        __dirname,
        "../src/templates/statement-vat-tax-invoices-two-ahez/template.hbs"
      ),
      "utf8"
    );
    expect(markup).not.toMatch(ARABIC);
  });

  it("labels totals rows by key and carries the rate across", () => {
    expect(totalsFixedLabel("igst")).toBe(fixedLabel("vat"));
    expect(totalsFixedLabel("igst:5")).toBe(fixedLabel("vat"));
    expect(totalsFixedLabel("total")).toBe(fixedLabel("total"));
    expect(totalsFixedLabel("charge:abc")).toBe("");
    expect(labelRate("VAT(5%)")).toBe("5%");
    expect(labelRate("Discount")).toBe("");
  });
});

describe("Arabic total in words", () => {
  it("spells numbers with the Arabic scale words", () => {
    expect(arabicNumberWords(0)).toBe("صفر");
    expect(arabicNumberWords(21)).toBe("واحد وعشرون");
    expect(arabicNumberWords(2000)).toBe("ألفان");
    expect(arabicNumberWords(3000)).toBe("ثلاثة آلاف");
    expect(arabicNumberWords(94240)).toBe("أربعة وتسعون ألفاً ومائتان وأربعون");
    expect(arabicNumberWords(1000001)).toBe("مليون وواحد");
  });

  it("adds the currency, the sub-unit and 'only'", () => {
    expect(
      arabicAmountInWords({
        currency: "SAR",
        subUnitLength: 2,
        finalTotal: { total: 12.5 },
      })
    ).toBe("اثنا عشر ريال سعودي وخمسون هللة فقط");
    expect(
      arabicAmountInWords({ currency: "XYZ", finalTotal: { total: 3 } })
    ).toBe("ثلاثة XYZ فقط");
    expect(arabicAmountInWords({ finalTotal: {} })).toBe("");
  });

  it("prints beside the English words on the page", () => {
    const out = text(render());
    expect(out).toContain(arabicAmountInWords(basePayload().invoice));
  });
});

describe("bilingual values", () => {
  const AR = fixedLabel("city");

  it("splits a value typed in both languages", () => {
    expect(splitBilingual(`Acme Co ${AR}`)).toEqual({
      en: "Acme Co",
      ar: AR,
      gap: " ",
      arFirst: false,
    });
    expect(splitBilingual(`${AR} Acme Co`)).toMatchObject({
      en: "Acme Co",
      ar: AR,
      arFirst: true,
    });
    expect(splitBilingual(`${AR} | Acme Co`)).toMatchObject({
      en: "Acme Co",
      ar: AR,
      arFirst: true,
    });
    // Numbers stay with the words they belong to.
    expect(splitBilingual(`12 Main St ${AR} - 345`)).toMatchObject({
      en: "12 Main St",
      ar: `${AR} - 345`,
    });
    expect(splitBilingual(`12 Main St | 12 ${AR}`)).toMatchObject({
      en: "12 Main St",
      ar: `12 ${AR}`,
    });
    expect(splitBilingual(`Line one\n${AR}`)).toMatchObject({
      en: "Line one",
      ar: AR,
    });
  });

  it("keeps one-language values on their own side", () => {
    expect(splitBilingual("Plain text")).toMatchObject({ en: "Plain text", ar: "" });
    expect(splitBilingual(AR)).toMatchObject({ en: "", ar: AR });
    expect(splitBilingual("")).toMatchObject({ en: "", ar: "" });
  });

  it("stacks a long two-language address value and lets Arabic set its direction", () => {
    const { street } = basePayload().invoice.billedBy;
    const long = `${street}, ${street} | ${AR} ${AR} ${AR}`;
    const [row] = partyRows({ street: long }, {});
    expect(row).toMatchObject({ value: `${street}, ${street}`, long: true });
    expect(partyRows({ street }, {})[0].long).toBe(false);

    const payload = basePayload();
    payload.invoice.billedBy.street = long;
    const html = render(payload);
    expect(html).toContain('class="vt-av is-long" dir="rtl"><bdi dir="auto">');
  });

  it("composes the shipping address line from its parts, per language", () => {
    const { shippedTo } = basePayload().invoice;
    const plain = partyAddress(shippedTo);
    expect(plain.en).toBe(
      `${shippedTo.street}, ${shippedTo.city}, ${shippedTo.state}, ${shippedTo.country} - ${shippedTo.pincode}`
    );
    expect(plain.ar).toBe("");

    const both = partyAddress({ ...shippedTo, city: `${shippedTo.city} ${AR}` });
    expect(both.en).toContain(shippedTo.city);
    expect(both.ar).toContain(AR);
    expect(both.ar).toContain(shippedTo.pincode);

    expect(partyAddress({ address: `Line ${AR}` })).toMatchObject({ en: "Line", ar: AR });
  });

  it("prints the composed address in the Shipped To card", () => {
    const { shippedTo } = basePayload().invoice;
    expect(text(render())).toContain(`${shippedTo.street}, ${shippedTo.city}`);
  });

  it("splits a two-language label: user's Arabic wins, else the fixed one", () => {
    expect(labelPair(`${AR} Total`, "total")).toEqual({ en: "Total", ar: AR });
    expect(labelPair("Total", "total")).toEqual({
      en: "Total",
      ar: fixedLabel("total"),
    });
    expect(labelPair(AR, "vatNumber")).toEqual({ en: "", ar: AR });
    expect(labelPair("", "total")).toEqual({ en: "", ar: fixedLabel("total") });
  });

  it("prints a two-language custom label once per side", () => {
    const payload = basePayload();
    payload.invoice.customLabels.signature = `${AR} Signed By`;
    payload.invoice.invoiceTitle = `${AR} Bill`;
    const html = render(payload);
    const out = text(html);
    expect(html).toContain('<p class="vt-sign-label">Signed By</p>');
    expect(html).toContain(`dir="rtl" lang="ar">${AR}</p>`);
    expect(out).not.toContain(fixedLabel("signature"));
    expect(out).not.toContain(fixedLabel("taxInvoice"));
  });

  it("keeps an Arabic-first item name intact in its cell", () => {
    const payload = basePayload();
    const name = `${AR} ${payload.invoice.items[0].name}`;
    payload.invoice.items[0].name = name;
    expect(text(render(payload))).toContain(name);
  });

  it("keeps a two-language item name intact in its cell", () => {
    const payload = basePayload();
    const name = `${payload.invoice.items[0].name} ${AR}`;
    payload.invoice.items[0].name = name;
    expect(text(render(payload))).toContain(name);
  });

  it("splits each term of a group", () => {
    expect(splitBilingualList([`Pay soon\n${AR}`, "Net 30"])).toEqual({
      en: ["Pay soon", "Net 30"],
      ar: [AR],
    });
  });

  it("prints the Arabic part of a party name and an item on the Arabic side", () => {
    const payload = basePayload();
    const { name } = payload.invoice.billedBy;
    payload.invoice.billedBy.name = `${name} ${AR}`;
    payload.invoice.items[0].name = `${payload.invoice.items[0].name} ${AR}`;
    const html = render(payload);
    expect(html).toContain(`<span dir="rtl" lang="ar">${AR}</span>`);
    expect(html).toContain(`class="item-name vt-item-ar" dir="rtl" lang="ar">${AR}`);
  });
});

describe("rows", () => {
  it("gives coded values their Arabic equivalent", () => {
    const { billedBy } = basePayload().invoice;
    const name = arabicEquivalent("country", billedBy.country.toLowerCase());
    expect(name).toMatch(ARABIC);
    expect(arabicEquivalent("country", "ZZZ")).toBe("");
    expect(arabicEquivalent("city", billedBy.city)).toBe("");
    const rows = partyRows({ country: billedBy.country }, {});
    expect(rows[0].arValue).toBe(name);
  });

  it("repeats only language-neutral values on the Arabic side", () => {
    const { billedBy } = basePayload().invoice;
    expect(isLanguageNeutral(billedBy.pincode)).toBe(true);
    expect(isLanguageNeutral("100-200")).toBe(true);
    expect(isLanguageNeutral(billedBy.city)).toBe(false);
    expect(isLanguageNeutral("")).toBe(false);
  });

  it("drops empty address fields and pairs each with its Arabic label", () => {
    const rows = partyRows(
      { name: "X", building: "12", city: "Pune", country: "" },
      {}
    );
    expect(rows.map((row) => row.key)).toEqual(["building", "city"]);
    expect(rows[0]).toMatchObject({
      label: "Building No.",
      value: "12",
      arValue: "12",
      arLabel: fixedLabel("building"),
    });
    expect(rows[1].arValue).toBe("");
  });

  it("honours the party opt-outs", () => {
    const rows = partyRows(
      { phone: "1", phoneShowInInvoice: false, email: "a@b.c" },
      { email: "Email" }
    );
    expect(rows.map((row) => row.key)).toEqual(["email"]);
  });

  it("reads both bank shapes and falls back to fixed English labels", () => {
    const rows = bankRows({
      bankAccount: { bankName: "B1", accountHolderName: "H1", accountNo: "9" },
      customLabels: {},
    });
    expect(rows.map((row) => [row.value, row.label])).toEqual([
      ["B1", "Bank Name"],
      ["H1", "Account Holder Name"],
      ["9", "Account Number"],
    ]);
    rows.forEach((row) => expect(row.arLabel).toMatch(ARABIC));
  });

  it("prefers the account's own bank labels", () => {
    const { bankAccount } = basePayload().invoice;
    const rows = bankRows({ bankAccount, customLabels: {} });
    const label = (key: string) => rows.find((row) => row.key === key)?.label;
    expect(label("accountNumber")).toBe(bankAccount.customLabels.accountNumber);
    expect(label("accountType")).toBe("Account Type");
  });

  it("moves a description that is not full width into the item cell", () => {
    expect(descriptionInItem({ hasDescription: true })).toBe(true);
    expect(extrasRow({ hasDescription: true })).toBe(false);
    expect(
      extrasRow({ hasDescription: true, descriptionFullWidth: true })
    ).toBe(true);
  });

  it("follows the document's RTL toggle", () => {
    expect(documentDir({ template: { rtl: true } })).toBe("rtl");
    expect(documentDir({})).toBe("ltr");
  });
});

describe("render", () => {
  it("prints the document, parties, items and grand total", () => {
    const html = render();
    const out = text(html);
    const { invoice } = basePayload();
    expect(out).toContain(invoice.invoiceNumber);
    expect(out).toContain(invoice.billedBy.name);
    expect(out).toContain(invoice.billedTo.name);
    invoice.items.forEach((item: any) => expect(out).toContain(item.name));
    expect(html).toContain('data-ceres-subtotal-row="total"');
    expect(out).toContain(fixedLabel("total"));
    expect(out).toContain(fixedLabel("seller"));
    expect(out).not.toMatch(/undefined|NaN|\[object Object\]/);
  });

  it("prints a custom label as entered and hides it when cleared", () => {
    const payload = basePayload();
    payload.invoice.customLabels.invoiceNumber = "Bill Ref";
    expect(text(render(payload))).toContain("Bill Ref");

    payload.invoice.customLabels.invoiceNumber = "";
    payload.invoice.customLabels.signature = "";
    const out = text(render(payload));
    expect(out).not.toContain("Bill Ref");
    expect(out).toContain(payload.invoice.invoiceNumber);
    expect(out).not.toContain("Authorised Signatory");
    expect(out).toContain(fixedLabel("signature"));
  });

  it("hides the shipping and transport cards when the document has none", () => {
    const html = render(
      withInvoice({ shippedTo: undefined, transportDetails: undefined })
    );
    expect(text(html)).not.toContain(fixedLabel("shippedTo"));
    expect(text(html)).not.toContain(fixedLabel("transportDetails"));
  });

  it("sets the page direction from the document", () => {
    const html = render(withInvoice({ template: { rtl: true } }));
    expect(html).toMatch(/class="vt-shell"\s+dir="rtl"/);
  });
});

describe("styles.css as text", () => {
  const css = fs.readFileSync(
    path.join(
      __dirname,
      "../src/templates/statement-vat-tax-invoices-two-ahez/styles.css"
    ),
    "utf8"
  );
  const sizes = [
    ...css.matchAll(/(?:font-size|--[\w-]*font-size-[\w-]+)\s*:\s*([\d.]+)px/g),
  ].map((match) => Number(match[1]));

  it("finds font-size declarations to check", () => {
    expect(sizes.length).toBeGreaterThan(5);
  });

  it("keeps every font size at or above 10px", () => {
    sizes.forEach((size) => expect(size).toBeGreaterThanOrEqual(10));
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
