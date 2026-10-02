// Handlebars helpers for the sami-contracting template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

/* eslint-disable @typescript-eslint/no-explicit-any */

type Field = { label: string; value: string };

const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const asText = (value: any): string => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
};

// The script a business picked for its PDFs ("arabic", "latin", …). Lydia's
// General Preferences writes it to the business's `configuration.pdfOptions`;
// the document's own `template.pdfOptions` and the older
// `configuration.script` are read after it so whichever the host populated wins.
export const documentScript = (invoice: any, pdfOptions: any): string =>
  [
    invoice?.owner?.configuration?.pdfOptions?.script,
    pdfOptions?.script,
    invoice?.owner?.configuration?.script,
  ]
    .map(asText)
    .find(Boolean) ?? "";

// The font the business picked for that script — written beside it by the
// same General Preferences control, and read from the same places.
export const documentFont = (invoice: any, pdfOptions: any): string =>
  [
    invoice?.owner?.configuration?.pdfOptions?.fontFamily,
    pdfOptions?.fontFamily,
  ]
    .map(asText)
    .find(Boolean) ?? "";

// Google Fonts stylesheet for a family name. Lydia's picker lists Google
// families only, so any other character means the value is not one of them and
// nothing is loaded rather than building a URL from it.
export const googleFontHref = (family: any): string => {
  const name = asText(family);
  if (!/^[A-Za-z0-9 ]+$/.test(name)) return "";
  return `https://fonts.googleapis.com/css2?family=${name.replace(
    / /g,
    "+"
  )}:wght@400;500;600;700&display=swap`;
};

// `lang` for the scripts whose shaping or line breaking depends on it. Any
// other script leaves `lang` off rather than guessing a language from it.
const SCRIPT_LANG: Record<string, string> = {
  arabic: "ar",
  hebrew: "he",
};

export const documentLang = (script: any): string =>
  SCRIPT_LANG[asText(script).toLowerCase()] ?? "";

// Lydia's "RTL" toggle patches `template.rtl` on the document and reloads the
// preview, so reading it at render time keeps the iframe and the PDF in step.
export const documentDir = (invoice: any): "rtl" | "ltr" =>
  invoice?.template?.rtl === true ? "rtl" : "ltr";

// A party's own labelled extras: custom fields, additional ids (e.g. a
// commercial registration number) and party headers. `showInInvoice` is
// opt-out, so only an explicit false hides an entry; an entry without a label
// or a value has nothing to print.
export const partyFields = (party: any): Field[] => {
  const fields: Field[] = [];
  const add = (label: any, value: any, hidden: boolean) => {
    const name = asText(label);
    const text = asText(value);
    if (!hidden && name && text) fields.push({ label: name, value: text });
  };

  asArray(party?.customFields).forEach((field) =>
    add(
      field?.label || field?.name,
      field?.value,
      field?.params?.showInInvoice === false
    )
  );
  asArray(party?.additionalIds).forEach((id) =>
    add(id?.label, id?.value, id?.showInInvoice === false)
  );
  asArray(party?.customHeaders).forEach((header) =>
    add(header?.label, header?.value, header?.showInInvoice === false)
  );

  return fields;
};

// Bank rows in the platform's order. Values carry two shapes in the wild (the
// contract's `bankName`/`accountHolderName` and the `bank`/`name` real payloads
// send), so both are read. Labels come only from the account's or the
// document's custom labels: an Arabic document must never fall back to English
// text, so a row with no label prints its value alone.
const BANK_ROWS: Array<{ values: string[]; labels: string[] }> = [
  { values: ["name", "accountHolderName"], labels: ["accountHolderName"] },
  { values: ["bank", "bankName"], labels: ["bankName", "bank"] },
  {
    values: ["accountNo", "accountNumber"],
    labels: ["accountNumber", "accountNo"],
  },
  { values: ["iban"], labels: ["iban"] },
  { values: ["swift", "swiftCode"], labels: ["swiftCode", "swift"] },
  { values: ["ifsc", "ifscCode"], labels: ["ifsc", "ifscCode"] },
  { values: ["sortCode"], labels: ["sortCode"] },
  { values: ["accountType"], labels: ["accountType"] },
];

export const bankFields = (invoice: any): Field[] => {
  const account = invoice?.bankAccount;
  if (!account || typeof account !== "object") return [];

  const labelSources = [account.customLabels, invoice?.customLabels];
  const labelFor = (keys: string[]): string =>
    keys
      .flatMap((key) => labelSources.map((source) => asText(source?.[key])))
      .find(Boolean) ?? "";

  const rows: Field[] = [];
  BANK_ROWS.forEach((row) => {
    const value = row.values.map((key) => asText(account[key])).find(Boolean);
    if (value) rows.push({ label: labelFor(row.labels), value });
  });

  asArray(account.customFields).forEach((field) => {
    const label = asText(field?.label);
    const value = asText(field?.value);
    if (field?.params?.showInInvoice !== false && label && value) {
      rows.push({ label, value });
    }
  });

  return rows;
};

// The "issued from" document field, placed in the number band instead of the
// details list. Matched by its label (by request) — the API gives document fields
// no stable key. It may be a custom field or a custom header, so both are
// searched. The comparison ignores what does not change how the label reads:
// Unicode presentation forms (NFKC), invisible direction marks, tatweel,
// diacritics, extra spaces and a trailing colon. A field the business hid
// (showInInvoice false) never matches.
const ISSUED_FROM_LABEL = "المصدر من";

// Zero-width and bidi controls, BOM and tatweel; then every non-spacing mark
// (Arabic diacritics among them). Marks sit outside the class because a
// combining character inside one is ambiguous (no-misleading-character-class).
const INVISIBLE =
  /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0640]|\p{Mn}/gu;

const normaliseLabel = (label: any): string =>
  asText(label)
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/[:：\s]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();

export const isIssuedFrom = (field: any): boolean =>
  field?.params?.showInInvoice !== false &&
  field?.showInInvoice !== false &&
  normaliseLabel(field?.label || field?.name) === ISSUED_FROM_LABEL;

export const issuedFromField = (fields: any, headers?: any): any =>
  [...asArray(fields), ...asArray(headers)].find(isIssuedFrom) ?? null;

// The seller's phone for the top row: the billed-by phone unless the business
// hid it, else the document's contact phone — real payloads often leave
// billedBy.phone empty and carry the number only under contact.
export const sellerPhone = (invoice: any): string => {
  const billedBy = invoice?.billedBy;
  const own =
    billedBy?.phoneShowInInvoice === false ? "" : asText(billedBy?.phone);
  return own || asText(invoice?.contact?.phone);
};

// Total quantity across the line items — the design's "number of items" figure
// (one line of 9 prints 9). Rounded to 4 places so float sums like 0.1 + 0.2
// print as 0.3; non-numeric quantities count as zero.
export const totalQuantity = (items: any): number => {
  const sum = asArray(items).reduce((acc, item) => {
    const qty = Number(item?.quantity);
    return Number.isFinite(qty) ? acc + qty : acc;
  }, 0);
  return Math.round(sum * 10000) / 10000;
};

// The file name an attachment URL points at, without its query string.
export const attachmentName = (url: any): string => {
  const path = asText(url).split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

export function registerSamiContractingTemplateHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  // Handlebars passes its options hash as the last argument; drop it.
  HB.registerHelper("or", (...args: any[]) => args.slice(0, -1).some(Boolean));
  HB.registerHelper("documentScript", documentScript);
  HB.registerHelper("documentFont", documentFont);
  HB.registerHelper("googleFontHref", googleFontHref);
  HB.registerHelper("documentLang", documentLang);
  HB.registerHelper("documentDir", documentDir);
  HB.registerHelper("partyFields", partyFields);
  HB.registerHelper("bankFields", bankFields);
  HB.registerHelper("attachmentName", attachmentName);
  HB.registerHelper("totalQuantity", totalQuantity);
  HB.registerHelper("isIssuedFrom", isIssuedFrom);
  HB.registerHelper("issuedFromField", issuedFromField);
  HB.registerHelper("sellerPhone", sellerPhone);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
