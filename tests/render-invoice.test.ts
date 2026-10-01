/**
 * @jest-environment jsdom
 */
// MarkdownViewer (one of the widgets basic-invoice-example registers) reads
// `document`/`window.location` at import time to kick off its async ToastUI
// load; under the default node environment those are undefined and the
// resulting rejection crashes the whole worker. jsdom gives it a real origin
// to resolve its relative fetch against instead.
import fixture from "./fixtures/columns-basic.json";

// The template bundle and every widget it imports reach Handlebars through
// `window.Handlebars`, exactly as it happens in the browser (see
// webpack.config.js's `externals` mapping). Pointing that at the very
// `handlebars/runtime` singleton the .hbs jest transform requires keeps both
// sides talking to the same helper/partial registry. Using `require` (rather
// than a typed `import`) avoids pulling handlebars/runtime's ambient .d.ts —
// which redeclares a global `Handlebars` — into the program.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Handlebars = require("handlebars/runtime");

(window as any).Handlebars = Handlebars;

// Importing the template module runs its registrations (widgets + helpers)
// and assigns window.CeresTemplate / window.CeresTemplateDataMapper, mirroring
// what the real renderer (src/main/index.ts) loads from the built bundle.
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("../src/templates/basic-invoice-example");

const renderFixture = (payload: unknown): string => {
  const mapper = (window as any).CeresTemplateDataMapper;
  const template = (window as any).CeresTemplate;
  const mapped = mapper(payload);
  (window as any).ceresInvoiceData = mapped;
  return template(mapped);
};

describe("basic-invoice-example — line items table", () => {
  const html = renderFixture(fixture);

  it("SC5: renders one heading per visible column, in the configured order, and drops the hidden one", () => {
    const headingMatch = html.match(
      /<table class="line-items-table[^"]*">[\s\S]*?<\/thead>/
    );
    expect(headingMatch).not.toBeNull();
    const theadHtml = headingMatch![0];

    const headings = [...theadHtml.matchAll(/<th[^>]*>([^<]*)<\/th>/g)]
      .map((match) => match[1].trim())
      .filter((text) => text.length > 0);

    expect(headings).toEqual(["Rate", "Item", "Qty", "Line Total", "Warranty"]);
    expect(theadHtml).not.toContain(">SKU<");
  });

  it("prints money cells as money in the rendered table", () => {
    // Regression: the shared table shipped with amount/total/tax columns in an
    // "unformatted" set, so a line worth 20000 printed as "20000" where the
    // hand-built table it replaced printed money. Every unit test passed —
    // one of them asserted the wrong output — so this asserts on the rendered
    // document, which is where it was visible.
    const bodyMatch = html.match(
      /<table class="line-items-table[^"]*">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/
    );
    expect(bodyMatch).not.toBeNull();

    expect(bodyMatch![1]).toContain("20,000.00");
    expect(bodyMatch![1]).not.toMatch(/>\s*20000\s*</);
  });

  it("shows the Refrens attribution only when the document asks for it", () => {
    // Regression: the partial reads `showBranding` off its inherited context,
    // and that value lives on the invoice. Assigning the data mapper moved the
    // template root to { invoice, ... }, so calling the partial without an
    // explicit context rendered nothing on every document, whatever the
    // setting said. Asserting both directions is what catches that — with the
    // bug present, the "on" case renders nothing too.
    const branded = renderFixture({
      ...(fixture as Record<string, unknown>),
      invoice: {
        ...((fixture as Record<string, unknown>).invoice as object),
        showBranding: true,
      },
    });

    expect(branded).toContain("refrens-branding-widget");
    expect(html).not.toContain("refrens-branding-widget");
  });

  it("SC6: numbers ordinary rows, restarting inside each group, and skips heading/additional-charge rows", () => {
    const bodyMatch = html.match(
      /<table class="line-items-table[^"]*">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/
    );
    expect(bodyMatch).not.toBeNull();
    const rows = [...bodyMatch![1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(
      (match) => match[1]
    );

    // Group A heading, item A1, item A2, Group A sub-total, Group B heading,
    // item B1, additional charge, Group B sub-total. The fixture never turns
    // group sub-totals off, so both groups — including the one that ends the
    // document — close with one (S11/SC46).
    expect(rows).toHaveLength(8);

    const indexOf = (row: string): string =>
      (row.match(/<td class="col-index">([^<]*)<\/td>/) || [
        undefined,
        "",
      ])[1]!.trim();

    expect(indexOf(rows[0])).toBe(""); // Group A heading
    expect(indexOf(rows[1])).toBe("1"); // item A1
    expect(indexOf(rows[2])).toBe("2"); // item A2
    expect(indexOf(rows[3])).toBe(""); // Group A sub-total
    expect(rows[3]).toContain("Sub total");
    expect(indexOf(rows[4])).toBe(""); // Group B heading
    expect(indexOf(rows[5])).toBe("1"); // item B1 — restarts inside the new group
    expect(indexOf(rows[6])).toBe(""); // additional charge
    expect(indexOf(rows[7])).toBe(""); // Group B sub-total
    expect(rows[7]).toContain("Sub total");
  });

  it("SC7: renders the business-added column in its configured position with its own wording", () => {
    const headingMatch = html.match(
      /<table class="line-items-table[^"]*">[\s\S]*?<\/thead>/
    );
    const headings = [
      ...headingMatch![0].matchAll(/<th[^>]*>([^<]*)<\/th>/g),
    ].map((match) => match[1].trim());

    expect(headings.indexOf("Warranty")).toBe(headings.length - 1);
    expect(html).toContain("12 months");
  });

  it("SC9 (regression): sections outside the line items table still render", () => {
    expect(html).toContain(fixture.invoice.invoiceNumber);
    expect(html).toContain(fixture.invoice.billedBy.name);
    expect(html).toContain(fixture.invoice.billedTo.name);
    expect(html).toContain(fixture.invoice.customLabels.billedBy);
    // The seven hardcoded headings the old table shipped are gone — the table
    // now reflects the fixture's own column list instead.
    expect(html).not.toContain("Service Description");
    expect(html).not.toContain("VAT Rate");
  });

  it("regression: a cell with no value renders with no child nodes at all, so styles.css's `td:empty` can match it", () => {
    // The stacked narrow-width view collapses a valueless cell with
    // `.line-items-table td:empty { display: none }`. `:empty` needs ZERO
    // child nodes — a whitespace text node defeats it — and a Handlebars
    // block leaves exactly that behind unless the cell body carries `~`
    // whitespace-control tildes. That shipped broken once: every value
    // assertion passed while the rule matched nothing and a blank summary
    // cell showed its bold label beside nothing on a phone. Asserting on the
    // text would not catch it, so this asserts on the node count.
    const totalsFixture = {
      ...fixture,
      invoice: { ...fixture.invoice, showTotalsRow: true },
    };

    const container = document.createElement("div");
    container.innerHTML = renderFixture(totalsFixture);

    const summaryCells = [
      ...container.querySelectorAll("tr.row-summary td[data-label]"),
    ];
    expect(summaryCells.length).toBeGreaterThan(0);

    // The summary row totals quantity and the money columns and leaves the
    // rest blank, so this fixture must produce at least one of each kind.
    const blank = summaryCells.filter((cell) => cell.textContent === "");
    const filled = summaryCells.filter((cell) => cell.textContent !== "");
    expect(blank.length).toBeGreaterThan(0);
    expect(filled.length).toBeGreaterThan(0);

    blank.forEach((cell) => expect(cell.childNodes).toHaveLength(0));
    filled.forEach((cell) => expect(cell.childNodes.length).toBeGreaterThan(0));
  });
});
