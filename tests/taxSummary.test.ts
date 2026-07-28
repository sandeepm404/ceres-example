import { computeTaxSummary } from "../src/widgets/tax-summary/utils";

describe("computeTaxSummary", () => {
  describe("empty / null input", () => {
    it("returns hasRows=false for empty array", () => {
      const result = computeTaxSummary([]);
      expect(result.hasRows).toBe(false);
      expect(result.taxList).toEqual([]);
    });

    it("returns hasRows=false for null input", () => {
      expect(computeTaxSummary(null as any).hasRows).toBe(false);
    });

    it("returns hasRows=false for undefined input", () => {
      expect(computeTaxSummary(undefined as any).hasRows).toBe(false);
    });

    it("returns zero totals for empty input", () => {
      const result = computeTaxSummary([]);
      expect(result.totalIgstAmount).toBe(0);
      expect(result.totalCgstAmount).toBe(0);
      expect(result.totalSgstAmount).toBe(0);
      expect(result.totalTaxAmount).toBe(0);
    });
  });

  describe("skipping items", () => {
    it("skips items with gstRate=0", () => {
      const items = [{ gstRate: 0, igst: 0, cgst: 0, sgst: 0 }];
      const result = computeTaxSummary(items);
      expect(result.hasRows).toBe(false);
      expect(result.taxList).toHaveLength(0);
    });

    it("skips items with missing gstRate", () => {
      const items = [{ igst: 0, cgst: 0, sgst: 0 }];
      const result = computeTaxSummary(items);
      expect(result.hasRows).toBe(false);
    });
  });

  describe("CGST/SGST mode (isIgst=false)", () => {
    it("groups two items with the same gstRate into one row", () => {
      const items = [
        { gstRate: 18, igst: 0, cgst: 90, sgst: 90 },
        { gstRate: 18, igst: 0, cgst: 45, sgst: 45 },
      ];
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.taxList).toHaveLength(1);
      expect(result.taxList[0].gstRate).toBe(18);
      expect(result.taxList[0].cgstAmount).toBe(135);
      expect(result.taxList[0].sgstAmount).toBe(135);
      expect(result.taxList[0].taxAmount).toBe(270);
    });

    it("creates separate rows for different gstRates", () => {
      const items = [
        { gstRate: 5, igst: 0, cgst: 12.5, sgst: 12.5 },
        { gstRate: 18, igst: 0, cgst: 90, sgst: 90 },
      ];
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.taxList).toHaveLength(2);
      const rates = result.taxList.map((r) => r.gstRate);
      expect(rates).toContain(5);
      expect(rates).toContain(18);
      expect(
        result.taxList.find((r) => r.gstRate === 5)?.cgstAmount
      ).toBeCloseTo(12.5);
      expect(result.taxList.find((r) => r.gstRate === 18)?.cgstAmount).toBe(90);
    });

    it("sets cgstRate and sgstRate to half of gstRate", () => {
      const items = [{ gstRate: 18, igst: 0, cgst: 90, sgst: 90 }];
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.taxList[0].cgstRate).toBe(9);
      expect(result.taxList[0].sgstRate).toBe(9);
      expect(result.taxList[0].igstRate).toBe(0);
    });

    it("accumulates totals correctly", () => {
      const items = [
        { gstRate: 18, igst: 0, cgst: 90, sgst: 90 },
        { gstRate: 5, igst: 0, cgst: 12.5, sgst: 12.5 },
      ];
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.totalCgstAmount).toBeCloseTo(102.5);
      expect(result.totalSgstAmount).toBeCloseTo(102.5);
      expect(result.totalTaxAmount).toBeCloseTo(205);
      expect(result.totalIgstAmount).toBe(0);
    });

    it("treats missing cgst/sgst as 0", () => {
      const items = [{ gstRate: 18 }]; // no cgst/sgst fields
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.taxList[0].cgstAmount).toBe(0);
      expect(result.taxList[0].sgstAmount).toBe(0);
      expect(result.taxList[0].taxAmount).toBe(0);
      expect(result.totalTaxAmount).toBe(0);
    });
  });

  describe("IGST mode (isIgst=true)", () => {
    it("populates igstAmount and leaves cgst/sgst zero", () => {
      const items = [{ gstRate: 18, igst: 180, cgst: 0, sgst: 0 }];
      const result = computeTaxSummary(items, { isIgst: true });
      expect(result.taxList[0].igstAmount).toBe(180);
      expect(result.taxList[0].cgstAmount).toBe(0);
      expect(result.taxList[0].sgstAmount).toBe(0);
    });

    it("sets igstRate equal to gstRate", () => {
      const items = [{ gstRate: 18, igst: 180 }];
      const result = computeTaxSummary(items, { isIgst: true });
      expect(result.taxList[0].igstRate).toBe(18);
      expect(result.taxList[0].cgstRate).toBe(0);
      expect(result.taxList[0].sgstRate).toBe(0);
    });

    it("accumulates totalIgstAmount", () => {
      const items = [
        { gstRate: 18, igst: 180 },
        { gstRate: 18, igst: 90 },
      ];
      const result = computeTaxSummary(items, { isIgst: true });
      expect(result.totalIgstAmount).toBe(270);
      expect(result.totalTaxAmount).toBe(270);
    });

    it("treats missing igst as 0", () => {
      const items = [{ gstRate: 18 }]; // no igst field
      const result = computeTaxSummary(items, { isIgst: true });
      expect(result.taxList[0].igstAmount).toBe(0);
      expect(result.taxList[0].taxAmount).toBe(0);
      expect(result.totalIgstAmount).toBe(0);
    });
  });

  describe("result flags", () => {
    it("echoes isIgst=true in result", () => {
      const result = computeTaxSummary([], { isIgst: true });
      expect(result.isIgst).toBe(true);
    });

    it("echoes isIgst=false in result", () => {
      const result = computeTaxSummary([], { isIgst: false });
      expect(result.isIgst).toBe(false);
    });

    it("echoes isUtgst in result", () => {
      const result = computeTaxSummary([], { isUtgst: true });
      expect(result.isUtgst).toBe(true);
    });

    it("hasCess is false when no cess amounts", () => {
      const items = [{ gstRate: 18, cgst: 90, sgst: 90 }];
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.hasCess).toBe(false);
    });
  });

  describe("sorting and rounding", () => {
    it("sorts taxList by gstRate descending", () => {
      const items = [
        { gstRate: 18, igst: 18 },
        { gstRate: 5, igst: 5 },
        { gstRate: 12, igst: 12 },
      ];
      const result = computeTaxSummary(items, { isIgst: true });
      expect(result.taxList.map((r) => r.gstRate)).toEqual([18, 12, 5]);
    });

    it("rounds accumulated igst amounts to 2 decimal places", () => {
      const items = [
        { gstRate: 18, igst: 0.1 },
        { gstRate: 18, igst: 0.2 },
      ];
      const result = computeTaxSummary(items, { isIgst: true });
      expect(result.taxList[0].igstAmount).toBe(0.3);
      expect(result.totalIgstAmount).toBe(0.3);
      expect(result.totalTaxAmount).toBe(0.3);
    });

    it("rounds accumulated cgst/sgst amounts to 2 decimal places", () => {
      const items = [
        { gstRate: 18, cgst: 0.1, sgst: 0.1 },
        { gstRate: 18, cgst: 0.2, sgst: 0.2 },
      ];
      const result = computeTaxSummary(items, { isIgst: false });
      expect(result.taxList[0].cgstAmount).toBe(0.3);
      expect(result.taxList[0].sgstAmount).toBe(0.3);
      expect(result.totalCgstAmount).toBe(0.3);
      expect(result.totalSgstAmount).toBe(0.3);
    });
  });
});
