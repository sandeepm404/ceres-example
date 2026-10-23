// Handlebars helpers for the gs-traders template.
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

const asNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const pickFirst = (...values: any[]): string =>
  values.map(asText).find(Boolean) ?? "";

// "Mode/Terms of Payment" and "mode / terms of payment" are the same label.
const labelKey = (value: any): string =>
  asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// India's official GST state codes — a fixed government-published list. Parties
// and `placeOfSupply` often carry only the code ("23").
const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

// A bare code ("23", "7") or a "29-KARNATAKA" pair → the two-digit code.
const stateCodeOf = (value: any): string => {
  const digits = asText(value).match(/^\d{1,2}(?!\d)/)?.[0] ?? "";
  return digits ? digits.padStart(2, "0") : "";
};

// `placeOfSupply` as the document prints it: "Madhya Pradesh (23)". A value
// that is not a known code prints as given.
export const placeOfSupply = (value: any): string => {
  const raw = asText(value);
  const code = stateCodeOf(raw);
  const name = GST_STATE_CODES[code];
  return name ? `${name} (${code})` : raw;
};

// The party's "State Name: <name>, Code : <code>" row. The code comes from the
// party's own state code, else its GST state, else the GSTIN's first two digits;
// the name from the party's state, else the code's official name.
export const partyState = (
  party: any
): { name: string; code: string } | null => {
  const code =
    stateCodeOf(party?.stateCode) ||
    stateCodeOf(party?.gstState) ||
    stateCodeOf(asText(party?.gstin).slice(0, 2));
  const name = pickFirst(party?.state, GST_STATE_CODES[code]);
  return name || code ? { name, code } : null;
};

// Parties carry an ISO country code ("IN"). An Indian address prints no
// country, as the reference does; any other prints its name.
const countryName = (value: any): string => {
  const code = asText(value);
  if (!code || code.toUpperCase() === "IN") return "";
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(
        code.toUpperCase()
      ) || code
    );
  } catch {
    return code;
  }
};

// The party's address, one line each: building, street, district, then
// "<city> - <pincode>", then the country outside India. State is not here: it
// has its own row (partyState).
export const partyAddressLines = (party: any): string[] => {
  const city = asText(party?.city);
  const pincode = pickFirst(party?.pincode, party?.zipCode);
  const street = asText(party?.street);
  // A street that already ends in the city ("…, Mandla") is not followed by
  // the city again on its own line.
  const cityInStreet =
    city && street.toLowerCase().endsWith(city.toLowerCase());
  const cityLine = [cityInStreet ? "" : city, pincode]
    .filter(Boolean)
    .join(" - ");
  return [
    asText(party?.building),
    street,
    asText(party?.district),
    cityLine,
    countryName(party?.country),
  ].filter(Boolean);
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

// ── Tally detail boxes ────────────────────────────────────────────────────────
//
// The boxes beside the parties that no contract field fills take their value
// from a document custom field of the same name. Each box lists the names it
// answers to, compared without case or punctuation.
const BOX_NAMES: Record<string, string[]> = {
  deliveryNote: ["Delivery Note", "Delivery Note No"],
  paymentTerms: ["Mode/Terms of Payment", "Terms of Payment", "Payment Terms"],
  reference: ["Reference No. & Date", "Reference No", "Reference"],
  otherReferences: ["Other References", "Other Reference"],
  orderDate: ["Buyer's Order Date", "Order Date", "PO Date"],
  dispatchDocNo: ["Dispatch Doc No.", "Dispatch Document No"],
  deliveryNoteDate: ["Delivery Note Date"],
  dispatchedThrough: ["Dispatched through", "Dispatched Through"],
  destination: ["Destination"],
  termsOfDelivery: ["Terms of Delivery"],
};

const BOX_KEYS = new Set(
  Object.values(BOX_NAMES)
    .flat()
    .map((name) => labelKey(name))
);

const visibleCustomFields = (invoice: any): any[] =>
  asArray(invoice?.customFields).filter(
    (field) =>
      field?.params?.showInInvoice !== false &&
      asText(field?.value) &&
      asText(field?.label || field?.name)
  );

// The custom-field value for one Tally box, or "".
export const boxValue = (invoice: any, box: string): string => {
  const names = new Set(asArray(BOX_NAMES[box]).map(labelKey));
  const match = visibleCustomFields(invoice).find((field) =>
    names.has(labelKey(field?.label || field?.name))
  );
  return match ? asText(match.value) : "";
};

// Document custom fields that no Tally box took; these print in the detail
// strip under the boxes.
export const otherCustomFields = (invoice: any): Field[] =>
  visibleCustomFields(invoice)
    .filter((field) => !BOX_KEYS.has(labelKey(field?.label || field?.name)))
    .map((field) => ({
      label: asText(field?.label || field?.name),
      value: asText(field?.value),
    }));

// ── Item rows ─────────────────────────────────────────────────────────────────
//
// The item table is a fixed Tally set — Sr No., Description, Quantity, Rate,
// Amount — read straight off the item, whatever the account's column settings.
//
// The account's form carries a gross quantity and a void percentage as custom
// columns; the built-in quantity is the net, worked out from them. When an item
// carries both, the description prints the gross / void / net breakdown. The two
// columns are found by label (their keys are random per account): the custom
// column labelled "Quantity" and the one whose label mentions "void".

export type ItemRow =
  | {
      kind: "item";
      sr: number;
      name: string;
      description: string;
      hsn: string;
      quantity: string;
      unit: string;
      rate: number;
      amount: number;
      breakdown: {
        gross: string;
        voidPct: string;
        voidQty: string;
        net: string;
      } | null;
    }
  | { kind: "group"; name: string }
  | { kind: "groupTotal"; name: string; amount: number };

// Fixed decimals with no grouping, as the reference prints quantities.
const fixed = (value: number, digits: number): string =>
  (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);

const findBreakdownColumns = (
  columns: any[]
): { grossKey: string; voidKey: string } | null => {
  const custom = columns.filter((c) => c?.system === false && asText(c?.key));
  const gross = custom.find((c) => /^\s*quantity\s*$/i.test(asText(c?.label)));
  const voidCol = custom.find((c) => /void/i.test(asText(c?.label)));
  return gross && voidCol
    ? { grossKey: asText(gross.key), voidKey: asText(voidCol.key) }
    : null;
};

export const itemRows = (invoice: any): ItemRow[] => {
  const columns = asArray(invoice?.columns);
  const keys = findBreakdownColumns(columns);
  const hsnShown = columns.some(
    (c) => c?.key === "hsn" && c?.isHidden !== true
  );
  const rows: ItemRow[] = [];
  let sr = 0;

  asArray(invoice?.items).forEach((item) => {
    if (!item || item.hidden === true) return;
    if (item.isGroupItemTotalRow) {
      rows.push({
        kind: "groupTotal",
        name: asText(item.name),
        amount: asNumber(item.amount) ?? 0,
      });
      return;
    }
    if (item.group) {
      rows.push({ kind: "group", name: asText(item.name) });
      return;
    }

    sr += 1;
    const net = asNumber(item.quantity);
    const gross = keys ? asNumber(item.custom?.[keys.grossKey]) : null;
    const voidPct = keys ? asNumber(item.custom?.[keys.voidKey]) : null;
    const breakdown =
      gross !== null && voidPct !== null && net !== null
        ? {
            gross: fixed(gross, 3),
            voidPct: String(voidPct),
            voidQty: fixed(gross - net, 3),
            net: fixed(net, 3),
          }
        : null;

    rows.push({
      kind: "item",
      sr,
      name: asText(item.name),
      description: asText(item.description),
      hsn: hsnShown ? asText(item.hsn) : "",
      quantity: net === null ? "" : fixed(net, 2),
      unit: asText(item.unit),
      rate: asNumber(item.rate) ?? 0,
      amount: asNumber(item.amount) ?? 0,
      breakdown,
    });
  });

  return rows;
};

// ── Item table foot ───────────────────────────────────────────────────────────
//
// The reference prints its figures plain — "29640.00", no symbol, no grouping —
// at the document's sub-unit length.

const decimals = (invoice: any): number =>
  Number.isInteger(invoice?.subUnitLength) ? invoice.subUnitLength : 2;

export const plainAmount = (value: any, invoice: any): string => {
  const n = asNumber(value);
  return n === null ? "" : fixed(n, decimals(invoice));
};

// The Subtotal model hands over formatted figures only ("₹1,045.50", "- ₹50").
// On an English-locale document — "," groups, "." marks decimals — they are
// read back to plain; any other locale keeps the model's own formatting rather
// than risk misreading its separators.
const unformat = (formatted: any, invoice: any): string => {
  const text = asText(formatted);
  const locale = asText(invoice?.locale);
  const digits = text.replace(/[^\d.]/g, "");
  if ((locale && !/^en\b/i.test(locale)) || !digits) return text;
  const negative = /[-−]/.test(text);
  return `${negative ? "-" : ""}${fixed(Number(digits), decimals(invoice))}`;
};

// "2.50" → "2.5", "9" → "9".
const trimRate = (rate: number): string => String(Number(rate.toFixed(3)));

// The one GST rate every item shares, or null when items differ or carry none.
const uniformGstRate = (invoice: any): number | null => {
  const rates = new Set(
    asArray(invoice?.items)
      .filter(
        (item) =>
          item &&
          !item.group &&
          !item.isGroupItemTotalRow &&
          item.hidden !== true
      )
      .map((item) => asNumber(item.gstRate))
      .filter((rate): rate is number => rate !== null)
  );
  return rates.size === 1 ? [...rates][0] : null;
};

export type FootRow = {
  key: string;
  label: string;
  value: string;
  isTaxRow: boolean;
  survivesHideTotals: boolean;
};

export type ItemFoot = {
  hidden: boolean;
  hideTaxes: boolean;
  body: FootRow[];
  totalLabel: string;
  total: string;
  roundedTotal: string;
  extra: Array<{ key: string; label: string; value: string }>;
  due: Array<{ key: string; label: string; value: string }>;
};

// The Subtotal model's rows laid out the reference's way:
//   body   — taxes, discounts, cess and charges, at the foot of the item body,
//            a tax labelled with its rate ("CGST 2.5%") when every item shares it;
//   Total  — the total before round off;
//   Round off Total — the document total.
// The model's own sub total and grand total rows are what Total and Round off
// Total replace. Extra fields and the balance rows follow as the model has them.
export const itemFoot = (model: any, invoice: any): ItemFoot => {
  const rate = uniformGstRate(invoice);
  const toRow = (row: any) => ({
    key: asText(row?.key),
    label: asText(row?.label),
    value: unformat(row?.value, invoice),
  });

  const body = asArray(model?.groups?.main)
    .filter(
      (row) =>
        !["subTotal", "amount", "total"].includes(row?.key) &&
        row?.emphasis !== "grand"
    )
    .map((row) => {
      const base = toRow(row);
      const split = base.key === "cgst" || base.key === "sgst";
      const rated = rate !== null && (split || base.key === "igst");
      return {
        ...base,
        label: rated
          ? `${base.label} ${trimRate(split ? rate / 2 : rate)}%`
          : base.label,
        isTaxRow: row?.isTaxRow === true,
        survivesHideTotals: row?.survivesHideTotals === true,
      };
    });

  const total = asNumber(invoice?.finalTotal?.total) ?? 0;
  const roundOff = asNumber(invoice?.finalTotal?.totalRoundOff) ?? 0;

  return {
    hidden: model?.hidden === true,
    hideTaxes: model?.hideTaxes === true,
    body,
    totalLabel: pickFirst(invoice?.customLabels?.total, "Total"),
    total: fixed(total - roundOff, decimals(invoice)),
    roundedTotal: fixed(total, decimals(invoice)),
    extra: asArray(model?.groups?.extra).map((row) => ({
      ...toRow(row),
      value: asText(row?.value),
    })),
    due: asArray(model?.groups?.due).map(toRow),
  };
};

// ── Bank ──────────────────────────────────────────────────────────────────────
//
// Bank lines in the reference's "BANK - STATE BANK OF INDIA" form. The account's
// customLabels key wins; otherwise the reference's own wording. A line prints
// only when its value does. Payloads carry `name`/`bank`/`accountNo`; the
// contract declares `accountHolderName`/`bankName`/`accountNumber` — both are read.
const BANK_LABELS: Record<string, string> = {
  bankName: "BANK",
  branch: "BRANCH",
  accountHolderName: "A/C NAME",
  accountNumber: "A/C NO.",
  ifsc: "IFSC",
  iban: "IBAN",
  swiftCode: "SWIFT",
};

export const bankLines = (bank: any, customLabels: any): Field[] => {
  const labelOf = (key: string): string =>
    pickFirst(customLabels?.[key], bank?.customLabels?.[key], BANK_LABELS[key]);

  const rows: Field[] = [
    {
      label: labelOf("bankName"),
      value: pickFirst(bank?.bank, bank?.bankName),
    },
    { label: labelOf("branch"), value: asText(bank?.branch) },
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
  ].filter((row) => row.value);

  asArray(bank?.customFields).forEach((field) => {
    const label = asText(field?.label);
    const value = asText(field?.value);
    if (label && value && field?.params?.showInInvoice !== false) {
      rows.push({ label, value });
    }
  });

  return rows;
};

export function registerGsTradersTemplateHelpers(HB: any): void {
  HB.registerHelper("eq", (a: any, b: any) => a === b);
  // Handlebars passes its options hash as the last argument; drop it.
  HB.registerHelper("or", (...args: any[]) => args.slice(0, -1).some(Boolean));
  HB.registerHelper("partyAddressLines", partyAddressLines);
  HB.registerHelper("partyFields", partyFields);
  HB.registerHelper("partyState", partyState);
  HB.registerHelper("placeOfSupply", placeOfSupply);
  HB.registerHelper("boxValue", boxValue);
  HB.registerHelper("otherCustomFields", otherCustomFields);
  HB.registerHelper("itemRows", itemRows);
  HB.registerHelper("itemFoot", itemFoot);
  HB.registerHelper("plainAmount", plainAmount);
  HB.registerHelper("bankLines", bankLines);
}

/* eslint-enable @typescript-eslint/no-explicit-any */
