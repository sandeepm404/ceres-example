/*
 * The totals block, decided once.
 *
 * Every ceres template used to write its own totals markup, and each copy was wrong in a
 * different way — a currency symbol pasted onto a raw number, the optional `totals` object
 * read instead of the required `finalTotal`, tax rows gated on whether the figure happened
 * to be non-zero, two round-off rows that refrens.com prints for nobody, and eight rows
 * against a reference that renders thirty-three.
 *
 * `computeSubtotalRows` returns a fully-decided render model: four groups of rows, each row
 * carrying its resolved label and an already-formatted amount string. Subtotal.hbs prints
 * it and nothing else. Every predicate lives here, where a test can reach it.
 *
 * The row set, the order and the visibility conditions mirror refrens.com's shared totals
 * component, lydia/src/components/widgets/invoice/balance.js, which is what customers
 * already see on all 14 built-in templates. Rows 34-36 of that component (the early-pay
 * table) are deliberately absent: they hang off `isEarlyPayApplicable`, a Lydia client-side
 * prop with no document field behind it, so they could never render in the iframe.
 */

import formatCurrency from "../shared/formatCurrency";
import {
  asArray,
  asFlag,
  asRecord,
  asText,
  isRecord,
  pickFirst,
  toAmount,
} from "../shared/payloadValues";
import type { UnknownRecord } from "../shared/payloadValues";
import { resolveDocumentTaxVisibility } from "../shared/taxVisibility";
import { resolveTaxLabel } from "../shared/taxRowLabels";
import { computeTaxSummary } from "../tax-summary/utils";

export type RowEmphasis = "normal" | "grand" | "due";

export interface SubtotalRow {
  key: string;
  label: string;
  /* Small secondary line under the label — the tax rate on a taxed additional charge. */
  note: string | null;
  /* Already formatted. Templates must not re-format or concatenate a symbol. */
  value: string;
  /* The converted amount sub-line on a foreign-currency document, or null. */
  converted: string | null;
  /* Second figure on the same row, used only by taxed additional charges. */
  extra: { value: string; converted: string | null } | null;
  emphasis: RowEmphasis;
  /*
   * A tax row, hidden by `hideTaxes`. Every row stays in the DOM so the host can toggle the
   * setting live by flipping visibility — the same contract the tax-summary, HSN-summary and
   * payments-table settings already use. Computing the rows away instead would make the
   * toggle a no-op until the document was re-rendered.
   */
  isTaxRow: boolean;
  /* An additional-charge row, which is the one thing `hideTotals` keeps. */
  survivesHideTotals: boolean;
}

export interface SubtotalGroups {
  main: SubtotalRow[];
  extra: SubtotalRow[];
  due: SubtotalRow[];
}

export interface SubtotalModel {
  /* `hideTotals` — the template renders the additional-charge rows and nothing else. */
  hidden: boolean;
  hideTaxes: boolean;
  groups: SubtotalGroups;
  hasExtra: boolean;
  hasDue: boolean;
  totalInWords: { label: string; value: string } | null;
  /*
   * The words line has three independent reasons to be hidden and the partial emits a class
   * for each, because `hideTotals` and `hideTotalInWords` are live host toggles while the
   * precision one is a property of the currency. Conflating them into a single flag meant
   * turning either setting off un-hid the line the other still wanted hidden.
   */
  hideTotalInWords: boolean;
  /* False when the document's sub-unit length exceeds what words can express. */
  wordsFitCurrency: boolean;
}

export interface SubtotalOptions {
  /* Document column settings — `mapped.columns`, or the raw `invoice.columns`. */
  columns?: unknown;
  /* Host wrapper fields. Absent in the iframe; `owner.currency`/`owner.locale` cover that. */
  businessCurrency?: unknown;
  businessLocale?: unknown;
  /* Override for `invoice.owner.configuration`, for hosts that pass it separately. */
  ownerConfiguration?: unknown;
}

/*
 * English fallbacks for the rows that have no backing column. ceres has no i18n runtime, so
 * these cannot come from `t()` the way refrens.com resolves them; the strings are copied
 * from lydia/src/i18n/en/ so the two renderers do not disagree by accident. A business
 * custom label still wins over these — see resolveLabel.
 */
const DEFAULT_LABELS: Record<string, string> = {
  subTotal: "Sub Total",
  discount: "Discount",
  earlyPayDiscount: "Early Pay Discount",
  amount: "Amount",
  cgst: "CGST",
  sgst: "SGST",
  utgst: "UTGST",
  igst: "IGST",
  total: "Total",
  totalInWords: "Total (in words)",
  latePaymentFee: "Late Payment Fee",
  conversionRate: "Conversion Rate",
  creditApplied: "Credit Applied",
  creditUsed: "Credit Used",
  refund: "Refund",
  availableCredits: "Available Credits",
  taxUnderRCM: "Tax under RCM",
  tdsAmountWithheld: "TDS Amount Withheld",
  amountPaid: "Amount Paid",
  amountReceived: "Amount Received",
  transactionCharge: "Transaction Charge",
  settledAmount: "Settled Amount",
  dueAmount: "Due Amount",
};

/*
 * Currencies whose sub-unit has more than two digits are rare enough that refrens.com reads
 * the real table (@refrens/fence currency.json) only to decide whether an amount can be
 * spelled in words. ceres ships no currency table, so two digits is the assumption; the
 * effect is limited to suppressing the words line when a business has configured a longer
 * sub-unit than the currency can express.
 */
const ASSUMED_CURRENCY_DECIMALS = 2;

const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/*
 * Additional-charge amount. Percentage charges apply to the item total after the discount,
 * not to the Sub Total and not to any earlier charge — mirrors
 * lydia/src/helpers/additionalCharges.ts, which serana's stored total agrees with.
 */
export const getAdditionalChargeAmount = (
  charge: unknown,
  base: number
): number => {
  const record = asRecord(charge);
  const amount = toAmount(record.amount);
  const multiplier =
    record.multiplier === undefined ? 1 : toAmount(record.multiplier);
  return asText(record.amountType) === "PERCENTAGE"
    ? (amount * multiplier * base) / 100
    : amount * multiplier;
};

const getAdditionalChargesTotal = (charges: unknown[], base: number): number =>
  charges.reduce<number>(
    (sum, charge) => sum + getAdditionalChargeAmount(charge, base),
    0
  );

interface CurrencyContext {
  currency: string;
  locale: string | undefined;
  subUnitLength: number | undefined;
  customCurrencySymbol: string | undefined;
  dual: { currency: string; locale: string | undefined; rate: number } | null;
}

const formatIn = (
  amount: number,
  currency: string,
  locale: string | undefined,
  subUnitLength: number | undefined,
  symbol?: string | undefined
): string => formatCurrency(amount, currency, locale, subUnitLength, symbol);

const money = (amount: number, ctx: CurrencyContext): string =>
  formatIn(
    amount,
    ctx.currency,
    ctx.locale,
    ctx.subUnitLength,
    ctx.customCurrencySymbol
  );

/*
 * The converted sub-line. Applied to every currency row, unlike the reference, which carries
 * it on eight row kinds and omits it from a dozen others for no discernible reason — a
 * totals block where some figures convert and others do not is harder to defend than one
 * that differs slightly from refrens.com (REF-25603 decision).
 */
const converted = (amount: number, ctx: CurrencyContext): string | null =>
  ctx.dual
    ? formatIn(
        amount * ctx.dual.rate,
        ctx.dual.currency,
        ctx.dual.locale,
        ctx.subUnitLength
      )
    : null;

const resolveCurrencyContext = (
  invoice: UnknownRecord,
  owner: UnknownRecord,
  options: SubtotalOptions
): CurrencyContext => {
  const currency = asText(invoice.currency) || "INR";
  /*
   * The document's own locale, falling back to the host's business locale exactly as the
   * reference does (`locale = businessLocale` in its invoice destructure). Deliberately NOT
   * falling back to `owner.locale`: that is the business's locale and belongs only to the
   * converted sub-line below. Using it here made the totals group digits Western while the
   * item table, which resolves through formatCurrency, grouped them Indian on the same page.
   */
  const locale =
    asText(pickFirst(invoice.locale, options.businessLocale)) || undefined;
  const subUnitLength =
    typeof invoice.subUnitLength === "number"
      ? invoice.subUnitLength
      : undefined;
  const customCurrencySymbol =
    asText(invoice.customCurrencySymbol) || undefined;

  /*
   * The host's `businessCurrency` lives on CeresTemplatePayload and never reaches the
   * iframe, which fetches the serana document directly. `owner.currency` does arrive —
   * the fetch sets populateBusiness:true, which populates the whole business — so without
   * this fallback the converted amount would silently never render in production. Mirrors
   * lydia's own `business?.currency || owner?.currency`.
   */
  const businessCurrency = asText(
    pickFirst(options.businessCurrency, owner.currency)
  );
  const businessLocale =
    asText(pickFirst(options.businessLocale, owner.locale)) || undefined;
  const rate = toAmount(asRecord(invoice.conversionRates)[businessCurrency]);

  /*
   * Gated on a non-zero rate, exactly as the Conversion Rate row below is. `conversionRates`
   * is optional and un-defaulted (talos/src/helpers/documentCommonFields.js), so without
   * this an INR document owned by a USD business and no rates on the payload printed
   * `US$0.00` under every one of its ~15 rows. The reference can leave the gate off because
   * its sub-line is wrapped in DefaultHidden and never visible; ours is.
   */
  const dual =
    businessCurrency && businessCurrency !== currency && rate
      ? { currency: businessCurrency, locale: businessLocale, rate }
      : null;

  return { currency, locale, subUnitLength, customCurrencySymbol, dual };
};

const buildColumnLabels = (
  columns: unknown,
  isUtgst: boolean
): Record<string, string> =>
  asArray(columns).reduce<Record<string, string>>((acc, entry) => {
    const column = asRecord(entry);
    const key = asText(column.key);
    const label = asText(column.label);
    if (!key || !label) return acc;
    /*
     * A union territory sale reports under UTGST but is carried in the sgst bucket, so the
     * document's own "SGST" column label must not win here. Same override the item-table
     * columns apply in invoiceTemplateNormalization.
     */
    acc[key] = key === "sgst" && isUtgst ? DEFAULT_LABELS.utgst : label;
    return acc;
  }, {});

/*
 * customLabels wins, then the document's own column label (which is where a business's
 * rename of "Discount" to "Rebate" lands), then the English constant.
 */
const resolveLabel = (
  key: string,
  customLabels: UnknownRecord,
  columnLabels: Record<string, string>
): string =>
  asText(customLabels[key]) || columnLabels[key] || DEFAULT_LABELS[key] || key;

interface RowInput {
  key: string;
  label: string;
  amount: number;
  note?: string | null;
  emphasis?: RowEmphasis;
  extraAmount?: number | null;
  isTaxRow?: boolean;
  survivesHideTotals?: boolean;
}

const makeRow = (input: RowInput, ctx: CurrencyContext): SubtotalRow => ({
  key: input.key,
  label: input.label,
  note: input.note ?? null,
  value: money(input.amount, ctx),
  converted: converted(input.amount, ctx),
  extra:
    input.extraAmount === undefined || input.extraAmount === null
      ? null
      : {
          value: money(input.extraAmount, ctx),
          converted: converted(input.extraAmount, ctx),
        },
  emphasis: input.emphasis ?? "normal",
  isTaxRow: input.isTaxRow ?? false,
  survivesHideTotals: input.survivesHideTotals ?? false,
});

/* A row whose value is text rather than money — extra fields, the conversion rate. */
const makeTextRow = (
  key: string,
  label: string,
  value: string
): SubtotalRow => ({
  key,
  label,
  note: null,
  value,
  converted: null,
  extra: null,
  emphasis: "normal",
  isTaxRow: false,
  survivesHideTotals: false,
});

const emptyModel = (): SubtotalModel => ({
  hidden: false,
  hideTaxes: false,
  groups: { main: [], extra: [], due: [] },
  hasExtra: false,
  hasDue: false,
  totalInWords: null,
  hideTotalInWords: false,
  wordsFitCurrency: true,
});

/*
 * A throwing Handlebars helper takes the whole document down, so every failure path here
 * returns an empty model instead. Callers get a totals block with no rows, never a blank page.
 */
export const computeSubtotalRows = (
  payload: unknown,
  options: SubtotalOptions = {}
): SubtotalModel => {
  if (!isRecord(payload)) return emptyModel();

  /*
   * Accept the wrapped `{ invoice, ... }` shape as well as the flat one. A template's root
   * context is whatever its data mapper returns, so the widget cannot assume either.
   */
  const invoice = isRecord(payload.invoice)
    ? (payload.invoice as UnknownRecord)
    : payload;

  const finalTotal = asRecord(invoice.finalTotal);
  const balance = asRecord(invoice.balance);
  const advanceOptions = asRecord(invoice.advanceOptions);
  const customLabels = asRecord(invoice.customLabels);
  const owner = asRecord(invoice.owner);
  const ownerConfiguration = asRecord(
    pickFirst(options.ownerConfiguration, owner.configuration)
  );
  const experimental = asRecord(ownerConfiguration.experimental);
  const items = asArray(invoice.items);
  const cesses = asArray(invoice.cesses);
  const additionalCharges = asArray(invoice.additionalCharges);
  const earlyPayDiscount = asRecord(invoice.earlyPayDiscount);
  const latePaymentFee = asRecord(invoice.latePaymentFee);

  const billType = asText(invoice.billType);
  /* The reference's `isMalaysia`, which picks Code vs HSN on a taxed charge line. */
  const isMalaysia = asText(asRecord(invoice.billedBy).country) === "MY";
  const isExpenditure = asFlag(invoice.isExpenditure);
  /* `utgst` is the document field (balance.js destructures `utgst: enableUtgst`). */
  const isUtgst = asFlag(pickFirst(invoice.utgst, invoice.isUtgst));
  const reverseCharge = asFlag(
    pickFirst(invoice.reverseCharge, advanceOptions.reverseCharge)
  );

  /*
   * Canonical homes first, deprecated advanceOptions copies as fallback. hideCurrencyCode is
   * a business setting rather than a document field, so it reads from the owner's config.
   */
  const hidden = asFlag(
    pickFirst(invoice.hideTotals, advanceOptions.hideTotals)
  );
  const hideTaxes = asFlag(
    pickFirst(invoice.hideTaxes, advanceOptions.hideTaxes)
  );
  const hideCurrencyCode = asFlag(
    pickFirst(experimental.hideCurrencyCode, advanceOptions.hideCurrencyCode)
  );
  const hideTotalInWords = asFlag(invoice.hideTotalInWords);

  const ctx = resolveCurrencyContext(invoice, owner, options);
  const columnLabels = buildColumnLabels(
    pickFirst(options.columns, invoice.columns),
    isUtgst
  );
  const label = (key: string): string =>
    resolveLabel(key, customLabels, columnLabels);

  const itemTotal = items.reduce<number>((sum, entry) => {
    const item = asRecord(entry);
    return asFlag(item.isGroupItemTotalRow) ? sum : sum + toAmount(item.total);
  }, 0);

  /* Additional charges are the one group that survives hideTotals. */
  const chargeRows = additionalCharges.map((charge) => {
    const record = asRecord(charge);
    return makeRow(
      {
        key: `charge:${asText(record._id) || asText(record.label)}`,
        label: asText(pickFirst(record.label, record.name)),
        amount: getAdditionalChargeAmount(record, itemTotal),
        survivesHideTotals: true,
      },
      ctx
    );
  });

  /*
   * No early return for hideTotals. The reference drops the rows outright, but ceres has to
   * keep them in the DOM for the host's live toggle to work, so the whole model is always
   * built and `hidden` only drives initial visibility.
   */

  const taxSummaryView = asText(advanceOptions.taxSummaryView);
  const aggView =
    taxSummaryView === "BOTH" || taxSummaryView === "INVOICE_SUMMARY";
  const taxName = asText(invoice.taxName) || "GST";

  /*
   * `hideTaxes` is deliberately NOT passed here. It is a display setting the host toggles
   * live, so the tax rows must exist in the DOM and be hidden by CSS — see SubtotalRow.
   * The export-without-payment suppression IS applied, because that is a property of the
   * document rather than a user toggle.
   */
  const taxVisibility = resolveDocumentTaxVisibility(invoice, {
    applySuppressions: true,
  });

  const main: SubtotalRow[] = [];

  /* 1. Additional charges that carry their own tax arrive as line items, not as charges. */
  items.forEach((entry) => {
    const item = asRecord(entry);
    if (!asFlag(item.isAdditionalCharge)) return;
    /*
     * Malaysia classifies with its own code rather than an HSN, and the reference picks by
     * the *seller's* country, not by which field happens to be filled:
     * `isMalaysia = billedBy?.country === 'MY'`, then
     * `({isMalaysia ? 'Code' : 'HSN'} {isMalaysia ? item.classification : item.hsn})`
     * (balance.js:63,196-199). Preferring `classification` whenever it is present printed
     * `Code <value>` on an Indian charge line that carried both fields.
     */
    const codeValue = isMalaysia
      ? asText(item.classification)
      : asText(item.hsn);
    const codeLabel = codeValue
      ? `${isMalaysia ? "Code" : "HSN"} ${codeValue}`
      : "";
    const rate = toAmount(item.gstRate);
    main.push(
      makeRow(
        {
          key: `taxedCharge:${asText(item._id) || asText(item.name)}`,
          label: asText(item.name),
          note: [`${taxName} ${rate}%`, codeLabel].filter(Boolean).join(" "),
          amount: toAmount(item.rate),
          extraAmount: toAmount(item.igst),
        },
        ctx
      )
    );
  });

  /* 2-4. The Sub Total block only appears when something reduced it. */
  const discount = toAmount(
    pickFirst(finalTotal.discount, finalTotal.totalDiscount)
  );
  const earlyPayApplied = asFlag(earlyPayDiscount.applied);
  if (discount || earlyPayApplied) {
    main.push(
      makeRow(
        {
          key: "subTotal",
          label: label("subTotal"),
          amount: toAmount(finalTotal.subTotal),
        },
        ctx
      )
    );
    if (discount) {
      const pct = toAmount(finalTotal.discountPercentage);
      main.push(
        makeRow(
          {
            key: "discount",
            label: pct ? `${label("discount")}(${pct}%)` : label("discount"),
            amount: discount,
          },
          ctx
        )
      );
    }
    if (earlyPayApplied) {
      main.push(
        makeRow(
          {
            key: "earlyPayDiscount",
            label: label("earlyPayDiscount"),
            amount: toAmount(finalTotal.earlyDiscount),
          },
          ctx
        )
      );
    }
  }

  const amountRow = (key: string): SubtotalRow =>
    makeRow(
      { key, label: label("amount"), amount: toAmount(finalTotal.amount) },
      ctx
    );

  /*
   * The three tax words are decided in widgets/shared/taxRowLabels, which the summary
   * tables also use, so a document can never be told its tax is IGST in one place and PPN
   * in another. `columns` is passed resolved, because a host may override the document's.
   */
  const taxLabelSources = {
    customLabels,
    columns: pickFirst(options.columns, invoice.columns),
    taxName,
    isUtgst,
  };
  const cgstLabel = (): string => resolveTaxLabel("cgst", taxLabelSources);
  const sgstLabel = (): string => resolveTaxLabel("sgst", taxLabelSources);
  const igstLabel = (): string => resolveTaxLabel("igst", taxLabelSources);

  /* 5-9. Flat tax rows: the taxable Amount, the tax family, then any applied cess. */
  if (taxVisibility.isTaxDocument && !aggView) {
    main.push(amountRow("amount"));
    if (taxVisibility.showCgstSgst) {
      main.push(
        makeRow(
          {
            key: "cgst",
            label: cgstLabel(),
            amount: toAmount(finalTotal.cgst),
            isTaxRow: true,
          },
          ctx
        )
      );
      main.push(
        makeRow(
          {
            key: "sgst",
            label: sgstLabel(),
            amount: toAmount(finalTotal.sgst),
            isTaxRow: true,
          },
          ctx
        )
      );
    }
    if (taxVisibility.showIgst) {
      main.push(
        makeRow(
          {
            key: "igst",
            label: igstLabel(),
            amount: toAmount(finalTotal.igst),
            isTaxRow: true,
          },
          ctx
        )
      );
    }
    /*
     * Cess rows are not `isTaxRow`, so `hideTaxes` leaves them alone. In the reference both
     * cess blocks sit *outside* the `!hideTaxes` fragment — the flat one at
     * lydia/src/components/widgets/invoice/balance.js:419 against the fragment that closes
     * at 415, the per-rate one at 651 against the fragment closing at 647. Only the CGST,
     * SGST and IGST rows are inside it. `hideTotals` still hides them, matching balance.js:241,
     * which drops everything but the additional-charges table.
     */
    const cessTotal = asRecord(finalTotal.cessTotal);
    cesses.forEach((entry) => {
      const cess = asRecord(entry);
      if (!asFlag(cess.isApplied)) return;
      main.push(
        makeRow(
          {
            key: `cess:${asText(cess.cessKey)}`,
            label: asText(pickFirst(cess.cessName, cess.name)),
            amount: toAmount(cessTotal[asText(cess.cessAmountKey)]),
            isTaxRow: false,
          },
          ctx
        )
      );
    });
  }

  /* 10-14. Per-rate breakup, when the business asked for the summary view. */
  if (taxVisibility.isTaxDocument && aggView) {
    main.push(amountRow("amount"));
    const summary = computeTaxSummary(
      items.map((entry) => asRecord(entry)),
      { isIgst: taxVisibility.showIgst, isUtgst }
    );
    const rows = summary.taxList;

    if (taxVisibility.showCgstSgst) {
      /*
       * The rate printed on a split row is half the item's GST rate — an 18% item shows
       * "CGST (9%)" and "SGST (9%)". computeTaxSummary already halves it onto
       * `cgstRate`/`sgstRate`; `gstRate` is the undivided rate and only groups the rows.
       * refrens.com does the same halving inside getAggregateTaxTotals
       * (lydia/src/helpers/taxAggregateSummary.js).
       */
      if (rows.length) {
        rows.forEach((row) =>
          main.push(
            makeRow(
              {
                key: `cgst:${row.gstRate}`,
                label: `${cgstLabel()} (${row.cgstRate}%)`,
                amount: row.cgstAmount,
                isTaxRow: true,
              },
              ctx
            )
          )
        );
        rows.forEach((row) =>
          main.push(
            makeRow(
              {
                key: `sgst:${row.gstRate}`,
                label: `${sgstLabel()} (${row.sgstRate}%)`,
                amount: row.sgstAmount,
                isTaxRow: true,
              },
              ctx
            )
          )
        );
      } else {
        main.push(
          makeRow(
            {
              key: "cgst",
              label: cgstLabel(),
              amount: toAmount(finalTotal.cgst),
              isTaxRow: true,
            },
            ctx
          )
        );
        main.push(
          makeRow(
            {
              key: "sgst",
              label: sgstLabel(),
              amount: toAmount(finalTotal.sgst),
              isTaxRow: true,
            },
            ctx
          )
        );
      }
    }

    if (taxVisibility.showIgst) {
      if (rows.length) {
        rows.forEach((row) =>
          main.push(
            makeRow(
              {
                key: `igst:${row.gstRate}`,
                label: `${igstLabel()} (${row.igstRate}%)`,
                amount: row.igstAmount,
                isTaxRow: true,
              },
              ctx
            )
          )
        );
      } else {
        main.push(
          makeRow(
            {
              key: "igst",
              label: igstLabel(),
              amount: toAmount(finalTotal.igst),
              isTaxRow: true,
            },
            ctx
          )
        );
      }
    }

    /*
     * One row per distinct cess rate, which is what `cessBreakupTotal` does
     * (lydia/src/helpers/taxAggregateSummary.js): the rate lives on the item as
     * `item.custom[cess.cessKey]` and the amount as `item.custom[cess.cessAmountKey]`.
     *
     * There is no `cess.rate`. The `cesses` subdocument is exactly
     * `{ cessName, cessType, cessKey, cessAmountKey, isApplied, isNewCess }`
     * (talos/src/invoices.js:553), so reading one gave a permanently-0 rate, a bare label,
     * and an aggregate row that was a duplicate of the flat row above it.
     *
     * When no item carries the cess — a document whose cess sits only on the total — the
     * combined figure off `finalTotal.cessTotal` still renders, unlabelled by rate.
     *
     * As in the flat block above, these rows are not `isTaxRow`: the reference's per-rate
     * cess block (balance.js:651) sits outside the `!hideTaxes` fragment that closes at 647.
     */
    const cessTotal = asRecord(finalTotal.cessTotal);
    cesses.forEach((entry) => {
      const cess = asRecord(entry);
      if (!asFlag(cess.isApplied)) return;
      const cessKey = asText(cess.cessKey);
      const amountKey = asText(cess.cessAmountKey);
      const cessName = asText(pickFirst(cess.cessName, cess.name));

      const byRate = new Map<number, number>();
      items.forEach((itemEntry) => {
        const custom = asRecord(asRecord(itemEntry).custom);
        const itemAmount = toAmount(custom[amountKey]);
        if (!itemAmount) return;
        const itemRate = toAmount(custom[cessKey]);
        byRate.set(itemRate, (byRate.get(itemRate) ?? 0) + itemAmount);
      });

      if (byRate.size === 0) {
        const amount = toAmount(cessTotal[amountKey]);
        if (amount <= 0) return;
        main.push(
          makeRow(
            {
              key: `cessRate:${cessKey}`,
              label: cessName,
              amount,
              isTaxRow: false,
            },
            ctx
          )
        );
        return;
      }

      byRate.forEach((amount, itemRate) => {
        main.push(
          makeRow(
            {
              key: itemRate
                ? `cessRate:${cessKey}:${itemRate}`
                : `cessRate:${cessKey}`,
              label: itemRate ? `${cessName} (${itemRate}%)` : cessName,
              amount,
              isTaxRow: false,
            },
            ctx
          )
        );
      });
    });
  }

  /*
   * 15. A non-tax document renders no tax rows, so when its additional charges move the
   * Total nothing states the base they applied to. Gated on the charges' net value, rounded
   * to the document's own precision first, so two percentage charges cancelling out cannot
   * pass for a real difference.
   */
  const netAdditionalCharges = roundTo(
    getAdditionalChargesTotal(additionalCharges, itemTotal),
    ctx.subUnitLength ?? ASSUMED_CURRENCY_DECIMALS
  );
  if (!taxVisibility.isTaxDocument && netAdditionalCharges !== 0) {
    main.push(amountRow("amount"));
  }

  /* 16-17. */
  main.push(...chargeRows);
  if (asFlag(latePaymentFee.enabled) && asFlag(latePaymentFee.isApplied)) {
    main.push(
      makeRow(
        {
          key: "latePaymentFee",
          label: label("latePaymentFee"),
          amount: toAmount(latePaymentFee.finalAmount),
        },
        ctx
      )
    );
  }

  /* 19. The Total always renders, with the currency code unless the business hid it. */
  const totalLabel = label("total");
  main.push(
    makeRow(
      {
        key: "total",
        label: hideCurrencyCode
          ? totalLabel
          : `${totalLabel} (${ctx.currency})`,
        amount: toAmount(finalTotal.total),
        emphasis: "grand",
      },
      ctx
    )
  );

  /* 20. */
  if (ctx.dual && ctx.dual.rate) {
    main.push(
      makeTextRow(
        "conversionRate",
        label("conversionRate"),
        `${money(1, ctx)} = ${formatIn(
          ctx.dual.rate,
          ctx.dual.currency,
          ctx.dual.locale,
          ctx.subUnitLength
        )}`
      )
    );
  }

  /* 21-25. Extra fields and the credit-note credit rows. */
  const extra: SubtotalRow[] = [];
  asArray(invoice.extraTotalFields).forEach((entry) => {
    const field = asRecord(entry);
    const value = asText(field.value);
    if (!value) return;
    /* Rendered as given, not currency-formatted — matches the reference. */
    extra.push(
      makeTextRow(
        `extra:${asText(pickFirst(field._id, field.key, field.label))}`,
        asText(field.label),
        value
      )
    );
  });

  const isCreditNote = billType === "CREDITNOTE";
  const credit = toAmount(balance.credit);
  const due = toAmount(balance.due);
  const refund = toAmount(balance.refund);
  /* A credit note's payments table defaults on; only an explicit false turns it off. */
  const showRefundRow =
    isCreditNote && !!refund && advanceOptions.showPaymentsTable !== false;

  if (!isCreditNote && billType !== "DEBITNOTE" && credit) {
    extra.push(
      makeRow(
        {
          key: "creditApplied",
          label: label("creditApplied"),
          amount: -credit,
        },
        ctx
      )
    );
  }
  if (isCreditNote) {
    if (credit) {
      extra.push(
        makeRow(
          { key: "creditUsed", label: label("creditUsed"), amount: -credit },
          ctx
        )
      );
    }
    if (showRefundRow) {
      extra.push(
        makeRow({ key: "refund", label: label("refund"), amount: -refund }, ctx)
      );
    }
    if (due) {
      extra.push(
        makeRow(
          {
            key: "availableCredits",
            label: label("availableCredits"),
            amount: due,
          },
          ctx
        )
      );
    }
  }

  /* 26-33. What has been paid, and what is still owed. */
  const dueRows: SubtotalRow[] = [];
  const rcmTax = toAmount(finalTotal.rcmTax);
  const rcmSummaryView = asFlag(advanceOptions.rcmSummaryView);
  const showSalesRcmSummary =
    reverseCharge &&
    !isExpenditure &&
    rcmSummaryView &&
    !!rcmTax &&
    !isCreditNote;
  const paid = toAmount(balance.paid);
  const transactionCharge = toAmount(balance.transactionCharge);
  const tds = toAmount(balance.tds);
  const settledAmount = toAmount(balance.settledAmount);

  if (!isCreditNote && (paid || showSalesRcmSummary)) {
    if (showSalesRcmSummary) {
      dueRows.push(
        makeRow(
          { key: "rcmSales", label: label("taxUnderRCM"), amount: rcmTax },
          ctx
        )
      );
    }
    if (tds) {
      dueRows.push(
        makeRow(
          { key: "tds", label: label("tdsAmountWithheld"), amount: -tds },
          ctx
        )
      );
    }
    if (paid) {
      dueRows.push(
        makeRow(
          {
            key: "amountPaid",
            label: label("amountPaid"),
            amount: -(paid + transactionCharge),
          },
          ctx
        )
      );
    }
    const expenditureRcm =
      toAmount(finalTotal.igst) ||
      toAmount(finalTotal.cgst) + toAmount(finalTotal.sgst);
    if (reverseCharge && isExpenditure && rcmSummaryView && expenditureRcm) {
      dueRows.push(
        makeRow(
          {
            key: "rcmExpenditure",
            label: label("taxUnderRCM"),
            amount: expenditureRcm,
          },
          ctx
        )
      );
    }
    if (transactionCharge) {
      dueRows.push(
        makeRow(
          {
            key: "amountReceived",
            label: label("amountReceived"),
            amount: paid,
          },
          ctx
        )
      );
      dueRows.push(
        makeRow(
          {
            key: "transactionCharge",
            label: label("transactionCharge"),
            amount: transactionCharge,
          },
          ctx
        )
      );
    }
    if (settledAmount) {
      dueRows.push(
        makeRow(
          {
            key: "settledAmount",
            label: label("settledAmount"),
            amount: settledAmount,
          },
          ctx
        )
      );
    }
    if (due) {
      dueRows.push(
        makeRow(
          {
            key: "dueAmount",
            label: label("dueAmount"),
            amount: due,
            emphasis: "due",
          },
          ctx
        )
      );
    }
  }

  /*
   * Words cannot express more decimal places than the currency has, which is why the
   * reference suppresses the line when the document's sub-unit length exceeds them. That is
   * a fact about the currency, kept separate from the two host-toggled settings so each can
   * be flipped without un-hiding what the others hide.
   */
  const wordsValue = asText(customLabels.totalInWordsValue);
  const wordsFitCurrency =
    !ctx.subUnitLength || ASSUMED_CURRENCY_DECIMALS >= ctx.subUnitLength;

  return {
    hidden,
    hideTaxes,
    groups: { main, extra, due: dueRows },
    hasExtra: extra.length > 0,
    hasDue: dueRows.length > 0,
    totalInWords: wordsValue
      ? { label: label("totalInWords"), value: wordsValue }
      : null,
    hideTotalInWords,
    wordsFitCurrency,
  };
};

export default computeSubtotalRows;
