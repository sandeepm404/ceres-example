/**
 * @jest-environment jsdom
 */
import {
  fitItemsToScreen,
  removeHiddenSymbol,
} from "../src/templates/bps-technologies/helpers";

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
