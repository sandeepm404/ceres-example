import fs from "node:fs";
import path from "node:path";
import HandlebarsRuntime from "handlebars/runtime";
import sample from "../src/types/sample.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/sami-contracting/template.hbs";
import {
  lastPageSlack,
  pagedShift,
  attachmentName,
  totalQuantity,
  isIssuedFrom,
  issuedFromField,
  sellerPhone,
  bankFields,
  documentDir,
  documentFont,
  documentLang,
  documentScript,
  googleFontHref,
  fixedTotals,
  isProductCodeColumn,
  printZoom,
  rendererPrintZoom,
  productCodeFirst,
  withFillerRow,
  descriptionInItemCell,
  partyFields,
  registerSamiContractingTemplateHelpers,
} from "../src/templates/sami-contracting/helpers";
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
 * Subtotal, CeresImage, RefrensBranding, qrSrc, formatCurrency. Only partials that
 * register against `window.Handlebars` with no importable logic are stubbed.
 */
beforeAll(() => {
  const HB = HandlebarsRuntime;
  registerSamiContractingTemplateHelpers(HB);
  registerFormatCurrencyHelper(HB);
  registerTaxFlagHelpers(HB);

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

const baseInvoice = (): any =>
  JSON.parse(JSON.stringify((sample as any).invoice));

const render = (over: Record<string, unknown> = {}): string =>
  template(
    normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice: { ...baseInvoice(), ...over },
    })
  );

const arabicOwner = (pdfOptions: Record<string, unknown>) => ({
  ...baseInvoice().owner,
  configuration: { ...(baseInvoice().owner?.configuration ?? {}), pdfOptions },
});

describe("sami-contracting helpers", () => {
  it("reads the script from the business pdfOptions first, then the document, then the older key", () => {
    expect(
      documentScript(
        {
          owner: {
            configuration: {
              pdfOptions: { script: "arabic" },
              script: "latin",
            },
          },
        },
        { script: "hebrew" }
      )
    ).toBe("arabic");
    expect(
      documentScript(
        { owner: { configuration: { script: "latin" } } },
        { script: " hebrew " }
      )
    ).toBe("hebrew");
    expect(
      documentScript({ owner: { configuration: { script: "latin" } } }, {})
    ).toBe("latin");
    expect(documentScript(undefined, undefined)).toBe("");
  });

  it("reads the script font from the same places", () => {
    expect(
      documentFont(
        { owner: { configuration: { pdfOptions: { fontFamily: "Cairo" } } } },
        { fontFamily: "Inter" }
      )
    ).toBe("Cairo");
    expect(documentFont({}, { fontFamily: "Amiri" })).toBe("Amiri");
    expect(documentFont(null, null)).toBe("");
  });

  it("builds a Google Fonts URL only from a plain family name", () => {
    expect(googleFontHref("Noto Sans Arabic")).toBe(
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
    );
    expect(googleFontHref("Cairo');x:url(")).toBe("");
    expect(googleFontHref(undefined)).toBe("");
  });

  it("maps right-to-left scripts to a lang and leaves every other script without one", () => {
    expect(documentLang("arabic")).toBe("ar");
    expect(documentLang("Hebrew")).toBe("he");
    expect(documentLang("latin")).toBe("");
    expect(documentLang(Number.NaN)).toBe("");
  });

  it("is rtl only when template.rtl is exactly true", () => {
    expect(documentDir({ template: { rtl: true } })).toBe("rtl");
    expect(documentDir({ template: { rtl: "true" } })).toBe("ltr");
    expect(documentDir(undefined)).toBe("ltr");
  });

  it("flattens a party's labelled extras, honouring the opt-out flags", () => {
    expect(
      partyFields({
        customFields: [
          { label: "Field", value: "A" },
          { name: "Named", value: 7 },
          { label: "Hidden", value: "x", params: { showInInvoice: false } },
          { label: "", value: "no label" },
        ],
        additionalIds: [
          { label: "رقم السجل التجاري", value: "4650039100" },
          { label: "Hidden id", value: "y", showInInvoice: false },
        ],
        customHeaders: [
          { label: "Header", value: "H" },
          { label: "Empty", value: "" },
        ],
      })
    ).toEqual([
      { label: "Field", value: "A" },
      { label: "Named", value: "7" },
      { label: "رقم السجل التجاري", value: "4650039100" },
      { label: "Header", value: "H" },
    ]);
    expect(partyFields(undefined)).toEqual([]);
  });

  it("prints bank values with payload labels only, never an English fallback", () => {
    expect(bankFields({})).toEqual([]);
    expect(bankFields({ bankAccount: "nope" })).toEqual([]);
    expect(
      bankFields({
        customLabels: { iban: "الآيبان" },
        bankAccount: {
          name: "Sami Est",
          bank: "Al Rajhi",
          iban: "SA0380000000608010167519",
          accountNumber: "",
          customLabels: { bankName: "اسم البنك" },
          customFields: [
            { label: "Branch", value: "Madinah" },
            { label: "Hidden", value: "x", params: { showInInvoice: false } },
            { label: "", value: "unlabelled" },
          ],
        },
      })
    ).toEqual([
      { label: "", value: "Sami Est" },
      { label: "اسم البنك", value: "Al Rajhi" },
      { label: "الآيبان", value: "SA0380000000608010167519" },
      { label: "Branch", value: "Madinah" },
    ]);
  });

  it("names an attachment by its file, decoded and without the query string", () => {
    expect(
      attachmentName(
        "https://x.test/a/%D9%81%D8%A7%D8%AA%D9%88%D8%B1%D8%A9.pdf?sig=1"
      )
    ).toBe("فاتورة.pdf");
    expect(attachmentName("https://x.test/bad%E0%A4%A.pdf")).toBe(
      "bad%E0%A4%A.pdf"
    );
    expect(attachmentName(null)).toBe("");
  });

  it("sums item quantities for the number-of-items line", () => {
    expect(totalQuantity([{ quantity: 9 }])).toBe(9);
    expect(
      totalQuantity([
        { quantity: 0.1 },
        { quantity: "0.2" },
        { quantity: "x" },
        null,
      ])
    ).toBe(0.3);
    expect(totalQuantity(undefined)).toBe(0);
  });

  it("recognises the issued-from field by its label, tolerating spacing and a colon", () => {
    expect(isIssuedFrom({ label: "المصدر من" })).toBe(true);
    expect(isIssuedFrom({ label: "  المصدر   من :" })).toBe(true);
    expect(isIssuedFrom({ name: "المصدر من" })).toBe(true);
    expect(
      isIssuedFrom({ label: "المصدر من", params: { showInInvoice: false } })
    ).toBe(false);
    expect(isIssuedFrom({ label: "الوصف" })).toBe(false);
    expect(isIssuedFrom(undefined)).toBe(false);
    const field = { label: "المصدر من", value: "-" };
    expect(issuedFromField([{ label: "الوصف" }, field])).toBe(field);
    expect(issuedFromField([{ label: "الوصف" }])).toBeNull();
    expect(issuedFromField(undefined)).toBeNull();
    // Same reading, different code points: direction marks, tatweel, diacritics.
    expect(isIssuedFrom({ label: "\u200Fالمصـدر مِن\u200E:" })).toBe(true);
    expect(isIssuedFrom({ label: "المصدر من", showInInvoice: false })).toBe(
      false
    );
    const header = { label: "المصدر من", value: "الرياض" };
    expect(issuedFromField([], [header])).toBe(header);
  });

  it("takes the seller phone from billed by, else the document contact", () => {
    expect(
      sellerPhone({
        billedBy: { phone: "0598636451" },
        contact: { phone: "x" },
      })
    ).toBe("0598636451");
    expect(
      sellerPhone({
        billedBy: { phone: "0598636451", phoneShowInInvoice: false },
        contact: { phone: "+966 1" },
      })
    ).toBe("+966 1");
    expect(sellerPhone({ contact: { phone: "+966 2" } })).toBe("+966 2");
    expect(sellerPhone(undefined)).toBe("");
  });

  it("registers eq and an or that ignores the options hash", () => {
    const HB = HandlebarsRuntime as any;
    const opts = { hash: {} };
    expect(HB.helpers.eq(false, false)).toBe(true);
    expect(HB.helpers.or(0, "", opts)).toBe(false);
    expect(HB.helpers.or(0, "x", opts)).toBe(true);
  });
});

describe("sami-contracting direction and script", () => {
  it("renders left-to-right with no lang by default", () => {
    const html = render();
    expect(html).toMatch(/class="smc-shell"\s+dir="ltr"\s+data-script=""/);
    expect(html).not.toContain("lang=");
  });

  it("flips to rtl when the document's template.rtl is on", () => {
    const html = render({ template: { ...baseInvoice().template, rtl: true } });
    expect(html).toContain('dir="rtl"');
  });

  it("sets lang, the script hook and the script font from the business pdfOptions", () => {
    const html = render({
      owner: arabicOwner({ script: "arabic", fontFamily: "Cairo" }),
    });
    expect(html).toContain('data-script="arabic"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain("style=\"--smc-script-font: 'Cairo';\"");
    // Handlebars entity-escapes "=" and "&" in the attribute; the browser decodes them.
    const decoded = html.replace(/&#x3D;/g, "=").replace(/&amp;/g, "&");
    expect(decoded).toContain(
      'href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap"'
    );
  });

  it("never writes a font name that is not a plain family into the style attribute", () => {
    const html = render({
      owner: arabicOwner({
        script: "arabic",
        fontFamily: "x'; background: red",
      }),
    });
    expect(html).not.toContain("--smc-script-font");
    expect(html).not.toContain("fonts.googleapis.com/css2?family=x");
  });

  it("zooms the shell by the text scale, pdfOptions first", () => {
    expect(render({ textScale: 1.2 })).toContain('style=" zoom: 1.2;"');
    expect(
      render({
        textScale: 1.2,
        advanceOptions: { ...baseInvoice().advanceOptions, textScale: "0.9" },
      })
    ).toContain('style=" zoom: 0.9;"');
    expect(
      render({
        textScale: 1.2,
        template: {
          ...baseInvoice().template,
          pdfOptions: { ...baseInvoice().template?.pdfOptions, textScale: 1.5 },
        },
      })
    ).toContain('style=" zoom: 1.5;"');
  });

  it("writes the zoom beside the script font in one style attribute", () => {
    const html = render({
      textScale: 1.1,
      owner: arabicOwner({ script: "arabic", fontFamily: "Cairo" }),
    });
    expect(html).toContain("style=\"--smc-script-font: 'Cairo'; zoom: 1.1;\"");
  });

  it("drops a text scale that is not a positive number", () => {
    [0, -1, "1; background: red", "abc", ""].forEach((textScale) =>
      expect(render({ textScale })).not.toContain("zoom:")
    );
    expect(render()).not.toMatch(/class="smc-shell"[^>]*style=/);
  });

  it("keeps the shell as the first element, with the font link inside it", () => {
    const html = render({
      owner: arabicOwner({ script: "arabic", fontFamily: "Cairo" }),
    }).trim();
    expect(html.startsWith('<div class="smc-shell"')).toBe(true);
  });
});

describe("sami-contracting print zoom", () => {
  it("applies the 'smaller' text scale (0.8) itself and leaves every other value to the renderer", () => {
    expect(printZoom({ zoomSize: 0.8 })).toBe("0.8");
    expect(printZoom({ zoomSize: "0.8" })).toBe("0.8");
    [0.9, 1, 1.1, undefined, "x"].forEach((zoomSize) =>
      expect(printZoom({ zoomSize })).toBe("")
    );
    expect(printZoom(undefined)).toBe("");
  });

  it("sets the print zoom on the page for a 0.8 document only", () => {
    const at = (zoomSize: unknown) =>
      render({
        template: { ...baseInvoice().template, pdfOptions: { zoomSize } },
      });
    expect(at(0.8)).toContain(
      'class="smc-page" style="--smc-print-zoom: 0.8;"'
    );
    expect(at(0.9)).toMatch(/class="smc-page">/);
  });
});

describe("sami-contracting printed page", () => {
  it("knows the page zoom the shared renderer applies in print", () => {
    expect(rendererPrintZoom({ zoomSize: 0.9 })).toBe("0.9");
    expect(rendererPrintZoom({ zoomSize: "1.1" })).toBe("1.1");
    [0.8, 0, -1, "x", undefined].forEach((zoomSize) =>
      expect(rendererPrintZoom({ zoomSize })).toBe("")
    );
  });

  it("marks the shell with the renderer's page zoom", () => {
    const at = (pdfOptions: Record<string, unknown>) =>
      render({ template: { ...baseInvoice().template, pdfOptions } });
    expect(at({ format: "a4", zoomSize: 0.8 })).not.toContain(
      "--smc-page-zoom"
    );
    expect(at({ format: "a4", zoomSize: 0.9 })).toContain(
      "--smc-page-zoom: 0.9;"
    );
  });
});

describe("sami-contracting letterhead page scope", () => {
  const withScope = (
    letterHeadOnFirstPage: boolean,
    footerOnLastPage: boolean
  ) =>
    render({
      letterHead: "https://example.com/lh.png",
      letterHeadFooter: "https://example.com/lhf.png",
      template: {
        ...baseInvoice().template,
        pdfOptions: {
          ...baseInvoice().template?.pdfOptions,
          letterHeadOnFirstPage,
          footerOnLastPage,
        },
      },
    });

  it("keeps the letterhead and footer in the page when scoped to the first/last page", () => {
    const html = withScope(true, true);
    expect(html).toMatch(/<div class="invoice-letterhead"/);
    expect(html).toMatch(/<div class="invoice-letterhead-footer"/);
  });

  it("leaves them to the PDF service's page margins otherwise", () => {
    const html = withScope(false, false);
    expect(html).toMatch(/<div class="no-dibella invoice-letterhead"/);
    expect(html).toMatch(/<div class="no-dibella invoice-letterhead-footer"/);
  });
});

describe("sami-contracting table filler row", () => {
  const state = () =>
    normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice: baseInvoice(),
    }) as any;

  it("adds one blank cell per visible column after the items, ahead of the summary row", () => {
    const before = state();
    const after = withFillerRow(before);
    const { rows } = after.mapped;
    expect(rows).toHaveLength(before.mapped.rows.length + 1);
    const at = rows.findIndex((row: any) => row.isFillerRow);
    const summaryAt = rows.findIndex(
      (row: any) => row.rowClass === "row-summary"
    );
    if (summaryAt >= 0) expect(at).toBe(summaryAt - 1);
    expect(rows[at].rowClass).toBe("row-filler");
    expect(rows[at].cells.every((cell: any) => cell.text === "")).toBe(true);
    expect(rows[at].cells.map((cell: any) => cell.key)).toEqual(
      before.mapped.columns
        .filter((column: any) => !column.isHidden)
        .map((column: any) => column.key)
    );
  });

  it("never adds a second filler", () => {
    const once = withFillerRow(state());
    expect(withFillerRow(once).mapped.rows).toHaveLength(
      once.mapped.rows.length
    );
  });

  it("renders the filler as an empty row the item rows keep their height above", () => {
    const html = template(withFillerRow(state()));
    expect(html).toMatch(/<tr class="row-filler" aria-hidden="true">/);
  });
});

describe("sami-contracting item description placement", () => {
  const state = (fullWidth?: boolean) => {
    const invoice = baseInvoice();
    if (fullWidth !== undefined) invoice.showDescriptionFullWidth = fullWidth;
    return normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice,
    }) as any;
  };
  const itemRows = (html: string) =>
    html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));

  it("prints the description in the item cell when full width is off", () => {
    const out = descriptionInItemCell(state(false));
    const withDescription = out.mapped.rows.filter(
      (row: any) => row.extras?.descriptionInItem
    );
    expect(withDescription.length).toBeGreaterThan(0);
    withDescription.forEach((row: any) => {
      expect(row.extras.hasDescription).toBe(false);
      expect(row.extras.hasAny).toBe(
        Boolean(row.extras.imagesInline || row.extras.imagesRow)
      );
    });
    const html = itemRows(template(out));
    expect(html).toMatch(
      /<td class="[^"]*col-item[^"]*"[^>]*>[\s\S]*?<div class="item-description smc-item-description">/
    );
    expect(html).not.toMatch(
      /item-extras-cell[^>]*>\s*<div class="item-description/
    );
  });

  it("keeps the description in its own full-width row when full width is on", () => {
    const before = state(true);
    expect(descriptionInItemCell(before)).toBe(before);
    const html = itemRows(template(before));
    expect(html).not.toMatch(/smc-item-description/);
    expect(html).toMatch(
      /<div class="item-description item-description-full">/
    );
  });

  it("leaves the item cell alone for an item with no description", () => {
    const invoice = baseInvoice();
    invoice.items = invoice.items.map((item: any) => ({
      ...item,
      description: "",
    }));
    const before = normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice,
    }) as any;
    expect(descriptionInItemCell(before)).toBe(before);
  });
});

describe("sami-contracting multi-page print fit", () => {
  const row = (top: number, height = 100) => ({ top, height, repeat: 40 });

  it("moves a row that would cross a page end to the next page, with its header", () => {
    // Page 1000 high: the row at 950 crosses, so it starts at 1000 + 40.
    expect(pagedShift([row(800), row(950)], 1000)).toBe(50 + 40);
  });

  it("adds nothing when the layout is already split into pages", () => {
    expect(pagedShift([row(800), row(1040), row(1140)], 1000)).toBe(0);
  });

  it("carries earlier breaks into later rows", () => {
    // 950 → 1040 (+90); the next row, at 1050 + 90 = 1140, fits.
    expect(pagedShift([row(950), row(1050)], 1000)).toBe(90);
  });

  it("leaves no slack on a single page: the CSS stretch covers it", () => {
    expect(lastPageSlack(600, 1000)).toBe(0);
    expect(lastPageSlack(1001, 1000)).toBe(0);
  });

  it("gives the rest of the last page, kept short of the page end", () => {
    expect(lastPageSlack(1300, 1000)).toBe(698);
    expect(lastPageSlack(2950, 1000)).toBe(48);
  });
});

describe("sami-contracting totals custom fields", () => {
  it("lists extraTotalFields under the item count, label and value as entered", () => {
    const html = render({
      extraTotalFields: [
        { key: "a", label: "الموقع:", value: "المدينة المنورة" },
        { key: "b", label: "مذكرة :", value: "-" },
      ],
    });
    expect(html).toContain('<dl class="smc-extra-fields">');
    expect(html).toContain("<dt>الموقع:</dt><dd>المدينة المنورة</dd>");
    expect(html).toContain("<dt>مذكرة :</dt><dd>-</dd>");
    expect(html.indexOf("smc-extra-fields")).toBeGreaterThan(
      html.indexOf("smc-count")
    );
  });

  it("drops a field with no value, and the list when there are none", () => {
    expect(
      render({ extraTotalFields: [{ key: "a", label: "Empty", value: "" }] })
    ).not.toContain("<dt>Empty</dt>");
    expect(render({ extraTotalFields: [] })).not.toContain("smc-extra-fields");
  });
});

describe("sami-contracting bank details", () => {
  const bankAccount = {
    name: "test",
    bank: "sbi",
    accountNo: "222223220000",
    ifsc: "SBIN0003471",
    accountType: "CURRENT",
  };
  const withBank = (showBankAccount: boolean) => {
    const state = normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice: { ...baseInvoice(), bankAccount },
    }) as any;
    state.mapped.visibility.showBankUpiSection = true;
    state.mapped.visibility.showBankAccount = showBankAccount;
    return template(state);
  };

  it("prints the bank details under the totals, headed تفاصيل البنك", () => {
    const html = withBank(true);
    const end = html.indexOf('class="smc-summary-end"');
    const block = html.indexOf('class="smc-bank-details"');
    expect(block).toBeGreaterThan(html.indexOf("smc-totals"));
    expect(block).toBeGreaterThan(end);
    expect(html).toContain('<p class="smc-bank-title">تفاصيل البنك</p>');
    expect(html).toContain("222223220000");
    expect(html).toContain("SBIN0003471");
  });

  it("follows the account's bank-account setting", () => {
    expect(withBank(false)).not.toContain("smc-bank-details");
  });
});

describe("sami-contracting addresses", () => {
  it("prints the client's district with the street", () => {
    const html = render({
      billedTo: {
        ...baseInvoice().billedTo,
        street: "شارع الأمير ماجد",
        district: "حي الصفا",
      },
    });
    expect(html).toContain("شارع الأمير ماجد، حي الصفا");
  });
});

describe("sami-contracting ZATCA QR", () => {
  const TLV =
    "AQ5TYXVkaSBCdXNpbmVzcwIPMzExMzE1MDI3NDAwMDAzAxQyMDI2LTA3LTMxVDEzOjA3OjM3WgQHNTUyMDAwMAUGNzIwMDAw";

  it("prints the API's zatcaQr and drops the document QR", () => {
    const html = render({
      zatcaQr: TLV,
      zatcaQrCode: undefined,
      documentQr: '{"a":"b"}',
    });
    expect(html).toMatch(
      /data-ceres-field-container="zatcaQrCode" class="smc-qr"/
    );
    expect(html).not.toContain('alt="Document QR"');
  });

  it("keeps the ZATCA container empty without a ZATCA QR", () => {
    const html = render({ zatcaQr: undefined, zatcaQrCode: undefined });
    expect(html).toMatch(
      /data-ceres-field-container="zatcaQrCode" class="smc-qr is-empty"/
    );
  });
});

describe("sami-contracting product code column", () => {
  const col = (key: string, label: string) => ({ key, label });
  const row = (keys: string[]) => ({
    cells: keys.map((key) => ({ key, text: key })),
  });

  it("recognises the column by its English, Arabic or bilingual name", () => {
    expect(isProductCodeColumn(col("c1", "Product Code"))).toBe(true);
    expect(isProductCodeColumn(col("c1", "كود الصنف"))).toBe(true);
    expect(isProductCodeColumn(col("c1", "كود الصنف\nProduct  code"))).toBe(
      true
    );
    expect(isProductCodeColumn(col("name", "Item"))).toBe(false);
    expect(isProductCodeColumn(col("hsn", "HSN/SAC"))).toBe(false);
  });

  it("moves the column and its cell in every row first, keeping the rest in order", () => {
    const state = {
      invoice: {},
      mapped: {
        columns: [
          col("name", "Item"),
          col("qty", "Qty"),
          col("c1", "كود الصنف"),
          col("total", "Total"),
        ],
        rows: [
          row(["name", "qty", "c1", "total"]),
          row(["name", "qty", "c1", "total"]),
        ],
      },
    };
    const out = productCodeFirst(state);
    expect(out.mapped.columns.map((c: any) => c.key)).toEqual([
      "c1",
      "name",
      "qty",
      "total",
    ]);
    out.mapped.rows.forEach((r: any) =>
      expect(r.cells.map((c: any) => c.key)).toEqual([
        "c1",
        "name",
        "qty",
        "total",
      ])
    );
  });

  it("leaves the table alone when there is no product code column", () => {
    const state = {
      mapped: { columns: [col("name", "Item")], rows: [row(["name"])] },
    };
    expect(productCodeFirst(state)).toBe(state);
  });

  it("prints the product code heading before the item heading", () => {
    const invoice = baseInvoice();
    invoice.columns = [
      ...invoice.columns,
      { key: "productCode", label: "كود الصنف", type: "TEXT" },
    ];
    const html = template(
      productCodeFirst(
        normalizeInvoiceTemplateState({ ...(sample as any), invoice })
      )
    );
    const thead = html.slice(html.indexOf("<thead>"), html.indexOf("</thead>"));
    expect(thead.indexOf("كود الصنف")).toBeGreaterThan(-1);
    expect(thead.indexOf("كود الصنف")).toBeLessThan(
      thead.indexOf('class="col-item')
    );
  });
});

describe("sami-contracting fixed totals", () => {
  const LABELS = [
    "الإجمالي غير شامل ضريبة القيمة المضافة",
    "ضريبة القيمة المضافة",
    "الإجمالي (شامل ضريبة القيمة المضافة)",
    "إجمالي المدفوع",
    "إجمالي المستحق",
  ];

  it("works out excl. VAT, VAT, incl. VAT, paid and due", () => {
    expect(
      fixedTotals({
        finalTotal: { total: 5520, igst: 720 },
        balance: { paid: 0, due: 5520 },
        items: [{ gstRate: 15 }, { gstRate: 15 }],
      })
    ).toMatchObject({
      exclVat: 4800,
      vat: 720,
      vatRate: "15",
      total: 5520,
      paid: 0,
      due: 5520,
    });
  });

  it("formats every figure in the document's currency with its decimals, never INR", () => {
    const { text } = fixedTotals({
      currency: "SAR",
      finalTotal: { total: 5520, igst: 720 },
      balance: { paid: 0, due: 5520 },
    });
    expect(text).toEqual({
      exclVat: "⃁\u00a04,800.00",
      vat: "⃁\u00a0720.00",
      total: "⃁\u00a05,520.00",
      paid: "⃁\u00a00.00",
      due: "⃁\u00a05,520.00",
    });
    const sar = render({ currency: "SAR", customCurrencySymbol: "" });
    const block = sar.slice(
      sar.indexOf("smc-totals"),
      sar.indexOf("</table>", sar.indexOf("smc-totals"))
    );
    expect(block).toContain("⃁");
    expect(block).not.toContain("₹");
  });

  it("adds split CGST and SGST, drops a mixed rate, and derives due when absent", () => {
    expect(
      fixedTotals({
        finalTotal: { total: 1180, cgst: 90, sgst: 90 },
        balance: { paid: 180 },
        items: [{ gstRate: 18 }, { gstRate: 5 }],
      })
    ).toMatchObject({
      exclVat: 1000,
      vat: 180,
      vatRate: "",
      total: 1180,
      paid: 180,
      due: 1000,
    });
  });

  it("prints all five rows in order, even with nothing paid", () => {
    const html = render({ balance: { paid: 0, due: 147500 } });
    const at = LABELS.map((label) => html.indexOf(label));
    at.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps every row when the totals, taxes and table columns are hidden", () => {
    const html = render({
      hideTotals: true,
      hideTaxes: true,
      columns: baseInvoice().columns.map((c: any) => ({
        ...c,
        isHidden: true,
      })),
    });
    LABELS.forEach((label) => expect(html).toContain(label));
    expect(html).not.toMatch(/smc-totals[\s\S]*is-hidden-by-/);
  });
});

describe("sami-contracting blocks", () => {
  it("renders the line items through the shared widget and the fixed totals block", () => {
    const html = render();
    expect(html).toContain('class="line-items-table');
    expect(html).toContain("smc-totals");
    expect(html).toContain("Enterprise Plan Subscription");
  });

  it("prints labels from the payload and drops a label element the payload leaves empty", () => {
    const labels = {
      ...baseInvoice().customLabels,
      billedTo: "اسم العميل",
      invoiceNumber: "",
    };
    let html = render({ customLabels: labels });
    expect(html).toContain("<dt>اسم العميل</dt>");
    expect(html).not.toMatch(/<span class="smc-key">\s*<\/span>/);
    html = render({ customLabels: { ...labels, billedTo: "" } });
    expect(html).not.toContain("Billed To");
    expect(html).toContain(baseInvoice().billedTo.name);
  });

  it("lays out seller ids, then the number band, then the two detail columns", () => {
    const html = render({
      customLabels: { ...baseInvoice().customLabels, billedTo: "اسم العميل" },
      billedBy: {
        ...baseInvoice().billedBy,
        vatNumber: "300411978400003",
        vatLabel: "الرقم الضريبي",
        phone: "0598636451",
        additionalIds: [{ label: "رقم السجل التجاري", value: "4650039100" }],
      },
      billedTo: {
        ...baseInvoice().billedTo,
        vatNumber: "302007697900003",
        vatLabel: "رقم السجل الضريبي للعميل",
      },
      customFields: [
        { label: "حالة الدفع", value: "مبيعات آجلة", dataType: "TEXT" },
      ],
    });
    const seller = html.indexOf('class="smc-seller"');
    const band = html.indexOf('class="smc-band"');
    const details = html.indexOf('class="smc-details"');
    expect(seller).toBeGreaterThan(-1);
    expect(seller).toBeLessThan(band);
    expect(band).toBeLessThan(details);

    const sellerRow = html.slice(seller, band);
    expect(sellerRow).toContain("الرقم الضريبي");
    expect(sellerRow).toContain("300411978400003");
    expect(sellerRow).toContain("0598636451");

    const area = html.slice(details, html.indexOf('class="smc-items"'));
    const split = area.indexOf('class="smc-party"');
    const start = area.slice(0, split);
    const end = area.slice(split);
    expect(start).toContain("<dt>اسم العميل</dt>");
    expect(start).toContain("مبيعات آجلة");
    expect(end).toContain("302007697900003");
    expect(end).toContain(baseInvoice().billedTo.street);

    // The seller's name and CR number belong to the letterhead, not this area.
    const top = html.slice(0, html.indexOf('class="smc-items"'));
    expect(top).not.toContain("4650039100");
    expect(top).not.toContain(baseInvoice().billedBy.name);
  });

  it("has no header or footer band of its own — the letterhead slots stay", () => {
    const html = render();
    expect(html).not.toContain("smc-stripes");
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<footer");
    expect(html).toContain('data-ceres-height="letterhead"');
    expect(html).toContain('data-ceres-height="letterhead-footer"');
  });

  it("renders the ZATCA QR from the payload and keeps the patchable slot when it is absent", () => {
    let html = render({ zatcaQrCode: "data:image/png;base64,AAAA" });
    expect(html).toContain(
      'data-ceres-field="zatcaQrCode" src="data:image/png;base64,AAAA"'
    );
    html = render({ zatcaQrCode: undefined });
    expect(html).toMatch(
      /data-ceres-field-container="zatcaQrCode" class="smc-qr is-empty"/
    );
  });

  it("encodes a documentQr that carries raw content, and only when no compliance QR exists", () => {
    let html = render({
      documentQr: '{"Invoice No":"1"}',
      zatcaQrCode: undefined,
      qrCode: undefined,
      irn: undefined,
    });
    expect(html).toMatch(
      /<img src="data:image\/gif;base64,[^"]+" alt="Document QR"/
    );
    html = render({
      documentQr: '{"Invoice No":"1"}',
      zatcaQrCode: "data:image/png;base64,AAAA",
    });
    expect(html).not.toContain('alt="Document QR"');
  });

  it("shows a plain signature image, and a placeholder while a digital signature is awaited", () => {
    let html = render({
      signature: "https://x.test/sig.png",
      signatureMethod: undefined,
    });
    expect(html).toContain("smc-signature-img");
    html = render({
      signature: "https://x.test/sig.png",
      signatureMethod: "DIGITAL",
    });
    expect(html).not.toContain("smc-signature-img");
    expect(html).toContain("data-ceres-signature-placeholder");
    html = render({
      signatureMethod: "DIGITAL",
      documentSignatureRequest: {
        status: "SIGNED",
        signers: [{ signerName: "سامي" }],
      },
    });
    expect(html).toContain("<p>سامي</p>");
  });

  it("never prints a currency conversion, even for a foreign-currency document", () => {
    const html = render({
      currency: "SAR",
      conversionRates: { INR: 25.48 },
      owner: { ...baseInvoice().owner, currency: "INR" },
    });
    expect(html).toContain("smc-totals");
    expect(html).not.toContain('data-ceres-subtotal-row="conversionRate"');
    expect(html).not.toContain("ceres-subtotal-converted");
  });

  it("boxes the API's total in words in the start column, above the QR", () => {
    const words = "ثلاثة الف و مائة و خمسة ريال";
    const customLabels = {
      ...baseInvoice().customLabels,
      totalInWordsValue: words,
    };
    const html = render({ customLabels, hideTotalInWords: false });
    const start = html.slice(
      html.indexOf('class="smc-summary-start"'),
      html.indexOf('class="smc-summary-end"')
    );
    expect(start).toMatch(
      new RegExp(
        `class="ceres-subtotal-words smc-words"\\s+data-ceres-total-in-words>${words}</p>`
      )
    );
    expect(start.indexOf("smc-words")).toBeLessThan(start.indexOf("smc-qrs"));
  });

  it("keeps the widget's hide rule for the moved words box", () => {
    const html = render({
      customLabels: { ...baseInvoice().customLabels, totalInWordsValue: "x" },
      hideTotalInWords: true,
    });
    expect(html).toMatch(/smc-words is-hidden-by-words-setting/);
  });

  it("prints the number of items above the words box and created-by below it", () => {
    const items = baseInvoice().items.map((item: any) => ({
      ...item,
      quantity: 9,
    }));
    const html = render({
      items,
      creator: { name: "سامي" },
      advanceOptions: {
        ...baseInvoice().advanceOptions,
        showCreatorInInvoice: true,
      },
      customLabels: {
        ...baseInvoice().customLabels,
        totalInWordsValue: "words",
      },
    });
    const start = html.slice(
      html.indexOf('class="smc-summary-start"'),
      html.indexOf('class="smc-summary-end"')
    );
    expect(start).toContain(
      `<span class="smc-count-value">${9 * items.length}</span>`
    );
    expect(start).toContain('<span class="smc-creator-value">سامي</span>');
    const order = ["smc-count", "smc-words", "smc-creator", "smc-qrs"].map(
      (c) => start.indexOf(c)
    );
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("hides created-by unless the account shows the creator", () => {
    const html = render({
      creator: { name: "سامي" },
      advanceOptions: {
        ...baseInvoice().advanceOptions,
        showCreatorInInvoice: false,
      },
    });
    expect(html).not.toContain("smc-creator");
  });

  it("moves the issued-from field into the band and out of the details list", () => {
    const html = render({
      customFields: [
        { label: "الوصف", value: "الفترة الخاصة", dataType: "TEXT" },
        { label: "المصدر من", value: "-", dataType: "TEXT" },
      ],
    });
    const band = html.slice(
      html.indexOf('class="smc-band"'),
      html.indexOf('class="smc-details"')
    );
    expect(band).toContain('<span class="smc-key">المصدر من</span>');
    expect(band).toContain('<span class="smc-val">-</span>');
    const details = html.slice(
      html.indexOf('class="smc-details"'),
      html.indexOf('class="smc-items"')
    );
    expect(details).not.toContain("المصدر من");
    expect(details).toContain("الفترة الخاصة");
  });

  it("also finds issued-from when it is a custom header", () => {
    const html = render({
      customFields: [],
      customHeaders: [{ label: "المصدر من", value: "الرياض" }],
    });
    const band = html.slice(
      html.indexOf('class="smc-band"'),
      html.indexOf('class="smc-details"')
    );
    expect(band).toContain('<span class="smc-val">الرياض</span>');
    const details = html.slice(
      html.indexOf('class="smc-details"'),
      html.indexOf('class="smc-items"')
    );
    expect(details).not.toContain("المصدر من");
  });

  it("leaves the band to the invoice number when there is no issued-from field", () => {
    const html = render({ customFields: [] });
    expect(html).not.toContain("smc-band-end");
  });

  it("prints the seller phone with its label in the top row, from contact when billed by has none", () => {
    const html = render({
      billedBy: { ...baseInvoice().billedBy, phone: undefined },
      contact: { phone: "+966598636451" },
    });
    const row = html.slice(
      html.indexOf('class="smc-seller"'),
      html.indexOf('class="smc-band"')
    );
    expect(row).toContain('<span class="smc-key">رقم الهاتف / الجوال</span>');
    expect(row).toContain("+966598636451");
  });

  it("gates the summary tables on the account's own settings", () => {
    const off = render({
      advanceOptions: {
        ...baseInvoice().advanceOptions,
        taxSummaryView: "INVOICE_SUMMARY",
      },
    });
    expect(off).not.toContain("TAX-SUMMARY");
    const on = render({
      advanceOptions: {
        ...baseInvoice().advanceOptions,
        taxSummaryView: "TABLE",
      },
    });
    expect(on).toContain("TAX-SUMMARY");
  });
});

describe("sami-contracting styles", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/templates/sami-contracting/styles.css"),
    "utf8"
  );

  it("never resolves a font size below 10px, screen or print", () => {
    const sizes = [
      ...css.matchAll(/(?:font-size|--smc-font-size-[a-z]+)\s*:\s*([\d.]+)px/g),
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

  it("uses logical alignment and spacing only, so dir=rtl mirrors the page", () => {
    expect(css).not.toMatch(/text-align:\s*(left|right)/);
    expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    expect(css).not.toMatch(/(^|[\s;{])(left|right)\s*:/);
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
