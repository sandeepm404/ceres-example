type LineItem = {
  hsn?: string;
  gstRate?: number;
  amount?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  [key: string]: any;
};

type HsnRow = {
  hsn: string;
  taxableValue: number;
  igstRate: number;
  igstAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  // Cess support: populated when custom cess fields are present in line items (future use)
  cessRate: number;
  cessAmount: number;
  taxAmount: number;
};

export type HsnSummaryResult = {
  hsnList: HsnRow[];
  isIgst: boolean;
  isUtgst: boolean;
  hasCess: boolean;
  hasRows: boolean;
  totalTaxableValue: number;
  totalIgstAmount: number;
  totalCgstAmount: number;
  totalSgstAmount: number;
  totalCessAmount: number;
  totalTaxAmount: number;
};

export function computeHsnSummary(
  items: LineItem[],
  options: { isIgst?: boolean; isUtgst?: boolean } = {}
): HsnSummaryResult {
  const { isIgst = false, isUtgst = false } = options;

  const empty: HsnSummaryResult = {
    hsnList: [],
    isIgst,
    isUtgst,
    hasCess: false,
    hasRows: false,
    totalTaxableValue: 0,
    totalIgstAmount: 0,
    totalCgstAmount: 0,
    totalSgstAmount: 0,
    totalCessAmount: 0,
    totalTaxAmount: 0,
  };

  if (!Array.isArray(items) || !items.length) return empty;

  const hsnMap: Record<string, HsnRow> = {};
  let totalTaxableValue = 0;
  let totalIgstAmount = 0;
  let totalCgstAmount = 0;
  let totalSgstAmount = 0;
  let totalTaxAmount = 0;

  items
    .filter((item) => item && !!(item.hsn || ""))
    .forEach((item) => {
      const hsn = item.hsn as string;
      const gstRate = item.gstRate || 0;
      const key = `${hsn}:${gstRate}`;

      if (!hsnMap[key]) {
        hsnMap[key] = {
          hsn,
          taxableValue: 0,
          igstRate: isIgst ? gstRate : 0,
          igstAmount: 0,
          cgstRate: isIgst ? 0 : gstRate / 2,
          cgstAmount: 0,
          sgstRate: isIgst ? 0 : gstRate / 2,
          sgstAmount: 0,
          cessRate: 0,
          cessAmount: 0,
          taxAmount: 0,
        };
      }

      const row = hsnMap[key];
      const amount = item.amount || 0;
      row.taxableValue += amount;
      totalTaxableValue += amount;

      if (isIgst) {
        const igst = item.igst || 0;
        row.igstAmount += igst;
        row.taxAmount += igst;
        totalIgstAmount += igst;
        totalTaxAmount += igst;
      } else {
        const cgst = item.cgst || 0;
        const sgst = item.sgst || 0;
        row.cgstAmount += cgst;
        row.sgstAmount += sgst;
        row.taxAmount += cgst + sgst;
        totalCgstAmount += cgst;
        totalSgstAmount += sgst;
        totalTaxAmount += cgst + sgst;
      }
    });

  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const hsnList = Object.values(hsnMap)
    .map((row) => ({
      ...row,
      taxableValue: round(row.taxableValue),
      igstAmount: round(row.igstAmount),
      cgstAmount: round(row.cgstAmount),
      sgstAmount: round(row.sgstAmount),
      taxAmount: round(row.taxAmount),
    }))
    .sort(
      (a, b) =>
        b.hsn.localeCompare(a.hsn) ||
        b.igstRate + b.cgstRate - a.igstRate - a.cgstRate
    );

  return {
    hsnList,
    isIgst,
    isUtgst,
    hasCess: false,
    hasRows: hsnList.length > 0,
    totalTaxableValue: round(totalTaxableValue),
    totalIgstAmount: round(totalIgstAmount),
    totalCgstAmount: round(totalCgstAmount),
    totalSgstAmount: round(totalSgstAmount),
    totalCessAmount: 0,
    totalTaxAmount: round(totalTaxAmount),
  };
}
