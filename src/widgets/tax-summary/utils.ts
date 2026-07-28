type LineItem = {
  gstRate?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  [key: string]: any;
};

type TaxRow = {
  gstRate: number;
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

export type TaxSummaryResult = {
  taxList: TaxRow[];
  isIgst: boolean;
  isUtgst: boolean;
  hasCess: boolean;
  hasRows: boolean;
  totalIgstAmount: number;
  totalCgstAmount: number;
  totalSgstAmount: number;
  totalCessAmount: number;
  totalTaxAmount: number;
};

export function computeTaxSummary(
  items: LineItem[],
  options: { isIgst?: boolean; isUtgst?: boolean } = {}
): TaxSummaryResult {
  const { isIgst = false, isUtgst = false } = options;

  const empty: TaxSummaryResult = {
    taxList: [],
    isIgst,
    isUtgst,
    hasCess: false,
    hasRows: false,
    totalIgstAmount: 0,
    totalCgstAmount: 0,
    totalSgstAmount: 0,
    totalCessAmount: 0,
    totalTaxAmount: 0,
  };

  if (!Array.isArray(items) || !items.length) return empty;

  const taxMap: Record<string, TaxRow> = {};
  let totalIgstAmount = 0;
  let totalCgstAmount = 0;
  let totalSgstAmount = 0;
  let totalTaxAmount = 0;

  items.forEach((item) => {
    if (!item) return;
    const gstRate = item.gstRate || 0;
    if (!gstRate) return;

    const key = String(gstRate);

    if (!taxMap[key]) {
      taxMap[key] = {
        gstRate,
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

    const row = taxMap[key];

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

  const taxList = Object.values(taxMap)
    .map((row) => ({
      ...row,
      igstAmount: round(row.igstAmount),
      cgstAmount: round(row.cgstAmount),
      sgstAmount: round(row.sgstAmount),
      taxAmount: round(row.taxAmount),
    }))
    .sort((a, b) => b.gstRate - a.gstRate);

  return {
    taxList,
    isIgst,
    isUtgst,
    hasCess: false,
    hasRows: taxList.length > 0,
    totalIgstAmount: round(totalIgstAmount),
    totalCgstAmount: round(totalCgstAmount),
    totalSgstAmount: round(totalSgstAmount),
    totalCessAmount: 0,
    totalTaxAmount: round(totalTaxAmount),
  };
}
