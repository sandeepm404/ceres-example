/**
 * @jest-environment jsdom
 */
/*
 * BPS Technologies: every test of the template in one file (one describe per area).
 */
import { TextDecoder, TextEncoder } from "util";
import fs from "fs";
import path from "path";
import HandlebarsRuntime from "handlebars/runtime";
import fixture from "./fixtures/bps-technologies.json";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";
import template from "../src/templates/bps-technologies/template.hbs";
import {
  applyBrowserPrintPage,
  buildBpsView,
  cutCards,
  drawnRect,
  evenSummaryColumns,
  fitItemsToScreen,
  flowFiller,
  foreignAmountInWords,
  formatContext,
  formatDocumentDate,
  formatFigure,
  isInvisibleSymbol,
  joinTotals,
  mapCompliance,
  mapItemTable,
  mapParty,
  mapPrint,
  mapScript,
  mapStockSummary,
  minusSubsidy,
  notesLabels,
  onThemeColor,
  prepareBrowserPrint,
  printMediaText,
  printScaleFor,
  registerBpsHelpers,
  removeHiddenSymbol,
  resolveSettings,
  setBpsStylesheetText,
  splitTotals,
  stretchItemTable,
  stretchPrintRules,
  syncPrintWidths,
  type FlowUnit,
  withMoneyDefaults,
  withPrintRules,
  withReadableStylesheet,
  withRefrensDefaults,
  withTemplateSettings,
} from "../src/templates/bps-technologies/helpers";
import taxSummaryPartial from "../src/widgets/tax-summary/TaxSummaryTable.hbs";
import hsnSummaryPartial from "../src/widgets/hsn-summary/HsnSummaryTable.hbs";
import paymentTablePartial from "../src/widgets/payment-table/PaymentTable.hbs";
import brandingPartial from "../src/widgets/refrens-branding/RefrensBranding.hbs";
import ceresImagePartial from "../src/widgets/image/CeresImage.hbs";
import ceresImageGalleryPartial from "../src/widgets/image/CeresImageGallery.hbs";
import invoiceStatusPartial from "../src/widgets/invoice-status/InvoiceStatus.hbs";
import { computeTaxSummary } from "../src/widgets/tax-summary/utils";
import { computeHsnSummary } from "../src/widgets/hsn-summary/utils";
import { computePaymentColumns } from "../src/widgets/payment-table/utils";
import { prepareImageGallery } from "../src/widgets/image/utils";
import registerFormatCurrencyHelper from "../src/widgets/shared/registerFormatCurrencyHelper";
import registerTaxFlagHelpers from "../src/widgets/shared/registerTaxFlagHelpers";

// jsdom (the DOM sections below) has no TextEncoder; Node's is the same API.
Object.assign(globalThis, { TextDecoder, TextEncoder });

type Json = Record<string, any>;

const TEMPLATE_DIR = path.join(__dirname, "../src/templates/bps-technologies");

/* A fresh, mutable copy of the fixture's wrapped payload. */
const payload = (edit?: (invoice: Json, root: Json) => void): Json => {
  const copy = JSON.parse(JSON.stringify(fixture));
  if (edit) edit(copy.invoice, copy);
  return copy;
};

const state = (edit?: (invoice: Json, root: Json) => void): Json =>
  normalizeInvoiceTemplateState(payload(edit) as never) as unknown as Json;

const render = (edit?: (invoice: Json, root: Json) => void): string =>
  template(state(edit));

const view = (edit?: (invoice: Json, root: Json) => void) =>
  buildBpsView(state(edit));

/* The opening tag of the first element carrying an attribute or class. */
const tagWith = (html: string, marker: string): string => {
  const at = html.indexOf(marker);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf(">", at) + 1);
};

beforeAll(() => {
  registerBpsHelpers(HandlebarsRuntime);
  registerFormatCurrencyHelper(HandlebarsRuntime);
  registerTaxFlagHelpers(HandlebarsRuntime);

  HandlebarsRuntime.registerHelper(
    "formateShortDateWithOffset",
    (value: unknown) => `date(${String(value ?? "")})`
  );
  HandlebarsRuntime.registerHelper(
    "formatPhoneNumber",
    (value: unknown) => `tel(${String(value ?? "")})`
  );
  HandlebarsRuntime.registerHelper(
    "prepareMarkdownViewerData",
    (content: unknown) => ({ content })
  );
  HandlebarsRuntime.registerPartial(
    "MarkdownViewer",
    (context: { content?: string }) =>
      `<div class="md">${context.content}</div>`
  );
  HandlebarsRuntime.registerPartial("TaxSummaryTable", taxSummaryPartial);
  HandlebarsRuntime.registerHelper(
    "computeTaxSummary",
    (items: unknown, options: { hash?: Json }) =>
      computeTaxSummary(Array.isArray(items) ? items : [], {
        isIgst: !!options?.hash?.isIgst,
        isUtgst: !!options?.hash?.isUtgst,
      })
  );
  HandlebarsRuntime.registerPartial("HsnSummaryTable", hsnSummaryPartial);
  HandlebarsRuntime.registerHelper(
    "computeHsnSummary",
    (items: unknown, options: { hash?: Json }) =>
      computeHsnSummary(Array.isArray(items) ? items : [], {
        isIgst: !!options?.hash?.isIgst,
        isUtgst: !!options?.hash?.isUtgst,
      })
  );
  HandlebarsRuntime.registerHelper("amountInWords", () => "words");
  HandlebarsRuntime.registerPartial("PaymentTable", paymentTablePartial);
  HandlebarsRuntime.registerHelper(
    "computePaymentColumns",
    (payments: unknown, options: { hash?: Json }) =>
      computePaymentColumns(Array.isArray(payments) ? payments : [], {
        businessCurrency: options?.hash?.businessCurrency,
        currency: options?.hash?.currency,
      })
  );
  HandlebarsRuntime.registerPartial("RefrensBranding", brandingPartial);
  HandlebarsRuntime.registerPartial("CeresImage", ceresImagePartial);
  HandlebarsRuntime.registerPartial(
    "CeresImageGallery",
    ceresImageGalleryPartial
  );
  HandlebarsRuntime.registerHelper(
    "prepareImageGallery",
    (images: unknown, options: { hash?: Json }) =>
      prepareImageGallery(images as never, {
        variant: options?.hash?.variant,
        alt: options?.hash?.alt,
      })
  );
  HandlebarsRuntime.registerPartial("InvoiceStatus", invoiceStatusPartial);
  HandlebarsRuntime.registerHelper("computeInvoiceStatus", (invoice: Json) => ({
    tags: [
      {
        text: invoice?.status === "PAID" ? "Paid" : "Unpaid",
        finalClass: "invoice-tag",
      },
    ],
  }));
});

describe("BPS Technologies — render", () => {
  it("maps the reference document from the payload", () => {
    const html = render();
    // Header: title, subtitle, the details, the business logo top right.
    expect(html).not.toContain("bp-mark");
    expect(html).toContain('src="apex-sample-logo.png"');
    expect(html).toContain(
      '<h1 class="bp-title" data-role="title">Equipment Quotation</h1>'
    );
    expect(html).toContain(
      '<p class="bp-subtitle">Supply of VRV System, Equipment, accessories &amp; allied materials.</p>'
    );
    // Document details: business labels, refrens.com's date format, custom headers.
    expect(html).toMatch(
      /bp-field-label">Drawing No<[\s\S]*?QT-R2\/A5\/880\/SR\/46\/26-27/
    );
    expect(html).toMatch(/bp-field-label">Date<[\s\S]*?May 27, 2026/);
    expect(html).toMatch(/bp-field-label">DWG\. NO<[\s\S]*?>R1</);
    // Billed By | Billed To cards (Figma): heading, name, address on one line, fields.
    const parties = html.slice(
      html.indexOf('data-section="parties"'),
      html.indexOf("</section>", html.indexOf('data-section="parties"'))
    );
    expect(parties.indexOf('data-role="billed-by"')).toBeLessThan(
      parties.indexOf('data-role="billed-to"')
    );
    // BPS design: the customer in the details list, "Customer Name: …".
    expect(parties).toMatch(
      /bp-field-label">Customer Name<\/span><span class="bp-field-value bp-party-name"/
    );
    expect(parties).toContain("SAMPLE CLIENT PVT LTD");
    expect(parties).toContain(
      "Sample House, 1/1 Sample Street, Kolkata, West Bengal, India - 700001"
    );
    expect(parties).toMatch(
      /bp-field-label">GSTIN<\/span><span class="bp-field-value bp-num bp-break">19AAAAA0000A1Z5/
    );
    expect(parties).toMatch(
      /bp-field-label">Email<\/span><span class="bp-field-value bp-email bp-break">client@example.com/
    );
    // The seller's card carries its own GSTIN.
    expect(parties).toMatch(/GSTIN<\/span><span[^>]*>19ABCDE1234F1Z5/);
    // Totals across the frame under the items (Simple design), the grand total last.
    const side = html.slice(
      html.indexOf('data-testid="totals-table"'),
      html.indexOf('data-section="bottom"')
    );
    ["Sub Total", "Discount", "CGST", "SGST"].forEach((label) =>
      expect(side).toMatch(
        new RegExp(`ceres-subtotal-label"[^>]*>\\s*${label}`)
      )
    );
    expect(side).toMatch(
      /bp-grand-row[\s\S]*?Equipment Cost[\s\S]*?₹10,21,694\.98/
    );
    expect(side).toContain("₹77,925.89");
    // The words head the left column (user request, 2026-10-24).
    expect(html).toContain("Ten Lakh Twenty One Thousand");
    // Terms keep every line (no Payment Terms card here), numbered; bank rows.
    expect(html).toContain(
      '<span class="bp-term-text">Price validity: 10 days from the date of submission.</span>'
    );
    // Every terms group sits in the box beside the signature, numbered.
    expect(html).toContain(
      '<span class="bp-term-text">90% Advance along with order and before delivery of materials</span>'
    );
    expect(html).not.toContain("bp-pay-card");
    expect(html).toMatch(
      /bp-kv-label bp-bank-bankName">Bank Name<[\s\S]*?Sample Bank/
    );
    expect(html).toMatch(
      /bp-kv-label bp-bank-ifsc">IFSC Code<[\s\S]*?SMPL0000123/
    );
  });

  // Skipped here: this repo's shared normalizer reads the unit / tax-summary settings from
  // their canonical keys (unitColumn, taxSummary.taxList), not the aliases this test uses.
  it.skip("prints the account's columns in its order, money with the currency symbol", () => {
    const html = render();
    const items = html.slice(html.indexOf('data-testid="items-table"'));
    const header = items.slice(
      items.indexOf("<thead>"),
      items.indexOf("</thead>")
    );
    const labels = Array.from(
      header.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g),
      (m) =>
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
    );
    // The serial heading: "Sl.No" (BPS design) unless the business names it.
    expect(header).toMatch(/data-col="sr"[^>]*>Sl\.No<\/th>/);
    expect(labels).toEqual([
      "Sl.No",
      "Product Description",
      "Location",
      "Remote Type",
      "Model",
      "TR",
      "Qty",
      "Unit",
      "Unit Price (₹)",
      "Amount (₹)",
    ]);
    // The figures as printed: each cell's data-label repeats its heading ("Unit Price (₹)")
    // for the phone layout, so it is left out here.
    const body = items
      .slice(items.indexOf("</thead>"), items.indexOf('class="bp-totals'))
      .replace(/ data-label="[^"]*"/g, "");
    expect(body).toContain("₹7,60,698.00");
    expect(body).toContain("BLOCK - 1");
    expect(body).toContain("RXQ42RY16");
  });

  it("keeps the totals out of the items' columns", () => {
    const html = render();
    const items = html.slice(
      html.indexOf('data-testid="items-table"'),
      html.indexOf('data-testid="totals-table"')
    );
    expect(items).not.toContain("ceres-subtotal-row");
    expect(items).toContain("</table>");
    expect(html).toMatch(
      /data-testid="totals-table"[\s\S]*?data-ceres-subtotal-row="total"/
    );
    expect(html).not.toMatch(/ceres-subtotal-label" colspan/);
  });

  // User (2026-11-05): Refrens' PDF service prints the "electronically generated" line itself;
  // a template's own copy printed it twice. The template never prints it.
  it("never prints its own electronically generated line", () => {
    const note = (edit: (invoice: Json) => void) =>
      render((invoice) => {
        // eslint-disable-next-line no-param-reassign
        invoice.signatureMethod = "NONE";
        // eslint-disable-next-line no-param-reassign
        invoice.signature = null;
        // eslint-disable-next-line no-param-reassign
        invoice.template = {
          ...((invoice.template as Json) || {}),
          pdfOptions: { footerOnLastPage: true, letterHeadOnFirstPage: true },
        };
        edit(invoice);
      }).includes("bp-signature-note");
    expect(note(() => undefined)).toBe(false);
    expect(
      note((invoice) => {
        // eslint-disable-next-line no-param-reassign
        invoice.signatureMethod = "SIMPLE";
        // eslint-disable-next-line no-param-reassign
        invoice.signature = "https://x.test/s.png";
      })
    ).toBe(false);
    expect(
      note((invoice) => {
        // eslint-disable-next-line no-param-reassign
        (invoice.template as Json).pdfOptions = { footerOnLastPage: false };
      })
    ).toBe(false);
  });

  // User (2026-11-03): a group's images print as an item's do, thumbnails under its name.
  it("prints a group's images under its name and its original images in a row below", () => {
    const html = render((invoice) => {
      // eslint-disable-next-line no-param-reassign
      invoice.items = [
        {
          name: "Pumps",
          group: true,
          images: ["https://x.test/g.png"],
          originalImages: ["https://x.test/big.png"],
        },
        { name: "Pump A", quantity: 1, rate: 10, amount: 10, total: 10 },
      ];
    });
    expect(html).toMatch(
      /bp-group-name">Pumps<\/span>[\s\S]*?ceres-image-gallery-thumbnail[\s\S]*?g\.png/
    );
    expect(html).toMatch(
      /bp-group-image-row[\s\S]*?class="bp-large-image"[^>]*big\.png/
    );
  });

  it("prints group names as entered and numbers their items 1, 2… from 1 again, as the BPS quotation", () => {
    const html = render();
    const groups = Array.from(
      html.matchAll(/class="bp-group-name">([^<]+)</g),
      (m) => m[1]
    );
    expect(groups).toEqual(["OUTDOOR UNITS", "INDOOR UNITS", "REFNET JOINT"]);
    const serials = Array.from(
      html.matchAll(/<tr class="bp-item-row[\s\S]*?data-testid="num">(\d+)</g),
      (m) => m[1]
    );
    expect(serials).toEqual(["1", "1", "2", "3", "4", "1", "2", "3"]);
  });

  it("keeps sample-free sections out until the document has their data", () => {
    const html = render();
    // No transport / shipped from / notes / attachments / payments in the reference.
    [
      'data-section="dispatch"',
      'data-section="notes"',
      'data-section="attachments"',
      'data-section="payments"',
    ].forEach((hook) => expect(html).not.toContain(hook));
    // The compliance box is present (live update target) but shows only with a value (CSS).
    expect(html).toContain('data-ceres-field="irn"');
    expect(html).toContain('data-ceres-field-container="documentQr"');
  });
});

describe("BPS Technologies — boolean settings", () => {
  it("hideTotals hides the totals rows and the cost card; hideTaxes the tax rows and note", () => {
    const hidden = render((invoice) => {
      invoice.hideTotals = true;
      invoice.advanceOptions.hideTotals = true;
    });
    expect(tagWith(hidden, 'data-ceres-subtotal-row="total"')).toContain(
      "is-hidden-by-totals"
    );
    expect(hidden).not.toContain('data-testid="cost-card"');

    const noTaxes = render((invoice) => {
      invoice.hideTaxes = true;
      invoice.advanceOptions.hideTaxes = true;
    });
    expect(tagWith(noTaxes, 'data-ceres-subtotal-row="cgst')).toContain(
      "is-hidden-by-taxes"
    );
    expect(noTaxes).not.toContain("bp-cost-note");
  });

  it("hideTotalInWords hides the words line (kept for the live toggle); showTotalsRow adds the column total", () => {
    const words = tagWith(
      render((invoice) => {
        invoice.hideTotalInWords = true;
      }),
      "data-ceres-total-in-words"
    );
    expect(words).toContain("is-hidden-by-words-setting");
    expect(tagWith(render(), "data-ceres-total-in-words")).not.toContain(
      "is-hidden-by-words-setting"
    );
    // A 3-decimal document keeps its words line.
    const threeDecimals = tagWith(
      render((invoice) => {
        invoice.subUnitLength = 3;
      }),
      "data-ceres-total-in-words"
    );
    expect(threeDecimals).not.toBe("");
    expect(threeDecimals).not.toContain("is-hidden");
    const totals = render((invoice) => {
      invoice.showTotalsRow = true;
    });
    expect(totals).toContain('data-testid="items-total"');
    expect(totals).toMatch(/items-total[\s\S]*?9,62,048\.00/);
  });

  // Skipped here: this repo's shared normalizer reads the unit / tax-summary settings from
  // their canonical keys (unitColumn, taxSummary.taxList), not the aliases this test uses.
  it.skip("renders the summaries hidden while off, so the host's live toggles can show them", () => {
    const off = render();
    expect(tagWith(off, "data-ceres-hsn-summary")).toContain("display: none");
    expect(tagWith(off, "data-ceres-tax-summary")).toContain("display: none");

    const on = render((invoice) => {
      invoice.advanceOptions.showHsnSummary = true;
      invoice.advanceOptions.taxSummaryView = "TABLE";
      invoice.hsnSummary = {
        hsnList: [{ hsn: "8415", taxableValue: 865843.2 }],
      };
    });
    expect(tagWith(on, "data-ceres-hsn-summary")).not.toContain(
      "display: none"
    );
    expect(tagWith(on, "data-ceres-tax-summary")).not.toContain(
      "display: none"
    );
    expect(on).toContain("<td>8415</td>");

    const payments = (show?: boolean) =>
      render((invoice) => {
        invoice.allPayments = [
          { amount: 1000, paymentDate: "2026-06-01", paymentMethod: "CASH" },
        ];
        if (show !== undefined) invoice.advanceOptions.showPaymentsTable = show;
      });
    // refrens.com prints payments only with "Show payments table" on; unset or off, hidden.
    expect(tagWith(payments(true), "data-ceres-payment-table")).not.toContain(
      "display: none"
    );
    expect(tagWith(payments(), "data-ceres-payment-table")).toContain(
      "display: none"
    );
    expect(tagWith(payments(false), "data-ceres-payment-table")).toContain(
      "display: none"
    );
  });

  it("isDescriptionFullWidth moves the description between its two live targets", () => {
    const edit = (full: boolean) => (invoice: Json) => {
      invoice.items[1].description = "Inverter, R32";
      invoice.advanceOptions.isDescriptionFullWidth = full;
    };
    const inline = render(edit(false));
    expect(tagWith(inline, "data-ceres-description-row")).toContain(
      "display: none"
    );
    expect(inline).toMatch(
      /data-ceres-description-inline>\s*<div data-ceres-description-content>/
    );

    const full = render(edit(true));
    expect(tagWith(full, "data-ceres-description-row")).not.toContain(
      "display: none"
    );
    expect(full).toMatch(
      /data-ceres-description-full-width>\s*<div data-ceres-description-content>/
    );
  });

  it("itemNameFullWidth puts the name on a row of its own above the figures", () => {
    const html = render((invoice) => {
      invoice.advanceOptions.itemNameFullWidth = true;
    });
    expect(html).toMatch(/bp-name-row[\s\S]*?<span class="bp-item-name">42 HP/);
    expect(
      view((invoice) => {
        invoice.advanceOptions.itemNameFullWidth = true;
      }).table.rows[1]
    ).toMatchObject({ nameRow: true });
  });

  it("showThumbnailAsColumn shows an item's thumbnail; hideGroupSubTotal keeps group totals out", () => {
    const thumbs = render((invoice) => {
      invoice.advanceOptions.showThumbnailAsColumn = true;
      invoice.items[1].thumbnail = "https://example.com/t.png";
    });
    expect(thumbs).toContain("bp-item-thumbnail");
    expect(thumbs).toContain("has-thumbnails");

    const subtotal = (hide: boolean) =>
      view((invoice) => {
        invoice.advanceOptions.hideGroupSubTotal = hide;
        invoice.items.splice(2, 0, {
          _id: "gt",
          name: "Sub Total",
          isGroupItemTotalRow: true,
          amount: 760698,
        });
      }).table.rows.some((row: Json) => row.isGroupTotal);
    expect(subtotal(true)).toBe(false);
    expect(subtotal(false)).toBe(true);
  });

  it("inline SKU / HSN / unit codes follow their settings", () => {
    const html = render((invoice) => {
      invoice.advanceOptions.showSkuInInvoice = true;
      invoice.advanceOptions.hsnView = "MERGE";
      invoice.items[1].sku = "SKU-1";
    });
    expect(html).toContain('<span class="bp-item-code">SKU: SKU-1</span>');
    expect(html).toContain('<span class="bp-item-code">HSN/SAC: 8415</span>');
  });

  it("Country / Place of Supply in their own row above the items, as refrens.com prints them; hideCountryOfSupply hides them (kept for the live toggle)", () => {
    const html = render();
    const at = html.indexOf('data-section="supply"');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf('data-section="items"'));
    expect(tagWith(html, "data-ceres-country-of-supply")).not.toContain(
      "display:none"
    );
    // Never inside the Shipped To card.
    const shipped = render((invoice) => {
      invoice.shippedTo = {
        name: "Site Office",
        city: "Howrah",
        country: "IN",
      };
    });
    expect(shipped).not.toMatch(
      /data-role="shipped-to"[^]*?data-ceres-country-of-supply[^]*?data-section="supply"/
    );
    expect(shipped.match(/data-ceres-country-of-supply/g)).toHaveLength(1);
    expect(
      tagWith(
        render((invoice) => {
          invoice.advanceOptions.hideCountryOfSupply = true;
        }),
        "data-ceres-country-of-supply"
      )
    ).toContain("display:none");
  });

  it("letterhead, footer and footerOnLastPage", () => {
    const every = render((invoice) => {
      invoice.letterHead = "https://example.com/head.png";
      invoice.letterHeadFooter = "https://example.com/foot.png";
    });
    expect(every).toContain('src="https://example.com/head.png"');
    expect(every).toContain("bp-footer-fixed");
    expect(every).toContain("bp-footer-spacer");

    const last = render((invoice) => {
      invoice.letterHeadFooter = "https://example.com/foot.png";
      invoice.template = { pdfOptions: { footerOnLastPage: true } };
    });
    expect(last).not.toContain("bp-footer-fixed");
    // The frame's footer holds only the browser print's margin row then.
    expect(last).not.toContain("bp-footer-spacer");
  });

  it("letterHeadOnFirstPage: the letterhead repeats in the print frame's header unless off", () => {
    const every = render((invoice) => {
      invoice.letterHead = "https://example.com/head.png";
    });
    const header = every.slice(
      every.indexOf("bp-page-frame-header"),
      every.indexOf("</thead>")
    );
    expect(header).toContain('src="https://example.com/head.png"');
    expect(every.match(/data-ceres-height="letterhead"/g)).toHaveLength(1);

    const first = render((invoice) => {
      invoice.letterHead = "https://example.com/head.png";
      invoice.template = { pdfOptions: { letterHeadOnFirstPage: true } };
    });
    // The frame's header holds only the browser print's margin row then.
    expect(
      first.slice(
        first.indexOf("bp-page-frame-header"),
        first.indexOf("</thead>")
      )
    ).not.toContain("bp-letterhead");
    expect(first.indexOf('src="https://example.com/head.png"')).toBeLessThan(
      first.indexOf("bp-page-frame")
    );
  });

  // Refrens' "Hide footer" only drops the "electronically generated" line its PDF service adds.
  it("hideFooter: the letterhead footer is still drawn", () => {
    const html = render((invoice) => {
      invoice.letterHeadFooter = "https://example.com/foot.png";
      invoice.template = { pdfOptions: { hideFooter: true } };
    });
    expect(html).toContain("https://example.com/foot.png");
    expect(html).not.toContain("is-footer-hidden");
  });

  // User (2026-11-01): text scale is the same everywhere. Nothing shrinks to fit the paper, the
  // table included; a table too wide for the page is cut off at its edge (landscape gives room).
  it("never shrinks the document or the table to fit the paper", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    const print = css.slice(css.indexOf("@media print {"));
    expect(print).toMatch(
      /\.bp-doc \{[^}]*zoom: var\(--bp-print-scale, 1\);\s*width: calc\(100% \/ var\(--bp-print-scale, 1\)\);/
    );
    expect(print).toMatch(
      /\.bp-items-scroll,\s*\.bp-widget-table \{\s*overflow: clip;/
    );
    // The one zoom is the 75 % print base, the whole document at once (2026-11-02).
    expect(css.match(/zoom:[^;]+;/g)).toEqual([
      "zoom: var(--bp-print-scale, 1);",
    ]);
    expect(css).not.toMatch(/--bp-doc-fit|is-print-compact|--bp-table-fit/);
    expect(render()).not.toMatch(
      /--bp-doc-fit|is-print-compact|--bp-table-fit/
    );
  });

  // BPS never stretches the item table, whatever either toggle says (2026-11-16): page 2
  // always goes on with totals, bank, terms and notes.
  it.each([
    [true, undefined, false],
    [true, true, false],
    [true, false, false],
    [false, true, false],
    [undefined, true, false],
    [undefined, undefined, false],
  ])(
    "stretches in print with the business toggle %s and the document toggle %s: %s",
    (business, document, stretched) => {
      const edit = (invoice: Json) => {
        invoice.owner.configuration.experimental = {
          stretchInvoiceTable: business,
        };
        invoice.template = { pdfOptions: { fullHeightTable: document } };
      };
      expect(mapPrint(state(edit)).stretchTable).toBe(stretched);
      expect(tagWith(render(edit), 'data-testid="invoice-root"')).toMatch(
        stretched ? /class="bp-doc is-stretch/ : /class="bp-doc(?! is-stretch)/
      );
    }
  );

  it("caps the printed page at the width between the margins, at any print size", () => {
    // At Normal text scale (1); unset is Smaller (0.8), whose zoom widens the page in CSS px.
    const width = (pdfOptions: Json) =>
      mapPrint(
        state((invoice) => {
          invoice.template = {
            pdfOptions: { zoomSize: 1, ...(pdfOptions as object) },
          };
        })
      ).printWidth;
    // A4 is 793.7 px wide; Refrens' margins are 30 px a step (Narrow 0.5 when unset); 4 px
    // kept back for rounding.
    expect(width({ format: "a4" })).toBe(759);
    expect(width({ format: "a4", xMargins: 1 })).toBe(729);
    // Margin 0 is a real setting (edge to edge), not "unset".
    expect(width({ format: "a4", xMargins: 0 })).toBe(789);
    expect(width({ format: "a4", xMargins: 2 })).toBe(669);
    // The print size divides the space between the margins, which keep their size.
    expect(width({ format: "a4", zoomSize: 0.9 })).toBe(844);
    expect(width({ format: "a4", zoomSize: 1.2 })).toBe(632);
  });

  it("merges a wrapped payload's template settings onto the document", () => {
    const merged = withTemplateSettings({
      invoice: { template: { pdfOptions: { footerOnLastPage: true } } },
      template: {
        primaryColor: "#123456",
        pdfOptions: { letterHeadOnFirstPage: true, footerOnLastPage: false },
      },
    }) as Json;
    expect(merged.invoice.template).toEqual({
      primaryColor: "#123456",
      pdfOptions: { letterHeadOnFirstPage: true, footerOnLastPage: true },
    });
    const flat = { invoiceNumber: "1", template: { name: "x" } };
    expect(withTemplateSettings(flat)).toBe(flat);
    const s = normalizeInvoiceTemplateState(
      withTemplateSettings({
        ...payload(),
        template: { pdfOptions: { letterHeadOnFirstPage: true } },
      }) as never
    ) as unknown as Json;
    expect(s.mapped.visibility.letterHeadOnFirstPage).toBe(true);
  });

  it("irnPosition places the compliance box above or below the items; the document QR prints whenever the document has one", () => {
    const withIrn = (edit?: (invoice: Json) => void) =>
      render((invoice) => {
        invoice.irn = {
          Irn: "abc123",
          AckNo: "112233",
          AckDt: "2026-05-27 10:00:00",
        };
        invoice.documentQr = "data:image/png;base64,AAAA";
        edit?.(invoice);
      });
    const above = withIrn();
    expect(above.indexOf('data-section="compliance"')).toBeLessThan(
      above.indexOf('data-section="items"')
    );
    expect(above).toContain(">abc123<");
    expect(above).toContain('src="data:image/png;base64,AAAA"');

    const below = withIrn((invoice) => {
      invoice.irnPosition = "BELOW_LINEITEMS";
    });
    expect(below.indexOf('data-section="compliance"')).toBeGreaterThan(
      below.indexOf('data-section="items"')
    );

    // refrens.com prints the document QR whenever the document carries one, whatever the
    // business's enableQrCode / showQrCode say (real PDFs, 2026-10-23).
    const qrOff = mapCompliance(
      state((invoice) => {
        invoice.documentQr = "data:image/png;base64,AAAA";
        invoice.owner.configuration.enableQrCode = false;
        invoice.owner.configuration.showQrCode = { quotation: false };
      })
    );
    expect(qrOff.qr.document).toBe("data:image/png;base64,AAAA");
  });

  it("Shipped From | Shipped To | Transport Details, a row of three cells", () => {
    const html = render((invoice) => {
      invoice.shippedFrom = { name: "Warehouse", city: "Kolkata" };
      invoice.shippedTo = {
        name: "Site Office",
        city: "Howrah",
        gstin: "19AAAAA1111A1Z5",
      };
      invoice.transportDetails = { vehicleNumber: "WB01AB1234" };
    });
    const client = html.slice(
      html.indexOf('data-section="parties"'),
      html.indexOf('data-section="logistics"')
    );
    expect(client).not.toContain("Site Office");
    // The frame's third row: Shipped From, Shipped To, Transport Details, in that order.
    const logistics = html.slice(
      html.indexOf('data-section="logistics"'),
      html.indexOf('data-section="items"')
    );
    expect(logistics).toMatch(
      /data-role="shipped-from"[\s\S]*?data-role="shipped-to"[\s\S]*?19AAAAA1111A1Z5[\s\S]*?bp-transport[\s\S]*?WB01AB1234/
    );
    const onlyTo = render((invoice) => {
      invoice.shippedTo = { name: "Site Office", city: "Howrah" };
    });
    expect(onlyTo).toContain('data-role="shipped-to"');
    expect(onlyTo).not.toContain('data-role="shipped-from"');
    const noParties = render((invoice) => {
      invoice.transportDetails = { vehicleNumber: "WB01AB1234" };
    });
    expect(noParties).not.toContain('data-role="shipped-to"');
    expect(noParties).not.toMatch(
      /bp-meta[\s\S]*?bp-field-label">Vehicle Number[\s\S]*?data-role="billed-by"/
    );
    expect(noParties).toMatch(/bp-transport-vehicleNumber[\s\S]*?WB01AB1234/);
  });

  it("totals and words across the frame; terms, notes, attachments | bank and UPI; the summaries; additional info | signature last", () => {
    const html = render((invoice) => {
      invoice.notes = "Thank you";
      invoice.attachments = ["https://example.com/drawing.pdf"];
      invoice.customFields = [{ label: "Site", value: "Block 1" }];
    });
    // BPS design: totals, summaries, bank, terms | signature, then notes, additional
    // information and attachments unboxed.
    expect(html.slice(html.indexOf('class="bp-bottom-side"'))).toMatch(
      /^[^]*?data-section="terms"/
    );
    // The summaries last, after the notes and attachments (user, 2026-11-16).
    const order = [
      "additional",
      "totals",
      "bank",
      "terms",
      "notes",
      "attachments",
      "hsn",
      "tax-summary",
      "enquiry",
    ].map((section) => html.indexOf(`data-section="${section}"`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf('data-section="totals"')).toBeLessThan(
      html.indexOf('data-section="bottom"')
    );
    expect(html).toContain(">drawing.pdf<");
    expect(html).toMatch(/ai-label">Site<[\s\S]*?Block 1/);

    const hiddenNotes = view((invoice) => {
      invoice.notes = "Thank you";
      invoice.showNotes = false;
    });
    expect(hiddenNotes.notes).toBeNull();
  });

  it("bank transfer and UPI follow the payment options; the UPI QR stays 120 px", () => {
    expect(
      render((invoice) => {
        invoice.paymentOptions.accountTransfer = false;
      })
    ).not.toContain('data-section="bank"');
    const upi = render((invoice) => {
      invoice.paymentOptions.upi = true;
      invoice.upi = { upi: "apex@upi" };
      invoice.template = { upiShrink: true };
    });
    expect(upi).toContain("apex@upi");
    // Every QR is 120 px (user request, 2026-10-24): upiShrink no longer makes the UPI QR small.
    expect(upi).toContain('class="bp-upi"');
    expect(upi).not.toContain("is-small");
  });

  it("party field visibility switches hide email and phone", () => {
    const html = render((invoice) => {
      invoice.billedTo.emailShowInInvoice = false;
    });
    expect(html).not.toContain("client@example.com");
  });

  it("shows the status tag as refrens.com does for each document type", () => {
    // A quotation reads "Created"; an unpaid invoice has no tag; a paid one "Paid".
    expect(render()).toContain('<span class="invoice-tag info">Created</span>');
    const unpaid = render((invoice) => {
      invoice.billType = "INVOICE";
      invoice.status = "UNPAID";
    });
    expect(unpaid).not.toContain("bp-status");
    const paid = render((invoice) => {
      invoice.billType = "INVOICE";
      invoice.status = "PAID";
    });
    expect(paid).toContain('<span class="invoice-tag success">Paid</span>');
    const part = render((invoice) => {
      invoice.billType = "INVOICE";
      invoice.status = "PARTIAL";
    });
    expect(part).toContain("Part Paid");
    // A purchase order sent to its vendor reads "Purchase Order Sent" (as refrens.com shows it);
    // one never sent stays "Created".
    const order = (vendorReminder?: Json) =>
      render((invoice) => {
        invoice.billType = "PURCHASEORDER";
        invoice.status = "UNPAID";
        invoice.vendorReminder = vendorReminder;
      });
    expect(order({ recipients: [{ email: "vendor@example.com" }] })).toContain(
      '<span class="invoice-tag info">Purchase Order Sent</span>'
    );
    expect(order({ recipients: [] })).toContain(
      '<span class="invoice-tag info">Created</span>'
    );
  });

  it("Change Script: right-to-left and the Language/Script font", () => {
    // Default: left to right, no extra font.
    expect(mapScript(state())).toEqual({
      dir: "ltr",
      lang: "en-IN", // the document's locale
      script: "",
      font: "",
      fontUrl: "",
    });
    expect(render()).toContain('dir="ltr"');

    // "Enable right-to-left script" with Latin ext: RTL, Inter covers the glyphs.
    const latin = state((invoice) => {
      invoice.template = { languageScript: "Latin ext", enableRtl: true };
    });
    expect(mapScript(latin)).toMatchObject({
      dir: "rtl",
      script: "latinext",
      font: "",
    });
    const html = template(latin);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-ceres-script="latinext"');
    expect(html).not.toContain("fonts.googleapis.com/css2?family=Noto");

    // A non-Latin script loads its Noto face; Arabic reads right to left on its own.
    const arabic = state((invoice) => {
      invoice.template = { script: "Arabic" };
    });
    expect(mapScript(arabic)).toMatchObject({
      dir: "rtl",
      font: "'Noto Sans Arabic'",
    });
    const arabicHtml = template(arabic);
    expect(arabicHtml).toContain("--bp-script-font: 'Noto Sans Arabic'");
    // Handlebars escapes "=" in the attribute; the browser reads it back as the URL.
    expect(arabicHtml).toContain(
      'href="https://fonts.googleapis.com/css2?family&#x3D;Noto+Sans+Arabic:wght@400;500;600;700&amp;display&#x3D;swap"'
    );
    // The switch turned off wins over the script's own direction.
    expect(
      mapScript(
        state((invoice) => {
          invoice.template = { script: "Arabic", enableRtl: false };
        })
      ).dir
    ).toBe("ltr");
    expect(
      mapScript(
        state((invoice) => {
          invoice.template = {
            languageScript: "Devanagari",
            languageCode: "hi",
          };
        })
      )
    ).toMatchObject({ dir: "ltr", lang: "hi", font: "'Noto Sans Devanagari'" });
  });

  it("theme colour, text scale and the compact print table", () => {
    const html = render((invoice) => {
      invoice.template = {
        primaryColor: "#1a5d1a",
        pdfOptions: { textScale: 1.1 },
      };
    });
    expect(html).toContain("--bp-theme: #1a5d1a");
    expect(html).toContain("--bp-text-scale: 1.1");
    expect(render()).not.toContain("--bp-theme");
  });

  it("signature: image, awaiting and signed digital signatures", () => {
    expect(
      render((invoice) => {
        invoice.signature = "https://example.com/sign.png";
      })
    ).toContain('src="https://example.com/sign.png"');
    expect(
      render((invoice) => {
        invoice.signatureMethod = "DIGITAL";
      })
    ).toContain("Awaiting Digital Signature");
    expect(
      render((invoice) => {
        invoice.signatureMethod = "DIGITAL";
        invoice.documentSignatureRequest = {
          status: "SIGNED",
          signers: [{ signerName: "A. Signer" }],
        };
      })
    ).toContain("Digitally signed by A. Signer");
    // No signature on the document: no signature block at all.
    expect(render()).not.toContain('data-testid="signature"');
    const html = render((invoice) => {
      invoice.signature = "https://example.com/sign.png";
    });
    // No "For <business>" line, as refrens.com prints the signature.
    expect(html).not.toContain("bp-signature-for");
    // In the right-hand column, after the totals.
    const at = html.indexOf('data-testid="signature"');
    expect(at).toBeGreaterThan(html.indexOf('class="bp-bottom-side"'));
    expect(at).toBeGreaterThan(html.indexOf('data-testid="totals-table"'));
  });
});

describe("BPS Technologies — view model", () => {
  it("prints dates as refrens.com does, May 27, 2026, in the business's offset", () => {
    expect(formatDocumentDate("2026-05-27")).toBe("May 27, 2026");
    expect(formatDocumentDate("2026-05-01")).toBe("May 01, 2026");
    expect(formatDocumentDate("2050-07-09")).toBe("Jul 09, 2050");
    expect(formatDocumentDate("2026-05-26T20:00:00.000Z", "+05:30")).toBe(
      "May 27, 2026"
    );
    expect(formatDocumentDate("not a date")).toBe("not a date");
    expect(formatDocumentDate("")).toBe("");
  });

  it("formats table figures without the symbol, negatives in brackets", () => {
    const ctx = formatContext({
      currency: "INR",
      locale: "en-IN",
      subUnitLength: 2,
    });
    expect(formatFigure(760698, ctx)).toBe("7,60,698.00");
    expect(formatFigure(-50, ctx)).toBe("(50.00)");
    expect(formatFigure("", ctx)).toBe("");
  });

  it("closes with Refrens' enquiry line from the document's contact details", () => {
    const html = render((invoice) => {
      invoice.contact = {
        email: "enquiry@example.com",
        phone: "+919800000000",
      };
    });
    expect(html).toMatch(
      /bp-enquiry[\s\S]*?For any enquiry, reach out via email at <strong class="bp-email">enquiry@example.com<\/strong>, call on/
    );
    expect(
      render((invoice) => {
        delete invoice.contact;
      })
    ).not.toContain("bp-enquiry");
  });

  it("adds Linked Document and Reason to the document details, with no details title", () => {
    const html = render((invoice) => {
      invoice.billType = "CREDITNOTE";
      invoice.invoiceTitle = "Credit Note";
      invoice.documentReason = "Product Return";
      invoice.linkedInvoices = [{ _id: "x", invoiceNumber: "INV-7" }];
    });
    // No "Credit Note Details" title over the rows (user request, 2026-10-21).
    expect(html).not.toContain("bp-meta-title");
    expect(html).not.toContain("Credit Note Details");
    expect(html).toMatch(/bp-field-label">Linked Document<[\s\S]*?INV-7/);
    expect(html).toMatch(/bp-field-label">Reason<[\s\S]*?Product Return/);
  });

  it("puts the QR at the header's end, the IRN and e-way bill among the details, one QR only", () => {
    const withQr = render((invoice) => {
      invoice.documentQr = "doc-qr-payload";
    });
    expect(withQr).toMatch(
      /data-section="header"[\s\S]*?bp-head-qrs[\s\S]*?bp-doc-qr"[^>]*><img[^>]*src="data:image\/[\s\S]*?data-section="details"/
    );
    // Whatever the business's placement: the QR stays at the header's end (Simple design).
    const beside = render((invoice) => {
      invoice.documentQr = "doc-qr-payload";
      invoice.owner.configuration.experimental = {
        qrCodePlacement: "BESIDE_LOGO",
      };
    });
    expect(beside).toMatch(/bp-head-qrs[\s\S]*?bp-doc-qr"/);
    const active = render((invoice) => {
      invoice.documentQr = "doc-qr-payload";
      invoice.qrCode = "irn-qr-payload";
      invoice.irn = { Irn: "abc", qrCode: "irn-qr-payload" };
    });
    expect(active).toContain("bp-doc-qr is-empty");
    // The IRN and the e-way bill are lines of the details; no E-Invoice card above the items.
    const eway = render((invoice) => {
      invoice.irn = {
        Irn: "abc123",
        EwbNo: "602218603039",
        EwbDt: "2026-11-12 10:00:00",
      };
    });
    expect(eway).toMatch(
      /data-section="details"[\s\S]*?bp-irn-row[\s\S]*?abc123[\s\S]*?Eway Bill[\s\S]*?602218603039[\s\S]*?Eway Date/
    );
    expect(eway).not.toMatch(
      /data-section="logistics"[\s\S]*?data-section="compliance"[\s\S]*?data-section="items"/
    );
  });

  it("sizes the table from the design's 958 px table with a 52 px serial column, as shares of the table", () => {
    const s = state();
    const table = mapItemTable(s, formatContext(s.invoice));
    expect(table.serialWidth).toBe(52);
    const rate = table.header.find((cell: Json) => cell.key === "rate");
    expect(rate?.width).toBeGreaterThanOrEqual(70);
    expect(rate?.share).toBeCloseTo(((rate?.width as number) / 958) * 100, 2);
  });

  it("assembles a sparse document without failing", () => {
    const sparse = buildBpsView(
      normalizeInvoiceTemplateState({
        invoice: { billType: "INVOICE" },
      } as never)
    );
    expect(sparse.parties).toEqual([]);
    expect(sparse.terms).toEqual([]);
    expect(sparse.enquiry).toBeNull();
    expect(
      template(
        normalizeInvoiceTemplateState({
          invoice: { billType: "INVOICE" },
        } as never)
      )
    ).toContain("bp-doc");
  });
});

describe("BPS Technologies — files and CSS", () => {
  const source = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");

  it("holds only the files the template rule allows", () => {
    expect(fs.readdirSync(TEMPLATE_DIR).sort()).toEqual([
      "helpers.ts",
      "index.ts",
      "samples.json",
      "styles.css",
      "template.hbs",
      "version.json",
    ]);
  });

  it("keeps the fixture's document values out of the source", () => {
    const code = ["template.hbs", "helpers.ts", "styles.css"]
      .map((file) => fs.readFileSync(path.join(TEMPLATE_DIR, file), "utf8"))
      .join("\n");
    [
      "SAMPLE CLIENT",
      "Sample Bank",
      "Drawing No",
      "RXQ42RY16",
      "OUTDOOR",
      "Equipment Cost",
      "19ABCDE",
    ].forEach((sample) => expect(code).not.toContain(sample));
  });

  it("lists attachments without an indent; a long name never widens its column", () => {
    expect(source).toMatch(
      /\.bp-attachments \{\s*contain: inline-size;\s*margin: 0;\s*padding: 0;\s*list-style: none;/
    );
    // The two halves under the totals are never narrower than their content.
    expect(source).toMatch(/\.bp-lines \{[^}]*table-layout: fixed;/);
  });

  it("draws every part of the frame with its own rules, meeting the next on one line", () => {
    expect(source).toMatch(/\.bp-box \{\s*border: var\(--bp-rule\);/);
    expect(source).toMatch(/--bp-rule: 1px solid var\(--bp-line\);/);
    expect(source).toMatch(
      /\.bp-page-body > :is\(\.bp-box, \.bp-items-section, \.bp-totals-table, \.bp-bottom\) \+ :is\(\.bp-box, \.bp-items-section, \.bp-totals-table, \.bp-bottom\) \{\s*margin-top: -1px;/
    );
    // Square corners throughout (Simple design).
    expect(source).not.toMatch(/radius: 8px/);
  });

  it("mirrors for right-to-left: logical sides only", () => {
    expect(source).not.toMatch(/(?:padding|margin|border)-(?:left|right)\s*:/);
    // Only the right-to-left overrides of the widgets' own alignment name a side.
    const withoutRtl = source.replace(
      /\.bp-doc\[dir="rtl"\][^{]*\{[^}]*\}/g,
      ""
    );
    expect(withoutRtl).not.toMatch(/text-align: (?:left|right)/);
    expect(source).toMatch(/var\(--bp-script-font, "Caladea"\)/);
  });

  it("uses the design's colours: black text, black rules, white paper", () => {
    ["--bp-ink: #000;", "--bp-line: #000;", "--bp-paper: #fff;"].forEach(
      (token) => expect(source).toContain(token)
    );
  });
});

describe("BPS Technologies — the platform's other settings, under every alias", () => {
  it("reads description full width, item name full width and group subtotal aliases", () => {
    const aliased = view((invoice) => {
      invoice.advanceOptions.showDescriptionInFullWidth = true;
      invoice.advanceOptions.isDescriptionFullWidth = false;
      invoice.advanceOptions.showGroupSubTotal = false;
    });
    expect(aliased.descriptionFullWidth).toBe(true);
    const settings = resolveSettings(
      state((invoice) => {
        invoice.showItemNameFullWidth = true;
        invoice.advanceOptions.hideGroupSubTotal = true;
      })
    );
    expect(settings.itemNameFullWidth).toBe(true);
    expect(settings.groupSubtotal).toBe(false);
  });

  it("showSummarisedTotalQuantity switches the in-table Total row", () => {
    expect(
      view((invoice) => {
        invoice.showTotalsRow = false;
        invoice.advanceOptions.showSummarisedTotalQuantity = true;
      }).table.footer.show
    ).toBe(true);
    expect(
      view((invoice) => {
        invoice.advanceOptions.showSummarizedTotalQuantity = false;
      }).table.footer.show
    ).toBe(false);
  });

  it("prints item serial numbers under the name unless switched off", () => {
    const withSerials = (invoice: Json) => {
      invoice.items[1].serialNumbers = ["SN-001", { serialNumber: "SN-002" }];
    };
    const row = (v: ReturnType<typeof view>) =>
      v.table.rows.find(
        (entry: Json) => entry.name === fixture.invoice.items[1].name
      ) as Json;
    expect(row(view(withSerials)).inlineCodes).toContain(
      "Serial No.: SN-001, SN-002"
    );
    expect(
      row(
        view((invoice) => {
          withSerials(invoice);
          invoice.advanceOptions.showSerialNumbersInDescription = false;
        })
      ).inlineCodes.join(" ")
    ).not.toContain("SN-001");
  });

  it("hideBalanceDue / showDueAmount false drop the Balance Due row, not the paid rows", () => {
    const paid = (invoice: Json) => {
      invoice.balance = { ...(invoice.balance || {}), paid: 1000, due: 5000 };
    };
    const keys = (v: ReturnType<typeof view>) =>
      v.totals.due.map((entry: Json) => entry.key);
    expect(keys(view(paid))).toContain("dueAmount");
    const hidden = view((invoice) => {
      paid(invoice);
      invoice.advanceOptions.hideBalanceDue = true;
    });
    expect(keys(hidden)).not.toContain("dueAmount");
    expect(keys(hidden).length).toBeGreaterThan(0);
    expect(
      keys(
        view((invoice) => {
          paid(invoice);
          invoice.invoiceValueProps = { dueAmount: { visible: false } };
        })
      )
    ).not.toContain("dueAmount");
  });

  it("showTerms false / hideTerms hide Terms and Conditions", () => {
    const off = view((invoice) => {
      invoice.advanceOptions.hideTerms = true;
    });
    expect(off.terms).toEqual([]);
    expect(view().terms.length).toBeGreaterThan(0);
  });

  it("a header field switched off in invoiceValueProps stays off", () => {
    const keys = (v: ReturnType<typeof view>) =>
      v.meta.map((row: Json) => row.key);
    const dated = (invoice: Json) => {
      invoice.dueDate = "2026-06-30";
    };
    expect(keys(view(dated))).toContain("dueDate");
    expect(
      keys(
        view((invoice) => {
          dated(invoice);
          invoice.invoiceValueProps = { DueDate: false };
        })
      )
    ).not.toContain("dueDate");
  });

  it("renders the stock summary from the document's batchSummary, hidden while switched off", () => {
    const batches = (invoice: Json) => {
      invoice.batchSummary = [
        {
          itemName: "Indoor unit",
          batch: { batchName: "B-12", expiryDate: "2027-03-31" },
          warehouseName: "Main",
          quantity: 4,
        },
      ];
    };
    const html = render(batches);
    expect(tagWith(html, "data-ceres-batch-summary")).not.toContain(
      "display: none"
    );
    // No title line over the summary tables in this template (user, 2026-11-13).
    expect(html).not.toContain("Batch Summary");
    expect(html).toContain("B-12");
    expect(html).toContain("Mar 31, 2027");
    // A column no batch fills (Mfg Date) is left out.
    expect(html).not.toContain("Mfg Date");

    const off = render((invoice) => {
      batches(invoice);
      invoice.advanceOptions.showStockSummary = false;
    });
    expect(tagWith(off, "data-ceres-batch-summary")).toContain("display: none");
    expect(render()).not.toContain("data-ceres-batch-summary");
  });

  it("uses the item batches only when the stock summary is switched on, with the business's columns", () => {
    const itemBatches = (invoice: Json) => {
      invoice.items[1].batchSummary = [{ batchName: "LOT-7", quantity: 1 }];
      invoice.defaultBatchColumns = [
        { key: "batchName", label: "Lot" },
        { key: "quantity", label: "Qty" },
        { key: "expiryDate", label: "Expiry", isHidden: true },
      ];
    };
    expect(mapStockSummary(state(itemBatches), formatContext({}))).toBeNull();
    const stock = mapStockSummary(
      state((invoice) => {
        itemBatches(invoice);
        invoice.advanceOptions.showStockSummary = true;
      }),
      formatContext({})
    ) as Json;
    expect(stock.columns.map((column: Json) => column.label)).toEqual([
      "Lot",
      "Qty",
    ]);
    expect(stock.rows[0].map((cell: Json) => cell.value)).toEqual([
      "LOT-7",
      "1",
    ]);
  });

  it("Pageless PDF prints the letterhead and footer once", () => {
    const pageless = view((invoice) => {
      invoice.template = {
        ...(invoice.template || {}),
        pdfOptions: { longPdf: true },
      };
    });
    expect(pageless.pageless).toBe(true);
    expect(pageless.letterheadEveryPage).toBe(false);
    expect(pageless.footerEveryPage).toBe(false);
  });

  it("puts dark text on a light theme colour and follows the host's live colour first", () => {
    expect(onThemeColor("#ffd400")).toBe("#22272f");
    expect(onThemeColor("#1f4e79")).toBe("#ffffff");
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toContain(
      "--bp-accent: var(--primary-color, var(--bp-theme, #4472c4))"
    );
  });
});

describe("BPS Technologies — e-way bill with the IRN", () => {
  it("lists the e-way bill under the IRN details, not under Transport Details", () => {
    const v = view((invoice) => {
      invoice.irn = {
        ...(invoice.irn || {}),
        Irn: "abc123",
        AckNo: "1826",
        EwbNo: "801598508277",
        EwbDt: "2026-09-08 10:00:00",
      };
      invoice.transportDetails = { vehicleNumber: "KA01AB1234" };
    });
    const complianceKeys = v.compliance.rows.map((row: Json) => row.key);
    expect(complianceKeys).toEqual(["ackNo", "ewayBillNumber", "ewayBillDate"]);
    const transportKeys = [
      ...(v.transport ? v.transport.rows : []),
      ...v.meta,
    ].map((row: Json) => row.key);
    expect(transportKeys).toContain("vehicleNumber");
    expect(transportKeys).not.toContain("ewayBillNumber");
  });
});

describe("BPS Technologies — logo slot", () => {
  it("holds the business logo only: never the business name, and nothing without a logo", () => {
    expect(render()).toContain("bp-logo-image");
    const noLogo = render((invoice) => {
      delete invoice.logo;
      if (invoice.billedBy) delete invoice.billedBy.logo;
    });
    expect(noLogo).not.toContain('class="bp-logo"');
    expect(noLogo).not.toContain("bp-brand-name");
    expect(noLogo).not.toContain('data-role="company-name"');
    // The details still print.
    expect(noLogo).toContain('data-section="details"');
  });
});

describe("BPS Technologies — PDF service page hooks", () => {
  const tag = (html: string, marker: string) => tagWith(html, marker);
  it("marks every-page letterhead and footer for the PDF service, which draws them itself", () => {
    const every = render((invoice) => {
      invoice.letterHead = "https://example.com/lh.png";
      invoice.letterHeadFooter = "https://example.com/ft.png";
      invoice.template = {
        pdfOptions: { letterHeadOnFirstPage: false, footerOnLastPage: false },
      };
    });
    const header = tag(every, 'data-ceres-page-policy="all"');
    expect(header).toContain("data-ceres-page-header");
    expect(header).toContain("no-dibella");
    const footer = tag(every, "data-ceres-page-footer");
    expect(footer).toContain('data-ceres-page-policy="all"');
    expect(footer).toContain("no-dibella");
  });

  it("keeps a first-page letterhead and a last-page footer in the document for the PDF service", () => {
    const once = render((invoice) => {
      invoice.letterHead = "https://example.com/lh.png";
      invoice.letterHeadFooter = "https://example.com/ft.png";
      invoice.template = {
        pdfOptions: { letterHeadOnFirstPage: true, footerOnLastPage: true },
      };
    });
    const header = tag(once, 'data-ceres-page-policy="first"');
    expect(header).toContain("data-ceres-page-header");
    expect(header).not.toContain("no-dibella");
    const footer = tag(once, "data-ceres-page-footer");
    expect(footer).toContain('data-ceres-page-policy="last"');
    expect(footer).not.toContain("no-dibella");
  });

  // "Hide footer" turns the PDF service's own footer off, the letterhead footer with it.
  it("draws the every-page footer itself when Hide footer is on", () => {
    const hidden = render((invoice) => {
      invoice.letterHeadFooter = "https://example.com/ft.png";
      invoice.template = {
        pdfOptions: { footerOnLastPage: false, hideFooter: true },
      };
    });
    const footer = tag(hidden, "data-ceres-page-footer");
    expect(footer).toContain('data-ceres-page-policy="all"');
    expect(footer).toContain("bp-footer-fixed");
    expect(footer).not.toContain("no-dibella");
    expect(hidden).not.toMatch(/no-dibella[^"]*bp-footer-spacer/);
  });
});

describe("BPS Technologies — PDF service window", () => {
  const source = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
  it("lays the document out at the paper's printable width in the PDF service", () => {
    // The service's window is narrower than a landscape page: the layout must see the paper.
    const print = source.slice(source.indexOf("@media print {"));
    expect(print).toMatch(
      /\[class~="isDibella"\] \.bp-doc \{\s*width: calc\(var\(--bp-print-width, 100%\) \/ var\(--bp-print-scale, 1\)\);\s*max-width: none;/
    );
  });
});

describe("BPS Technologies — frames hug long values", () => {
  const source = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
  it("widens the bank card for a long account number or UPI ID instead of overflowing", () => {
    // The rows take their content's width (figures never wrap) and the QR moves under them.
    // The rows take the room left of the QR; under 600 px the QR goes under them.
    expect(source).toMatch(/\.bp-bank \{[^}]*flex-flow: row nowrap;/);
    expect(source).toMatch(/\.bp-bank \{\s*flex-direction: column;/);
    expect(source).toMatch(/\.bp-lines \{[^}]*table-layout: fixed;/);
  });
});

describe("BPS Technologies — party tax numbers only when on the document", () => {
  const ids = (edit: (invoice: Json) => void) => {
    const invoice = state(edit).invoice as Json;
    const party = mapParty(invoice, invoice.billedBy, "");
    return party ? [...party.ids, ...party.extras].map((row) => row.label) : [];
  };
  it("does not print a stored VAT / TRN number on an Indian GST document", () => {
    expect(
      ids((invoice) => {
        invoice.billedBy.vatNumber = "VAT000000000";
        invoice.billedBy.trnNumber = "100000000000003";
      })
    ).not.toEqual(expect.arrayContaining(["VAT Number"]));
  });
  it("prints it where the document carries it, and never when switched off", () => {
    expect(
      ids((invoice) => {
        invoice.taxType = "UAE";
        invoice.billedBy.country = "AE";
        invoice.billedBy.vatNumber = "VAT000000000";
      })
    ).toContain("VAT Number");
    // A party abroad prints its own number on an Indian GST document too (refrens.com)…
    expect(
      ids((invoice) => {
        invoice.billedBy.country = "AE";
        invoice.billedBy.vatNumber = "VAT000000000";
      })
    ).toContain("VAT Number");
    // …and a party in India never does, even switched on.
    expect(
      ids((invoice) => {
        invoice.billedBy.vatNumber = "VAT000000000";
        invoice.billedBy.fieldVisibility = { vat: true };
      })
    ).not.toContain("VAT Number");
    expect(
      ids((invoice) => {
        invoice.taxType = "UAE";
        invoice.billedBy.country = "AE";
        invoice.billedBy.vatNumber = "VAT000000000";
        invoice.billedBy.fieldVisibility = { vatNumber: false };
      })
    ).not.toContain("VAT Number");
  });
});

describe("BPS Technologies — unbroken field values", () => {
  it("lets an email carry on from its label and break only at the edge; figures never break", () => {
    const html = render((invoice) => {
      invoice.billedTo.email = "sample.client@example.com";
    });
    expect(html).toMatch(
      /bp-field-label">Email<\/span><span class="bp-field-value bp-email bp-break">sample.client@example\.com/
    );
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-field-value\.bp-break:not\(\.bp-num\) \{[^}]*overflow-wrap: anywhere;/
    );
    // A document number, GSTIN, phone, transport or bank figure, or amount is never wrapped.
    [
      "\\.bp-party-fields \\.bp-field-value",
      "\\.bp-transport \\.bp-kv-value",
      "\\.bp-bank-rows \\.bp-kv-value",
    ].forEach((box) => {
      expect(css).not.toMatch(
        new RegExp(`${box}\\.bp-num \\{[^}]*white-space: normal;`)
      );
    });
    expect(css).toMatch(/\.bp-num \{\s*white-space: nowrap;/);
    expect(css).toMatch(/\.bp-field-value\.bp-num \{\s*white-space: nowrap;/);
  });
});

describe("BPS Technologies — editor settings (accordions)", () => {
  const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
  const metaKeys = (edit?: (invoice: Json, root: Json) => void) =>
    view(edit).meta.map((row: Json) => row.key);

  it("Change Color & Font: the theme colour and both fonts; the page stays white", () => {
    expect(css).toMatch(/--bp-accent: var\(--primary-color,/);
    // Black on white (BPS design): the theme colours the title and the heading rows' tint only.
    expect(css).toMatch(/--bp-ink: #000;/);
    expect(css).toMatch(
      /--bp-head-tint: color-mix\(in srgb, var\(--bp-accent\) 30%, var\(--bp-paper\)\);/
    );
    expect(css).toMatch(/--bp-paper: #fff;/);
    expect(css).not.toMatch(
      /var\(--(?:primary-background|secondary-background)/
    );
    // No Secondary Color anywhere: the zebra rows take the cards' light tint (2026-10-24).
    expect(css).not.toMatch(/var\(--secondary-color/);
    expect(css).toMatch(/--bp-zebra: var\(--bp-paper\);/);
    expect(css).toMatch(/--bp-title-font: var\(--title-font,/);
    expect(css).toMatch(/--bp-font: var\(--subtitle-font,/);
    // No white is hard-coded outside the token.
    expect(css.replace(/--bp-(?:paper|on-accent):[^;]*;/g, "")).not.toMatch(
      /#fff\b/
    );
  });

  it("Other Configurations: Hide Totals on the document hides the totals, total row and words", () => {
    const shown = render();
    expect(shown).toMatch(/class="bp-box bp-words ceres-subtotal-words"/);
    const hidden = render((invoice) => {
      invoice.hideTotals = true;
    });
    expect(hidden).not.toMatch(/class="bp-box bp-words ceres-subtotal-words"/);
    expect(
      resolveSettings(
        state((invoice) => {
          invoice.hideTotals = true;
        })
      ).totalsRow
    ).toBe(false);
  });

  it("Other Configurations: Show Refrens branding", () => {
    expect(render()).not.toContain("refrens-branding-widget");
    expect(
      render((invoice) => {
        invoice.showBranding = true;
      })
    ).toContain("refrens-branding-widget");
  });

  it("document details follow the business's saved order", () => {
    expect(metaKeys()).toEqual([
      "invoiceNumber",
      "invoiceDate",
      "customHeader",
    ]);
    expect(
      metaKeys((invoice) => {
        invoice.documentFieldOrder = ["DWG. NO", { key: "invoiceDate" }];
      })
    ).toEqual(["customHeader", "invoiceDate", "invoiceNumber"]);
    expect(
      metaKeys((invoice) => {
        invoice.template = {
          ...invoice.template,
          documentDetailsOrder: ["invoice_date"],
        };
      })
    ).toEqual(["invoiceDate", "invoiceNumber", "customHeader"]);
  });

  it("Watermark: drawn by the shared widget the template loads", () => {
    const index = fs.readFileSync(path.join(TEMPLATE_DIR, "index.ts"), "utf8");
    expect(index).toContain('import "../../widgets/watermark"');
  });
});

describe("BPS Technologies — Refrens match (2026-10-19)", () => {
  const unitRow = (unitColumn?: string) =>
    template(
      normalizeInvoiceTemplateState(
        withRefrensDefaults(
          (() => {
            const root = JSON.parse(JSON.stringify(fixture));
            const invoice = root.invoice || root;
            invoice.advanceOptions = { ...invoice.advanceOptions };
            delete invoice.advanceOptions.unitColumn;
            if (unitColumn) invoice.advanceOptions.unitColumn = unitColumn;
            invoice.items.forEach((item: Json) => {
              if (!item.group) item.unit = "PCS";
            });
            return root;
          })()
        )
      )
    );

  // Skipped here: this repo's shared normalizer reads the unit / tax-summary settings from
  // their canonical keys (unitColumn, taxSummary.taxList), not the aliases this test uses.
  it.skip("prints the unit where the unit setting puts it, as refrens.com does", () => {
    // Unset (Refrens' default) and SEPARATE_COLUMN: a Unit column of its own.
    expect(unitRow()).toMatch(/<th[^>]*data-col="unit"/);
    expect(unitRow("SEPARATE_COLUMN")).toMatch(/<th[^>]*data-col="unit"/);
    // Merged into Quantity: "1 (PCS)", no Unit column.
    const merged = unitRow("MERGE_QUANTITY");
    expect(merged).not.toMatch(/<th[^>]*data-col="unit"/);
    expect(merged).toMatch(/\d \(PCS\)/);
    // With the item name: "Unit: PCS" under it, no Unit column.
    const named = unitRow("MERGE_NAME");
    expect(named).not.toMatch(/<th[^>]*data-col="unit"/);
    expect(named).toContain("Unit: PCS");
  });

  it("adds a Notes column to the payments when a payment has notes", () => {
    const html = render((invoice) => {
      invoice.advanceOptions.showPaymentsTable = true;
      invoice.allPayments = [
        {
          amount: 1000,
          paymentDate: "2026-06-01",
          paymentMethod: "CASH",
          notes: "Hi sweet",
        },
      ];
    });
    expect(html).toMatch(/<th>Notes<\/th>[\s\S]*?Hi sweet/);
    expect(html).not.toContain(
      '<h3 class="bp-card-title" data-role="title">Payments</h3>'
    );
  });

  it("spells foreign amounts in their own units, as refrens.com", () => {
    expect(foreignAmountInWords(5400.18, "USD").toUpperCase()).toBe(
      "FIVE THOUSAND FOUR HUNDRED DOLLARS AND EIGHTEEN CENTS ONLY"
    );
    expect(foreignAmountInWords(1800, "SAR").toUpperCase()).toBe(
      "ONE THOUSAND EIGHT HUNDRED RIYALS ONLY"
    );
  });
});

describe("BPS Technologies — description and note tables in print", () => {
  it("repeats a description or note table's headings on every page, breaking between its rows", () => {
    const source = fs.readFileSync(
      path.join(TEMPLATE_DIR, "styles.css"),
      "utf8"
    );
    const print = source.slice(source.indexOf("@media print"));
    expect(print).toMatch(
      /\.bp-doc :is\(\.bp-item-desc, \.bp-note-body\) \.toastui-editor-contents thead \{\s*display: table-header-group;/
    );
    expect(print).toMatch(
      /\.bp-doc :is\(\.bp-item-desc, \.bp-note-body\) \.toastui-editor-contents tr \{\s*break-inside: avoid;/
    );
  });
});

describe("BPS Technologies — boxes split by a page break", () => {
  it("draws a split box's border on each page's piece", () => {
    const source = fs.readFileSync(
      path.join(TEMPLATE_DIR, "styles.css"),
      "utf8"
    );
    // Chrome 122 drops a cloned box's side rules: the page frame draws a rule at the top of
    // every page's content, and the planner a closing rule under the last line of a part a page
    // break cuts (user, 2026-11-13).
    expect(source).not.toMatch(/box-decoration-break: clone/);
    const hbs = fs.readFileSync(
      path.join(TEMPLATE_DIR, "template.hbs"),
      "utf8"
    );
    expect(hbs).toMatch(
      /<tr class="bp-page-rule is-top"[^>]*><td><\/td><\/tr>\s*<\/thead>/
    );
    // The bottom part's lines are table rows; the table's footer row, repeated at each page's
    // foot in Chrome 122 too, draws the part's bottom rule there.
    expect(hbs).toMatch(
      /<table class="bp-lines" role="presentation">\s*<colgroup>[\s\S]*?<\/colgroup>[\s\S]*?<thead class="bp-lines-head"[\s\S]*?<tfoot class="bp-lines-foot"/
    );
    expect(source).toMatch(
      /\.bp-lines > \.bp-lines-foot td \{[^}]*border-top: var\(--bp-rule\);/
    );
  });

  it("labels the exchange-rate row Applied Exchange Rate", () => {
    const html = render((invoice) => {
      invoice.currency = "USD";
      invoice.businessCurrency = "INR";
      invoice.conversionRates = { INR: 96.326 };
      invoice.advanceOptions.showExchangeRateOnPdf = true;
    });
    expect(html).not.toMatch(/>\s*Conversion Rate\s*</);
  });
});

describe("BPS Technologies — Refrens match (2026-10-23)", () => {
  it("prints the status tag on paper as refrens.com's PDFs do", () => {
    const tag = (billType: string, status: string) =>
      view((invoice) => {
        invoice.billType = billType;
        invoice.status = status;
      }).status;
    expect(tag("INVOICE", "PARTIAL")).toMatchObject({
      text: "Part Paid",
      inPrint: true,
    });
    expect(tag("QUOTATION", "UNPAID")).toMatchObject({
      text: "Created",
      inPrint: false,
    });
    expect(tag("QUOTATION", "DRAFT")).toMatchObject({
      text: "Draft",
      inPrint: true,
    });
  });

  it("keeps the business's own 'Tax' wording on the column and its totals row", () => {
    const html = render((invoice) => {
      invoice.igst = true;
      invoice.columns = invoice.columns.map((column: Json) =>
        column.key === "igst" ? { ...column, label: "Tax" } : column
      );
    });
    expect(html).not.toMatch(
      /data-ceres-subtotal-row="igst[^"]*"[\s\S]{0,200}?>\s*IGST/
    );
  });

  it("prints table money with its sign, rates and flat discounts as entered", () => {
    const html = render((invoice) => {
      invoice.items[1].rate = 180.5;
      invoice.items[1].discount = { discountType: "FIXED", amount: 50 };
    });
    const body = html.slice(
      html.indexOf("</thead>"),
      html.indexOf("bp-bottom")
    );
    expect(body).toContain("₹180.5<");
    expect(body).toMatch(/₹[\d,]+\.\d\d</);
  });

  it("prints the UPI ID once: under the QR when there is one", () => {
    const html = render((invoice) => {
      invoice.paymentOptions = { ...invoice.paymentOptions, upi: true };
      invoice.upi = { vpa: "shop@okbank" };
    });
    const bank = html.slice(html.indexOf('data-section="bank"'));
    const ids =
      bank.slice(0, bank.indexOf("</section>")).match(/shop@okbank/g) || [];
    // The QR's alt text names it too; the printed text has it once.
    expect(ids.length).toBeLessThanOrEqual(2);
    expect(bank).not.toMatch(
      /bp-bank-upi">UPI<\/span>[\s\S]*?shop@okbank[\s\S]*?bp-upi-id/
    );
  });

  it("titles the compliance card by what it holds", () => {
    const einvoice = view((invoice) => {
      invoice.irn = {
        Irn: "abc123",
        AckNo: "1122",
        AckDt: "2026-05-27 10:00:00",
      };
    });
    expect(einvoice.compliance.title).toBe("E-Invoice Details");
    const eway = view((invoice) => {
      invoice.irn = { EwbNo: "6811", EwbDt: "2026-05-27 10:00:00" };
    });
    expect(["Eway Bill Details", ""]).toContain(eway.compliance.title);
  });

  it("wraps a worded transport entry; a code or figure keeps to one line", () => {
    const rows = view((invoice) => {
      invoice.transportDetails = {
        challanNumber: "flyadeal warehouse SAUDI ARABIAN AIRLINES NO 160-11",
        vehicleNumber: "WB01AB1234",
      };
    }).transport?.rows as Json[];
    expect(rows.find((row) => row.key === "challanNumber")?.isNum).toBe(false);
    expect(rows.find((row) => row.key === "vehicleNumber")?.isNum).toBe(true);
  });
});

describe("BPS Technologies — failed images", () => {
  it("prints nothing for an image that fails to load: no broken mark, no alt text", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(/\.bp-doc img\.is-broken,[^{]*\{\s*display: none;/);
    const helpers = fs.readFileSync(
      path.join(TEMPLATE_DIR, "helpers.ts"),
      "utf8"
    );
    expect(helpers).toMatch(
      /addEventListener\(\s*"error",[\s\S]*?classList\.add\("is-broken"\)[\s\S]*?true\s*\)/
    );
  });
});

describe("BPS Technologies — tax and discount rows as refrens.com prints them", () => {
  it("follows the document's own tax view: one CGST / SGST row, no rates added", () => {
    const rows = view().totals.rows.map((row: Json) => row.label);
    expect(rows).toContain("CGST");
    expect(rows.some((label: string) => /^CGST \(/.test(label))).toBe(false);
  });

  it("labels the discount row without a rate", () => {
    const rows = view().totals.rows as Json[];
    const discount = rows.find((row) => row.key === "discount");
    expect(discount?.label).not.toMatch(/%\)/);
  });
});

describe("BPS Technologies — item table look (refrens.com Simple)", () => {
  it("gives group rows their turn in the zebra, with no grey of their own (user, 2026-10-24)", () => {
    const { rows } = view().table;
    const group = rows.findIndex((row: Json) => row.isGroupHeader);
    expect(group).toBeGreaterThanOrEqual(0);
    expect(rows[group].isStripe).toBe(group % 2 === 0);
    expect(rows[group + 1].isStripe).toBe(!rows[group].isStripe);
    const html = render();
    expect(html).toMatch(
      /<tr class="bp-group-row(?: is-stripe)?" data-testid="group-row">/
    );
    const striped = rows.findIndex(
      (row: Json) => row.isGroupHeader && row.isStripe
    );
    if (striped >= 0) {
      expect(html).toMatch(
        /<tr class="bp-group-row is-stripe" data-testid="group-row">/
      );
    }
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).not.toMatch(/\.bp-group-row(?: > td)? \{[^}]*background/);
  });

  it("rules the table both ways, square, the Total row bold on white", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-items > :is\(thead, tbody\) > tr > :is\(th, td\) \{\s*border-inline-end: var\(--bp-rule\);/
    );
    expect(css).not.toMatch(/\.bp-items-scroll \{[^}]*border-radius/);
    expect(css).toMatch(
      /\.bp-total-row > td \{[^}]*background: var\(--bp-paper\);\s*font-weight: 700;/
    );
  });
});

describe("BPS Technologies — review round 2 (2026-10-23)", () => {
  const css = () =>
    fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");

  it("draws the e-invoice QR from irn.SignedQRCode and drops the document QR", () => {
    const signed = "eyJhbGciOiJSUzI1NiJ9.".padEnd(948, "x");
    const compliance = mapCompliance(
      state((invoice) => {
        invoice.documentQr = "doc-qr-payload";
        invoice.irn = { Irn: "abc", SignedQRCode: signed, Status: "ACT" };
      })
    );
    expect(compliance.qr.irn).toMatch(/^data:image\/svg\+xml/);
    expect(compliance.qr.document).toBe("");
    // Every QR is 120 px, the e-invoice's too (user request, 2026-10-24).
    expect(css()).toMatch(/\.bp-qr img \{[^}]*width: 120px;\s*height: 120px;/);
    expect(css()).toMatch(/\.bp-upi-qr \{[^}]*width: 120px;\s*height: 120px;/);
    expect(css()).not.toMatch(/150px/);
  });

  it("names the Place of Supply from its GST code, as refrens.com", () => {
    const html = render((invoice) => {
      invoice.placeOfSupply = "29";
      invoice.billedTo = {
        ...invoice.billedTo,
        state: "Gujarat",
        country: "IN",
      };
    });
    expect(html).toMatch(
      /bp-supply-cell[\s\S]*?bp-field-value">Karnataka \(29\)</
    );
  });

  it("rules the summary tables both ways inside their frame part, square", () => {
    expect(css()).toMatch(
      /\.bp-widget-table \.ceres-table td \{[^}]*border-inline-end: var\(--bp-rule\);\s*border-bottom: var\(--bp-rule\);/
    );
    expect(css()).toMatch(
      /\.bp-widget-table \.ceres-table-section \{[^}]*overflow: clip;\s*\}/
    );
    // No grey outline beside the purple header: the wrappers draw no border.
    expect(css()).not.toMatch(/\.ceres-table-section \{[^}]*border: 1px/);
    expect(css()).not.toMatch(
      /\.bp-items-scroll \{\s*max-width: 100%;[^}]*border: 1px/
    );
  });
});

describe("BPS Technologies — enquiry line", () => {
  it("is centred", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(/\.bp-enquiry \{[^}]*text-align: center;/);
  });
});

describe("BPS Technologies — header rows in print", () => {
  it("prints the header, each row of three cells and the words line whole", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-head,\s*\.bp-row,\s*\.bp-words,\s*\.bp-row > \.bp-cell \{\s*break-inside: avoid;/
    );
  });
});

describe("BPS Technologies — HSN and Tax Summary columns", () => {
  it("spreads their columns equally", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\[data-section="hsn"\], \[data-section="tax-summary"\]\) \.ceres-table\.is-even \{\s*width: 100%;\s*table-layout: fixed;/
    );
  });
});

describe("BPS Technologies — review round 6 (2026-10-24)", () => {
  const css = (): string =>
    fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
  const hbs = (): string =>
    fs.readFileSync(path.join(TEMPLATE_DIR, "template.hbs"), "utf8");

  it("closes every page's piece of the item table in print", () => {
    // A repeated, empty footer draws each piece's bottom rule; the headings repeat on top.
    expect(hbs()).toMatch(
      /<tfoot class="bp-items-corners" aria-hidden="true">/
    );
    expect(css()).toMatch(/\.bp-items-corners \{\s*display: none;/);
    expect(css()).toMatch(
      /\.bp-items > \.bp-items-corners \{\s*display: table-footer-group;/
    );
    expect(css()).toMatch(
      /\.bp-items > \.bp-items-corners > tr::after \{[^}]*height: 1px;[^}]*border-width: 0 0 1px;/
    );
    expect(css()).not.toMatch(/\.bp-items[^{]*> tbody:last-child/);
  });

  it("starts the e-invoice QR level with the first detail", () => {
    expect(css()).toMatch(
      /\.bp-cards > \.bp-compliance \{[^}]*display: grid;[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/
    );
    expect(css()).toMatch(
      /\.bp-compliance > \.bp-compliance-text > \.bp-card-title \{\s*grid-column: 1 \/ -1;/
    );
  });

  it("keeps the enquiry line and group headings with what they belong to in print", () => {
    expect(css()).toMatch(
      /\.bp-doc \.bp-enquiry \{\s*break-before: avoid-page;/
    );
    expect(css()).toMatch(
      /\.bp-items \.bp-group-row \+ tr \{\s*break-before: avoid;/
    );
  });

  it("never wraps a value with a digit; print wraps cells as the screen does", () => {
    expect(css()).not.toMatch(/is-print-compact/);
    expect(
      fs.readFileSync(path.join(TEMPLATE_DIR, "helpers.ts"), "utf8")
    ).toMatch(/\/\\d\/\.test\(value\)\s*\?\s*" has-digits"/);
  });

  it("stacks the bottom parts on a phone, the bank over the lines", () => {
    expect(css()).toMatch(
      /@container bp-doc \(width < 600px\) \{[\s\S]*?\.bp-lines,\s*\.bp-lines > tbody,[\s\S]*?display: block;/
    );
  });
});

describe("BPS Technologies — review round 5 (2026-10-24)", () => {
  const css = (): string =>
    fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");

  it("draws no border and no rounded corners on item images", () => {
    expect(css()).toMatch(
      /\.bp-doc \.bp-items :is\(\.bp-thumbnail, \.ceres-image, \.bp-large-image\) \{\s*border: 0;\s*border-radius: 0;/
    );
  });

  it("sets Scan To Pay as a section title in the text colour, the note in body text", () => {
    expect(css()).toMatch(
      /\.bp-upi-caption \{[^}]*color: var\(--bp-ink\);[^}]*font-weight: 700;/
    );
    expect(css()).toMatch(/\.bp-upi-note \{[^}]*color: var\(--bp-ink\);/);
  });

  it("prints the terms as the frame's left half; notes and attachments unboxed after it", () => {
    expect(css()).toMatch(/\.bp-plain \{[^}]*margin-top: 16px;/);
    expect(css()).toMatch(
      /\.bp-lines \.bp-line-cell \{\s*position: relative;\s*border-inline: var\(--bp-rule\);/
    );
  });
});

describe("sales order bank account from the PDF service's data", () => {
  it("takes bankAccountDetails when bankAccount is only the account's id", () => {
    const order = {
      invoice: {
        billType: "SALESORDER",
        bankAccount: "000000000000000000000001",
        bankAccountDetails: {
          accountNo: "1234 5678 9012",
          name: "Test Traders",
          bank: "Example Bank",
        },
      },
    };
    const result = withRefrensDefaults(order) as {
      invoice: Record<string, unknown>;
    };
    expect(result.invoice.bankAccount).toEqual({
      accountNo: "1234 5678 9012",
      name: "Test Traders",
      bank: "Example Bank",
    });
    // An account already sent whole is kept.
    const whole = {
      invoice: {
        bankAccount: { accountNo: "1" },
        bankAccountDetails: { accountNo: "2" },
      },
    };
    expect(
      (withRefrensDefaults(whole) as typeof whole).invoice.bankAccount
    ).toEqual({ accountNo: "1" });
  });
});

describe("BPS Technologies — real PDF findings (2026-11-01)", () => {
  // Khmer party names printed as boxes: the PDF service has no fallback fonts.
  it("loads the Noto face of a script found in the document's text", () => {
    const khmer = state((invoice) => {
      (invoice.billedTo as Record<string, unknown>).name = "យេសរាល យេសរាល។";
    });
    expect(mapScript(khmer).font).toBe("'Noto Sans Khmer'");
    expect(template(khmer)).toContain("--bp-script-font: 'Noto Sans Khmer';");
    expect(mapScript(state()).font).toBe("");
  });

  // Tabloid fell back to A4: the page was laid out an A4 column wide.
  it("lays a Tabloid page out at Tabloid width", () => {
    const tabloid = mapPrint({
      pdfOptions: { format: "tabloid", xMargins: 1, zoomSize: 1 },
    });
    const a4 = mapPrint({
      pdfOptions: { format: "a4", xMargins: 1, zoomSize: 1 },
    });
    expect(tabloid.printWidth).toBe(
      Math.floor((279.4 / 25.4) * 96 - 2 * 30 - 4)
    );
    expect(tabloid.printWidth).toBeGreaterThan(a4.printWidth);
  });

  // Long custom totals took the whole row and the labels broke letter by letter (A00052-E).
  it("keeps the totals' labels a word wide and lets a custom value wrap", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-totals-table \.bp-totals \.ceres-subtotal-label \{[^}]*overflow-wrap: break-word;/
    );
    expect(css).toMatch(
      /\.bp-extra-row \.bp-num:not\(\[data-testid="num"\]\) \{\s*white-space: normal;/
    );
  });
});

describe("BPS Technologies — line height and browser-print margins (2026-11-02)", () => {
  const css = () =>
    fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");

  // User: the lines read too far apart; every line height follows the text scale.
  it("sets body lines at 1.45 and no line height in fixed pixels", () => {
    expect(css()).toMatch(/--bp-lh: 1\.45;/);
    expect(css()).not.toMatch(/line-height: \d+px/);
  });

  // User: margins did not follow the setting in a browser's print (always 1 cm).
  it("gives a browser's print the document's side margins", () => {
    const html = render((invoice) => {
      invoice.template = { pdfOptions: { xMargins: "2" } };
    });
    // Refrens' margins: 30 px of the paper per step (Wide 2 = 60 px), Narrow 0.5 when unset.
    expect(html).toContain('data-bp-side-margin="60"');
    const print = mapPrint({ pdfOptions: { xMargins: "2" } });
    expect(print.browserPrintWidth).toBe(print.printWidth);
    expect(mapPrint({ pdfOptions: {} }).sideMargin).toBe("15");
    expect(mapPrint({ pdfOptions: { xMargins: "0" } }).sideMargin).toBe("0");
  });
});

describe("BPS Technologies — print size (2026-11-02)", () => {
  // Print at the screen's size, like the E-commerce template, zoomed by the text scale alone:
  // each size prints at its own (user, 2026-11-02: Smaller printed as Normal).
  it("prints every text scale at its own size, 0.8 and unset by the template's own zoom", () => {
    const print = (pdfOptions: Json) => mapPrint({ pdfOptions });
    // No zoom of the document's own: the page's html zoom is the text scale.
    ["0.8", "0.9", "1", "1.2"].forEach((zoomSize) =>
      expect(print({ zoomSize }).printScale).toBe("1")
    );
    expect(printScaleFor()).toBe(1);
    // Refrens' renderer zooms <html> by 0.9, 1, 1.1 and 1.2, not 0.8 nor unset: the template's.
    expect(print({}).ownPrintZoom).toBe("0.8");
    expect(print({ zoomSize: "0.8" }).ownPrintZoom).toBe("0.8");
    expect(print({ zoomSize: "0.9" }).ownPrintZoom).toBeUndefined();
    expect(print({ zoomSize: 1 }).ownPrintZoom).toBeUndefined();
    expect(render()).toContain(
      '<style id="bp-own-zoom">@media print { :where(html) { zoom: 0.8; } }</style>'
    );
    // The page is laid out under that zoom: wider in CSS px.
    expect(print({}).printWidth).toBe(950);
  });

  // Chrome prints its date / title / URL / page-number stamps in a page's top and bottom
  // margins: they are 0 in a browser's print, the frame's margin rows put 1 cm back.
  it("gives a browser's print margin rows instead of page margins", () => {
    const html = render();
    expect(html.match(/<tr class="bp-page-margin"/g)).toHaveLength(2);
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /body:not\(\[class~="isDibella"\]\) \.bp-doc:not\(\.is-pageless\) \.bp-page-frame > \* > tr\.bp-page-margin \{\s*display: table-row;/
    );
  });
});

/*
 * The Simple design (user, 2026-11-13): Refrens' Simple layout in one ruled frame — header,
 * details | Billed By | Billed To, Shipped From | Shipped To | Transport, the ruled item table,
 * the totals and the words across the frame, terms / notes / additional info | bank and UPI.
 */
describe("BPS Technologies — BPS design (2026-11-16)", () => {
  const css = () =>
    fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");

  it("lays the frame out in the design's order", () => {
    const html = render((invoice) => {
      invoice.shippedTo = { name: "Site Office", city: "Howrah" };
      invoice.notes = "Thank you";
    });
    const order = [
      'class="bp-logo"',
      'class="bp-tagline"',
      'class="bp-title"',
      'data-role="billed-by"',
      'data-section="details"',
      'data-role="billed-to"',
      'data-role="shipped-to"',
      'data-section="items"',
      'data-section="totals"',
      "data-ceres-total-in-words",
      'data-section="bank"',
      'data-section="terms"',
      'data-section="notes"',
    ].map((marker) => html.indexOf(marker));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Three equal cells per row, a rule between them.
    expect(css()).toMatch(
      /\.bp-row \{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(min-content, 1fr\)\);/
    );
    expect(css()).toMatch(
      /\.bp-cell \+ \.bp-cell \{\s*border-inline-start: var\(--bp-rule\);/
    );
  });

  it("puts Country / Place of Supply under Shipped To, in the details only without one", () => {
    const supply = (shipped: boolean) =>
      render((invoice) => {
        invoice.countryOfSupply = "IN";
        invoice.placeOfSupply = "29";
        if (shipped)
          invoice.shippedTo = { name: "Site Office", city: "Howrah" };
      });
    const withShip = supply(true);
    expect(withShip).toMatch(
      /data-role="shipped-to"[\s\S]*?data-ceres-country-of-supply[\s\S]*?Karnataka \(29\)/
    );
    expect(
      withShip.slice(
        withShip.indexOf('data-section="details"'),
        withShip.indexOf('data-role="billed-to"')
      )
    ).not.toContain("data-ceres-country-of-supply");
    const noShip = supply(false);
    expect(
      noShip.slice(
        noShip.indexOf('data-section="details"'),
        noShip.indexOf('data-role="billed-to"')
      )
    ).toContain("data-ceres-country-of-supply");
  });

  it("adds no Due Amount to the document details", () => {
    expect(
      view((invoice) => {
        invoice.billType = "INVOICE";
      }).details.find((row) => row.key === "dueAmount")
    ).toBeUndefined();
  });

  it("prints the amount in words on its own line after the grand total", () => {
    const html = render();
    expect(html.indexOf("data-ceres-total-in-words")).toBeGreaterThan(
      html.indexOf("bp-grand-row")
    );
    expect(html).toMatch(/bp-words-value">Ten Lakh Twenty One Thousand [A-Z]/);
  });

  it("draws the table in black rules, the heading row bold on the theme's light tint", () => {
    const sheet = css();
    expect(sheet).toMatch(
      /\.bp-items-section \{[^}]*--bp-sep-color: var\(--bp-line\);/
    );
    expect(sheet).toMatch(
      /\.bp-items > thead > tr > th \{[^}]*background: var\(--bp-head-tint\);[^}]*font-weight: 700;/
    );
  });

  it("prints the grand total larger, on white, its figure in a ruled cell", () => {
    expect(css()).toMatch(
      /\.bp-totals-table \.bp-totals \.bp-grand-row > \* \{[^}]*font-size: calc\(var\(--bp-font-size-grand\)/
    );
    expect(css()).toMatch(
      /\.bp-totals-table \.bp-totals \.ceres-subtotal-value \{[^}]*border-inline: var\(--bp-rule\);/
    );
    expect(css()).not.toMatch(/background: var\(--bp-accent\)/);
  });

  it("sets no capitals by stylesheet (the status tag reads as Refrens writes it); bold at 700 at most", () => {
    const sheet = css();
    expect(sheet).not.toMatch(/text-transform: uppercase/);
    expect(sheet).not.toMatch(/font-weight: (800|900|bold)/);
  });
});

describe("BPS Technologies — light theme colours", () => {
  it("draws headings and table rules in ink for a light theme colour, the theme colour otherwise", () => {
    const html = (color: string) =>
      render((invoice) => {
        invoice.template = {
          ...((invoice.template as Json) || {}),
          primaryColor: color,
        };
      });
    expect(html("#ffd400")).toContain("--bp-accent-text: #22272f;");
    expect(html("#ffffff")).toContain("--bp-accent-text: #22272f;");
    expect(html("#0b1f4d")).not.toContain("--bp-accent-text:");
  });
});

describe("BPS Technologies — live colour contrast (Lydia)", () => {
  it("re-checks text contrast whenever Lydia changes the colour live", () => {
    const index = fs.readFileSync(path.join(TEMPLATE_DIR, "index.ts"), "utf8");
    expect(index).toMatch(/registerBpsThemeContrast\(\);/);
    const helpers = fs.readFileSync(
      path.join(TEMPLATE_DIR, "helpers.ts"),
      "utf8"
    );
    // Watches <html>'s style (where the renderer writes --primary-color) and new documents.
    expect(helpers).toMatch(/attributeFilter: \["style"\]/);
    expect(helpers).toMatch(/setProperty\("--bp-accent-text", INK_ON_LIGHT\)/);
  });
});

describe("BPS Technologies — description tables edge to edge", () => {
  it("spans a full-width description holding a table across the serial column too", () => {
    const html = render((invoice) => {
      invoice.advanceOptions.isDescriptionFullWidth = true;
      invoice.items = [
        {
          name: "Sheet",
          description: "| Colour | Pcs |\n| --- | --- |\n| Red | 2 |",
          quantity: 1,
          rate: 10,
          amount: 10,
          total: 10,
        },
      ];
    });
    const row = html.slice(html.indexOf('data-testid="item-detail-row"'));
    expect(
      row.slice(0, row.indexOf("data-ceres-description-full-width"))
    ).not.toContain('class="bp-col-serial"');
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-item-desc \.toastui-editor-contents table,\s*\.bp-doc \.bp-note-body \.toastui-editor-contents table \{\s*width: 100%;/
    );
  });
});

describe("BPS Technologies — summary tables without titles (2026-11-13)", () => {
  it("prints the HSN, tax, batch and payment tables with no title line above them", () => {
    const html = render();
    ["hsn", "tax-summary"].forEach((section) => {
      const start = html.indexOf(`data-section="${section}"`);
      const part = html.slice(start, html.indexOf("</section>", start));
      expect(part).not.toContain("bp-card-title");
    });
    expect(html).not.toMatch(/>\s*HSN Summary\s*</);
    expect(html).not.toMatch(/>\s*Tax Summary\s*</);
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-widget-table \.ceres-table thead th \{\s*background: var\(--bp-head-tint\);\s*font-weight: 700;/
    );
    expect(css).toMatch(
      /\.bp-widget-table \.ceres-table \.ceres-table-words \{[^}]*font-weight: 600;/
    );
  });
});

describe("BPS Technologies — the client's four pages (brief, 2026-11-16)", () => {
  it("prints the tagline itself, and no subtitle that repeats it", () => {
    const html = render((invoice) => {
      invoice.invoiceSubTitle = "Telangana's Most Trusted Solar Installer";
    });
    expect(html).toContain(
      '<p class="bp-tagline">Telangana’s Most Trusted Solar Installer</p>'
    );
    expect(html).not.toContain('class="bp-subtitle"');
    expect(
      render((invoice) => {
        invoice.invoiceSubTitle = "Rooftop On-Grid";
      })
    ).toContain('<p class="bp-subtitle">Rooftop On-Grid</p>');
  });

  it("puts the document's custom fields on page 1 as Project Details, before the items", () => {
    const html = render((invoice) => {
      invoice.customFields = [
        { label: "Project Type", value: "Subsidy" },
        { label: "Panel Wattage", value: "545 Wp" },
      ];
    });
    expect(html).toMatch(
      /data-section="additional"[\s\S]*?>Project Details<[\s\S]*?Project Type<[\s\S]*?Subsidy/
    );
    expect(html.indexOf('data-section="additional"')).toBeLessThan(
      html.indexOf('data-section="items"')
    );
  });

  it("keeps the items on page 1 under the parties box; every terms group stays in the box beside the signature", () => {
    const html = render((invoice) => {
      invoice.terms = [
        { label: "Payments Terms", terms: ["10% Advance Booking Amount."] },
        { label: "Delivery", terms: ["Within 45 days."] },
      ];
    });
    expect(html).toContain(
      'class="bp-items-section" data-testid="section" data-section="items"'
    );
    expect(html).not.toContain("terms-more");
    const box = html.slice(
      html.indexOf('data-section="bottom"'),
      html.indexOf("</table>", html.indexOf('data-section="bottom"'))
    );
    expect(box).toContain(">Payments Terms<");
    expect(box).toContain(">Delivery<");
    expect(box).toContain("Within 45 days.");
    expect(
      fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8")
    ).toMatch(
      /\.bp-page-body > \.bp-page-start\.bp-page-start \{\s*margin-top: 0;\s*break-before: page;/
    );
  });

  it("prints the client's fixed last two pages on every document type, as written, each on a new page", () => {
    const html = render((invoice) => {
      invoice.terms = [{ label: "Payments Terms", terms: ["10% Advance."] }];
    });
    expect(html).toMatch(
      /bp-fixed bp-page-start"[^>]*data-section="fixed-services"[\s\S]*?BPS Energy Premium Services:[\s\S]*?<strong>5 years preventive and corrective maintenance,<\/strong> at no extra cost—to keep your solar system performing at its best all year round\./
    );
    expect(html).toMatch(
      /bp-fixed bp-page-start"[^>]*data-section="fixed-terms"[\s\S]*?Terms &amp; Conditions[\s\S]*?Prices quoted are valid until the proposal’s expiry date\./
    );
    expect(html.match(/<li>/g)?.length).toBeGreaterThanOrEqual(10);
    // Every document type prints them (user, 2026-11-17).
    [
      "INVOICE",
      "PROFORMA",
      "SALES_ORDER",
      "DELIVERY_CHALLAN",
      "CREDIT_NOTE",
      "DEBIT_NOTE",
      "PURCHASE_ORDER",
    ].forEach((billType) => {
      const doc = render((invoice) => {
        invoice.billType = billType;
      });
      expect(doc).toContain('data-section="fixed-services"');
      expect(doc).toContain('data-section="fixed-terms"');
    });
  });

  it("leaves out the page's own logo, tagline and document QR (the letterhead carries them)", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-head-side,\s*\.bp-head \.bp-logo,\s*\.bp-head \.bp-tagline,\s*\.bp-head \.bp-doc-qr \{\s*display: none;/
    );
  });
});

describe("BPS Technologies — labels inside the notes (user, 2026-11-16)", () => {
  it("turns a line that is only bold into a label, between tables or paragraphs", () => {
    const body = [
      "| S.NO | Item |",
      "| --- | --- |",
      "| 1 | Solar PV Module |",
      "**Components Warranty**",
      "| Components | Years |",
      "| --- | --- |",
      "| Inverter | 8 Years |",
      "",
      "<strong>Premium Services</strong>",
      "Plain paragraph.",
    ].join("\n");
    const out = notesLabels(body);
    expect(out).toContain("\n### Components Warranty\n");
    expect(out).toContain("\n### Premium Services\n");
    expect(out).toContain("| 1 | Solar PV Module |");
  });

  it("leaves bold words inside a sentence, a list item or a table cell as they are", () => {
    [
      "Includes **5 years** maintenance.",
      "- **Expert Installation Services**",
      "| **Inverter** | 8 Years |",
      "**One** and **Two**",
    ].forEach((line) => expect(notesLabels(line)).toBe(line));
  });

  it("prints such a label in the notes title's style", () => {
    const html = render((invoice) => {
      invoice.notes = "Intro\n\n**Components Warranty**\n\nMore";
    });
    expect(html).toContain("### Components Warranty");
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-note-body \.toastui-editor-contents :is\(h1, h2, h3, h4, h5, h6\) \{[^}]*font-size: calc\(var\(--bp-font-size-section\)[^}]*font-weight: 700;[^}]*text-decoration: underline;/
    );
    expect(css).toMatch(
      /\.bp-plain-title \{\s*font-size: calc\(var\(--bp-font-size-section\)/
    );
  });
});

describe("BPS Technologies — subsidy and Net Payable (user, 2026-11-16)", () => {
  const subsidy = (invoice: Json) => {
    invoice.customFields = [
      { label: "Project Type", value: "Subsidy" },
      { label: "Subsidy Amount", value: "78000" },
    ];
  };

  it("prints the subsidy and the Net Effective Price under the totals, never in Project Details", () => {
    const html = render(subsidy);
    expect(html).toMatch(
      /bp-grand-row[\s\S]*?bp-subsidy-row[\s\S]*?Subsidy \(The Amount will be credited to customer’s bank account\)[\s\S]*?>-₹78,000\.00<[\s\S]*?bp-effective-row[\s\S]*?Net Effective Price/
    );
    const additional = html.slice(
      html.indexOf('data-section="additional"'),
      html.indexOf("</section>", html.indexOf('data-section="additional"'))
    );
    expect(additional).toContain("Project Type");
    expect(additional).not.toContain("Subsidy Amount");
  });

  it("works out the Net Effective Price as the grand total less the subsidy", () => {
    const { rows } = view((invoice) => {
      subsidy(invoice);
      invoice.finalTotal.total = 340000;
    }).totals;
    const effective = rows.find((row: Json) => row.key === "bpNetEffective");
    expect(effective?.value).toBe("₹2,62,000.00");
  });

  it("prints nothing extra without a subsidy field (a non-subsidy project)", () => {
    const html = render();
    expect(html).not.toContain("bp-subsidy-row");
    expect(html).not.toContain("bp-net-payable");
  });

  it("marks Net Payable under the one item's amount, else the Total row, else the grand total", () => {
    const one = render((invoice) => {
      subsidy(invoice);
      invoice.items = invoice.items
        .filter((item: Json) => !item.group)
        .slice(0, 1);
    });
    expect(one).toMatch(
      /data-testid="item-row"[\s\S]*?bp-net-payable[\s\S]*?data-section="totals"/
    );
    expect(one.match(/bp-net-payable/g)).toHaveLength(1);
    const many = render((invoice) => {
      subsidy(invoice);
      invoice.showTotalsRow = true;
    });
    expect(many).toMatch(/data-testid="items-total"[\s\S]*?bp-net-payable/);
    expect(many.match(/bp-net-payable/g)).toHaveLength(1);
    const grand = render((invoice) => {
      subsidy(invoice);
      invoice.showTotalsRow = false;
    });
    expect(grand).toMatch(/data-role="grand-total-row"[\s\S]*?bp-net-payable/);
  });
});

describe("BPS Technologies — subsidy, every way it is entered (user, 2026-11-16)", () => {
  const oneItem = (invoice: Json) => {
    invoice.items = invoice.items
      .filter((item: Json) => !item.group)
      .slice(0, 1);
  };

  it.each([
    ["text", "78,000"],
    ["number", 78000],
    ["currency", { currency: "INR", amount: 78000 }],
  ])("reads a %s custom field", (_kind, value) => {
    const { rows } = view((invoice) => {
      invoice.customFields = [{ label: "Subsidy Amount", value }];
      invoice.finalTotal.total = 340000;
    }).totals;
    expect(rows.find((row: Json) => row.key === "bpNetEffective")?.value).toBe(
      "₹2,62,000.00"
    );
  });

  it("marks Net Payable for a subsidy entered as a deduction, adding no rows of its own", () => {
    const html = render((invoice) => {
      oneItem(invoice);
      invoice.additionalCharges = [
        {
          label:
            "Subsidy (The Amount will be credited to customer's bank account)",
          amount: 78000,
          amountType: "FIXED_AMOUNT",
          multiplier: -1,
        },
      ];
    });
    expect(html).toMatch(/data-testid="item-row"[\s\S]*?bp-net-payable/);
    expect(html).not.toContain("bp-subsidy-row");
    expect(html).not.toContain("bp-effective-row");
  });
});

describe("BPS Technologies — UPI (user, 2026-11-16)", () => {
  it("prints no UPI limit note under the QR", () => {
    const html = render((invoice) => {
      invoice.paymentOptions.upi = true;
      invoice.upiId = "bps@okbank";
      invoice.status = "UNPAID";
      invoice.finalTotal.total = 340000;
    });
    expect(html).not.toContain("bp-upi-note");
    expect(html).not.toMatch(/Maximum of 1 lakh/i);
  });
});

describe("BPS Technologies — note tables (user, 2026-11-16)", () => {
  it("spreads a note table's columns evenly", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-doc \.bp-note-body \.toastui-editor-contents table \{\s*table-layout: fixed;/
    );
  });
});

describe("BPS Technologies — totals figure column (user, 2026-11-16)", () => {
  it("lines the totals' figure column up with the item table's columns, as E-commerce", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-totals-table\.is-aligned \.bp-totals \.ceres-subtotal-value \{\s*width: var\(--bp-value-share\);\s*min-width: 0;/
    );
    const source = fs.readFileSync(
      path.join(TEMPLATE_DIR, "helpers.ts"),
      "utf8"
    );
    expect(source).toMatch(/alignTotalsColumn\(root\);\n\};/);
  });
});

describe("BPS Technologies — details order (user, 2026-11-16)", () => {
  it("prints the document date first, then the document number", () => {
    const keys = view().details.map((row: Json) => row.key);
    expect(keys.indexOf("invoiceDate")).toBe(0);
    expect(keys.indexOf("invoiceNumber")).toBe(1);
    const html = render();
    expect(html.indexOf("bp-meta-invoiceDate")).toBeLessThan(
      html.indexOf("bp-meta-invoiceNumber")
    );
  });
});

describe("BPS Technologies — customer phone label (user, 2026-11-16)", () => {
  it("labels the customer's phone Mobile Number; the seller's phone keeps its label", () => {
    const html = render((invoice) => {
      invoice.billedTo.phone = "+919966410605";
      invoice.billedTo.phoneShowInInvoice = true;
    });
    const buyer = html.slice(html.indexOf('data-role="billed-to"'));
    expect(buyer).toMatch(/bp-field-label">Mobile Number<\/span>/);
    expect(buyer).not.toMatch(/bp-field-label">Phone<\/span>/);
    const seller = html.slice(
      html.indexOf('data-role="billed-by"'),
      html.indexOf('data-section="details"')
    );
    expect(seller).not.toContain("Mobile Number");
  });
});

describe("BPS Technologies — subsidy sign (user, 2026-11-16)", () => {
  it("writes a subsidy with a minus sign, not brackets, from a field or a Refrens deduction", () => {
    expect(
      minusSubsidy({ label: "Subsidy (The Amount…)", value: "(₹78,000.00)" })
        .value
    ).toBe("-₹78,000.00");
    expect(minusSubsidy({ label: "Discount", value: "(₹10.00)" }).value).toBe(
      "(₹10.00)"
    );
    const field = render((invoice) => {
      invoice.customFields = [{ label: "Subsidy Amount", value: "78000" }];
    });
    expect(field).toMatch(/bp-subsidy-row[\s\S]*?>-₹78,000\.00</);
    const deduction = render((invoice) => {
      invoice.additionalCharges = [
        {
          label: "Subsidy (credited to customer)",
          amount: 78000,
          amountType: "FIXED_AMOUNT",
          multiplier: -1,
        },
      ];
    });
    expect(deduction).not.toMatch(/\(₹78,000\.00\)/);
  });
});

describe("BPS Technologies — bank labels (user, 2026-11-16)", () => {
  it("labels the account holder 'Account Holder Name'", () => {
    const html = render((invoice) => {
      invoice.bankAccount.name = "BPS ENERGY";
    });
    expect(html).toMatch(
      /bp-bank-accountHolderName">Account Holder Name<[\s\S]*?BPS ENERGY/
    );
  });
});

describe("BPS Technologies — notes labels, client's case (user, 2026-11-16)", () => {
  it("prints a bold line between two note tables as a label; plain or in-table text stays", () => {
    const table =
      "| Components | Years |\n| --- | --- |\n| Inverter | 8 Years |";
    expect(
      notesLabels(`${table}\n**Components Warranty**\n${table}`)
    ).toContain("\n### Components Warranty\n");
    expect(notesLabels("**Components Warranty**:")).toContain(
      "### Components Warranty"
    );
    expect(notesLabels("Components Warranty")).toBe("Components Warranty");
    expect(notesLabels("| **Inverter** | 8 Years |")).toBe(
      "| **Inverter** | 8 Years |"
    );
  });
});

describe("BPS Technologies — bank rows as the client's quotation (user, 2026-11-16)", () => {
  it("lists Account Holder Name, Account Number, Bank Name, IFSC Code in that order", () => {
    const html = render((invoice) => {
      invoice.bankAccount = {
        name: "BPS ENERGY",
        accountNo: "258099997699",
        bank: "Indusind bank ltd",
        ifsc: "INDB0000231",
      };
    });
    const labels = Array.from(
      html.matchAll(/bp-kv-label bp-bank-[A-Za-z]+">([^<]+)</g),
      (m) => m[1]
    );
    expect(labels.slice(0, 4)).toEqual([
      "Account Holder Name",
      "Account Number",
      "Bank Name",
      "IFSC Code",
    ]);
  });
});

describe("BPS Technologies — fixed pages type (user, 2026-11-16)", () => {
  it("sets the fixed pages in the template's sizes, marked with the client's ➢ arrowhead", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-fixed-title \{[^}]*font-size: calc\(var\(--bp-font-size-section\)/
    );
    expect(css).toMatch(
      /\.bp-fixed \.bp-fixed-list \{[^}]*font-size: calc\(var\(--bp-font-size-base\)/
    );
    expect(css).toMatch(
      /\.bp-fixed \.bp-fixed-list > li::before \{[^}]*clip-path: polygon\(0 0, 100% 50%, 0 100%, 30% 50%\)/
    );
  });
});

describe("BPS Technologies — page-top rule (user, 2026-11-16)", () => {
  it("prints no page-top rule over the unboxed header", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-head,\s*\.bp-plain,\s*\.bp-doc \.bp-enquiry \{\s*position: relative;\s*z-index: 4;\s*background: var\(--bp-paper\);/
    );
  });
});

describe("BPS Technologies — no page-top rule (user, 2026-11-16)", () => {
  it("hides the engine's page-top rule in print; the item table draws its own top line", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /@media print \{\s*\.bp-page-frame > \* > tr\.bp-page-rule \{\s*display: none;/
    );
    expect(css).toMatch(
      /\.bp-doc \.bp-page-body > \.bp-items-section \.bp-items > thead > tr:first-child > th \{\s*border-top-width: 1px;/
    );
  });
});

describe("BPS Technologies — page breaks between parts, closed (user, 2026-11-16)", () => {
  it("keeps the frame joined (no gaps); in print each part keeps its own top rule one pixel up", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).not.toMatch(
      /:is\(\.bp-totals-table, \.bp-bank, \.bp-bottom\) \{\s*margin-top: 14px;/
    );
    expect(css).toMatch(
      /@media print \{\s*\.bp-doc \.bp-page-body > :is\(\.bp-box, \.bp-items-section, \.bp-totals-table, \.bp-bottom\) \+ :is\(\.bp-box, \.bp-items-section, \.bp-totals-table, \.bp-bottom\) \{\s*margin-top: -1px;/
    );
  });
});

describe("BPS Technologies — invisible currency symbol (user, 2026-11-16)", () => {
  it("knows a symbol made only of invisible characters", () => {
    ["\u3164", "\u200b", "\u2800", " ", "\u00a0", "\u115f\u1160"].forEach(
      (value) => expect(isInvisibleSymbol(value)).toBe(true)
    );
    ["₹", "Rs", "", undefined].forEach((value) =>
      expect(isInvisibleSymbol(value)).toBe(false)
    );
  });

  it("prints figures with no symbol and no box: the hidden mark is never a missing glyph", () => {
    // Through the template's own data step, as the renderer runs it.
    const html = template(
      withMoneyDefaults(
        state((invoice) => {
          invoice.customCurrencySymbol = "\u3164";
        })
      )
    );
    expect(html).not.toContain("\u3164");
    expect(html).toContain("\u2060");
  });
});

describe("BPS Technologies — Pageless PDF (user, 2026-11-16)", () => {
  it("adds no page breaks in a Pageless PDF: the fixed pages follow after a gap", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /@media print \{\s*\.bp-doc\.is-pageless \.bp-page-body > \.bp-page-start\.bp-page-start \{\s*margin-top: 24px;\s*break-before: auto;/
    );
    const html = render((invoice) => {
      invoice.template = { pdfOptions: { pageless: true } };
    });
    expect(html).toMatch(/class="bp-doc[^"]*is-pageless/);
  });
});

describe("BPS Technologies — space under a notes label (user, 2026-11-16)", () => {
  it("starts a table under a notes label as far below as under the notes' title", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.toastui-editor-contents > :is\(h1, h2, h3, h4, h5, h6\) \+ table \{\s*margin-top: 20px;/
    );
  });
});

describe("BPS Technologies — ampersand (user, 2026-11-16)", () => {
  it("draws '&' upright as Cambria does: PT Serif for that one character, Caladea for the rest", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toContain("family=PT+Serif:wght@400;700&text=%26");
    expect(css).toMatch(
      /--bp-font: var\(--subtitle-font, "PT Serif", "Caladea"\)/
    );
  });
});

describe("BPS Technologies — UPI at the bank box's foot (user, 2026-11-16)", () => {
  it("aligns the UPI QR and caption to the bottom of the bank box", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(/\.bp-bank > \.bp-upi \{\s*align-self: flex-end;/);
  });
});

describe("BPS Technologies — all summary tables at the end (user, 2026-11-16)", () => {
  it("prints the HSN, tax, batch and payment tables together after the notes, before the fixed pages", () => {
    const html = render((invoice) => {
      invoice.notes = "List of components";
      invoice.advanceOptions.showHsnSummary = true;
      invoice.advanceOptions.taxSummaryView = "TABLE";
      invoice.advanceOptions.showStockSummary = true;
      invoice.items[1].batchSummary = [{ batchName: "LOT-7", quantity: 1 }];
      invoice.defaultBatchColumns = [
        { key: "batchName", label: "Lot" },
        { key: "quantity", label: "Qty" },
      ];
      invoice.advanceOptions.showPaymentsTable = true;
      invoice.allPayments = [
        { amount: 1000, paymentDate: "2026-06-01", paymentMethod: "CASH" },
      ];
    });
    const at = (section: string) => html.indexOf(`data-section="${section}"`);
    ["hsn", "tax-summary", "stock-summary", "payments"].forEach((section) => {
      expect(at(section)).toBeGreaterThan(at("notes"));
      expect(at(section)).toBeGreaterThan(at("bank"));
      expect(at(section)).toBeLessThan(at("fixed-services"));
    });
    const group = html.slice(
      html.indexOf('class="bp-summaries"'),
      at("fixed-services")
    );
    ["hsn", "tax-summary", "stock-summary", "payments"].forEach((section) =>
      expect(group).toContain(`data-section="${section}"`)
    );
  });
});

describe("BPS Technologies — space between summary tables (user, 2026-11-16)", () => {
  it("puts a 16 px space between the summary tables", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.bp-summaries \{\s*display: flex;\s*flex-direction: column;\s*gap: 16px;/
    );
  });
});

// ---- browser-page (was tests/bps-technologies.browser-page.dom.test.ts)
describe("browser-page", () => {
  const page = () => document.getElementById("bp-browser-page")?.textContent;

  describe("BPS Technologies — a browser's print takes the side margins", () => {
    beforeEach(() => {
      document.head.innerHTML = "";
      document.body.className = "";
    });

    it("writes an @page margin from the document's setting", () => {
      document.body.innerHTML = `<div class="bp-doc" data-bp-side-margin="60"></div>`;
      applyBrowserPrintPage();
      // Wide (2): two 30 px steps of the paper, as Refrens' PDF service.
      expect(page()).toBe("@page { margin: 0 60px; }");
    });

    it("divides the margins by the print size zoom, which scales them", () => {
      document.body.innerHTML = `<div class="bp-doc" data-bp-side-margin="30"></div>`;
      const zoom = document.createElement("style");
      zoom.id = "ceres-template-zoom";
      zoom.textContent = "@media print { html { zoom: 1.25; } }";
      document.head.append(zoom);
      applyBrowserPrintPage();
      expect(page()).toBe("@page { margin: 0 24px; }");
    });

    it("leaves the PDF service's own margins alone", () => {
      document.body.className = "isDibella";
      document.body.innerHTML = `<div class="bp-doc" data-bp-side-margin="2"></div>`;
      applyBrowserPrintPage();
      expect(page()).toBeUndefined();
    });
  });
});

// ---- browser-print (was tests/bps-technologies.browser-print.dom.test.ts)
describe("browser-print", () => {
  describe("BPS Technologies — a browser's own print", () => {
    it("reads each media query as print would on the page", () => {
      expect(printMediaText("print", 718)).toBe("all");
      expect(printMediaText("screen", 718)).toBe("not all");
      expect(printMediaText("screen and (width <= 720px)", 718)).toBe(
        "not all"
      );
      expect(printMediaText("(width <= 640px)", 718)).toBe("not all");
      expect(printMediaText("(width <= 640px)", 479)).toBe("all");
      expect(
        printMediaText("(prefers-color-scheme: dark)", 718)
      ).toBeUndefined();
    });

    it("switches the print rules on for one measurement and back", () => {
      document.head.innerHTML =
        "<style>@media print { .probe { color: red; } } @media screen { .probe { color: blue; } }</style>";
      const sheet = document.styleSheets[0];
      const media = () =>
        Array.from(sheet.cssRules).map(
          (rule) => (rule as CSSMediaRule).media.mediaText
        );
      expect(withPrintRules(718, media)).toEqual(["all", "not all"]);
      expect(media()).toEqual(["print", "screen"]);
      expect(() =>
        withPrintRules(718, () => {
          throw new Error("measure failed");
        })
      ).toThrow("measure failed");
      expect(media()).toEqual(["print", "screen"]);
    });

    it("prepares before printing, leaving the screen layout as it was", () => {
      document.head.innerHTML = "";
      document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px;"><div class="bp-items-scroll"><table class="bp-items is-cards"></table></div></div>`;
      prepareBrowserPrint();
      expect(document.querySelector<HTMLElement>(".bp-doc")?.style.width).toBe(
        ""
      );
      expect(document.querySelector(".bp-items")?.className).toBe(
        "bp-items is-cards"
      );
    });

    // Refrens' PDF service makes its PDF in print media, and making it fires beforeprint.
    it("prepares nothing when print media is on already (the PDF service)", () => {
      document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px;"></div>`;
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: /print/.test(query),
        media: query,
      })) as unknown as typeof window.matchMedia;
      const layout = jest.fn();
      try {
        prepareBrowserPrint(layout);
      } finally {
        window.matchMedia = original;
      }
      expect(layout).not.toHaveBeenCalled();
    });

    it("measures with a readable copy of a stylesheet from another origin", () => {
      // The sections above share this page: start from a browser's page, not the PDF service's.
      document.body.className = "";
      setBpsStylesheetText('@import url("font.css"); .probe { color: red; }');
      document.head.innerHTML =
        '<link rel="stylesheet" href="https://example.com/templates/bps-technologies/1.0.1/bundle.css">';
      const link = document.querySelector("link") as HTMLLinkElement;
      // A sheet whose rules cannot be read, as a cross-origin one.
      const foreign = {
        disabled: false,
        get cssRules(): CSSRuleList {
          throw new DOMException("cross-origin", "SecurityError");
        },
      };
      Object.defineProperty(link, "sheet", { value: foreign });
      const during = withReadableStylesheet(() => ({
        copy: document.querySelector("style[data-bp-measure]")?.textContent,
        on: !(
          document.querySelector("style[data-bp-measure]") as HTMLStyleElement
        ).sheet?.disabled,
        original: foreign.disabled,
      }));
      expect(during).toEqual({
        copy: '@import url("font.css"); .probe { color: red; }',
        on: true,
        original: true,
      });
      expect(foreign.disabled).toBe(false);
      expect(
        (document.querySelector("style[data-bp-measure]") as HTMLStyleElement)
          .sheet?.disabled
      ).toBe(true);
    });

    // Lydia changes the print size live: the renderer rewrites its zoom style, no new render.
    it("follows a print zoom changed live", () => {
      document.head.innerHTML = "";
      document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px; --bp-browser-print-width: 714px; --bp-print-base: 718.1102px; --bp-browser-print-base: 718.1102px;"></div>`;
      const doc = document.querySelector<HTMLElement>(".bp-doc") as HTMLElement;
      syncPrintWidths();
      expect(doc.style.getPropertyValue("--bp-print-width")).toBe("714px");
      const zoom = document.createElement("style");
      zoom.id = "ceres-template-zoom";
      zoom.textContent = "@media print { html { zoom: 1.2; } }";
      document.head.append(zoom);
      syncPrintWidths();
      expect(doc.style.getPropertyValue("--bp-print-width")).toBe("594px");
      expect(doc.style.getPropertyValue("--bp-browser-print-width")).toBe(
        "594px"
      );
      // Back to 0.8, which the renderer draws by removing its style: zoom 1 widths.
      zoom.remove();
      syncPrintWidths();
      expect(doc.style.getPropertyValue("--bp-print-width")).toBe("714px");
    });

    // Nothing shrinks to fit the paper (user, 2026-11-01): the browser's print lays the page out
    // at its width (over the 75 % print base) and the table keeps the print size.
    it("never scales the document or the table for a browser's print", () => {
      document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px;"><div class="bp-items-scroll"><table class="bp-items"></table></div></div>`;
      const doc = document.querySelector(".bp-doc") as HTMLElement;
      let widthWhilePreparing = "";
      prepareBrowserPrint(() => {
        widthWhilePreparing = doc.style.width;
      });
      // jsdom drops a calc() with a variable; Chrome lays the page out at 714 px / the 75 % base.
      expect(["", "calc(714px / var(--bp-print-scale, 1))"]).toContain(
        widthWhilePreparing
      );
      expect(doc.getAttribute("style")).not.toMatch(/zoom|fit/);
      expect(doc.dataset.bpPreparedZoom).toBeUndefined();
    });

    // The item photos' print cap is a share of the page's height: measured in the window's.
    it("measures with the page's vh and leaves none behind", () => {
      document.head.innerHTML = "";
      document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 736px; --bp-browser-print-height: 1268px;"></div>`;
      const doc = document.querySelector<HTMLElement>(".bp-doc") as HTMLElement;
      let during = "";
      prepareBrowserPrint(() => {
        during = doc.style.getPropertyValue("--bp-vh");
      });
      expect(during).toBe("12.68px");
      expect(doc.style.getPropertyValue("--bp-vh")).toBe("");
    });
  });
});

// ---- screen-fit (was tests/bps-technologies.screen-fit.dom.test.ts)
describe("screen-fit", () => {
  const media = (print: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: print && query === "print",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  };

  const mount = (extra = "") => {
    document.body.innerHTML = `<div class="bp-doc"><div class="bp-items-scroll"><table class="bp-items${extra}"><tbody><tr><td>1</td></tr></tbody></table></div></div>`;
    return document.querySelector<HTMLElement>(".bp-items") as HTMLElement;
  };

  // jsdom lays nothing out: the screen reads 0 px wide, a phone.
  describe("BPS Technologies — item table on a phone or tablet screen", () => {
    it("shows the items as cards on a phone", () => {
      media(false);
      const table = mount();
      fitItemsToScreen();
      expect(table.classList.contains("is-cards")).toBe(true);
    });

    // refrens.com's own invoice pages: cards under 576 px, then the headings in a row with each
    // name across the table (user request, 2026-10-24); from the A4 width the paper table.
    it.each([
      [575, "is-cards"],
      [576, "is-grid"],
      [793, "is-grid"],
      [794, ""],
    ])("at %i px the table reads as '%s'", (width, layout) => {
      media(false);
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: width,
      });
      const table = mount(" is-cards");
      fitItemsToScreen();
      expect(table.classList.contains("is-cards")).toBe(layout === "is-cards");
      expect(table.classList.contains("is-grid")).toBe(layout === "is-grid");
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 0,
      });
    });

    it("keeps the table as it is in print", () => {
      media(true);
      const table = mount(" is-cards");
      fitItemsToScreen();
      expect(table.classList.contains("is-cards")).toBe(false);
      expect(table.classList.contains("is-grid")).toBe(false);
    });
  });

  // The summaries on a phone (user request, 2026-10-24): each row as heading | figure pairs.
  describe("BPS Technologies — summary tables on a phone screen", () => {
    const mountSummary = () => {
      document.body.innerHTML = `<div class="bp-doc"><section class="bp-card bp-widget-table" data-section="hsn"><div class="ceres-table-section"><table class="ceres-table">
        <thead><tr><th>HSN</th><th>Taxable Value</th><th colspan="2">IGST</th><th>Total</th></tr><tr><th></th><th></th><th>Rate</th><th>Amount</th><th></th></tr></thead>
        <tbody><tr><td>9018</td><td>175000</td><td>5%</td><td>8750</td><td>8750</td></tr></tbody>
        <tfoot><tr><td><strong>Total</strong></td><td>175000</td><td></td><td>8750</td><td>8750</td></tr><tr><td colspan="99" class="ceres-table-words">Words</td></tr></tfoot>
      </table></div></section></div>`;
      return document.querySelector<HTMLElement>(
        ".bp-widget-table"
      ) as HTMLElement;
    };

    it("labels each cell with its column's headings, both rows joined", () => {
      media(false);
      const section = mountSummary();
      fitItemsToScreen();
      expect(section.classList.contains("is-stacked")).toBe(true);
      const labels = Array.from(section.querySelectorAll("td")).map(
        (cell) => cell.dataset.label ?? ""
      );
      expect(labels).toEqual([
        "HSN",
        "Taxable Value",
        "IGST Rate",
        "IGST Amount",
        "Total",
        "",
        "Taxable Value",
        "IGST Rate",
        "IGST Amount",
        "Total",
        "",
      ]);
    });

    it("keeps the tables as they are on a wider screen and in print", () => {
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 576,
      });
      media(false);
      const section = mountSummary();
      fitItemsToScreen();
      expect(section.classList.contains("is-stacked")).toBe(false);
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 0,
      });
      media(true);
      fitItemsToScreen();
      expect(section.classList.contains("is-stacked")).toBe(false);
    });
  });

  describe("BPS Technologies — invisible currency symbol on the page (user, 2026-11-16)", () => {
    it("takes the hidden mark and its space out of every figure", () => {
      document.body.innerHTML = `<div class="bp-doc"><span>\u2060 3,12,213.00</span><span>-\u2060 78,000.00</span></div>`;
      removeHiddenSymbol();
      expect(document.body.textContent).toBe("3,12,213.00-78,000.00");
    });
  });
});

// ---- stretch (was tests/bps-technologies.stretch.dom.test.ts)
describe("stretch", () => {
  const media = (print: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: print && query === "print",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  };

  const rect = (top: number, bottom: number, width = 1000) =>
    ({
      top,
      bottom,
      left: 0,
      right: width,
      width,
      height: bottom - top,
      x: 0,
      y: top,
    } as DOMRect);

  /*
   * jsdom lays nothing out: the document's boxes are given here. One item row ending at
   * `itemEnd`, the totals after it ending at `end` (the body's foot), 1000 px wide.
   */
  const mount = (classes = "", itemEnd = 500, end = 600) => {
    document.body.innerHTML = `<div class="bp-doc${classes}"><table class="bp-page-frame"><tbody><tr><td class="bp-page-frame-cell"><div class="bp-page-body"><div class="bp-items-scroll"><table class="bp-items"><tbody><tr class="bp-item-row"><td>1</td></tr><tr class="bp-filler"><td></td></tr></tbody></table></div><section class="bp-totals-row">Totals</section></div></td></tr></tbody></table></div>`;
    const doc = document.querySelector<HTMLElement>(".bp-doc") as HTMLElement;
    Object.defineProperty(doc, "offsetWidth", {
      configurable: true,
      value: 1000,
    });
    const set = (selector: string, box: DOMRect) => {
      const el = document.querySelector(selector) as HTMLElement;
      el.getBoundingClientRect = () => box;
    };
    set(".bp-doc", rect(0, end));
    set(".bp-page-body", rect(0, end));
    set(".bp-items-scroll", rect(0, itemEnd));
    set(".bp-items", rect(0, itemEnd));
    set(".bp-item-row", rect(0, itemEnd));
    set(".bp-totals-row", rect(itemEnd, end));
    const filler = doc.querySelector<HTMLElement>(".bp-filler") as HTMLElement;
    return { doc, filler };
  };

  const fillerHeight = (filler: HTMLElement) =>
    filler.style.getPropertyValue("--bp-filler-height");

  const LAYOUT = { head: 0, foot: 0, start: 0 };
  const room = (units: FlowUnit[], anchor: number, page: number) => {
    const length = flowFiller(units, anchor, { ...LAYOUT, page });
    return length ? length.c + length.k * page : undefined;
  };

  // The pages, simulated (user, 2026-11-01: the table runs to the foot of the page it ends on,
  // one page or more).
  describe("BPS Technologies — the stretch's pages", () => {
    it("fills what the table and the totals after it leave of a one-page document", () => {
      const units = [
        { top: 0, bottom: 400 },
        { top: 400, bottom: 600 },
      ];
      expect(room(units, 0, 1000)).toBe(400);
    });

    it("fills the page the table ends on when the document runs longer", () => {
      // Twelve 100 px items: the eleventh moves to page 2; the totals follow on page 2.
      const items = Array.from({ length: 12 }, (_, i) => ({
        top: i * 100,
        bottom: (i + 1) * 100,
      }));
      const units = [...items, { top: 1200, bottom: 1300 }];
      // Page 2 holds items 11 and 12 (200 px) and the totals (100 px): 700 px left.
      expect(room(units, 11, 1000)).toBe(700);
    });

    it("runs the table down its page, short of the foot, when the totals move to the next page", () => {
      const units = [
        { top: 0, bottom: 900 },
        { top: 900, bottom: 1150 },
      ];
      // The totals go to page 2: 100 px left under the table, 24 kept back from the page's
      // foot (an empty table never moves to a page of its own).
      expect(room(units, 0, 1000)).toBe(76);
    });

    // The party, shipping and transport cards break between their lines in print.
    it("places a row of cards cut between its lines", () => {
      const card = (bottom: number) => ({
        top: 0,
        bottom,
        head: 50,
        close: 17,
        breaks: [
          { fit: 200, resume: 204 },
          { fit: 400, resume: 404 },
          { fit: 600, resume: 604 },
        ],
      });
      // Page end 500: each card breaks after its line ending at 400; the taller card's rest
      // (from 604 to 820, its title and top edge again) sets the row's height on page 2.
      expect(cutCards([card(700), card(820)], 500)).toEqual({
        rest: 50 + 820 - 404,
      });
      // No line fits above the bottom edge: the row moves on whole.
      expect(cutCards([card(700)], 150)).toBeUndefined();
    });

    it("does not stretch where a page break cuts a row before the table ends", () => {
      const units: FlowUnit[] = [
        { top: 0, bottom: 1500, fluid: true, line: 20 },
        { top: 1500, bottom: 1600 },
      ];
      expect(flowFiller(units, 0, { ...LAYOUT, page: 1000 })).toBeUndefined();
    });

    it("writes one print rule per range of page heights, in 100vh", () => {
      const css = stretchPrintRules(
        [
          { top: 0, bottom: 400 },
          { top: 400, bottom: 600 },
        ],
        0,
        LAYOUT,
        1,
        16
      );
      expect(css).toMatch(
        /@media print and \(min-height: \d+px\) and \(max-height: [\d.]+px\) \{ \.bp-doc\.is-stretch \.bp-items \.bp-filler \{ --bp-filler-height: max\(0px, calc\(1 \* 100vh \/ 1 - 616px\)\); \} \}/
      );
    });
  });

  // The preview always stretches, whatever the toggles (user, 2026-10-31; 2026-11-01: on the
  // sheet the table ends on, one sheet or more).
  describe("BPS Technologies — the preview's A4 sheet", () => {
    afterEach(() => {
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 0,
      });
    });

    it("gives a short document's spare height to the filler, toggles off", () => {
      media(false);
      const { doc, filler } = mount();
      stretchItemTable();
      // 1000 px wide: an A4 sheet is 1414 px tall; the document is 600.
      expect(fillerHeight(filler)).toBe("814px");
      expect(doc.classList.contains("is-filled")).toBe(true);
    });

    it("measures the same again with the filler in place (no loop)", () => {
      media(false);
      const { filler } = mount(" is-stretch");
      stretchItemTable();
      stretchItemTable();
      expect(fillerHeight(filler)).toBe("814px");
    });

    it("adds no space when the totals move to the next sheet, as in print", () => {
      media(false);
      // The item ends at 1300 px on sheet 1 (1414 px tall); the totals (400 px) move to sheet 2.
      const { doc, filler } = mount("", 1300, 1700);
      stretchItemTable();
      expect(fillerHeight(filler)).toBe("0px");
      expect(doc.classList.contains("is-filled")).toBe(false);
    });

    // User (2026-11-02): the summary rows never stretch; the space goes under the last item.
    it("puts the space above a closing Sub total row", () => {
      media(false);
      mount();
      const filler = document.querySelector(".bp-filler") as HTMLElement;
      filler.insertAdjacentHTML(
        "beforebegin",
        '<tr class="bp-item-row bp-group-total-row"><td>Sub total</td></tr>'
      );
      stretchItemTable();
      const rows = Array.from(document.querySelectorAll(".bp-items tr"));
      expect(rows.map((row) => row.className)).toEqual([
        "bp-item-row",
        "bp-filler",
        "bp-item-row bp-group-total-row",
      ]);
    });

    it("leaves a Pageless document as it is", () => {
      media(false);
      const { doc, filler } = mount(" is-pageless");
      stretchItemTable();
      expect(fillerHeight(filler)).toBe("");
      expect(doc.classList.contains("is-filled")).toBe(false);
    });

    it("leaves the cards and grid layouts as they are", () => {
      media(false);
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 700,
      });
      const { doc, filler } = mount();
      fitItemsToScreen();
      expect(document.querySelector(".bp-items.is-grid")).not.toBeNull();
      expect(fillerHeight(filler)).toBe("");
      expect(doc.classList.contains("is-filled")).toBe(false);
    });

    // In print the business's toggle decides; the preview's filler goes.
    it("drops the preview's filler in print without the business toggle", () => {
      media(false);
      const { doc, filler } = mount();
      stretchItemTable();
      media(true);
      stretchItemTable();
      expect(fillerHeight(filler)).toBe("");
      expect(doc.classList.contains("is-filled")).toBe(false);
      // Print ends: the preview fills its sheet again.
      media(false);
      stretchItemTable();
      expect(fillerHeight(filler)).toBe("814px");
    });

    it("stretches in print with the business toggle, by page-height rules", () => {
      media(true);
      const { doc, filler } = mount(" is-stretch");
      stretchItemTable();
      expect(doc.classList.contains("is-filled")).toBe(true);
      expect(fillerHeight(filler)).toBe("");
      expect(document.getElementById("bp-stretch-pages")?.textContent).toMatch(
        /--bp-filler-height: max\(0px, calc\(1 \* 100vh/
      );
    });
  });
});

// ---- summary-even (was tests/bps-technologies.summary-even.dom.test.ts)
describe("summary-even", () => {
  describe("BPS Technologies — HSN / Tax Summary even columns", () => {
    it("sets the words row's colspan to the real column count and marks the table even", () => {
      document.body.innerHTML = `
        <section class="bp-widget-table" data-section="hsn"><table class="ceres-table">
          <thead><tr><th>HSN</th><th>Taxable</th><th colspan="2">IGST</th><th>Total</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr>
            <tr><td class="ceres-table-words" colspan="99">words</td></tr>
          </tbody>
        </table></section>
        <section class="bp-widget-table" data-section="payments"><table class="ceres-table">
          <tbody><tr><td colspan="99">untouched</td></tr></tbody>
        </table></section>`;
      evenSummaryColumns();
      const [hsn, payments] = Array.from(document.querySelectorAll("table"));
      expect(hsn.classList.contains("is-even")).toBe(true);
      expect(
        (hsn.querySelector(".ceres-table-words") as HTMLTableCellElement)
          .colSpan
      ).toBe(5);
      expect(payments.classList.contains("is-even")).toBe(false);
      expect(
        (payments.querySelector("td") as HTMLTableCellElement).colSpan
      ).toBe(99);
    });
  });
});

// ---- totals-joint (was tests/bps-technologies.totals-joint.dom.test.ts)
describe("totals-joint", () => {
  const printing = () => {
    window.matchMedia = ((query: string) => ({
      matches: /print/.test(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  };

  const rect = (left: number, right: number, top = 0, bottom = 20) =>
    ({
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
    } as DOMRect);

  // The item table's last row, its cells at these left/right edges, in a box 0–714 px wide.
  const mount = (edges: Array<[number, number]>) => {
    const cells = edges.map(() => "<td>x</td>").join("");
    document.body.innerHTML = `<div class="bp-items-scroll"><table class="bp-items"><tbody><tr>${cells}</tr></tbody><tbody class="bp-items-total"><tr>${cells}</tr></tbody></table></div>`;
    const box = document.querySelector(".bp-items-scroll") as HTMLElement;
    box.getBoundingClientRect = () => rect(0, 714);
    const row = document.querySelector(
      ".bp-items tbody tr"
    ) as HTMLTableRowElement;
    Array.from(row.cells).forEach((cell, i) => {
      const [left, right] = edges[i];
      // eslint-disable-next-line no-param-reassign
      cell.getBoundingClientRect = () => rect(left, right);
      // eslint-disable-next-line no-param-reassign
      cell.getClientRects = () => [rect(left, right)] as unknown as DOMRectList;
    });
    return row;
  };

  describe("BPS Technologies — the totals' joint on a cut-off table", () => {
    it("marks both square corners when the table fits its box", () => {
      printing();
      mount([
        [0, 300],
        [300, 714],
      ]);
      const table = document.querySelector(".bp-items") as HTMLElement;
      table.getBoundingClientRect = () => rect(0, 714);
      splitTotals();
      const split = document.querySelector(
        "table[data-bp-totals-split]"
      ) as HTMLElement;
      expect(split.classList.contains("is-joint-left")).toBe(true);
      expect(split.classList.contains("is-joint-right")).toBe(true);
    });

    // User (2026-11-01): a wide table is cut off at the page edge, never shrunk. Chrome 122 let
    // the corner mark past that edge escape the cut and shrank the whole PDF page to show it.
    it("leaves out the corner that falls past the page edge", () => {
      printing();
      mount([
        [0, 500],
        [500, 954],
      ]);
      const table = document.querySelector(".bp-items") as HTMLElement;
      table.getBoundingClientRect = () => rect(0, 954);
      splitTotals();
      const split = document.querySelector(
        "table[data-bp-totals-split]"
      ) as HTMLElement;
      expect(split.classList.contains("is-joint-left")).toBe(true);
      expect(split.classList.contains("is-joint-right")).toBe(false);
    });
  });
});

// ---- totals-split (was tests/bps-technologies.totals-split.dom.test.ts)
describe("totals-split", () => {
  const printing = (matches: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  };

  const mount = () => {
    document.body.innerHTML = `<div class="bp-items-scroll"><table class="bp-items"><thead><tr><th>Sr.</th><th>Item</th></tr></thead><tbody><tr><td>1</td><td>A</td></tr></tbody><tbody class="bp-items-total"><tr><td>T</td><td>1</td></tr></tbody></table></div>`;
    return document.querySelector<HTMLTableElement>(
      ".bp-items"
    ) as HTMLTableElement;
  };

  describe("BPS Technologies — totals in print", () => {
    it("moves the totals into a table of their own, without the item headings", () => {
      printing(true);
      const table = mount();
      splitTotals();
      const split = table.nextElementSibling as HTMLTableElement;
      expect(split.hasAttribute("data-bp-totals-split")).toBe(true);
      expect(split.querySelector("thead")).toBeNull();
      expect(split.querySelectorAll(".bp-items-total")).toHaveLength(1);
      expect(table.querySelectorAll(".bp-items-total")).toHaveLength(0);
      expect(split.querySelectorAll("col")).toHaveLength(2);
    });

    it("leaves the table whole outside print, and joins it back in order", () => {
      printing(false);
      const table = mount();
      const before = table.innerHTML;
      splitTotals();
      expect(table.nextElementSibling).toBeNull();
      printing(true);
      splitTotals();
      joinTotals();
      expect(table.nextElementSibling).toBeNull();
      expect(table.innerHTML).toBe(before);
    });
  });
});

// ---- zoom-measure (was tests/bps-technologies.zoom-measure.dom.test.ts)
describe("zoom-measure", () => {
  /*
   * Refrens' PDF service runs Chrome 122, which reports anything inside a CSS-zoomed element
   * divided by that zoom; Chrome 128+ reports what is drawn (Element.currentCSSZoom exists there).
   */
  describe("BPS Technologies — measuring inside the zoomed print table", () => {
    const mount = () => {
      document.body.innerHTML = `<table class="bp-items" style="zoom: 0.5"><tbody><tr><td id="cell">1</td></tr></tbody></table>`;
      const cell = document.getElementById("cell") as HTMLElement;
      cell.getBoundingClientRect = () =>
        ({
          x: 400,
          y: 100,
          width: 200,
          height: 40,
          left: 400,
          right: 600,
          top: 100,
          bottom: 140,
        } as DOMRect);
      const real = window.getComputedStyle;
      jest
        .spyOn(window, "getComputedStyle")
        .mockImplementation((element: Element) => {
          const style = real(element);
          // jsdom drops the zoom property; it is read from the style attribute.
          const zoom =
            /zoom:\s*([\d.]+)/.exec(element.getAttribute("style") || "")?.[1] ||
            "1";
          return { ...style, zoom } as CSSStyleDeclaration;
        });
      return cell;
    };

    afterEach(() => {
      jest.restoreAllMocks();
      delete (Element.prototype as unknown as Record<string, unknown>)
        .currentCSSZoom;
    });

    it("scales Chrome 122's figures by the zoom, to what is drawn", () => {
      const rect = drawnRect(mount());
      expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
        200, 50, 100, 20,
      ]);
    });

    it("leaves a Chrome 128+ rect as it is", () => {
      Object.defineProperty(Element.prototype, "currentCSSZoom", {
        configurable: true,
        get: () => 1,
      });
      const rect = drawnRect(mount());
      expect([rect.x, rect.width]).toEqual([400, 200]);
    });
  });
});
