// Handlebars helpers for the 3d-align template.
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

// Parties carry an ISO country code ("IN"); the document prints the name
// ("India"). A value that is not a two-letter code is printed as given.
export const countryName = (value: any): string => {
  const code = asText(value);
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
};

// The party address as the design prints it, one line each:
//   <street>,
//   <city>,
//   <state>, <country> - <pincode>
// An absent part drops out with its punctuation.
export const partyAddressLines = (party: any): string[] => {
  const lines = [party?.building, party?.street, party?.district, party?.city]
    .map(asText)
    .filter(Boolean)
    .map((line) => (/,$/.test(line) ? line : `${line},`));

  const region = [asText(party?.state), countryName(party?.country)]
    .filter(Boolean)
    .join(", ");
  const pincode = asText(party?.pincode);
  const last = region && pincode ? `${region} - ${pincode}` : region || pincode;
  if (last) lines.push(last);

  // The final line never ends on a dangling comma.
  if (lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
  }
  return lines;
};

// A party's own labelled extras: custom fields, additional ids and party
// headers. `showInInvoice` is opt-out, so only an explicit false hides an
// entry; an entry without a label or a value has nothing to print.
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

// Bank row labels follow the platform: the account's customLabels key wins,
// otherwise the platform's own wording.
const BANK_LABELS: Record<string, string> = {
  bankDetails: "Bank Details",
  accountHolderName: "Account Name",
  accountNumber: "Account Number",
  ifsc: "IFSC",
  iban: "IBAN",
  swiftCode: "SWIFT Code",
  sortCode: "Sort Code",
  accountType: "Account Type",
  bankName: "Bank",
};

const pickFirst = (...values: any[]): string =>
  values.map(asText).find(Boolean) ?? "";

// "CURRENT" → "Current", "SAVINGS" → "Savings".
const titleCase = (value: any): string =>
  asText(value)
    .toLowerCase()
    .replace(/(^|[\s_-])([a-z])/g, (_m, sep, ch) => `${sep}${ch.toUpperCase()}`)
    .replace(/_/g, " ");

// The bank block's heading and rows, in the design's order. A row prints only
// when its value does. Payloads carry `name`/`bank`/`accountNo`; the contract
// declares `accountHolderName`/`bankName`/`accountNumber` — both are read.
export const bankRows = (
  bank: any,
  customLabels: any
): { heading: string; rows: Field[] } => {
  const labelOf = (key: string): string =>
    pickFirst(customLabels?.[key], bank?.customLabels?.[key], BANK_LABELS[key]);

  const rows: Field[] = [
    {
      label: labelOf("accountHolderName"),
      value: pickFirst(bank?.name, bank?.accountHolderName),
    },
    {
      label: labelOf("accountNumber"),
      value: pickFirst(bank?.accountNo, bank?.accountNumber),
    },
    { label: labelOf("ifsc"), value: pickFirst(bank?.ifsc, bank?.ifscCode) },
    { label: labelOf("iban"), value: asText(bank?.iban) },
    {
      label: labelOf("swiftCode"),
      value: pickFirst(bank?.swift, bank?.swiftCode),
    },
    { label: labelOf("sortCode"), value: asText(bank?.sortCode) },
    { label: labelOf("accountType"), value: titleCase(bank?.accountType) },
    {
      label: labelOf("bankName"),
      value: pickFirst(bank?.bank, bank?.bankName),
    },
  ].filter((row) => row.value);

  asArray(bank?.customFields).forEach((field) => {
    const label = asText(field?.label);
    const value = asText(field?.value);
    if (label && value && field?.params?.showInInvoice !== false) {
      rows.push({ label, value });
    }
  });

  return { heading: labelOf("bankDetails"), rows };
};

export function registerThreeDAlignTemplateHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  // Handlebars passes its options hash as the last argument; drop it.
  HB.registerHelper("or", (...args: any[]) => args.slice(0, -1).some(Boolean));
  HB.registerHelper("partyAddressLines", partyAddressLines);
  HB.registerHelper("partyFields", partyFields);
  HB.registerHelper("bankRows", bankRows);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
