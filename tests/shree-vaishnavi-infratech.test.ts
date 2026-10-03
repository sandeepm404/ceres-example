import fs from "node:fs";
import path from "node:path";
import {
  getItemColumnValue,
  mapVaishnaviTemplateData,
} from "../src/templates/shree-vaishnavi-infratech/helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

// A month-grouped quotation: a widget group heading, three Oct-26 rows (two
// with the same item name), one Nov-26 row and the group's sub-total row.
const fixture = {
  invoice: {
    billType: "INVOICE",
    invoiceType: "INVOICE",
    status: "UNPAID",
    invoiceNumber: "SVI/2026-27/0042",
    invoiceDate: "2026-11-02T00:00:00.000Z",
    ownerOffset: "+05:30",
    currency: "INR",
    businessCurrency: "INR",
    businessLocale: "en-IN",
    taxName: "GST",
    taxType: "INDIA",
    isIgst: false,
    advanceOptions: {
      taxSummaryView: "detailed",
      showHsnSummary: true,
      mergeIdenticalAdjacentCells: true,
    },
    columns: [
      {
        key: "month",
        label: "Month",
      },
      {
        key: "item",
        label: "Name of Work",
      },
      {
        key: "vehicleNumber",
        label: "Vehicle Number",
      },
      {
        key: "quantity",
        label: "Qty",
        dataType: "number",
      },
      {
        key: "rate",
        label: "Rate",
        dataType: "currency",
      },
      {
        key: "amount",
        label: "Amount",
        dataType: "currency",
      },
      {
        key: "total",
        label: "Total",
        dataType: "currency",
      },
    ],
    items: [
      {
        name: "Municipal Services",
        group: true,
      },
      {
        month: "Oct-26",
        name: "Road sweeping",
        vehicleNumber: "KA 01 AB 1234",
        quantity: 26,
        rate: 2500,
        amount: 65000,
        hsn: "9985",
        gstRate: 18,
        cgst: 5850,
        sgst: 5850,
        taxAmount: 11700,
        total: 76700,
        subTotal: 76700,
      },
      {
        month: "Oct-26",
        name: "Road sweeping",
        vehicleNumber: "KA 01 AB 5678",
        quantity: 26,
        rate: 2500,
        amount: 65000,
        hsn: "9985",
        gstRate: 18,
        cgst: 5850,
        sgst: 5850,
        taxAmount: 11700,
        total: 76700,
        subTotal: 76700,
      },
      {
        month: "Oct-26",
        name: "Garbage lifting",
        vehicleNumber: "KA 01 CD 4321",
        quantity: 30,
        rate: 1800,
        amount: 54000,
        hsn: "9985",
        gstRate: 18,
        cgst: 4860,
        sgst: 4860,
        taxAmount: 9720,
        total: 63720,
        subTotal: 63720,
      },
      {
        month: "Nov-26",
        name: "Garbage lifting",
        vehicleNumber: "KA 01 CD 4321",
        quantity: 30,
        rate: 1800,
        amount: 54000,
        hsn: "9985",
        gstRate: 18,
        cgst: 4860,
        sgst: 4860,
        taxAmount: 9720,
        total: 63720,
        subTotal: 63720,
      },
      {
        name: "Sub total",
        isGroupItemTotalRow: true,
        quantity: 112,
        amount: 238000,
        cgst: 21420,
        sgst: 21420,
        taxAmount: 42840,
        total: 280840,
        subTotal: 280840,
      },
    ],
    subTotal: 238000,
    finalTotal: {
      subTotal: 238000,
      cgst: 21420,
      sgst: 21420,
      total: 280840,
    },
    billedBy: {
      name: "Shree Vaishnavi Infratech",
      gstin: "29ABCDE1234F1Z5",
      state: "Karnataka",
      country: "India",
    },
    billedTo: {
      name: "Bruhat City Services Pvt Ltd",
      gstin: "29AAACB5678K1Z2",
      state: "Karnataka",
      country: "India",
    },
  },
};

const TEMPLATE_DIR = path.join(
  __dirname,
  "../src/templates/shree-vaishnavi-infratech"
);

// One real-item group as "<column key>x<rowspan>#<serial>" per printed cell.
const printedCells = (group: any): string[][] =>
  group.rows.map((row: any) =>
    row.cells
      .filter((cell: any) => !cell.skip)
      .map(
        (cell: any) =>
          `${cell.column.key}${cell.rowspan > 1 ? `x${cell.rowspan}` : ""}${
            cell.isRowNumber ? `#${cell.groupNumber}` : ""
          }`
      )
  );

const itemGroups = (state: any) =>
  state.lineItemGroups.filter(
    (group: any) => !group.isGroupHeader && !group.isGroupSubtotal
  );

describe("shree-vaishnavi-infratech: line-item cell grouping", () => {
  const state = mapVaishnaviTemplateData(fixture);

  it("puts S.No first and keeps the API column order after it", () => {
    expect(state.mapped.columns.map((column: any) => column.key)).toEqual([
      "index",
      "month",
      "item",
      "vehicleNumber",
      "quantity",
      "rate",
      "amount",
      "total",
    ]);
  });

  it("gives each month one S.No and merges the repeated month and item name", () => {
    const [october, november] = itemGroups(state);

    expect(printedCells(october)).toEqual([
      [
        "indexx3#1",
        "monthx3",
        "itemx2",
        "vehicleNumber",
        "quantity",
        "rate",
        "amount",
        "total",
      ],
      ["vehicleNumber", "quantity", "rate", "amount", "total"],
      ["item", "vehicleNumber", "quantity", "rate", "amount", "total"],
    ]);
    expect(printedCells(november)).toEqual([
      [
        "index#2",
        "month",
        "item",
        "vehicleNumber",
        "quantity",
        "rate",
        "amount",
        "total",
      ],
    ]);
  });

  it("keeps widget group headings and sub-totals as their own rows", () => {
    const [heading] = state.lineItemGroups;
    const subtotal = state.lineItemGroups[state.lineItemGroups.length - 1];

    expect(heading).toMatchObject({
      isGroupHeader: true,
      label: "Municipal Services",
    });
    expect(subtotal).toMatchObject({
      isGroupSubtotal: true,
      label: "Sub total",
    });
    expect(itemGroups(state)).toHaveLength(2);
  });

  it("prints one row per item when merging is switched off", () => {
    const unmerged = mapVaishnaviTemplateData({
      invoice: {
        ...fixture.invoice,
        advanceOptions: {
          ...fixture.invoice.advanceOptions,
          mergeIdenticalAdjacentCells: false,
        },
      },
    });

    const serials = itemGroups(unmerged).map(
      (group: any) =>
        group.rows[0].cells.find((cell: any) => cell.isRowNumber).groupNumber
    );
    expect(serials).toEqual([1, 2, 3, 4]);
    itemGroups(unmerged).forEach((group: any) =>
      group.rows.forEach((row: any) =>
        row.cells.forEach((cell: any) => expect(cell.rowspan).toBe(1))
      )
    );
  });
});

describe("shree-vaishnavi-infratech: data mapping", () => {
  const state = mapVaishnaviTemplateData(fixture);

  it("sums the Amount column from the real items only", () => {
    // Four items at 65,000 / 65,000 / 54,000 / 54,000; the group sub-total
    // row (238,000) is not counted a second time.
    expect(state.totals.subTotal).toBe(238000);
  });

  it("shows the CGST/SGST summary rows for an intra-state document", () => {
    expect(state.vaishnavi.showCgstSgstSummary).toBe(true);
    expect(state.vaishnavi.showIgstSummary).toBe(false);
  });

  it("shows the HSN summary only when the document turns it on", () => {
    expect(state.sri.showHsnSummary).toBe(true);

    const off = mapVaishnaviTemplateData({
      invoice: {
        ...fixture.invoice,
        advanceOptions: {
          ...fixture.invoice.advanceOptions,
          showHsnSummary: false,
        },
      },
    });
    expect(off.sri.showHsnSummary).toBe(false);
  });

  it("prints the status tag only for a status the PDF shows", () => {
    const tag = (billType: string, status: string, isOverdue = false) =>
      mapVaishnaviTemplateData({
        invoice: { ...fixture.invoice, billType, status, isOverdue },
      }).sri.showStatusTag;

    expect(tag("QUOTATION", "UNPAID")).toBe(false);
    expect(tag("QUOTATION", "PAID")).toBe(false);
    expect(tag("QUOTATION", "CANCELED")).toBe(true);
    expect(tag("INVOICE", "UNPAID")).toBe(false);
    expect(tag("INVOICE", "UNPAID", true)).toBe(false);
    expect(tag("INVOICE", "PAID")).toBe(true);
    expect(tag("INVOICE", "PARTIAL")).toBe(true);
    expect(tag("INVOICE", "PARTIAL", true)).toBe(false);
    expect(tag("INVOICE", "CANCELLED")).toBe(true);
  });

  it("zooms the print only for zoomSize 0.8 and the text scale", () => {
    const zoom = (pdfOptions: any) =>
      mapVaishnaviTemplateData({ ...fixture, pdfOptions }).vaishnavi.print.zoom;

    // Every other zoomSize is the renderer's own page zoom.
    expect(zoom({})).toBe("1");
    expect(zoom({ zoomSize: 0.9 })).toBe("1");
    expect(zoom({ zoomSize: 1.2 })).toBe("1");
    expect(zoom({ zoomSize: 0.8 })).toBe("0.8");
    expect(zoom({ zoomSize: "0.8" })).toBe("0.8");
    expect(zoom({ textScale: 1.1 })).toBe("1.1");
    expect(zoom({ zoomSize: 0.8, textScale: 1.1 })).toBe("0.88");
  });

  it("reduces an object cell value to something printable", () => {
    expect(
      getItemColumnValue(
        { discount: { amount: 10, discountType: "PERCENTAGE" } },
        { key: "discount" }
      )
    ).toBe(10);
  });
});

describe("shree-vaishnavi-infratech: template files", () => {
  it("holds only the standard template files", () => {
    expect(fs.readdirSync(TEMPLATE_DIR).sort()).toEqual([
      "helpers.ts",
      "index.ts",
      "samples.json",
      "styles.css",
      "template.hbs",
      "version.json",
    ]);
  });

  it("imports nothing from another template", () => {
    ["helpers.ts", "index.ts"].forEach((file) => {
      const source = fs.readFileSync(path.join(TEMPLATE_DIR, file), "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map(
        (match) => match[1]
      );
      imports
        .filter((target) => target.startsWith("."))
        .forEach((target) =>
          expect(target).toMatch(/^(\.\/|\.\.\/\.\.\/(main|widgets)\/)/)
        );
    });
  });

  it("falls back to Open Sans when the API sends no font", () => {
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
    expect(
      css.startsWith(
        '@import "https://fonts.googleapis.com/css2?family=Open+Sans'
      )
    ).toBe(true);
    expect(css).toMatch(
      /--vaishnavi-body-font: var\(\s*--subtitle-font,\s*"Open Sans"/
    );
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
