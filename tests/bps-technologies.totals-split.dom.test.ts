/**
 * @jest-environment jsdom
 */
import {
  joinTotals,
  splitTotals,
} from "../src/templates/bps-technologies/helpers";

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
