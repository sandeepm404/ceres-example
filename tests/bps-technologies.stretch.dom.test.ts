/**
 * @jest-environment jsdom
 */
import {
  cutCards,
  fitItemsToScreen,
  flowFiller,
  stretchItemTable,
  stretchPrintRules,
  type FlowUnit,
} from "../src/templates/bps-technologies/helpers";

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
