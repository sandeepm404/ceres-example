import fs from "node:fs";
import path from "node:path";
import HandlebarsRuntime from "handlebars/runtime";
import sample from "../src/types/sample.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/frigo-pro-eood/template.hbs";
import {
  PAYMENT_LINE_TEXT,
  PAYMENT_LINE_UNIT,
  dottedDate,
  partyAddress,
  partyFields,
  paymentLineText,
  recordedPayments,
  registerFrigoProTemplateHelpers,
  showExchangeRate,
  hasBusinessColumn,
  BGN_SYMBOL,
  frigoTotals,
  settlementFigures,
  TAX_BASE_LABEL,
  PAID_LABEL,
  DUE_LABEL,
  totalsFigure,
  pageZoom,
  pageZoomStyle,
  withPaymentRows,
  withoutSecondCurrency,
} from "../src/templates/frigo-pro-eood/helpers";
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
 */
beforeAll(() => {
  const HB = HandlebarsRuntime;
  registerFrigoProTemplateHelpers(HB);
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
  HB.registerPartial("TaxSummaryTable", () => "<div>TAX-SUMMARY</div>");
  HB.registerPartial("HsnSummaryTable", () => "<div>HSN-SUMMARY</div>");
  HB.registerPartial("PaymentTable", () => "<div>PAYMENT-TABLE</div>");
  HB.registerHelper("computeTaxSummary", () => ({}));
  HB.registerHelper("computeHsnSummary", () => ({}));
  HB.registerHelper("computePaymentColumns", () => ({}));
});

const baseInvoice = (): any =>
  JSON.parse(JSON.stringify((sample as any).invoice));

// Mirrors index.ts's data mapper.
const mapState = (over: Record<string, unknown> = {}): any =>
  withoutSecondCurrency(
    withPaymentRows(
      normalizeInvoiceTemplateState({
        ...(sample as any),
        invoice: { ...baseInvoice(), ...over },
      })
    )
  );

const render = (over: Record<string, unknown> = {}): string =>
  template(mapState(over));

const paymentRows = (state: any): any[] =>
  state.mapped.rows.filter((row: any) => row.rowClass === "row-payment");

const cellText = (row: any, key: string): string | undefined =>
  row.cells.find((cell: any) => cell.key === key)?.text;

describe("frigo-pro-eood helpers", () => {
  it("prints dates as dd.mm.yyyy in the business's offset", () => {
    expect(dottedDate("2025-10-06T10:00:00.000Z")).toBe("06.10.2025");
    // 21:00 UTC on the 5th is already the 6th in Sofia (+03:00).
    expect(dottedDate("2025-10-05T21:00:00.000Z", "+03:00")).toBe("06.10.2025");
    expect(dottedDate("2025-10-05T21:00:00.000Z", "-0500")).toBe("05.10.2025");
    expect(dottedDate("")).toBe("");
    expect(dottedDate("not a date")).toBe("");
  });

  it("collects party fields, honouring the showInInvoice opt-out", () => {
    expect(
      partyFields({
        customFields: [
          { label: "МОЛ", value: "Мартин Петков" },
          { label: "Hidden", value: "x", params: { showInInvoice: false } },
        ],
        additionalIds: [{ label: "Идент. №", value: "204419745" }],
        customHeaders: [{ label: "", value: "no label" }],
      })
    ).toEqual([
      { label: "МОЛ", value: "Мартин Петков" },
      { label: "Идент. №", value: "204419745" },
    ]);
  });

  it("builds the address without the city, which has its own row", () => {
    expect(
      partyAddress({
        street: "ж.к. ЗАПАДНА ПРОМИШЛЕНА ЗОНА",
        city: "Велико Търново",
        country: "Bulgaria",
      })
    ).toBe("ж.к. ЗАПАДНА ПРОМИШЛЕНА ЗОНА, Bulgaria");
  });

  it("counts only payments still on the document", () => {
    const payments = recordedPayments({
      allPayments: [
        { amount: 100 },
        { amount: 50, isRemoved: true },
        { amount: 25, isApproved: false },
        { amount: 0 },
        { amount: "abc" },
        null,
      ],
    });
    expect(payments).toEqual([{ amount: 100 }]);
  });

  it("writes the payment text as <invoice number>/<payment date>", () => {
    expect(
      paymentLineText(
        { invoiceNumber: "3903", ownerOffset: "+03:00" },
        { paymentDate: "2025-10-06T08:00:00.000Z" }
      )
    ).toBe(`${PAYMENT_LINE_TEXT} 3903/06.10.2025`);
    expect(PAYMENT_LINE_TEXT).toBe("Авансово плащане по ф-ра");
  });
});

describe("frigo-pro-eood payment lines", () => {
  const payment = {
    paymentDate: "2025-10-06T08:00:00.000Z",
    amount: 1533.87,
    paymentMethod: "ACCOUNT_TRANSFER",
  };

  it("adds one line per recorded payment after the items", () => {
    const state = mapState({
      invoiceNumber: "3903",
      allPayments: [payment, { ...payment, amount: 200 }],
    });
    const { rows } = state.mapped;
    const payments = paymentRows(state);
    expect(payments).toHaveLength(2);

    const lastItemAt = rows.reduce(
      (at: number, row: any, i: number) =>
        row.rowClass.startsWith("row-even") ||
        row.rowClass.startsWith("row-odd")
          ? i
          : at,
      -1
    );
    expect(rows.indexOf(payments[0])).toBe(lastItemAt + 1);
    expect(rows.indexOf(payments[1])).toBe(lastItemAt + 2);
  });

  it("continues the line numbers from the items", () => {
    const state = mapState({ allPayments: [payment, payment] });
    const itemLines = state.mapped.rows
      .filter((row: any) => !row.rowClass.startsWith("row-payment"))
      .map((row: any) => row.lineNumber)
      .filter((n: any) => typeof n === "number");
    const last = Math.max(...itemLines);
    expect(paymentRows(state).map((row: any) => row.lineNumber)).toEqual([
      last + 1,
      last + 2,
    ]);
  });

  it("prints text, -1, rate and a negative amount; leaves tax columns blank", () => {
    const state = mapState({
      invoiceNumber: "3903",
      ownerOffset: "+03:00",
      advanceOptions: {
        ...baseInvoice().advanceOptions,
        unitColumn: "SEPARATE_COLUMN",
      },
      allPayments: [payment],
    });
    const [row] = paymentRows(state);
    expect(row.item.name).toBe(`${PAYMENT_LINE_TEXT} 3903/06.10.2025`);
    expect(cellText(row, "quantity")).toBe("-1");
    expect(cellText(row, "rate")).toMatch(/1,533\.87/);
    expect(cellText(row, "amount")).toMatch(/^-.*1,533\.87$/);
    expect(cellText(row, "total")).toMatch(/^-.*1,533\.87$/);
    ["hsn", "gstRate", "discount", "igst", "cgst", "sgst"].forEach((key) => {
      const text = cellText(row, key);
      if (text !== undefined) expect(text).toBe("");
    });
    row.cells.forEach((cell: any) =>
      expect(cell.secondaryText).toBeUndefined()
    );
  });

  it("prints бр. in a separate unit column", () => {
    // The sample's items carry no unit, so normalization hides the column;
    // show it the way a document with units would.
    const base = normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice: {
        ...baseInvoice(),
        advanceOptions: {
          ...baseInvoice().advanceOptions,
          unitColumn: "SEPARATE_COLUMN",
        },
        allPayments: [payment],
      },
    }) as any;
    base.mapped.columns = [
      ...base.mapped.columns,
      { key: "unit", label: "Мярка", className: "col-unit", isHidden: false },
    ];
    const [row] = paymentRows(withPaymentRows(base));
    expect(cellText(row, "unit")).toBe(PAYMENT_LINE_UNIT);
    expect(cellText(row, "quantity")).toBe("-1");
  });

  it("merges the unit into the quantity when the account does", () => {
    const state = mapState({
      advanceOptions: {
        ...baseInvoice().advanceOptions,
        unitColumn: "MERGE_QUANTITY",
      },
      allPayments: [payment],
    });
    expect(cellText(paymentRows(state)[0], "quantity")).toBe(
      `-1 (${PAYMENT_LINE_UNIT})`
    );
  });

  it("keeps the summary row last", () => {
    const state = mapState({
      allPayments: [payment],
      advanceOptions: { ...baseInvoice().advanceOptions, showTotalsRow: true },
    });
    const { rows } = state.mapped;
    const summaryAt = rows.findIndex((r: any) => r.rowClass === "row-summary");
    if (summaryAt >= 0) {
      expect(summaryAt).toBe(rows.length - 1);
      expect(rows.indexOf(paymentRows(state)[0])).toBeLessThan(summaryAt);
    }
  });

  it("adds nothing when there are no payments", () => {
    const before = normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice: { ...baseInvoice(), allPayments: [] },
    });
    expect(withPaymentRows(before)).toBe(before);
  });

  it("renders the payment line in the item table", () => {
    const html = render({ invoiceNumber: "3903", allPayments: [payment] });
    expect(html).toContain('class="row-payment"');
    expect(html).toContain(`${PAYMENT_LINE_TEXT} 3903/06.10.2025`);
  });

  it("rounds a payment line's figures to the document's decimals", () => {
    const state = mapState({
      allPayments: [{ amount: 2991534.5260000005, paymentDate: "2026-10-06" }],
    });
    const [row] = state.mapped.rows.filter(
      (r: any) => r.rowClass === "row-payment"
    );
    expect(cellText(row, "rate")).not.toMatch(/0000005/);
    expect(cellText(row, "rate")).toMatch(/534\.53$/);
  });
});

describe("frigo-pro-eood blocks", () => {
  it("prints title, subtitle, number and dotted date", () => {
    const html = render({
      invoiceTitle: "Фактура",
      invoiceSubTitle: "Оригинал",
      invoiceNumber: "0000004544",
      invoiceDate: "2026-09-29T08:00:00.000Z",
    });
    expect(html).toContain("Фактура");
    expect(html).toContain("Оригинал");
    expect(html).toContain("0000004544");
    expect(html).toContain("29.09.2026");
  });

  it("boxes both parties with their headings from customLabels", () => {
    const html = render({
      customLabels: {
        ...baseInvoice().customLabels,
        billedTo: "Получател",
        billedBy: "Доставчик",
      },
    });
    expect(html).toContain('data-party="billedTo"');
    expect(html).toContain('data-party="billedBy"');
    expect(html).toContain("Получател");
    expect(html).toContain("Доставчик");
  });

  it("labels the parties' phone and email rows", () => {
    const html = render({
      billedTo: {
        ...baseInvoice().billedTo,
        phone: "+359888314614",
        phoneShowInInvoice: true,
        emailShowInInvoice: true,
        email: "office@laits.bg",
      },
    });
    const box = html.slice(
      html.indexOf('data-party="billedTo"'),
      html.indexOf('data-party="billedBy"')
    );
    expect(box).toMatch(/<dt>Телефон<\/dt><dd>[^<]*\d/);
    expect(box).toMatch(/<dt>Имейл<\/dt><dd>office@laits\.bg<\/dd>/);
    expect(box).not.toMatch(/<dt><\/dt>/);
  });

  it("uses the shared Subtotal widget for totals", () => {
    expect(render()).toContain("data-ceres-subtotal");
  });

  it("leaves no placeholder text on the page", () => {
    const html = render({
      allPayments: [{ amount: 10, paymentDate: "2025-01-01" }],
    });
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/);
  });
});

describe("frigo-pro-eood applied exchange rate", () => {
  // A BGN document owned by an INR business: the Subtotal widget emits its
  // Conversion Rate row; the template decides whether it shows.
  const foreign = {
    currency: "BGN",
    businessCurrency: "INR",
    conversionRates: { INR: 57.22 },
  };
  const withToggle = (value: unknown) => ({
    ...foreign,
    advanceOptions: {
      ...baseInvoice().advanceOptions,
      showAppliedExchangeRate: value,
    },
  });

  it("reads only an explicit true as on", () => {
    expect(showExchangeRate({ showAppliedExchangeRate: true }, {})).toBe(true);
    expect(showExchangeRate({ showAppliedExchangeRate: false }, {})).toBe(
      false
    );
    expect(showExchangeRate({}, {})).toBe(false);
    expect(showExchangeRate({}, { showAppliedExchangeRate: true })).toBe(true);
  });

  it("hides the Conversion Rate row when the setting is off or absent", () => {
    [false, undefined].forEach((value) => {
      const html = render(withToggle(value));
      expect(html).toContain('data-ceres-subtotal-row="conversionRate"');
      expect(html).toMatch(/class="fpe-totals is-exchange-rate-hidden"/);
    });
  });

  it("shows it when the setting is on", () => {
    const html = render(withToggle(true));
    expect(html).toContain('data-ceres-subtotal-row="conversionRate"');
    expect(html).not.toContain("is-exchange-rate-hidden");
  });

  it("hides the row in CSS through that class", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../src/templates/frigo-pro-eood/styles.css"),
      "utf8"
    );
    expect(css).toMatch(
      /\.fpe-totals\.is-exchange-rate-hidden \[data-ceres-subtotal-row="conversionRate"\]\s*\{\s*display:\s*none;/
    );
  });
});

describe("frigo-pro-eood business-currency amounts", () => {
  const foreign = {
    currency: "BGN",
    businessCurrency: "INR",
    conversionRates: { INR: 57.22 },
  };
  const secondaryTexts = (state: any): string[] =>
    state.mapped.rows.flatMap((row: any) =>
      row.cells.map((cell: any) => cell.secondaryText).filter(Boolean)
    );

  it("drops the INR amount under item figures", () => {
    const normalized = normalizeInvoiceTemplateState({
      ...(sample as any),
      invoice: { ...baseInvoice(), ...foreign },
    });
    // Guard: the shared normalization does produce them for this document.
    expect(secondaryTexts(normalized).length).toBeGreaterThan(0);
    expect(secondaryTexts(withoutSecondCurrency(normalized))).toEqual([]);
    expect(render(foreign)).not.toContain("second-currency-amount");
  });

  const businessCells = (html: string): string[] =>
    [...html.matchAll(/data-ceres-business-amount>\s*([^<]*?)\s*</g)].map(
      (m) => m[1]
    );

  it("prints the INR amount in its own column, before each total", () => {
    const html = render(foreign);
    expect(html).toContain("fpe-has-business");
    const cells = businessCells(html);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.filter(Boolean).length).toBeGreaterThan(0);
    // Not as the widget's sub-line under the figure.
    expect(html).not.toContain("ceres-subtotal-converted");
    // Business cell first, then the document-currency figure.
    const row = html.slice(html.indexOf("data-ceres-business-amount"));
    expect(row.indexOf("data-ceres-business-amount")).toBeLessThan(
      row.indexOf('<td class="ceres-subtotal-value">')
    );
  });

  it("has no business column when the currencies match", () => {
    const html = render({ currency: "INR", businessCurrency: "INR" });
    expect(html).not.toContain("fpe-has-business");
    expect(businessCells(html)).toEqual([]);
  });

  it("has no business column without a conversion rate", () => {
    const html = render({ ...foreign, conversionRates: {} });
    expect(businessCells(html)).toEqual([]);
  });

  it("hides the totals block with the hideTotals setting", () => {
    const html = render({ ...foreign, hideTotals: true });
    expect(html).toContain("data-ceres-subtotal");
    expect(html).toContain("is-hidden-by-totals");
  });

  it("prints the lev as лв., never BGN", () => {
    // The normalization takes businessCurrency from the payload's top level.
    const state = mapState({
      currency: "EUR",
      conversionRates: { BGN: 1.95583 },
    });
    const html = template({
      ...state,
      invoice: { ...state.invoice, businessCurrency: "BGN" },
    });
    const totals = html.slice(html.indexOf("data-ceres-subtotal"));
    expect(totals).toContain(BGN_SYMBOL);
    expect(totals).not.toContain("BGN");
    expect(businessCells(html).filter(Boolean).length).toBeGreaterThan(0);
  });

  it("swaps BGN in every figure of the totals model", () => {
    const model = frigoTotals({
      groups: {
        main: [
          {
            value: "€1 = BGN 1.96",
            converted: null,
            extra: { value: "BGN 2.00", converted: "BGN 3.00" },
          },
        ],
        extra: [],
        due: [{ value: "€5.00", converted: "BGN 9.78", extra: null }],
      },
    });
    expect(model.groups.main[0].value).toBe(
      `1\u00a0€ = 1.96\u00a0${BGN_SYMBOL}`
    );
    expect(model.groups.main[0].extra.converted).toBe(
      `3.00\u00a0${BGN_SYMBOL}`
    );
    expect(model.groups.due[0].converted).toBe(`9.78\u00a0${BGN_SYMBOL}`);
    expect(model.businessColumn).toBe(true);
    expect(frigoTotals(null)).toBeNull();
  });

  it("puts the currency after the amount, and a minus for brackets", () => {
    const nb = "\u00a0";
    expect(totalsFigure("BGN\u00a01,186,473.02")).toBe(`1,186,473.02${nb}лв.`);
    expect(totalsFigure("(лв. 1,400,038.16)")).toBe(`-1,400,038.16${nb}лв.`);
    expect(totalsFigure("€6,25,975")).toBe(`6,25,975${nb}€`);
    expect(totalsFigure("(€7,38,650.50)")).toBe(`-7,38,650.50${nb}€`);
    expect(totalsFigure("-€880.00")).toBe(`-880.00${nb}€`);
    expect(totalsFigure("US$1.00")).toBe(`1.00${nb}US$`);
    expect(totalsFigure(null)).toBeNull();
  });

  it("prints the currency after each figure, minus not brackets", () => {
    const html = render({
      allPayments: [{ amount: 100, paymentDate: "2026-10-06" }],
    });
    const totals = html.slice(html.indexOf("data-ceres-subtotal"));
    const figures = [
      ...totals.matchAll(/class="ceres-subtotal-value">\s*([^<]*?)\s*</g),
    ].map((m) => m[1]);
    expect(figures.length).toBeGreaterThan(0);
    figures.forEach((f) => {
      expect(f).not.toMatch(/[()]/);
      // Never a symbol before the number (rows without a currency are bare).
      if (/\d/.test(f) && !f.includes("=")) expect(f).toMatch(/^-?\d/);
    });
  });

  it("flags the column from any converted amount", () => {
    expect(hasBusinessColumn({ groups: { main: [{ converted: null }] } })).toBe(
      false
    );
    expect(
      hasBusinessColumn({ groups: { main: [], due: [{ converted: "₹1.00" }] } })
    ).toBe(true);
    expect(
      hasBusinessColumn({
        groups: { main: [{ converted: null, extra: { converted: "₹1.00" } }] },
      })
    ).toBe(true);
    expect(hasBusinessColumn(null)).toBe(false);
  });
});

describe("frigo-pro-eood settlement rows", () => {
  // 625,975 + 18% VAT = 738,650.50, as on the Frigo Pro document.
  const doc = (paid: number[], over: any = {}) => ({
    currency: "BGN",
    finalTotal: { total: 738650.5, igst: 112675.5, cgst: 0, sgst: 0 },
    allPayments: paid.map((amount) => ({ amount, paymentDate: "2026-10-06" })),
    ...over,
  });
  const igst = { showIgst: true, showCgstSgst: false };
  const settlement = (html: string) =>
    html.slice(html.indexOf("data-ceres-settlement"));
  const rowValues = (html: string) =>
    [
      ...settlement(html).matchAll(
        /data-ceres-settlement-row="([^"]+)"[\s\S]*?<th class="ceres-subtotal-label">([^<]*)<\/th>[\s\S]*?<td class="ceres-subtotal-value">([^<]*)</g
      ),
    ].map((m) => ({ key: m[1], label: m[2].trim(), value: m[3].trim() }));

  it("is the full figures when nothing is paid", () => {
    expect(settlementFigures(doc([]), igst)).toEqual({
      taxBase: 625975,
      vat: 112675.5,
      due: 738650.5,
      paid: 0,
    });
  });

  it("is all zero when the payments equal the invoice total", () => {
    expect(settlementFigures(doc([738650.5]), igst)).toEqual({
      taxBase: 0,
      vat: 0,
      due: 0,
      paid: 738650.5,
    });
  });

  it("splits a part payment between tax base and VAT in proportion", () => {
    expect(settlementFigures(doc([369325.25]), igst)).toEqual({
      taxBase: 312987.5,
      vat: 56337.75,
      due: 369325.25,
      paid: 369325.25,
    });
  });

  it("adds up every recorded payment", () => {
    expect(settlementFigures(doc([700000, 38650.5]), igst).due).toBe(0);
  });

  it("counts CGST + SGST or IGST, never both", () => {
    // A payload can carry both, IGST being their sum.
    const both = doc([369325.25], {
      finalTotal: {
        total: 738650.5,
        igst: 112675.5,
        cgst: 56337.75,
        sgst: 56337.75,
      },
    });
    const split = settlementFigures(both, {
      showIgst: false,
      showCgstSgst: true,
    });
    expect(split.vat).toBe(56337.75);
    expect(settlementFigures(both, igst).vat).toBe(56337.75);
    expect(split.taxBase).toBe(312987.5);
  });

  it("caps the paid share at the total; an overpayment shows as a negative due", () => {
    expect(settlementFigures(doc([800000]), igst)).toEqual({
      taxBase: 0,
      vat: 0,
      due: -61349.5,
      paid: 800000,
    });
  });

  it("prints on an unpaid invoice too, after the totals", () => {
    const html = render({ allPayments: [] });
    expect(html).toContain("data-ceres-settlement");
    expect(html.indexOf("data-ceres-settlement")).toBeGreaterThan(
      html.indexOf("data-ceres-subtotal")
    );
    expect(rowValues(html).map((r) => r.key)).toEqual([
      "taxBase",
      "vat",
      "due",
    ]);
  });

  it("uses the fixed labels, whatever the payload's customLabels say", () => {
    const html = render({
      customLabels: {
        ...baseInvoice().customLabels,
        dueAmount: "Due Amount",
        paidAmount: "Paid Amount",
      },
    });
    const rows = rowValues(html);
    expect(rows[0].label).toBe(`${TAX_BASE_LABEL}:`);
    expect(rows[rows.length - 1].label).toBe(`${DUE_LABEL}:`);
    expect(DUE_LABEL).toBe("Сума за плащане");
    expect(PAID_LABEL).toBe("Платена сума");
    expect(html).not.toMatch(/Due Amount|Paid Amount/);
    // The VAT row is the totals' tax-row label without its rate.
    expect(rows[1].label).not.toMatch(/%/);
    expect(rows[1].label).toMatch(/\S+:$/);
  });

  it("prints 0.00 in every row when paid in full", () => {
    const { total } = baseInvoice().finalTotal;
    const html = render({
      allPayments: [{ amount: total, paymentDate: "2026-10-06" }],
    });
    const rows = rowValues(html);
    expect(rows.map((r) => r.key)).toEqual(["taxBase", "vat", "due"]);
    rows.forEach((r) => expect(r.value).toMatch(/^0\.00\D*$/));
  });

  it("keeps two decimals when the document sets no sub-unit length", () => {
    const html = render({
      subUnitLength: undefined,
      allPayments: [
        { amount: baseInvoice().finalTotal.total, paymentDate: "2026-10-06" },
      ],
    });
    rowValues(html).forEach((r) => expect(r.value).toMatch(/^0\.00\D*$/));
  });

  it("fills the business column too", () => {
    const state = mapState({
      currency: "EUR",
      conversionRates: { BGN: 1.95583 },
    });
    const html = template({
      ...state,
      invoice: { ...state.invoice, businessCurrency: "BGN" },
    });
    const cells = [
      ...settlement(html).matchAll(
        /data-ceres-business-amount>\s*([^<]*?)\s*</g
      ),
    ].map((m) => m[1]);
    expect(cells).toHaveLength(rowValues(html).length);
    cells.forEach((c) => expect(c).toMatch(/\d\u00a0лв\.$/));
  });

  it("prints amount paid above amount to pay", () => {
    const { total } = baseInvoice().finalTotal;
    const html = render({
      allPayments: [{ amount: total / 4, paymentDate: "2026-10-06" }],
    });
    const rows = rowValues(html);
    expect(rows.map((r) => r.key)).toEqual(["taxBase", "vat", "paid", "due"]);
    expect(rows[2].label).toBe(`${PAID_LABEL}:`);
    expect(rows[2].value).toMatch(/^-\d/);
  });

  it("has no amount-paid row when paid in full or more", () => {
    const { total } = baseInvoice().finalTotal;
    [total, total + 100].forEach((amount) => {
      const html = render({
        allPayments: [{ amount, paymentDate: "2026-10-06" }],
      });
      expect(rowValues(html).map((r) => r.key)).toEqual([
        "taxBase",
        "vat",
        "due",
      ]);
    });
  });

  it("has no amount-paid row when nothing is paid", () => {
    const keys = rowValues(render({ allPayments: [] })).map((r) => r.key);
    expect(keys).toEqual(["taxBase", "vat", "due"]);
  });

  it("does not print the widget's own total rows", () => {
    const html = render();
    ["subTotal", "amount", "total", "amountPaid", "dueAmount"].forEach((key) =>
      expect(html).not.toContain(`data-ceres-subtotal-row="${key}"`)
    );
  });

  it("keeps the Conversion Rate row for the exchange-rate setting", () => {
    const html = render({
      currency: "BGN",
      businessCurrency: "INR",
      conversionRates: { INR: 57.22 },
    });
    expect(html).toContain('data-ceres-subtotal-row="conversionRate"');
  });

  it("is hidden with the totals", () => {
    expect(settlement(render({ hideTotals: true }))).toContain(
      "is-hidden-by-totals"
    );
  });
});

describe("frigo-pro-eood text scale", () => {
  const zoom = (pdfOptions: any, advanceOptions: any = {}, invoice: any = {}) =>
    pageZoom(invoice, pdfOptions, advanceOptions);

  it("applies Lydia's text scale on screen, and only 0.8 in print", () => {
    // The renderer zooms every other value in print itself.
    expect(zoom({ zoomSize: 0.9 })).toEqual({ screen: 0.9, print: 1 });
    expect(zoom({ zoomSize: 1.2 })).toEqual({ screen: 1.2, print: 1 });
    expect(zoom({ zoomSize: 0.8 })).toEqual({ screen: 0.8, print: 0.8 });
    expect(zoom({ zoomSize: 1 })).toEqual({ screen: 1, print: 1 });
  });

  it("applies the older textScale on screen and in print", () => {
    expect(zoom({ textScale: 1.1 })).toEqual({ screen: 1.1, print: 1.1 });
    expect(zoom({}, { textScale: "0.9" })).toEqual({ screen: 0.9, print: 0.9 });
    expect(zoom({}, {}, { textScale: 1.2 })).toEqual({
      screen: 1.2,
      print: 1.2,
    });
    // pdfOptions wins over advanceOptions, which wins over the invoice.
    expect(zoom({ textScale: 1.1 }, { textScale: 2 }).screen).toBe(1.1);
  });

  it("combines both", () => {
    const { screen, print } = zoom({ textScale: 1.1, zoomSize: 0.8 });
    expect(screen).toBeCloseTo(0.88);
    expect(print).toBeCloseTo(0.88);
    expect(pageZoomStyle({}, { textScale: 1.1, zoomSize: 0.8 }, {})).toBe(
      "--fpe-screen-zoom: 0.88; --fpe-print-zoom: 0.88;"
    );
  });

  it("ignores anything that is not a positive number", () => {
    ["abc", "-1", 0, "", null, undefined, "1.2px"].forEach((value) => {
      expect(zoom({ zoomSize: value, textScale: value })).toEqual({
        screen: 1,
        print: 1,
      });
    });
  });

  it("emits a style only when a zoom differs from 1", () => {
    expect(pageZoomStyle({}, {}, {})).toBe("");
    expect(pageZoomStyle({}, { zoomSize: 0.9 }, {})).toBe(
      "--fpe-screen-zoom: 0.9;"
    );
    expect(pageZoomStyle({}, { zoomSize: 0.8 }, {})).toBe(
      "--fpe-screen-zoom: 0.8; --fpe-print-zoom: 0.8;"
    );
  });

  it("puts the zoom on the page element", () => {
    const html = render({
      template: { ...baseInvoice().template, pdfOptions: { zoomSize: 0.8 } },
    });
    expect(html).toMatch(
      /class="fpe-page" style="--fpe-screen-zoom: 0\.8; --fpe-print-zoom: 0\.8;"/
    );
    expect(render()).toMatch(/class="fpe-page">/);
  });

  it("reads the zoom variables in CSS, per medium", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../src/templates/frigo-pro-eood/styles.css"),
      "utf8"
    );
    expect(css).toMatch(
      /@media screen \{\s*\.fpe-page \{\s*zoom: var\(--fpe-screen-zoom, 1\);/
    );
    expect(css).toMatch(
      /@media print \{\s*\.fpe-page \{\s*zoom: var\(--fpe-print-zoom, 1\);/
    );
  });
});

describe("frigo-pro-eood styles", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/templates/frigo-pro-eood/styles.css"),
    "utf8"
  );

  it("never resolves a font size below 10px, screen or print", () => {
    const sizes = [
      ...css.matchAll(/(?:font-size|--fpe-font-size-[a-z]+)\s*:\s*([\d.]+)px/g),
    ].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThanOrEqual(12);
    sizes.forEach((size) => expect(size).toBeGreaterThanOrEqual(10));
  });

  it("never breaks a figure across lines, text wrap on or off", () => {
    // A figure cell stays on one line…
    expect(css).toMatch(/td:not\(\.col-item\) \{[^}]*white-space: nowrap;/);
    // …and no wrap-mode rule lets it wrap again.
    expect(css).not.toMatch(
      /is-wrap-enabled[^{]*td:not\(\.col-item\)[^{]*\{[^}]*white-space: normal/
    );
    // Wrap mode keeps the content-sized layout, so figures get the width they need.
    expect(css).toMatch(
      /\.fpe-items \.line-items-table\.is-wrap-enabled \{\s*table-layout: auto;/
    );
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
