import { asArray, asFlag, asRecord, asText, isRecord } from "./payloadValues";
import type { UnknownRecord } from "./payloadValues";

/*
 * What to call the tax on this document, decided once.
 *
 * "CGST", "SGST" and "IGST" are only ever right for an Indian GST document. A Malaysian
 * SST or an Indonesian PPN invoice carries its figure in the same `igst` bucket, and serana
 * relabels the `igst` column to the business's taxName on a non-India tax type
 * (serana/src/services/document-defaults/class.js: `if (rest.key === 'igst' && taxName)
 * return { ...rest, label: taxName }`). So the document's own column label is the answer
 * whenever it has one, and the taxName is the answer when the column has been archived —
 * "IGST" is never the answer for those documents.
 *
 * Precedence, matching refrens.com: the business's custom label, then the document's column
 * label, then the fallback word.
 */
export interface TaxLabelSources {
  customLabels?: unknown;
  /* The document's `columns`, or a host override of them. */
  columns?: unknown;
  taxName?: unknown;
  isUtgst?: unknown;
}

const FALLBACK: Record<string, string> = {
  cgst: "CGST",
  sgst: "SGST",
  utgst: "UTGST",
  igst: "IGST",
};

export const resolveTaxLabel = (
  key: "cgst" | "sgst" | "igst",
  sources: TaxLabelSources
): string => {
  const customLabels = asRecord(sources.customLabels);
  const isUtgst = asFlag(sources.isUtgst);
  const taxName = asText(sources.taxName) || "GST";

  /*
   * A union territory sale reports under UTGST but is carried in the sgst bucket, so
   * neither a custom label nor the document's own "SGST" column label may win.
   */
  if (key === "sgst" && isUtgst) return FALLBACK.utgst;

  const custom = asText(customLabels[key]);
  if (custom) return custom;

  const column = asArray(sources.columns)
    .map((entry) => asRecord(entry))
    .find((entry) => asText(entry.key) === key);
  const columnLabel = asText(column?.label);
  if (columnLabel) return columnLabel;

  /* The combined row's word is the document's tax when that is not GST. */
  if (key === "igst" && taxName !== "GST") return taxName;

  return FALLBACK[key];
};

/* The same answer taken straight from either template root shape. */
export const resolveDocumentTaxLabel = (
  payload: unknown,
  key: unknown
): string => {
  const record = isRecord(payload) ? payload : {};
  const invoice = isRecord(record.invoice)
    ? (record.invoice as UnknownRecord)
    : (record as UnknownRecord);
  const wanted = asText(key);
  if (wanted !== "cgst" && wanted !== "sgst" && wanted !== "igst") return "";

  return resolveTaxLabel(wanted, {
    customLabels: invoice.customLabels,
    columns: invoice.columns,
    taxName: invoice.taxName,
    isUtgst: invoice.utgst === undefined ? invoice.isUtgst : invoice.utgst,
  });
};

export default resolveTaxLabel;
