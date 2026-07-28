import { computeHsnSummary } from "../src/widgets/hsn-summary/utils";

describe("computeHsnSummary", () => {
  describe("empty / null input", () => {
    it("returns hasRows=false for empty array", () => {
      const result = computeHsnSummary([]);
      expect(result.hasRows).toBe(false);
      expect(result.hsnList).toEqual([]);
    });

    it("returns hasRows=false for null input", () => {
      expect(computeHsnSummary(null as any).hasRows).toBe(false);
    });

    it("returns hasRows=false for undefined input", () => {
      expect(computeHsnSummary(undefined as any).hasRows).toBe(false);
    });

    it("returns zero totals for empty input", () => {
      const result = computeHsnSummary([]);
      expect(result.totalTaxableValue).toBe(0);
      expect(result.totalTaxAmount).toBe(0);
    });
  });

  describe("skipping items", () => {
    it("skips items with empty hsn string", () => {
      const items = [
        { hsn: "", gstRate: 18, amount: 1000, cgst: 90, sgst: 90 },
      ];
      const result = computeHsnSummary(items);
      expect(result.hasRows).toBe(false);
    });

    it("skips items with missing hsn field", () => {
      const items = [{ gstRate: 18, amount: 1000, cgst: 90, sgst: 90 }];
      const result = computeHsnSummary(items);
      expect(result.hasRows).toBe(false);
    });

    it("treats missing gstRate as 0", () => {
      const items = [{ hsn: "1001", amount: 1000, cgst: 90, sgst: 90 }];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList).toHaveLength(1);
      expect(result.hsnList[0].hsn).toBe("1001");
      expect(result.hsnList[0].cgstRate).toBe(0);
      expect(result.hsnList[0].sgstRate).toBe(0);
    });
  });

  describe("CGST/SGST mode (isIgst=false)", () => {
    it("groups two items with the same hsn into one row", () => {
      const items = [
        { hsn: "1001", gstRate: 5, amount: 1000, igst: 0, cgst: 25, sgst: 25 },
        {
          hsn: "1001",
          gstRate: 5,
          amount: 500,
          igst: 0,
          cgst: 12.5,
          sgst: 12.5,
        },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList).toHaveLength(1);
      expect(result.hsnList[0].hsn).toBe("1001");
      expect(result.hsnList[0].taxableValue).toBe(1500);
      expect(result.hsnList[0].cgstAmount).toBeCloseTo(37.5);
      expect(result.hsnList[0].sgstAmount).toBeCloseTo(37.5);
      expect(result.hsnList[0].taxAmount).toBeCloseTo(75);
    });

    it("creates separate rows for different hsn codes", () => {
      const items = [
        { hsn: "1001", gstRate: 5, amount: 1000, cgst: 25, sgst: 25 },
        { hsn: "2002", gstRate: 18, amount: 2000, cgst: 180, sgst: 180 },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList).toHaveLength(2);
      const codes = result.hsnList.map((r: { hsn: string }) => r.hsn);
      expect(codes).toContain("1001");
      expect(codes).toContain("2002");
    });

    it("creates separate rows for the same hsn code with different gstRates", () => {
      const items = [
        { hsn: "1001", gstRate: 5, amount: 1000, cgst: 25, sgst: 25 },
        { hsn: "1001", gstRate: 18, amount: 2000, cgst: 180, sgst: 180 },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList).toHaveLength(2);
    });

    it("sets cgstRate and sgstRate to half of gstRate", () => {
      const items = [
        { hsn: "1001", gstRate: 18, amount: 1000, cgst: 90, sgst: 90 },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList[0].cgstRate).toBe(9);
      expect(result.hsnList[0].sgstRate).toBe(9);
      expect(result.hsnList[0].igstRate).toBe(0);
    });

    it("accumulates totals across all rows", () => {
      const items = [
        { hsn: "1001", gstRate: 5, amount: 1000, cgst: 25, sgst: 25 },
        { hsn: "2002", gstRate: 18, amount: 2000, cgst: 180, sgst: 180 },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.totalTaxableValue).toBe(3000);
      expect(result.totalCgstAmount).toBe(205);
      expect(result.totalSgstAmount).toBe(205);
      expect(result.totalTaxAmount).toBe(410);
    });

    it("treats missing cgst/sgst as 0", () => {
      const items = [{ hsn: "1001", gstRate: 18, amount: 1000 }];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList[0].cgstAmount).toBe(0);
      expect(result.hsnList[0].sgstAmount).toBe(0);
      expect(result.totalTaxAmount).toBe(0);
    });
  });

  describe("IGST mode (isIgst=true)", () => {
    it("populates igstAmount and leaves cgst/sgst zero", () => {
      const items = [
        { hsn: "1001", gstRate: 18, amount: 1000, igst: 180, cgst: 0, sgst: 0 },
      ];
      const result = computeHsnSummary(items, { isIgst: true });
      expect(result.hsnList[0].igstAmount).toBe(180);
      expect(result.hsnList[0].cgstAmount).toBe(0);
      expect(result.totalIgstAmount).toBe(180);
      expect(result.isIgst).toBe(true);
    });

    it("sets igstRate equal to gstRate", () => {
      const items = [{ hsn: "1001", gstRate: 18, amount: 1000, igst: 180 }];
      const result = computeHsnSummary(items, { isIgst: true });
      expect(result.hsnList[0].igstRate).toBe(18);
      expect(result.hsnList[0].cgstRate).toBe(0);
    });

    it("treats missing igst as 0", () => {
      const items = [{ hsn: "1001", gstRate: 18, amount: 1000 }];
      const result = computeHsnSummary(items, { isIgst: true });
      expect(result.hsnList[0].igstAmount).toBe(0);
      expect(result.totalIgstAmount).toBe(0);
    });

    it("treats missing amount as 0 for taxableValue", () => {
      const items = [{ hsn: "1001", gstRate: 18, igst: 180 }];
      const result = computeHsnSummary(items, { isIgst: true });
      expect(result.hsnList[0].taxableValue).toBe(0);
      expect(result.totalTaxableValue).toBe(0);
    });
  });

  describe("result flags", () => {
    it("echoes isIgst=true in result", () => {
      expect(computeHsnSummary([], { isIgst: true }).isIgst).toBe(true);
    });

    it("echoes isIgst=false in result", () => {
      expect(computeHsnSummary([], { isIgst: false }).isIgst).toBe(false);
    });

    it("echoes isUtgst=true in result", () => {
      expect(computeHsnSummary([], { isUtgst: true }).isUtgst).toBe(true);
    });

    it("echoes isUtgst=false in result", () => {
      expect(computeHsnSummary([], { isUtgst: false }).isUtgst).toBe(false);
    });

    it("hasCess is false when no cess amounts", () => {
      const items = [
        { hsn: "1001", gstRate: 18, amount: 1000, cgst: 90, sgst: 90 },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hasCess).toBe(false);
    });
  });

  describe("sorting and rounding", () => {
    it("sorts hsnList by hsn code descending then gst rate descending", () => {
      const items = [
        { hsn: "2002", gstRate: 5, amount: 100, igst: 5 },
        { hsn: "1001", gstRate: 18, amount: 100, igst: 18 },
        { hsn: "1001", gstRate: 5, amount: 100, igst: 5 },
      ];
      const result = computeHsnSummary(items, { isIgst: true });
      expect(result.hsnList.map((r: { hsn: string }) => r.hsn)).toEqual([
        "2002",
        "1001",
        "1001",
      ]);
      expect(result.hsnList[1].igstRate).toBe(18);
      expect(result.hsnList[2].igstRate).toBe(5);
    });

    it("rounds accumulated igst amounts to 2 decimal places", () => {
      const items = [
        { hsn: "1001", gstRate: 18, amount: 100, igst: 0.1 },
        { hsn: "1001", gstRate: 18, amount: 100, igst: 0.2 },
      ];
      const result = computeHsnSummary(items, { isIgst: true });
      expect(result.hsnList[0].igstAmount).toBe(0.3);
      expect(result.totalIgstAmount).toBe(0.3);
      expect(result.totalTaxAmount).toBe(0.3);
    });

    it("rounds accumulated cgst/sgst and taxableValue to 2 decimal places", () => {
      const items = [
        { hsn: "1001", gstRate: 18, amount: 0.1, cgst: 0.1, sgst: 0.1 },
        { hsn: "1001", gstRate: 18, amount: 0.2, cgst: 0.2, sgst: 0.2 },
      ];
      const result = computeHsnSummary(items, { isIgst: false });
      expect(result.hsnList[0].taxableValue).toBe(0.3);
      expect(result.hsnList[0].cgstAmount).toBe(0.3);
      expect(result.hsnList[0].sgstAmount).toBe(0.3);
      expect(result.totalTaxableValue).toBe(0.3);
      expect(result.totalCgstAmount).toBe(0.3);
      expect(result.totalSgstAmount).toBe(0.3);
    });
  });
});
