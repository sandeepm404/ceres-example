import { computeSubtotalRows } from "../src/widgets/subtotal/utils";
import type { SubtotalModel } from "../src/widgets/subtotal/utils";
import {
  resolveTaxVisibility,
  resolveDocumentTaxVisibility,
} from "../src/widgets/shared/taxVisibility";
import { resolveDocumentTaxLabel } from "../src/widgets/shared/taxRowLabels";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import type { NormalizedInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";

/*
 * A minimal domestic Indian tax invoice. Each test overrides only what it is about, so a
 * failure names the one field that mattered.
 */
const baseInvoice = () => ({
  billType: "INVOICE",
  invoiceType: "INVOICE",
  currency: "INR",
  taxType: "INDIA",
  taxName: "GST",
  isIgst: false,
  items: [{ _id: "i1", total: 1000, gstRate: 18, cgst: 90, sgst: 90 }],
  columns: [
    { key: "amount", label: "Amount" },
    { key: "discount", label: "Discount" },
    { key: "cgst", label: "CGST" },
    { key: "sgst", label: "SGST" },
    { key: "igst", label: "IGST" },
    { key: "total", label: "Total" },
  ],
  finalTotal: {
    subTotal: 1000,
    discount: 0,
    amount: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    total: 1180,
  },
  balance: {},
  advanceOptions: {},
  customLabels: {},
});

const compute = (over: Record<string, unknown> = {}, options = {}) =>
  computeSubtotalRows({ ...baseInvoice(), ...over }, options);
const keys = (model: SubtotalModel) => model.groups.main.map((row) => row.key);

const row = (model: SubtotalModel, key: string) =>
  [...model.groups.main, ...model.groups.extra, ...model.groups.due].find(
    (candidate) => candidate.key === key
  );

describe("computeSubtotalRows", () => {
  describe("payload shape", () => {
    /*
     * A template's root context is whatever its data mapper returns. Both shapes are live —
     * the shipped fork assigns normalizeInvoiceTemplateState and gets a wrapped root, a
     * mapper-less template gets the flat payload. A fixture built from only one of them
     * passes while the other renders blank.
     */
    it("reads a flat payload", () => {
      expect(row(compute(), "total")?.value).toBe("₹1,180");
    });

    it("reads a wrapped { invoice } payload", () => {
      const model = computeSubtotalRows({ invoice: baseInvoice() });
      expect(row(model, "total")?.value).toBe("₹1,180");
    });

    it("reads the normalized state produced by the real mapper", () => {
      const state = normalizeInvoiceTemplateState({
        invoice: baseInvoice(),
      } as never);
      const model = computeSubtotalRows(state.invoice, {
        columns: state.mapped.columns,
      });
      expect(row(model, "total")?.value).toBe("₹1,180");
      expect(row(model, "cgst")).toBeDefined();
    });

    it("returns an empty model rather than throwing on junk input", () => {
      // A throwing Handlebars helper takes down the whole document.
      [null, undefined, 42, "nope", []].forEach((junk) => {
        const model = computeSubtotalRows(junk);
        expect(model.groups.main).toEqual([]);
        expect(model.hidden).toBe(false);
      });
    });
  });

  describe("reads finalTotal, never the optional totals object", () => {
    /*
     * `finalTotal` is required by the contract and `totals` is optional. Every template
     * before REF-25603 read `totals`, so the whole block rendered blank whenever the API
     * omitted it.
     */
    it("renders every row from finalTotal with no totals object present", () => {
      const model = compute();
      expect(row(model, "total")?.value).toBe("₹1,180");
      expect(row(model, "amount")?.value).toBe("₹1,000");
      expect(row(model, "cgst")?.value).toBe("₹90");
    });

    it("ignores a conflicting totals object", () => {
      const model = compute({ totals: { total: 999999, cgst: 4242 } });
      expect(row(model, "total")?.value).toBe("₹1,180");
      expect(row(model, "cgst")?.value).toBe("₹90");
    });
  });

  describe("row order", () => {
    it("orders the tax-document rows the way refrens.com does", () => {
      const model = compute({
        finalTotal: { ...baseInvoice().finalTotal, discount: 100 },
      });
      expect(keys(model)).toEqual([
        "subTotal",
        "discount",
        "amount",
        "cgst",
        "sgst",
        "total",
      ]);
    });

    it("omits the Sub Total block when nothing reduced the total", () => {
      // refrens.com shows Sub Total only alongside a discount or an early-pay discount.
      expect(keys(compute())).toEqual(["amount", "cgst", "sgst", "total"]);
    });

    it("shows the Sub Total block for an applied early-pay discount", () => {
      const model = compute({
        earlyPayDiscount: { applied: true },
        finalTotal: { ...baseInvoice().finalTotal, earlyDiscount: 50 },
      });
      expect(keys(model)).toEqual([
        "subTotal",
        "earlyPayDiscount",
        "amount",
        "cgst",
        "sgst",
        "total",
      ]);
    });

    it("always ends the main group with the Total", () => {
      expect(keys(compute()).at(-1)).toBe("total");
    });
  });

  describe("no round-off rows, ever", () => {
    /*
     * The payload carries both buckets but no refrens.com template renders a round-off row —
     * rounding is already folded into `total`. Two templates used to print them anyway.
     */
    it("drops amountRoundOff and totalRoundOff even when both are set", () => {
      const model = compute({
        finalTotal: {
          ...baseInvoice().finalTotal,
          amountRoundOff: 12,
          totalRoundOff: 34,
        },
      });
      expect(keys(model)).not.toContain("amountRoundOff");
      expect(keys(model)).not.toContain("totalRoundOff");
      expect(JSON.stringify(model)).not.toMatch(/RoundOff/i);
    });
  });

  describe("tax rows are decided by the document, not by the figure", () => {
    it("keeps a zero CGST row on a domestic tax invoice", () => {
      // The old templates gated on `{{#if totals.cgst}}`, so this row disappeared.
      const model = compute({
        finalTotal: { ...baseInvoice().finalTotal, cgst: 0, sgst: 0 },
      });
      expect(row(model, "cgst")?.value).toBe("₹0");
      expect(row(model, "sgst")?.value).toBe("₹0");
    });

    it("reads the interstate flag from `igst`, the real document field", () => {
      // Nothing writes `isIgst` onto a document — lydia sets `igst: !!totalIgst`. Reading
      // the wrong name meant every interstate invoice printed a zero CGST and a zero SGST
      // row and dropped its IGST row (REF-25603 QA).
      const model = compute({
        isIgst: undefined,
        igst: true,
        finalTotal: {
          ...baseInvoice().finalTotal,
          cgst: 0,
          sgst: 0,
          igst: 180,
        },
      });
      expect(keys(model)).toContain("igst");
      expect(keys(model)).not.toContain("cgst");
      expect(row(model, "igst")?.value).toBe("₹180");
    });

    it("still honours the deprecated isIgst from an older host", () => {
      const model = compute({ isIgst: true });
      expect(keys(model)).toContain("igst");
      expect(keys(model)).not.toContain("cgst");
    });

    it("keeps the split on an Indian document whatever its tax is called", () => {
      // The reference's row gate is `!igstTax && taxType === TAX_TYPE.INDIA` with no
      // taxName term (balance.js:323), and taxName is a free-form user-editable string.
      const model = compute({ taxName: "VAT" });
      expect(keys(model)).toContain("cgst");
      expect(keys(model)).toContain("sgst");
      expect(keys(model)).not.toContain("igst");
    });

    it("names the combined row after the document's tax, not IGST", () => {
      // fence's countyTaxName maps ID to PPN and MY to SST. serana relabels the `igst`
      // column to the taxName on a GLOBAL tax type, so that label wins; when the column
      // is archived the taxName is still the right word, and "IGST" never is.
      const withColumn = compute({
        taxType: "GLOBAL",
        taxName: "PPN",
        columns: [{ key: "igst", label: "PPN" }],
      });
      expect(row(withColumn, "igst")?.label).toBe("PPN");

      const withoutColumn = compute({
        taxType: "GLOBAL",
        taxName: "PPN",
        columns: [],
      });
      expect(row(withoutColumn, "igst")?.label).toBe("PPN");

      const indianGst = compute({ isIgst: true, columns: [] });
      expect(row(indianGst, "igst")?.label).toBe("IGST");
    });

    it("shows IGST for a non-India tax type", () => {
      const model = compute({ taxType: "GLOBAL", taxName: "VAT" });
      expect(keys(model)).toContain("igst");
      expect(keys(model)).not.toContain("cgst");
    });

    it("renders no tax rows on a non-tax document", () => {
      const model = compute({ invoiceType: "QUOTATION" });
      expect(keys(model)).not.toContain("cgst");
      expect(keys(model)).not.toContain("sgst");
      expect(keys(model)).not.toContain("igst");
      expect(keys(model)).not.toContain("amount");
    });

    it("suppresses a zero tax row on an export without payment", () => {
      const model = compute({
        supplyType: "EXPWOP",
        finalTotal: { ...baseInvoice().finalTotal, cgst: 0, sgst: 0 },
      });
      expect(keys(model)).not.toContain("cgst");
    });

    it("keeps a non-zero tax row on an export without payment", () => {
      const model = compute({ supplyType: "EXPWOP" });
      expect(row(model, "cgst")?.value).toBe("₹90");
    });

    it("labels the SGST row UTGST for a union territory sale", () => {
      // `utgst` is the document field; balance.js destructures `utgst: enableUtgst`.
      expect(row(compute({ utgst: true }), "sgst")?.label).toBe("UTGST");
      expect(row(compute({ isUtgst: true }), "sgst")?.label).toBe("UTGST");
    });
  });

  describe("hide settings", () => {
    it("hides everything but the additional charges under hideTotals", () => {
      const model = compute({
        hideTotals: true,
        additionalCharges: [{ _id: "c1", label: "Freight", amount: 200 }],
      });
      expect(model.hidden).toBe(true);
      // The rows stay in the DOM so the host's live toggle can reveal them.
      const survivors = model.groups.main.filter((r) => r.survivesHideTotals);
      expect(survivors.map((r) => r.label)).toEqual(["Freight"]);
      expect(keys(model)).toContain("total");
      // The words line's own reason stays independent of hideTotals — see the partial.
      expect(model.hideTotalInWords).toBe(false);
    });

    it("accepts hideTotals from the deprecated advanceOptions home", () => {
      expect(compute({ advanceOptions: { hideTotals: true } }).hidden).toBe(
        true
      );
    });

    it("marks tax rows for hideTaxes without removing them", () => {
      const model = compute({ hideTaxes: true });
      expect(model.hideTaxes).toBe(true);
      expect(row(model, "cgst")?.isTaxRow).toBe(true);
      expect(row(model, "total")?.isTaxRow).toBe(false);
    });

    it("accepts hideTaxes from the deprecated advanceOptions home", () => {
      expect(compute({ advanceOptions: { hideTaxes: true } }).hideTaxes).toBe(
        true
      );
    });

    it("appends the currency code to the Total label by default", () => {
      expect(row(compute(), "total")?.label).toBe("Total (INR)");
    });

    it("drops the currency code for the business experimental setting", () => {
      /*
       * hideCurrencyCode is a business configuration, not a document field — a template
       * reading advanceOptions.hideCurrencyCode would never see it set.
       */
      const model = compute({
        owner: { configuration: { experimental: { hideCurrencyCode: true } } },
      });
      expect(row(model, "total")?.label).toBe("Total");
    });

    it("still honours hideCurrencyCode from the deprecated advanceOptions home", () => {
      const model = compute({ advanceOptions: { hideCurrencyCode: true } });
      expect(row(model, "total")?.label).toBe("Total");
    });

    it("reports hideTotalInWords as its own reason to hide the words line", () => {
      const withWords = { customLabels: { totalInWordsValue: "One thousand" } };
      expect(compute(withWords).hideTotalInWords).toBe(false);
      expect(
        compute({ ...withWords, hideTotalInWords: true }).hideTotalInWords
      ).toBe(true);
    });

    it("suppresses the words line when subUnitLength exceeds the currency's decimals", () => {
      // You cannot spell "one point two three four rupees".
      const model = compute({
        subUnitLength: 3,
        customLabels: { totalInWordsValue: "One thousand" },
      });
      expect(model.totalInWords).not.toBeNull();
      expect(model.wordsFitCurrency).toBe(false);
    });
  });

  describe("currency formatting", () => {
    it("formats with a thousands separator and the currency symbol", () => {
      const model = compute({
        finalTotal: { ...baseInvoice().finalTotal, total: 1234567.5 },
      });
      expect(row(model, "total")?.value).toBe("₹12,34,567.50");
    });

    it("brackets a negative rather than printing a bare minus", () => {
      // The old fork printed ₹-1234.5 by concatenating a symbol onto a raw number.
      const model = compute({ balance: { credit: 1234.5, paid: 0 } });
      expect(row(model, "creditApplied")?.value).toBe("(₹1,234.50)");
    });

    it("honours a custom currency symbol", () => {
      const model = compute({ currency: "SAR" });
      expect(row(model, "total")?.value).toContain("⃁");
    });

    it("respects subUnitLength", () => {
      const model = compute({
        subUnitLength: 3,
        finalTotal: { ...baseInvoice().finalTotal, total: 1180 },
      });
      expect(row(model, "total")?.value).toBe("₹1,180.000");
    });

    it("groups digits by the document locale, not the business locale", () => {
      /*
       * owner.locale is the *business's* locale and belongs only to the converted sub-line.
       * Using it for the document amount made the totals read ₹130,000.00 while the item
       * table, which resolves through formatCurrency, read ₹1,30,000.00 on the same page.
       */
      const model = compute({
        owner: { currency: "USD", locale: "en-US" },
        finalTotal: { ...baseInvoice().finalTotal, total: 130000 },
      });
      expect(row(model, "total")?.value).toBe("₹1,30,000");
    });

    it("falls back to the host business locale for the document amount", () => {
      const model = compute(
        { finalTotal: { ...baseInvoice().finalTotal, total: 130000 } },
        { businessLocale: "en-US" }
      );
      expect(row(model, "total")?.value).toBe("₹130,000");
    });
  });

  describe("dual currency", () => {
    const rates = { conversionRates: { USD: 0.012 } };

    it("converts every amount row when the host sends businessCurrency", () => {
      const model = compute(rates, { businessCurrency: "USD" });
      expect(row(model, "total")?.converted).toBe("$14.16");
      expect(row(model, "cgst")?.converted).toBe("$1.08");
    });

    it("falls back to owner.currency when the host sends nothing", () => {
      /*
       * The decisive case. `businessCurrency` is a Lydia client-side prop that never reaches
       * the iframe, which fetches the serana document directly — so without this fallback the
       * converted amount silently never renders in production, on exactly the foreign-currency
       * documents the feature is for.
       */
      const model = compute({
        ...rates,
        owner: { currency: "USD", locale: "en-US" },
      });
      expect(row(model, "total")?.converted).toBe("$14.16");
    });

    it("renders no conversion when the document currency matches the business", () => {
      const model = compute(rates, { businessCurrency: "INR" });
      expect(row(model, "total")?.converted).toBeNull();
      expect(keys(model)).not.toContain("conversionRate");
    });

    it("renders no sub-line at all when there is no conversion rate", () => {
      /*
       * `conversionRates` is optional and un-defaulted, so an INR document owned by a USD
       * business can easily arrive without one. Formatting `amount * 0` put `$0.00` under
       * every row of the totals block. The reference can leave this ungated because its
       * sub-line is wrapped in DefaultHidden and never actually visible; ours is visible.
       */
      const model = compute({}, { businessCurrency: "USD" });
      expect(row(model, "total")?.converted).toBeNull();
      model.groups.main.forEach((r) => expect(r.converted).toBeNull());
    });

    it("adds a conversion-rate row only when a rate exists", () => {
      expect(keys(compute(rates, { businessCurrency: "USD" }))).toContain(
        "conversionRate"
      );
      expect(keys(compute({}, { businessCurrency: "USD" }))).not.toContain(
        "conversionRate"
      );
    });
  });

  describe("label resolution", () => {
    it("prefers a business custom label over everything", () => {
      const model = compute({
        customLabels: { subTotal: "Net Amount" },
        finalTotal: { ...baseInvoice().finalTotal, discount: 100 },
      });
      expect(row(model, "subTotal")?.label).toBe("Net Amount");
    });

    it("falls back to the document's own column label", () => {
      // This is where a business's rename of Discount to Rebate lands.
      const model = compute({
        columns: [
          ...baseInvoice().columns.filter((c) => c.key !== "discount"),
          { key: "discount", label: "Rebate" },
        ],
        finalTotal: { ...baseInvoice().finalTotal, discount: 100 },
      });
      expect(row(model, "discount")?.label).toBe("Rebate");
    });

    it("falls back to an English constant when neither exists", () => {
      const model = compute({ columns: [], balance: { credit: 50, paid: 0 } });
      expect(row(model, "creditApplied")?.label).toBe("Credit Applied");
    });

    it("overrides a document SGST column label for a UTGST sale", () => {
      const model = compute({ isUtgst: true });
      expect(row(model, "sgst")?.label).toBe("UTGST");
    });

    it("appends the discount percentage when the document carries one", () => {
      const model = compute({
        finalTotal: {
          ...baseInvoice().finalTotal,
          discount: 100,
          discountPercentage: 10,
        },
      });
      expect(row(model, "discount")?.label).toBe("Discount(10%)");
    });

    it("prefers explicit columns options over invoice.columns", () => {
      const model = compute(
        {},
        { columns: [{ key: "cgst", label: "CGST-X" }] }
      );
      expect(row(model, "cgst")?.label).toBe("CGST-X");
    });
  });

  describe("per-rate breakup under the summary tax view", () => {
    it("splits tax rows by rate", () => {
      const model = compute({
        advanceOptions: { taxSummaryView: "BOTH" },
        items: [
          { _id: "a", total: 1000, gstRate: 18, cgst: 90, sgst: 90 },
          { _id: "b", total: 500, gstRate: 5, cgst: 12.5, sgst: 12.5 },
        ],
      });
      expect(keys(model)).toContain("cgst:18");
      expect(keys(model)).toContain("cgst:5");
      expect(keys(model)).toContain("sgst:18");
    });

    it("prints half the item rate on each split row", () => {
      // An 18% item is CGST 9% + SGST 9%. refrens.com halves it inside
      // getAggregateTaxTotals; the row's `gstRate` is the undivided grouping key.
      const model = compute({
        advanceOptions: { taxSummaryView: "BOTH" },
        items: [
          { _id: "a", total: 1000, gstRate: 18, cgst: 90, sgst: 90 },
          { _id: "b", total: 500, gstRate: 5, cgst: 12.5, sgst: 12.5 },
        ],
      });
      expect(row(model, "cgst:18")?.label).toBe("CGST (9%)");
      expect(row(model, "sgst:18")?.label).toBe("SGST (9%)");
      expect(row(model, "cgst:5")?.label).toBe("CGST (2.5%)");
    });

    it("falls back to the flat tax row when no item carries a rate", () => {
      const model = compute({
        advanceOptions: { taxSummaryView: "INVOICE_SUMMARY" },
        items: [],
      });
      expect(keys(model)).toContain("cgst");
      expect(keys(model)).not.toContain("cgst:18");
    });

    it("splits IGST by rate on an interstate sale", () => {
      const model = compute({
        isIgst: true,
        advanceOptions: { taxSummaryView: "BOTH" },
        items: [{ _id: "a", total: 1000, gstRate: 18, igst: 180 }],
      });
      expect(keys(model)).toContain("igst:18");
    });

    it("falls back to the flat IGST row when no item carries a rate", () => {
      const model = compute({
        isIgst: true,
        advanceOptions: { taxSummaryView: "BOTH" },
        items: [],
      });
      expect(keys(model)).toContain("igst");
    });
  });

  describe("cess", () => {
    /*
     * There is no `cess.rate` — the subdocument is exactly
     * `{ cessName, cessType, cessKey, cessAmountKey, isApplied, isNewCess }`
     * (talos/src/invoices.js:553). The rate and the per-item amount live on the item, under
     * `custom[cessKey]` and `custom[cessAmountKey]`, which is where `cessBreakupTotal`
     * reads them (lydia/src/helpers/taxAggregateSummary.js).
     */
    const cessInvoice = {
      cesses: [
        {
          _id: "c1",
          cessKey: "comp",
          cessAmountKey: "compAmount",
          cessName: "Comp. Cess",
          isApplied: true,
        },
      ],
      items: [
        {
          _id: "i1",
          total: 1000,
          custom: { comp: 12, compAmount: 60 },
        },
      ],
      finalTotal: {
        ...baseInvoice().finalTotal,
        cessTotal: { compAmount: 60 },
      },
    };

    it("renders an applied cess row", () => {
      const model = compute(cessInvoice);
      expect(row(model, "cess:comp")?.label).toBe("Comp. Cess");
      expect(row(model, "cess:comp")?.value).toBe("₹60");
    });

    it("skips a cess that is not applied", () => {
      const model = compute({
        ...cessInvoice,
        cesses: [{ ...cessInvoice.cesses[0], isApplied: false }],
      });
      expect(keys(model)).not.toContain("cess:comp");
    });

    it("breaks the cess down per distinct rate under the summary view", () => {
      const model = compute({
        ...cessInvoice,
        items: [
          { _id: "i1", total: 1000, custom: { comp: 12, compAmount: 60 } },
          { _id: "i2", total: 500, custom: { comp: 12, compAmount: 30 } },
          { _id: "i3", total: 400, custom: { comp: 5, compAmount: 20 } },
        ],
        advanceOptions: { taxSummaryView: "BOTH" },
      });
      // Same-rate items sum into one row; a second rate gets its own, as on refrens.com.
      expect(row(model, "cessRate:comp:12")?.label).toBe("Comp. Cess (12%)");
      expect(row(model, "cessRate:comp:12")?.value).toBe("₹90");
      expect(row(model, "cessRate:comp:5")?.label).toBe("Comp. Cess (5%)");
      expect(row(model, "cessRate:comp:5")?.value).toBe("₹20");
    });

    it("omits a zero cess under the summary view", () => {
      const model = compute({
        ...cessInvoice,
        items: [{ _id: "i1", total: 1000 }],
        finalTotal: { ...baseInvoice().finalTotal, cessTotal: {} },
        advanceOptions: { taxSummaryView: "BOTH" },
      });
      expect(keys(model).some((k) => k.startsWith("cessRate:"))).toBe(false);
    });

    it("falls back to the combined figure when no item carries the cess", () => {
      // A document whose cess sits only on the total still renders, without a rate suffix.
      const model = compute({
        ...cessInvoice,
        items: [{ _id: "i1", total: 1000 }],
        advanceOptions: { taxSummaryView: "BOTH" },
      });
      expect(row(model, "cessRate:comp")?.label).toBe("Comp. Cess");
      expect(row(model, "cessRate:comp")?.value).toBe("₹60");
    });

    it("does not mark cess rows as tax rows, in either view", () => {
      // Both cess blocks sit outside balance.js's `!hideTaxes` fragment, so `hideTaxes`
      // must leave them alone while it hides CGST/SGST/IGST.
      const flat = compute(cessInvoice);
      expect(row(flat, "cess:comp")?.isTaxRow).toBe(false);
      expect(row(flat, "cgst")?.isTaxRow).toBe(true);

      const perRate = compute({
        ...cessInvoice,
        advanceOptions: { taxSummaryView: "BOTH" },
      });
      expect(row(perRate, "cessRate:comp:12")?.isTaxRow).toBe(false);

      const combined = compute({
        ...cessInvoice,
        items: [{ _id: "i1", total: 1000 }],
        advanceOptions: { taxSummaryView: "BOTH" },
      });
      expect(row(combined, "cessRate:comp")?.isTaxRow).toBe(false);
    });
  });

  describe("additional charges", () => {
    it("renders a flat charge", () => {
      const model = compute({
        additionalCharges: [{ _id: "c1", label: "Freight", amount: 200 }],
      });
      expect(row(model, "charge:c1")?.value).toBe("₹200");
    });

    it("applies a percentage charge to the item total after the discount", () => {
      const model = compute({
        additionalCharges: [
          {
            _id: "c1",
            label: "Handling",
            amount: 10,
            amountType: "PERCENTAGE",
          },
        ],
      });
      // 10% of the 1000 item total.
      expect(row(model, "charge:c1")?.value).toBe("₹100");
    });

    it("honours a charge multiplier", () => {
      const model = compute({
        additionalCharges: [
          { _id: "c1", label: "Crate", amount: 50, multiplier: 3 },
        ],
      });
      expect(row(model, "charge:c1")?.value).toBe("₹150");
    });

    it("excludes group total rows from the percentage base", () => {
      const model = compute({
        items: [
          { _id: "a", total: 1000 },
          { _id: "g", total: 1000, isGroupItemTotalRow: true },
        ],
        additionalCharges: [
          {
            _id: "c1",
            label: "Handling",
            amount: 10,
            amountType: "PERCENTAGE",
          },
        ],
      });
      expect(row(model, "charge:c1")?.value).toBe("₹100");
    });

    it("adds an Amount row to a non-tax document whose charges move the total", () => {
      const model = compute({
        invoiceType: "QUOTATION",
        additionalCharges: [{ _id: "c1", label: "Freight", amount: 200 }],
      });
      expect(keys(model)).toContain("amount");
    });

    it("omits that Amount row when the charges cancel out", () => {
      // A pair that nets to zero leaves Amount equal to Total, so the row would just repeat it.
      const model = compute({
        invoiceType: "QUOTATION",
        additionalCharges: [
          { _id: "c1", label: "Up", amount: 200 },
          { _id: "c2", label: "Down", amount: -200 },
        ],
      });
      expect(keys(model)).not.toContain("amount");
    });

    it("renders a taxed charge that arrives as a line item", () => {
      const model = compute({
        items: [
          { _id: "i1", total: 1000 },
          {
            _id: "ac1",
            name: "Installation",
            isAdditionalCharge: true,
            rate: 500,
            igst: 90,
            gstRate: 18,
            hsn: "9987",
          },
        ],
      });
      const taxed = row(model, "taxedCharge:ac1");
      expect(taxed?.label).toBe("Installation");
      expect(taxed?.note).toBe("GST 18% HSN 9987");
      expect(taxed?.extra?.value).toBe("₹90");
    });

    it("prints the Malaysian Code for a Malaysian seller", () => {
      const model = compute({
        // The reference reads `billedBy.country === 'MY'` (balance.js:63), not whichever of
        // the two fields the item happens to carry. taxName drives the prefix, so a
        // Malaysian document must not say "GST".
        billedBy: { country: "MY" },
        taxType: "GLOBAL",
        taxName: "SST",
        items: [
          {
            _id: "ac1",
            name: "Install",
            isAdditionalCharge: true,
            rate: 500,
            gstRate: 6,
            classification: "011",
          },
        ],
      });
      expect(row(model, "taxedCharge:ac1")?.note).toBe("SST 6% Code 011");
    });

    it("prints HSN for a non-Malaysian seller even when a classification is present", () => {
      const model = compute({
        billedBy: { country: "IN" },
        items: [
          {
            _id: "ac1",
            name: "Install",
            isAdditionalCharge: true,
            rate: 500,
            gstRate: 18,
            hsn: "9987",
            classification: "011",
          },
        ],
      });
      expect(row(model, "taxedCharge:ac1")?.note).toBe("GST 18% HSN 9987");
    });

    it("prints only the rate when the item carries neither code", () => {
      const model = compute({
        items: [
          {
            _id: "ac1",
            name: "Install",
            isAdditionalCharge: true,
            gstRate: 18,
          },
        ],
      });
      expect(row(model, "taxedCharge:ac1")?.note).toBe("GST 18%");
    });
  });

  describe("late payment fee", () => {
    it("renders only once enabled and applied", () => {
      const fee = { enabled: true, isApplied: true, finalAmount: 250 };
      expect(
        row(compute({ latePaymentFee: fee }), "latePaymentFee")?.value
      ).toBe("₹250");
      expect(
        keys(compute({ latePaymentFee: { ...fee, isApplied: false } }))
      ).not.toContain("latePaymentFee");
    });
  });

  describe("extra total fields", () => {
    it("renders the value verbatim rather than as currency", () => {
      // Matches the reference, which prints the raw string.
      const model = compute({
        extraTotalFields: [
          { key: "packing", label: "Packing Charges", value: "500" },
        ],
      });
      expect(row(model, "extra:packing")?.value).toBe("500");
      expect(model.hasExtra).toBe(true);
    });

    it("skips a field with no value", () => {
      const model = compute({
        extraTotalFields: [{ key: "packing", label: "Packing", value: "" }],
      });
      expect(model.hasExtra).toBe(false);
    });
  });

  describe("credit rows", () => {
    it("shows Credit Applied as a deduction on an invoice", () => {
      const model = compute({ balance: { credit: 500 } });
      expect(row(model, "creditApplied")?.value).toBe("(₹500)");
    });

    it("omits Credit Applied on a debit note", () => {
      const model = compute({
        billType: "DEBITNOTE",
        balance: { credit: 500 },
      });
      expect(row(model, "creditApplied")).toBeUndefined();
    });

    it("uses the credit-note wording and adds available credits", () => {
      const model = compute({
        billType: "CREDITNOTE",
        balance: { credit: 500, due: 200 },
      });
      expect(row(model, "creditUsed")?.value).toBe("(₹500)");
      expect(row(model, "availableCredits")?.value).toBe("₹200");
      expect(row(model, "creditApplied")).toBeUndefined();
    });

    it("shows a credit-note refund unless the payments table is switched off", () => {
      const cn = { billType: "CREDITNOTE", balance: { refund: 300 } };
      expect(row(compute(cn), "refund")?.value).toBe("(₹300)");
      expect(
        row(
          compute({ ...cn, advanceOptions: { showPaymentsTable: false } }),
          "refund"
        )
      ).toBeUndefined();
    });
  });

  describe("payment and due rows", () => {
    it("shows amount paid net of the transaction charge, plus the due amount", () => {
      const model = compute({
        balance: { paid: 1000, due: 180, transactionCharge: 20 },
      });
      expect(row(model, "amountPaid")?.value).toBe("(₹1,020)");
      expect(row(model, "amountReceived")?.value).toBe("₹1,000");
      expect(row(model, "transactionCharge")?.value).toBe("₹20");
      expect(row(model, "dueAmount")?.value).toBe("₹180");
      expect(row(model, "dueAmount")?.emphasis).toBe("due");
      expect(model.hasDue).toBe(true);
    });

    it("shows TDS withheld as a deduction", () => {
      const model = compute({ balance: { paid: 1000, tds: 50 } });
      expect(row(model, "tds")?.value).toBe("(₹50)");
    });

    it("shows the settled amount", () => {
      const model = compute({ balance: { paid: 1000, settledAmount: 900 } });
      expect(row(model, "settledAmount")?.value).toBe("₹900");
    });

    it("renders no due group on a credit note", () => {
      const model = compute({ billType: "CREDITNOTE", balance: { paid: 500 } });
      expect(model.hasDue).toBe(false);
    });

    it("renders no due group when nothing was paid", () => {
      expect(compute().hasDue).toBe(false);
    });

    it("shows the sales RCM row only with the business summary setting on", () => {
      const rcm = {
        reverseCharge: true,
        finalTotal: { ...baseInvoice().finalTotal, rcmTax: 120 },
        advanceOptions: { rcmSummaryView: true },
      };
      expect(row(compute(rcm), "rcmSales")?.value).toBe("₹120");
      expect(
        row(compute({ ...rcm, advanceOptions: {} }), "rcmSales")
      ).toBeUndefined();
    });

    it("shows the expenditure RCM row from the tax buckets", () => {
      const model = compute({
        isExpenditure: true,
        reverseCharge: true,
        balance: { paid: 100 },
        advanceOptions: { rcmSummaryView: true },
      });
      expect(row(model, "rcmExpenditure")?.value).toBe("₹180");
    });

    it("accepts reverseCharge from advanceOptions", () => {
      const model = compute({
        finalTotal: { ...baseInvoice().finalTotal, rcmTax: 120 },
        advanceOptions: { reverseCharge: true, rcmSummaryView: true },
      });
      expect(row(model, "rcmSales")?.value).toBe("₹120");
    });
  });

  describe("early-pay rows are deliberately absent", () => {
    it("renders no early-pay table", () => {
      /*
       * Rows 34-36 of the reference hang off isEarlyPayApplicable, a Lydia client-side prop
       * with no document field behind it, so they could never render in the iframe.
       */
      const model = compute({
        earlyPayDiscount: { discountAmount: 100, expiry: "2026-01-01" },
        toPay: { full: 1080 },
      });
      expect(keys(model)).not.toContain("earlyPayAmount");
    });
  });
});

describe("resolveTaxVisibility", () => {
  const doc = {
    invoiceType: "INVOICE",
    taxType: "INDIA",
    isInterState: false,
  };

  it("returns neither family on a non-tax document", () => {
    const v = resolveTaxVisibility({ ...doc, invoiceType: "QUOTATION" });
    expect(v).toMatchObject({
      isTaxDocument: false,
      showCgstSgst: false,
      showIgst: false,
    });
  });

  it("picks CGST/SGST for a domestic Indian sale", () => {
    expect(resolveTaxVisibility(doc)).toMatchObject({
      showCgstSgst: true,
      showIgst: false,
    });
  });

  it("picks IGST for an interstate sale", () => {
    expect(resolveTaxVisibility({ ...doc, isInterState: true })).toMatchObject({
      showCgstSgst: false,
      showIgst: true,
    });
  });

  it("splits regardless of what the tax is named", () => {
    // `taxName` is a free-form, PATCH-whitelisted string; the reference's row gate
    // (balance.js:323) has no taxName term, so a business renaming its tax label must not
    // lose the CGST/SGST split on a domestic Indian sale.
    ["VAT", "SST", "GST (18%)", ""].forEach((taxName) => {
      expect(resolveTaxVisibility({ ...doc, ...{ taxName } })).toMatchObject({
        showCgstSgst: true,
        showIgst: false,
      });
    });
  });

  it("defaults an absent taxType to INDIA, as the reference destructure does", () => {
    // balance.js:33 is `taxType = TAX_TYPE.INDIA`. A payload that lost the field used to
    // print a single IGST row on a domestic GST invoice.
    ["", undefined].forEach((taxType) => {
      expect(resolveTaxVisibility({ ...doc, taxType })).toMatchObject({
        showCgstSgst: true,
        showIgst: false,
      });
    });
  });

  it("picks IGST for every non-India tax type", () => {
    ["GLOBAL", "MALAYSIA"].forEach((taxType) => {
      expect(resolveTaxVisibility({ ...doc, taxType })).toMatchObject({
        showIgst: true,
        showCgstSgst: false,
      });
    });
  });

  it("ignores hideTaxes unless suppressions are requested", () => {
    // The item-table columns are a property of the document, not of a display toggle.
    expect(resolveTaxVisibility({ ...doc, hideTaxes: true }).showCgstSgst).toBe(
      true
    );
    expect(
      resolveTaxVisibility(
        { ...doc, hideTaxes: true },
        { applySuppressions: true }
      ).showCgstSgst
    ).toBe(false);
  });

  it("suppresses a zero tax row on an export without payment", () => {
    const opts = { applySuppressions: true };
    expect(
      resolveTaxVisibility({ ...doc, supplyType: "EXPWOP" }, opts).showCgstSgst
    ).toBe(false);
    expect(
      resolveTaxVisibility({ ...doc, supplyType: "EXPWOP", cgst: 90 }, opts)
        .showCgstSgst
    ).toBe(true);
    expect(
      resolveTaxVisibility(
        { ...doc, isInterState: true, supplyType: "EXPWOP" },
        opts
      ).showIgst
    ).toBe(false);
    expect(
      resolveTaxVisibility(
        { ...doc, isInterState: true, supplyType: "EXPWOP", igst: 180 },
        opts
      ).showIgst
    ).toBe(true);
  });

  it("reads a numeric-string tax bucket", () => {
    expect(
      resolveTaxVisibility(
        { ...doc, supplyType: "EXPWOP", cgst: "90" },
        { applySuppressions: true }
      ).showCgstSgst
    ).toBe(true);
  });
});

describe("resolveDocumentTaxVisibility", () => {
  const doc = {
    invoiceType: "INVOICE",
    taxType: "INDIA",
    taxName: "GST",
    igst: false,
    finalTotal: { cgst: 90, sgst: 90, igst: 0 },
  };

  it("reads either template root shape", () => {
    // The root is whatever the template's data mapper returns; both are live.
    expect(resolveDocumentTaxVisibility(doc).showCgstSgst).toBe(true);
    expect(resolveDocumentTaxVisibility({ invoice: doc }).showCgstSgst).toBe(
      true
    );
  });

  it("gives the summary tables one combined column for a non-India document", () => {
    // What the tables used to get was the raw inter-state flag, false here, so an
    // Indonesian PPN or Malaysian SST invoice drew CGST and SGST columns. Both are
    // `taxType: "GLOBAL"`, which is the term that decides it.
    [
      { taxType: "GLOBAL", taxName: "PPN" },
      { taxType: "GLOBAL", taxName: "SST" },
    ].forEach((over) => {
      const v = resolveDocumentTaxVisibility({ ...doc, ...over });
      expect(v.showIgst).toBe(true);
      expect(v.showCgstSgst).toBe(false);
    });
  });

  it("ignores hideTaxes so the host's live toggle stays a CSS concern", () => {
    const v = resolveDocumentTaxVisibility(
      { ...doc, hideTaxes: true },
      { applySuppressions: true }
    );
    expect(v.showCgstSgst).toBe(true);
  });

  it("returns nothing renderable for a non-record payload", () => {
    expect(resolveDocumentTaxVisibility(undefined).isTaxDocument).toBe(false);
  });
});

describe("normalizeInvoiceTemplateState tax visibility", () => {
  const build = (over: Record<string, unknown>) =>
    normalizeInvoiceTemplateState({
      invoice: { ...baseInvoice(), ...over },
    } as never);

  const columnVisible = (
    state: NormalizedInvoiceTemplateState,
    key: string
  ) => {
    const column = state.mapped.columns.find((c) => c.key === key);
    return column ? !column.isHidden : null;
  };

  it("agrees between mapped.visibility and mapped.columns", () => {
    /*
     * These were two different predicates before REF-25603, which is why the shipped fork
     * rendered CGST and SGST columns on a quotation: it gates cells on mapped.visibility
     * while the headers came from mapped.columns.
     */
    [
      { invoiceType: "INVOICE", taxType: "INDIA", igst: false },
      { invoiceType: "INVOICE", taxType: "INDIA", igst: true },
      { invoiceType: "INVOICE", taxType: "INDIA", taxName: "VAT" },
      { invoiceType: "INVOICE", taxType: "INDIA", isIgst: true },
      { invoiceType: "INVOICE", taxType: "GLOBAL" },
      { invoiceType: "INVOICE", taxType: "MALAYSIA" },
      { invoiceType: "QUOTATION", taxType: "INDIA" },
      { invoiceType: "BOS", taxType: "INDIA" },
    ].forEach((over) => {
      const state = build(over);
      expect({
        igst: state.mapped.visibility.showIgst,
        cgst: state.mapped.visibility.showCgstSgst,
      }).toEqual({
        igst: columnVisible(state, "igst"),
        cgst: columnVisible(state, "cgst"),
      });
    });
  });

  it("shows no tax columns on a non-tax document", () => {
    const state = build({ invoiceType: "QUOTATION" });
    expect(state.mapped.visibility.showCgstSgst).toBe(false);
    expect(state.mapped.visibility.showIgst).toBe(false);
  });

  it("splits on the India tax type, not on what the tax is called", () => {
    // A GLOBAL document whose taxName happens to be GST is still a single-row document.
    const global = build({ taxType: "GLOBAL", taxName: "GST" });
    expect(global.mapped.visibility.showIgst).toBe(true);
    expect(global.mapped.visibility.showCgstSgst).toBe(false);

    // An India document keeps its split whatever the tax is named — the reference's row
    // gate has no taxName term, and taxName is user-editable while taxType is not.
    const vat = build({ taxType: "INDIA", taxName: "VAT" });
    expect(vat.mapped.visibility.showCgstSgst).toBe(true);
    expect(vat.mapped.visibility.showIgst).toBe(false);

    const gst = build({ taxType: "INDIA", taxName: "GST" });
    expect(gst.mapped.visibility.showCgstSgst).toBe(true);
    expect(gst.mapped.visibility.showIgst).toBe(false);
  });
});

describe("resolveDocumentTaxLabel", () => {
  it("prefers the document's own column label", () => {
    const label = resolveDocumentTaxLabel(
      {
        taxType: "GLOBAL",
        taxName: "PPN",
        columns: [{ key: "igst", label: "PPN 11%" }],
      },
      "igst"
    );
    expect(label).toBe("PPN 11%");
  });

  it("falls back to the taxName, never to IGST, on a non-GST document", () => {
    expect(resolveDocumentTaxLabel({ taxName: "PPN" }, "igst")).toBe("PPN");
    expect(resolveDocumentTaxLabel({ taxName: "SST" }, "igst")).toBe("SST");
    expect(resolveDocumentTaxLabel({ taxName: "GST" }, "igst")).toBe("IGST");
    expect(resolveDocumentTaxLabel({}, "igst")).toBe("IGST");
  });

  it("keeps UTGST ahead of a saved SGST column label", () => {
    const doc = { utgst: true, columns: [{ key: "sgst", label: "SGST" }] };
    expect(resolveDocumentTaxLabel(doc, "sgst")).toBe("UTGST");
  });

  it("lets a business's custom label win", () => {
    const doc = {
      customLabels: { cgst: "Central Tax" },
      columns: [{ key: "cgst", label: "CGST" }],
    };
    expect(resolveDocumentTaxLabel(doc, "cgst")).toBe("Central Tax");
  });

  it("reads the wrapped root shape and refuses a key it does not own", () => {
    expect(
      resolveDocumentTaxLabel({ invoice: { taxName: "PPN" } }, "igst")
    ).toBe("PPN");
    expect(resolveDocumentTaxLabel({ taxName: "PPN" }, "total")).toBe("");
  });
});
