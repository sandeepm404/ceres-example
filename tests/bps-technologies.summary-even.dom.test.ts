/**
 * @jest-environment jsdom
 */
import { evenSummaryColumns } from "../src/templates/bps-technologies/helpers";

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
      (hsn.querySelector(".ceres-table-words") as HTMLTableCellElement).colSpan
    ).toBe(5);
    expect(payments.classList.contains("is-even")).toBe(false);
    expect((payments.querySelector("td") as HTMLTableCellElement).colSpan).toBe(
      99
    );
  });
});
