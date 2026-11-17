/**
 * @jest-environment jsdom
 */
import { splitTotals } from "../src/templates/bps-technologies/helpers";

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
