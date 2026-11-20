// Handlebars helpers for the fitking template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

/* eslint-disable @typescript-eslint/no-explicit-any */

import formatCurrency from "../../widgets/shared/formatCurrency";
import formatPhoneNumberIntl from "../../widgets/phone-number";

// India's official GST state codes — a fixed government-published list, not
// something the payload carries a name for. `placeOfSupply` on this invoice
// is just the bare code ("07"); some payloads instead combine code and name
// as one string ("29-KARNATAKA"), which the helper below also unpacks.
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

export function registerFitkingTemplateHelpers(HB: any): void {
  // `placeOfSupply` is a bare numeric code on most payloads ("07"), so the
  // state name has to come from a lookup — falls back to whatever text was
  // actually there if the code isn't in the list (already a name, or a
  // format this list doesn't recognise).
  HB.registerHelper("gstStateName", function (value: any) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const code = (raw.match(/^\d+/)?.[0] ?? "").padStart(2, "0");
    const name = GST_STATE_CODES[code];
    if (name) return name;

    // "29-KARNATAKA" style: no match by code above because the value isn't
    // purely numeric — use whatever follows the dash instead.
    const dashIndex = raw.indexOf("-");
    if (dashIndex !== -1) return raw.slice(dashIndex + 1).trim();

    return raw;
  });

  HB.registerHelper("increment", function (value: number) {
    return value + 1;
  });
  HB.registerHelper("eq", function (a: any, b: any) {
    return a === b;
  });
  HB.registerHelper("or", function (...args: any[]) {
    const values = args.slice(0, -1);
    return values.some((val) => Boolean(val) && val !== "0" && val !== 0);
  });

  // The document's own page size, e.g. `pdfOptions.format: "a5"` — the CSS
  // `@page` at-rule can't read Handlebars data, so `template.hbs` emits a
  // `<style>` block with this resolved keyword rather than hardcoding A4. Only
  // sizes Chromium's print pipeline recognises as an `@page { size: … }`
  // keyword are mapped; anything else (unset, "auto", a value we don't know)
  // falls back to A4, matching the previous hardcoded behaviour.
  const PAGE_SIZE_KEYWORDS: Record<string, string> = {
    a3: "A3",
    a4: "A4",
    a5: "A5",
    b4: "B4",
    b5: "B5",
    letter: "letter",
    legal: "legal",
    ledger: "ledger",
    tabloid: "ledger",
  };

  HB.registerHelper("pageSizeKeyword", function (format: any) {
    const key = String(format ?? "")
      .trim()
      .toLowerCase();
    return PAGE_SIZE_KEYWORDS[key] || "A4";
  });

  function extractNumericValue(val: any): number | null {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === "number") return Number.isNaN(val) ? null : val;
    if (typeof val === "string") {
      const cleaned = val.replace(/,/g, "").trim();
      const parsed = parseFloat(cleaned);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof val === "object" && val !== null) {
      const candidateKeys = [
        "amount",
        "total",
        "value",
        "totalDiscount",
        "discountAmount",
        "val",
        "price",
        "rate",
      ];
      // The first candidate key that holds a number wins.
      const found = candidateKeys
        .filter((k) => val[k] !== undefined && val[k] !== null)
        .map((k) => extractNumericValue(val[k]))
        .find((res) => res !== null);
      return found ?? null;
    }
    return null;
  }

  HB.registerHelper("hasValue", function (val: any) {
    const num = extractNumericValue(val);
    if (num !== null) return true;
    return val !== undefined && val !== null && val !== "";
  });

  // A party's operator-defined extras arrive in three differently shaped
  // buckets, and any of them can be absent. Flatten them to one {label, value}
  // list so each party block renders with a single loop.
  function stringifyFieldValue(val: any): string {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val.trim();
    if (typeof val === "number") return Number.isNaN(val) ? "" : String(val);
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      return val.map(stringifyFieldValue).filter(Boolean).join(", ");
    }
    // Objects have no sensible single-line form; printing one would render
    // "[object Object]" onto the document.
    return "";
  }

  // Strips a trailing blank line/`<br>` a rich-text editor leaves behind when
  // a description is composed with an empty line at the end. MarkdownViewer
  // renders that as a genuine empty `<p><br></p>`, which — inside a table
  // cell sharing its row's height with much shorter cells (rate, total, tax)
  // — shows up as dead space at the bottom of the row, bounded by the row's
  // own borders like an extra blank row. Only trailing emptiness is removed;
  // a `<br>` anywhere else in the text is a deliberate line break.
  HB.registerHelper("trimTrailingBlankLines", function (text: any) {
    if (typeof text !== "string") return text;
    return text.replace(/(?:\s*<br\s*\/?>\s*)+$/gi, "").replace(/\s+$/, "");
  });

  HB.registerHelper("partyFields", function (party: any) {
    if (!party || typeof party !== "object") return [];

    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: any, value: any, isHidden: boolean) => {
      if (isHidden) return;
      const text = stringifyFieldValue(value);
      const name = typeof label === "string" ? label.trim() : "";
      if (!text || !name) return;
      fields.push({ label: name, value: text });
    };
    const asArray = (val: any): any[] => (Array.isArray(val) ? val : []);

    // `showInInvoice` is opt-out: it is frequently absent on records that are
    // meant to print, so only an explicit false hides the row.
    asArray(party.customFields).forEach((field) =>
      add(
        field?.label ?? field?.name,
        field?.value,
        field?.params?.showInInvoice === false
      )
    );
    asArray(party.additionalIds).forEach((id) =>
      add(id?.label, id?.value, id?.showInInvoice === false)
    );
    asArray(party.customHeaders).forEach((header) =>
      add(header?.label, header?.value, header?.showInInvoice === false)
    );

    return fields;
  });

  // Letterhead/footer assets are documented as strings, but the platform also
  // ships them as { url } — see toAssetUrl in src/main/commonUtils.ts. Printing
  // the raw value in an `src` renders "[object Object]", which the browser
  // resolves to a broken image: the block keeps its height but shows nothing.
  // Resolving here means a value we cannot turn into a URL reads as absent, so
  // the surrounding `is-empty` guard collapses the block instead. `itemImages`
  // below reuses the same unwrapping for line-item photos.
  function resolveAssetUrl(val: any): string {
    if (typeof val === "string") return val.trim();
    if (val && typeof val === "object") {
      const nested = ["url", "src", "link", "href"]
        .map((key) => (val as any)[key])
        .find((value) => typeof value === "string" && value.trim());
      if (nested) return nested.trim();
    }
    return "";
  }

  HB.registerHelper("assetUrl", function (val: any) {
    return resolveAssetUrl(val);
  });

  // A line item's pictures. The photo column always shows the thumbnail
  // array (`images`), never `originalImages` — those are full-resolution
  // uploads that are too heavy for the small in-table photo.
  function resolveItemImages(item: any): string[] {
    if (!item || typeof item !== "object") return [];

    return (Array.isArray(item.images) ? item.images : [])
      .map(resolveAssetUrl)
      .filter(Boolean);
  }

  HB.registerHelper("itemImages", function (item: any) {
    return resolveItemImages(item);
  });

  // Keys are compared with punctuation and case stripped, so `accountNo`,
  // `account_no` and `Account No` are the same key.
  const normalizeColumnKey = (key: any) =>
    String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  // The bank block, built from the payload rather than written out row by row.
  // Two things make hardcoding it wrong: BankDetails carries its own
  // `customLabels` (an account renaming "IFSC" to "Sort Code" is data, not a
  // template edit), and every field has more than one accepted name in the
  // contract — this payload fills `bank` and `name`, not the `bankName` and
  // `holderName` the markup used to read, so those rows printed empty or fell
  // back to the biller. Rows with no value are dropped, so an account that has
  // no SWIFT/IBAN prints exactly what it did before.
  const BANK_ROWS: Array<{
    valueKeys: string[];
    labelKeys: string[];
    label: string;
  }> = [
    {
      valueKeys: ["bankName", "bank"],
      labelKeys: ["bankName", "bank"],
      label: "Bank Name",
    },
    {
      valueKeys: ["accountHolderName", "holderName", "name"],
      labelKeys: ["accountName", "accountHolderName", "holderName"],
      label: "Account Name",
    },
    {
      valueKeys: ["accountNo", "accountNumber"],
      labelKeys: ["accountNo", "accountNumber"],
      label: "Account No",
    },
    {
      valueKeys: ["ifsc", "ifscCode"],
      labelKeys: ["ifsc", "ifscCode"],
      label: "IFSC",
    },
    {
      valueKeys: ["swift", "swiftCode"],
      labelKeys: ["swift", "swiftCode"],
      label: "SWIFT",
    },
    { valueKeys: ["iban"], labelKeys: ["iban"], label: "IBAN" },
    { valueKeys: ["branch"], labelKeys: ["branch"], label: "Branch" },
    { valueKeys: ["sortCode"], labelKeys: ["sortCode"], label: "Sort Code" },
    {
      valueKeys: ["accountType"],
      labelKeys: ["accountType"],
      label: "Account Type",
    },
  ];

  HB.registerHelper("bankFields", function (invoice: any) {
    const account = invoice?.bankAccount;
    if (!account || typeof account !== "object") return [];

    // The account's own labels win over the document's, which win over ours.
    const labelSources = [account.customLabels, invoice?.customLabels];
    const labelFor = (labelKeys: string[], fallback: string) => {
      const match = labelSources
        .filter((source) => source && typeof source === "object")
        .map((source) => {
          const available = new Map<string, string>();
          Object.entries(source).forEach(([key, val]) => {
            if (typeof val === "string" && val.trim()) {
              available.set(normalizeColumnKey(key), val.trim());
            }
          });
          return labelKeys
            .map((key) => available.get(normalizeColumnKey(key)))
            .find(Boolean);
        })
        .find(Boolean);
      return match || fallback;
    };

    const rows: Array<{ label: string; value: string }> = [];
    BANK_ROWS.forEach((row) => {
      let value =
        row.valueKeys
          .map((key) => stringifyFieldValue(account[key]))
          .find(Boolean) || "";
      // The holder name is the one row that prints regardless: an account with
      // no name on it belongs to the business issuing the document.
      if (!value && row.label === "Account Name") {
        value = stringifyFieldValue(invoice?.billedBy?.name);
      }
      if (value) {
        rows.push({ label: labelFor(row.labelKeys, row.label), value });
      }
    });

    // Whatever else the account has been configured to carry.
    (Array.isArray(account.customFields) ? account.customFields : [])
      .filter((field: any) => field?.params?.showInInvoice !== false)
      .forEach((field: any) => {
        const label =
          typeof field?.label === "string" ? field.label.trim() : "";
        const value = stringifyFieldValue(field?.value);
        if (label && value) rows.push({ label, value });
      });

    return rows;
  });

  function formatCurrencyValue(value: any, invoiceOrSymbol?: any): string {
    const num = extractNumericValue(value);
    if (num === null) {
      if (typeof value === "string") return value;
      return "";
    }

    let currency: any;
    let subUnitLength: any;
    let customCurrencySymbol: any;
    if (typeof invoiceOrSymbol === "string") {
      customCurrencySymbol = invoiceOrSymbol;
    } else if (
      typeof invoiceOrSymbol === "object" &&
      invoiceOrSymbol !== null
    ) {
      currency = invoiceOrSymbol.currency;
      subUnitLength = invoiceOrSymbol.subUnitLength;
      customCurrencySymbol = invoiceOrSymbol.customCurrencySymbol;
    }

    return formatCurrency(
      num,
      currency,
      undefined,
      subUnitLength,
      customCurrencySymbol
    );
  }

  HB.registerHelper("formatCurrency", formatCurrencyValue);

  // The line discount arrives as an object (`{ amount, discountType }`), never
  // a ready-made string: a PERCENTAGE discount prints as its rate, any other
  // type as money. A missing or zero discount prints nothing, so rows the
  // business did not discount stay blank instead of reading "0%".
  function itemDiscountText(item: any, invoice: any): string {
    const discount = item?.discount;
    const raw =
      discount && typeof discount === "object" ? discount.amount : discount;
    const amount = extractNumericValue(raw);
    if (amount === null || amount === 0) return "";
    const type = String(discount?.discountType || "").toUpperCase();
    if (type === "PERCENTAGE") return `${amount}%`;
    return formatCurrencyValue(amount, invoice);
  }

  HB.registerHelper("formatItemDiscount", itemDiscountText);

  HB.registerHelper("formatPhone", function (phone: any) {
    if (typeof phone !== "string" && typeof phone !== "number") return "";
    const phoneStr = String(phone).trim();
    if (!phoneStr) return "";
    return formatPhoneNumberIntl(phoneStr) ?? phoneStr;
  });

  const COLUMN_ALIASES: Record<string, string[]> = {
    item: ["name", "description", "item", "productdescription"],
    model: ["model", "modelno", "model_no"],
    rate: ["rate", "price", "unitprice", "unit_price"],
    quantity: ["quantity", "qty"],
    total: ["total", "amount", "linetotal"],
    hsn: ["hsn", "hsnsac", "hsn_sac", "sac"],
    discount: ["discount"],
    igst: ["igst"],
    cgst: ["cgst"],
    sgst: ["sgst"],
  };

  HB.registerHelper(
    "getColumnLabel",
    function (key: string, fallback: string, options: any) {
      const root = options?.data?.root;
      const columns = root?.columns || root?.invoice?.columns;
      const target = (key || "").toLowerCase();
      if (Array.isArray(columns)) {
        const keyOf = (c: any) => (c.key || c.id || c.name || "").toLowerCase();
        // Exact key first. Aliases are only a fallback: payloads ship both `amount`
        // and `total` columns, and `amount` sits earlier in the array, so an
        // alias-first search would label the Total column with the Amount label.
        const col =
          columns.find((c: any) => keyOf(c) === target) ||
          columns.find((c: any) =>
            (COLUMN_ALIASES[target] || []).includes(keyOf(c))
          );
        if (
          col &&
          col.label &&
          typeof col.label === "string" &&
          col.label.trim()
        ) {
          return col.label.trim();
        }
      }

      const customLabels = root?.invoice?.customLabels;
      if (customLabels && customLabels[key]) {
        return customLabels[key];
      }

      return fallback;
    }
  );

  // ── Item table columns ───────────────────────────────────────────────────
  //
  // The order comes from `invoice.columns` as the API returns it. Each declared
  // column maps to a `kind` the row markup knows how to render; anything
  // unrecognised is a user-defined column and renders from the item's own data.

  // Declared key (punctuation and case stripped) -> render kind.
  const COLUMN_KEY_KINDS: Record<string, string> = {
    name: "name",
    item: "name",
    itemname: "name",
    description: "name",
    model: "model",
    modelno: "model",
    modelnumber: "model",
    hsn: "hsn",
    sac: "hsn",
    hsnsac: "hsn",
    rate: "rate",
    price: "rate",
    unitprice: "rate",
    quantity: "qty",
    qty: "qty",
    discount: "discount",
    igst: "igst",
    cgst: "cgst",
    sgst: "sgst",
    utgst: "sgst",
    amount: "amount",
    total: "total",
  };

  // Kind -> width class on its <col>, default heading, and the `customLabels`
  // key that overrides that heading.
  const COLUMN_KIND_META: Record<
    string,
    { colClass: string; label: string; labelKey?: string }
  > = {
    sno: { colClass: "fk-col-sno", label: "" },
    name: { colClass: "fk-col-desc", label: "Item", labelKey: "item" },
    photo: { colClass: "fk-col-photo", label: "" },
    model: { colClass: "fk-col-model", label: "Model No.", labelKey: "model" },
    hsn: { colClass: "fk-col-hsn", label: "HSN/SAC", labelKey: "hsn" },
    rate: { colClass: "fk-col-price", label: "Unit Price", labelKey: "rate" },
    qty: { colClass: "fk-col-qty", label: "Qty", labelKey: "quantity" },
    discount: {
      colClass: "fk-col-disc",
      label: "Discount",
      labelKey: "discount",
    },
    igst: { colClass: "fk-col-tax", label: "IGST", labelKey: "igst" },
    cgst: { colClass: "fk-col-tax", label: "CGST", labelKey: "cgst" },
    sgst: { colClass: "fk-col-tax", label: "SGST", labelKey: "sgst" },
    amount: { colClass: "fk-col-total", label: "Amount", labelKey: "amount" },
    total: { colClass: "fk-col-total", label: "Total", labelKey: "total" },
    custom: { colClass: "fk-col-custom", label: "" },
  };

  // ── Column widths ────────────────────────────────────────────────────────
  //
  // Widths are measured from the values this document actually prints, not
  // declared per column name in CSS: the column set comes from the payload, so
  // a fixed px rule per name either clips a column whose figures are larger
  // than the rule anticipated (a nowrap total spilling past the table edge) or
  // hands width to a column that does not need it. Everything is emitted as a
  // percentage, which keeps the row exactly as wide as the table under
  // `table-layout: fixed` however many columns the payload declares.

  // Rough advance width of one character at the table's base font. Digits and
  // uppercase run wider than lowercase, so this errs high — a column half a
  // character too wide costs the description nothing noticeable, a column half
  // a character too narrow clips a figure.
  const CHAR_PX = 7;
  // Cell padding plus both borders, which the text never gets to use.
  const CELL_CHROME_PX = 18;
  // Nominal content width of the table: page width less the page and main-box
  // padding. Only used to turn measured px into a ratio, so it does not have to
  // track the real width exactly.
  const TABLE_PX = 950;
  // The description column is the point of the table; never let the measured
  // columns squeeze it below this share.
  const MIN_NAME_PCT = 26;

  // Per kind: floor, ceiling, and whether the value can wrap. Wrapping columns
  // are measured by their longest word rather than their whole text, since the
  // rest can fall to the next line.
  const COLUMN_WIDTH_RULES: Record<
    string,
    { min: number; max: number; wraps?: boolean }
  > = {
    sno: { min: 30, max: 46 },
    photo: { min: 152, max: 152 },
    model: { min: 70, max: 200 },
    hsn: { min: 66, max: 110 },
    rate: { min: 82, max: 190 },
    qty: { min: 46, max: 90 },
    discount: { min: 64, max: 130 },
    igst: { min: 60, max: 130 },
    cgst: { min: 60, max: 130 },
    sgst: { min: 60, max: 130 },
    amount: { min: 90, max: 200 },
    total: { min: 90, max: 200 },
    custom: { min: 70, max: 150, wraps: true },
    // A user-defined column declared as a number or currency: same treatment
    // as the built-in numeric kinds above, not the free-text `custom` rule.
    customNumeric: { min: 90, max: 200 },
  };

  // Whether a declared column's own dataType — not the value it happens to
  // hold — marks it as numeric. A payload can mark a column `currency` and
  // still send an item where that field is blank or unparsable; the column is
  // numeric regardless, so its cells must not wrap just because one row's
  // value could not be parsed.
  function isNumericColumnType(column: any): boolean {
    const declared = `${column?.dataType || ""} ${column?.fxReturnType || ""}`;
    return declared.includes("number") || declared.includes("currency");
  }

  const longestWordLength = (text: string) =>
    String(text || "")
      .split(/\s+/)
      .reduce((longest, word) => Math.max(longest, word.length), 0);

  // The line's tax-inclusive total: `amount` (already net of the line
  // discount) plus whatever tax the item carries. `taxAmount` wins when the
  // backend has already summed it. Otherwise only ONE regime applies per
  // invoice — inter-state IGST, or intra-state CGST+SGST/UTGST, never both —
  // so which fields to sum follows `mapped.visibility`, same as the tax
  // summary table does; a stale/leftover value in the field that does not
  // apply (e.g. a nonzero `igst` left over on a CGST/SGST invoice) must not
  // get added in, or the line double-counts tax.
  function lineItemTax(
    item: any,
    visibility?: {
      showIgst?: boolean;
      showCgstSgst?: boolean;
      isUtgst?: boolean;
    }
  ): number {
    const explicit = extractNumericValue(item?.taxAmount);
    if (explicit !== null) return explicit;

    const cess = extractNumericValue(item?.cessAmount) ?? 0;

    if (visibility?.showIgst) {
      return (extractNumericValue(item?.igst) ?? 0) + cess;
    }
    if (visibility?.showCgstSgst) {
      const stateTax = visibility.isUtgst
        ? extractNumericValue(item?.utgst) ?? 0
        : extractNumericValue(item?.sgst) ?? 0;
      return (extractNumericValue(item?.cgst) ?? 0) + stateTax + cess;
    }

    // No visibility signal available (e.g. width measurement without root
    // context) — fall back to summing whichever fields are actually present.
    return (
      (extractNumericValue(item?.igst) ?? 0) +
      (extractNumericValue(item?.cgst) ?? 0) +
      (extractNumericValue(item?.sgst) ?? 0) +
      (extractNumericValue(item?.utgst) ?? 0) +
      cess
    );
  }

  // The item's tax-inclusive total for the declared `total` column — see
  // `lineItemTax` below for how the tax figure is derived.
  HB.registerHelper(
    "formatLineTotal",
    function (item: any, invoice: any, visibility: any) {
      const amount = extractNumericValue(item?.amount) ?? 0;
      return formatCurrencyValue(
        amount + lineItemTax(item, visibility),
        invoice
      );
    }
  );

  // The rendered cell for a user-defined column: the text plus whether it came
  // out numeric, which the markup uses to stop long figures wrapping mid-number.
  // Payloads put these values on `custom` keyed by column key, on a
  // `customFields` list, or occasionally flat on the item itself, so all three
  // are checked before giving up.
  function customColumnValue(item: any, column: any, invoice?: any) {
    if (!item || !column?.key) return { text: "", isNumber: false };

    const key = String(column.key);
    let value = item.custom?.[key];

    if (value === undefined || value === null || value === "") {
      const match = (
        Array.isArray(item.customFields) ? item.customFields : []
      ).find((field: any) => {
        const candidates = [field?.key, field?.name, field?.label];
        return candidates.some(
          (candidate: any) =>
            typeof candidate === "string" &&
            candidate.trim().toLowerCase() === key.toLowerCase()
        );
      });
      value = match?.value;
    }

    if (value === undefined || value === null || value === "") {
      value = item[key];
    }

    // Currency formatting only where the column declares it: everything else,
    // `number` included, prints the value as the document stores it.
    const declaredType = `${column.dataType || ""} ${
      column.fxReturnType || ""
    }`;
    if (
      declaredType.includes("currency") &&
      extractNumericValue(value) !== null
    ) {
      return { text: formatCurrencyValue(value, invoice), isNumber: true };
    }

    // `isNumber` drives the nowrap class in the row markup. A column declared
    // `number`/`currency` must not wrap even on a row where this value happens
    // to be blank or unparsable — the column's shape doesn't change row to row.
    return {
      text: stringifyFieldValue(value),
      isNumber:
        isNumericColumnType(column) || extractNumericValue(value) !== null,
    };
  }

  HB.registerHelper("customColumnCell", customColumnValue);

  function isDatabaseId(str: string): boolean {
    if (!str) return false;
    const trimmed = str.trim();
    return (
      /^[a-z0-9]{10,}$/i.test(trimmed) || /^[0-9a-fA-F]{24}$/.test(trimmed)
    );
  }

  function lookupUnitInObjectOrArray(unitId: string, src: any): string {
    if (!src || !unitId) return "";

    if (typeof src === "object" && !Array.isArray(src)) {
      const match = src[unitId];
      if (typeof match === "string" && !isDatabaseId(match)) return match;
      if (typeof match === "object" && match !== null) {
        const name =
          match.symbol ||
          match.name ||
          match.shortName ||
          match.label ||
          match.title;
        if (name && !isDatabaseId(name)) return name;
      }
    }

    if (Array.isArray(src)) {
      const match = src.find(
        (u: any) =>
          u &&
          (u.id === unitId ||
            u._id === unitId ||
            u.unitId === unitId ||
            u.key === unitId ||
            u.code === unitId)
      );
      if (match) {
        if (typeof match === "string" && !isDatabaseId(match)) return match;
        if (typeof match === "object" && match !== null) {
          const name =
            match.symbol ||
            match.name ||
            match.shortName ||
            match.label ||
            match.title ||
            match.code;
          if (name && !isDatabaseId(name)) return name;
        }
      }
    }

    return "";
  }

  function resolveUnit(unitRaw: any, item?: any, invoice?: any): string {
    const candidates = [
      item?.unitName,
      item?.unit_name,
      item?.unitSymbol,
      item?.unit_symbol,
      item?.unitTitle,
      item?.unitLabel,
      item?.unitDetails?.symbol,
      item?.unitDetails?.name,
      item?.unit_details?.symbol,
      item?.unit_details?.name,
      item?.custom?.unit,
    ];

    const named = candidates.find(
      (cand) => cand && typeof cand === "string" && !isDatabaseId(cand)
    );
    if (named) return named.trim();

    let rawStr = "";
    if (typeof unitRaw === "string") {
      rawStr = unitRaw.trim();
    } else if (typeof unitRaw === "object" && unitRaw !== null) {
      rawStr =
        unitRaw.symbol ||
        unitRaw.name ||
        unitRaw.shortName ||
        unitRaw.label ||
        "";
    }

    if (rawStr && !isDatabaseId(rawStr)) {
      return rawStr;
    }

    const unitIdToLookup =
      rawStr || (typeof item?.unit === "string" ? item.unit : "");
    if (unitIdToLookup && invoice) {
      const sources = [
        invoice.units,
        invoice.unitList,
        invoice.unitMap,
        invoice.unitMapping,
        invoice.masterUnits,
        invoice.owner?.units,
        invoice.business?.units,
        invoice.company?.units,
        invoice.masterData?.units,
        invoice.advanceOptions?.units,
      ];

      const found = sources
        .map((src) => lookupUnitInObjectOrArray(unitIdToLookup, src))
        .find(Boolean);
      if (found) return found;
    }

    if (isDatabaseId(unitIdToLookup)) {
      return "Nos";
    }

    return rawStr;
  }

  // The text a given column prints for a given item, mirroring the row markup.
  // Anything this returns short renders clipped, so it has to stay in step with
  // the cells in template.hbs.
  function columnCellText(
    kind: string,
    column: any,
    item: any,
    invoice: any,
    visibility?: any
  ): string {
    switch (kind) {
      case "model":
        return String(item?.sku || "");
      case "hsn":
        return String(item?.hsn || "");
      case "rate":
        return formatCurrencyValue(item?.rate, invoice);
      case "qty": {
        const qty =
          item?.quantity !== undefined && item?.quantity !== null
            ? item.quantity
            : item?.qty;
        if (qty === undefined || qty === null) return "";
        // The unit prints on its own line under the figure, so the column only
        // has to fit whichever of the two is wider.
        const unit = resolveUnit(item?.unit, item, invoice);
        return String(qty).length >= String(unit || "").length
          ? String(qty)
          : String(unit);
      }
      case "discount":
        return itemDiscountText(item, invoice);
      case "igst":
        return formatCurrencyValue(item?.igst, invoice);
      case "cgst":
        return formatCurrencyValue(item?.cgst, invoice);
      case "sgst":
        return formatCurrencyValue(item?.sgst, invoice);
      case "amount":
        return formatCurrencyValue(item?.amount, invoice);
      case "total": {
        const amount = extractNumericValue(item?.amount) ?? 0;
        return formatCurrencyValue(
          amount + lineItemTax(item, visibility),
          invoice
        );
      }
      case "custom":
        return customColumnValue(item, column, invoice).text;
      default:
        return "";
    }
  }

  function assignColumnWidths(
    columns: Array<Record<string, any>>,
    root: any
  ): void {
    const invoice = root?.invoice;
    const items = Array.isArray(invoice?.items) ? invoice.items : [];
    const visibility = root?.mapped?.visibility;

    // Measured px per column, name excluded: it takes whatever is left.
    let measuredTotal = 0;
    const measured = columns.filter((column) => column.kind !== "name");
    measured.forEach((column) => {
      const rule =
        column.kind === "custom" && isNumericColumnType(column)
          ? COLUMN_WIDTH_RULES.customNumeric
          : COLUMN_WIDTH_RULES[column.kind] || COLUMN_WIDTH_RULES.custom;
      let widest = rule.wraps
        ? longestWordLength(column.label)
        : String(column.label || "").length;

      if (column.kind === "sno") {
        widest = Math.max(widest, String(items.length).length);
      } else if (column.kind !== "photo") {
        widest = items.reduce((max: number, item: any) => {
          const text = columnCellText(
            column.kind,
            column,
            item,
            invoice,
            visibility
          );
          return Math.max(
            max,
            rule.wraps ? longestWordLength(text) : text.length
          );
        }, widest);
      }

      const px = Math.min(
        rule.max,
        Math.max(rule.min, widest * CHAR_PX + CELL_CHROME_PX)
      );
      Object.assign(column, { widthPx: px });
      measuredTotal += px;
    });

    let measuredPct = (measuredTotal / TABLE_PX) * 100;
    // Too many columns to fit alongside a readable description: give them their
    // share of what is left over instead of their measured width.
    const scale =
      measuredPct > 100 - MIN_NAME_PCT ? (100 - MIN_NAME_PCT) / measuredPct : 1;
    measuredPct *= scale;

    measured.forEach((column) => {
      Object.assign(column, {
        widthPct: Number(
          ((column.widthPx / TABLE_PX) * 100 * scale).toFixed(3)
        ),
      });
    });

    const nameColumn = columns.find((column) => column.kind === "name");
    if (nameColumn) {
      nameColumn.widthPct = Number(
        Math.max(MIN_NAME_PCT, 100 - measuredPct).toFixed(3)
      );
    }
  }

  // Tax, discount and HSN columns stay subject to the document's visibility
  // flags: a declared column set lists every column the account has configured,
  // including ones that do not apply to this document (an intra-state invoice
  // still declares IGST), and rendering those would print a column of zeros.
  function isKindVisible(kind: string, root: any): boolean {
    const visibility = root?.mapped?.visibility || {};
    if (kind === "hsn") return Boolean(root?.derived?.showHsnColumn);
    if (kind === "discount")
      return Boolean(root?.invoice?.finalTotal?.discount);
    if (kind === "igst") return Boolean(visibility.showIgst);
    if (kind === "cgst" || kind === "sgst")
      return Boolean(visibility.showCgstSgst);
    if (kind === "photo") {
      const items = Array.isArray(root?.invoice?.items)
        ? root.invoice.items
        : [];
      return items.some((item: any) => resolveItemImages(item).length > 0);
    }
    return true;
  }

  function getItemColumns(root: any): Array<Record<string, any>> {
    const rawColumns = root?.columns || root?.invoice?.columns;
    const customLabels = root?.invoice?.customLabels || {};

    // The declared set, minus the entries that never print, resolved to kinds.
    const declared: Array<Record<string, any>> = [];
    (Array.isArray(rawColumns) ? rawColumns : []).forEach((col: any) => {
      if (!col || typeof col !== "object") return;
      if (col.isHidden === true || col.private === true) return;

      const key = String(col.key || col.id || col.name || "").trim();
      if (!key) return;
      const label = typeof col.label === "string" ? col.label.trim() : "";
      // A business's own custom column (e.g. one it named "Model No.") has a
      // random generated key, so it never matches by key. Falling back to the
      // label catches that case and routes it through the "model" kind, which
      // always renders the item's SKU rather than that column's stored value.
      const kind =
        COLUMN_KEY_KINDS[normalizeColumnKey(key)] ||
        (COLUMN_KEY_KINDS[normalizeColumnKey(label)] === "model"
          ? "model"
          : undefined);

      // An unrecognised key is a user-defined column, rendered from item data.
      if (!kind && !label) return;
      declared.push({
        kind: kind || "custom",
        label,
        key,
        dataType: String(col.dataType || "").toLowerCase(),
        fxReturnType: String(col.fxReturnType || "").toLowerCase(),
      });
    });

    const columns: Array<Record<string, any>> = [];
    const usedKinds = new Set<string>();
    const declares = (kind: string) =>
      declared.some((col) => col.kind === kind);

    const add = (kind: string, extra: Record<string, any> = {}) => {
      // Every kind but `custom` is a single column; payloads legitimately
      // declare both `amount` and `total`, which are the same column here.
      if (kind !== "custom" && usedKinds.has(kind)) return;
      if (!isKindVisible(kind, root)) return;
      usedKinds.add(kind);

      const meta = COLUMN_KIND_META[kind] || COLUMN_KIND_META.custom;
      const label =
        extra.label ||
        (meta.labelKey && customLabels[meta.labelKey]) ||
        meta.label;
      columns.push({
        ...extra,
        kind,
        colClass: extra.colClass || meta.colClass,
        label,
      });
    };

    // The item name and its photo are one visual unit, so the photo is pinned
    // beside the name rather than taking a slot from the declared order. It is
    // the only column this template adds that the document does not declare —
    // anything else invented here shows up as a duplicate of a declared column.
    const addItemColumns = (label?: string) => {
      if (usedKinds.has("name")) return;
      add("name", label ? { label } : {});
      add("photo");
    };

    add("sno");
    if (!declares("name")) addItemColumns();

    declared.forEach((col) => {
      if (col.kind === "name") {
        addItemColumns(col.label);
      } else if (col.kind === "custom") {
        add("custom", {
          label: col.label,
          key: col.key,
          dataType: col.dataType,
          fxReturnType: col.fxReturnType,
        });
      } else {
        add(col.kind, col.label ? { label: col.label } : {});
      }
    });

    // No column config at all: fall back to this template's own order so those
    // documents keep rendering exactly as they did.
    if (!declared.length) {
      add("model");
      add("hsn");
      add("rate");
      add("qty");
      add("discount");
      add("igst");
      add("cgst");
      add("sgst");
      add("amount");
    }

    // A user-defined column the account configured but never actually filled
    // in — no item on this document carries a value for its key under any of
    // the three buckets `customColumnValue` checks — renders as a header over
    // an empty strip. Built-in kinds are left alone: those are core invoice
    // fields (rate, qty, tax…) where an all-zero column is still meaningful,
    // just a `custom` column with nothing in it is dead weight.
    const items = Array.isArray(root?.invoice?.items) ? root.invoice.items : [];
    const visibleColumns = columns.filter(
      (column) =>
        column.kind !== "custom" ||
        items.some(
          (item: any) =>
            customColumnValue(item, column, root?.invoice).text !== ""
        )
    );

    assignColumnWidths(visibleColumns, root);
    return visibleColumns;
  }

  HB.registerHelper("itemColumns", function (options: any) {
    return getItemColumns(options?.data?.root);
  });

  // Column count of the line-item table. The full-width description row spans
  // the whole table, and a colspan larger than the real column count makes the
  // browser invent the missing columns — they eat the width the auto-sized Item
  // column should get and leave a dead strip at the right edge.
  HB.registerHelper("itemColspan", function (options: any) {
    return getItemColumns(options?.data?.root).length;
  });

  // The name header spans into the photo column via colspan, since photo
  // never gets a <th> of its own — but isKindVisible drops photo entirely
  // when no item has an image, so the colspan has to shrink to match or the
  // header claims a column the body no longer has.
  HB.registerHelper("hasPhotoColumn", function (options: any) {
    return getItemColumns(options?.data?.root).some(
      (col) => col.kind === "photo"
    );
  });

  // Every heading the document names for itself. The account configures these
  // in `invoice.customLabels` — a quotation's "Quotation From", a renamed
  // "Remarks", a translated "Total" — so the string in the markup is only what
  // prints when the payload carries no label for that key. Deciding wording
  // from the document's own data instead (matching `invoiceTitle` against
  // "Quotation", say) reads a field the user is free to type anything into, and
  // silently falls back the moment they do.
  //
  // Named `docLabel`, not `label`: line items, terms and custom fields all
  // carry their own `label` property, and a helper of that name would shadow
  // every one of them.
  // Takes one or more candidate keys followed by the fallback:
  // `{{docLabel "notes" "Remarks"}}`, or where accounts are known to name the
  // same section differently, `{{docLabel "additionalInfo" "footer" "…"}}` —
  // the first key the payload carries wins. Keys are matched with punctuation
  // and case stripped, so `additionalInfo`, `additional_info` and
  // `Additional Info` are all the same key.
  function documentLabel(...args: any[]) {
    const options = args[args.length - 1];
    const positional = args
      .slice(0, -1)
      .filter((arg) => typeof arg === "string");
    const fallback =
      positional.length > 1 ? positional[positional.length - 1] : "";
    const keys = positional.length > 1 ? positional.slice(0, -1) : positional;

    const customLabels = options?.data?.root?.invoice?.customLabels;
    if (customLabels) {
      const available = new Map<string, string>();
      Object.entries(customLabels).forEach(([ckey, cval]) => {
        if (typeof cval === "string" && cval.trim()) {
          available.set(normalizeColumnKey(ckey), cval.trim());
        }
      });
      const match = keys
        .map((key) => available.get(normalizeColumnKey(key)))
        .find(Boolean);
      if (match) return match;
    }

    return fallback;
  }

  HB.registerHelper("docLabel", documentLabel);

  // The signature image the document actually carries, or "" when it carries
  // none — the signature box is gated on this, never on
  // `customLabels.signature`, which ships as the default "Authorised
  // Signatory" even on documents with no signature.
  //
  // `signature` is the contract's own field; the `billedBy`/`signatureImage`
  // spellings are kept from the original chain as engine-specific fallbacks
  // the platform reference does not document.
  // Fitking prints the rate beside every tax row ("CGST (9%)", "IGST (18%)").
  // The shared Subtotal widget only does that under the per-rate tax view, so
  // hand it a copy of the invoice with that view forced on. The copy feeds the
  // totals block alone; the document itself is untouched.
  HB.registerHelper("withTaxRates", function (invoice: any) {
    if (!invoice || typeof invoice !== "object") return invoice;
    const advanceOptions = invoice.advanceOptions || {};
    const view = advanceOptions.taxSummaryView;
    if (view === "BOTH" || view === "INVOICE_SUMMARY") return invoice;

    return {
      ...invoice,
      advanceOptions: { ...advanceOptions, taxSummaryView: "INVOICE_SUMMARY" },
    };
  });

  HB.registerHelper("signatureImage", function (invoice: any) {
    const candidate = [
      invoice?.signature,
      invoice?.billedBy?.signature,
      invoice?.signatureImage,
      invoice?.billedBy?.signatureImage,
    ].find((src: any) => typeof src === "string" && src.trim());

    return candidate ? String(candidate).trim() : "";
  });

  HB.registerHelper(
    "formatQtyCell",
    function (item: any, invoice: any, advanceOptions: any) {
      if (!item) return "";
      const qty =
        item.quantity !== undefined && item.quantity !== null
          ? item.quantity
          : item.qty;
      if (qty === undefined || qty === null) return "";

      const unitCol = (
        advanceOptions?.unitColumn ||
        invoice?.advanceOptions?.unitColumn ||
        "MERGE_QUANTITY"
      ).toUpperCase();

      if (
        ["MERGE_NAME", "SEPARATE", "HIDE", "NONE", "FALSE"].includes(unitCol)
      ) {
        return String(qty);
      }

      const unit = resolveUnit(item.unit, item, invoice);
      if (unit) {
        return new HB.SafeString(
          `<div class="fk-qty-num">${qty}</div><div class="fk-qty-unit">${unit}</div>`
        );
      }
      return String(qty);
    }
  );

  /* ── Payload switches and compliance blocks ─────────────────────────────── */

  const asRecord = (val: any): Record<string, any> =>
    val && typeof val === "object" && !Array.isArray(val) ? val : {};
  const asList = (val: any): any[] => (Array.isArray(val) ? val : []);

  // Opt-out switches: only an explicit false (or "false") hides.
  const isOffFlag = (val: any): boolean =>
    val === false ||
    (typeof val === "string" && val.trim().toLowerCase() === "false");

  // A tri-state switch: true / false when the payload says so, else undefined.
  const optionalFlag = (val: any): boolean | undefined => {
    if (typeof val === "boolean") return val;
    const raw = stringifyFieldValue(val).toLowerCase();
    if (["true", "1", "yes", "on"].includes(raw)) return true;
    if (["false", "0", "no", "off"].includes(raw)) return false;
    return undefined;
  };

  const rootOf = (options: any) => options?.data?.root ?? {};
  const ownerConfiguration = (invoice: any) =>
    asRecord(asRecord(asRecord(invoice).owner).configuration);
  const businessFieldVisibility = (invoice: any) =>
    asRecord(
      asRecord(ownerConfiguration(invoice).experimental).fieldVisibility
    );

  // `{{#unless (isOff invoice.billedTo.phoneShowInInvoice)}}`
  HB.registerHelper("isOff", (val: any) => isOffFlag(val));

  const isIndianParty = (party: any) =>
    ["IN", "INDIA"].includes(
      stringifyFieldValue(asRecord(party).country).toUpperCase()
    );

  // GSTIN / PAN hide when the business (owner.configuration.experimental
  // .fieldVisibility.<key>.showInDocument) or the party's own map turns them off.
  const fieldShown = (invoice: any, party: any, key: string) =>
    !isOffFlag(
      asRecord(businessFieldVisibility(invoice)[key]).showInDocument
    ) && !isOffFlag(asRecord(party.fieldVisibility)[key]);

  // VAT / TRN / TIN / SST / Tax ID print only where the document carries them:
  // any switch that hides one (`<key>ShowInInvoice`, `show<Key>`, `hide<Key>`,
  // the party's or the business's fieldVisibility) hides it; an explicit "on"
  // shows it; otherwise it shows unless this is an Indian GST document, whose
  // form has GSTIN and PAN only.
  const taxIdShown = (invoice: any, party: any, aliases: string[]) => {
    const names = aliases.map((alias) => alias.toLowerCase());
    const fromMap = (map: Record<string, any>) =>
      Object.keys(map)
        .filter((key) => names.includes(key.toLowerCase()))
        .map((key) => {
          const value = map[key];
          const record = asRecord(value);
          return [
            value,
            record.showInDocument,
            record.showInInvoice,
            record.visible,
          ]
            .map(optionalFlag)
            .find((flag) => flag !== undefined);
        });
    const capital = (alias: string) =>
      alias.charAt(0).toUpperCase() + alias.slice(1);
    const switches = [
      ...aliases.flatMap((alias) =>
        [
          party[`${alias}ShowInInvoice`],
          party[`show${capital(alias)}InInvoice`],
          party[`show${capital(alias)}`],
        ].map(optionalFlag)
      ),
      ...fromMap(asRecord(party.fieldVisibility)),
      ...fromMap(businessFieldVisibility(invoice)),
    ].filter((flag): flag is boolean => flag !== undefined);
    const hidden = aliases.some(
      (alias) => optionalFlag(party[`hide${capital(alias)}`]) === true
    );
    if (hidden || switches.includes(false)) return false;
    if (switches.includes(true)) return true;
    return (
      stringifyFieldValue(invoice.taxType).toUpperCase() !== "INDIA" ||
      !isIndianParty(party)
    );
  };

  // A party's tax numbers, in the order refrens.com prints them. GSTIN and PAN
  // are Indian numbers, so a party abroad prints neither; the other
  // geographies' numbers never print for a party in India.
  HB.registerHelper("partyTaxIds", function (party: any, options: any) {
    const p = asRecord(party);
    const invoice = asRecord(rootOf(options).invoice);
    const label = (...args: string[]) => documentLabel(...args, options);
    const rows: Array<{ label: string; value: string }> = [];
    const add = (labelText: string, value: any) => {
      const text = stringifyFieldValue(value);
      if (text) rows.push({ label: labelText, value: text });
    };

    const domestic = isIndianParty(p) || !stringifyFieldValue(p.country);
    if (domestic && fieldShown(invoice, p, "gst")) {
      add(label("gstin", "gstNumber", "GSTIN"), p.gstin);
    }
    if (domestic && fieldShown(invoice, p, "pan")) {
      add(
        label("pan", "panNumber", "PAN"),
        stringifyFieldValue(p.panNumber) || p.pan
      );
    }
    if (!isIndianParty(p)) {
      const vatFallback = stringifyFieldValue(p.vatLabel) || "VAT Number";
      [
        {
          key: "vatNumber",
          aliases: ["vat", "vatNumber"],
          text: label("vat", "vatNumber", vatFallback),
        },
        {
          key: "trnNumber",
          aliases: ["trn", "trnNumber"],
          text: label("trn", "trnNumber", "TRN"),
        },
        {
          key: "tinNumber",
          aliases: ["tin", "tinNumber"],
          text: label("tin", "tinNumber", "TIN"),
        },
        {
          key: "sstNumber",
          aliases: ["sst", "sstNumber"],
          text: label("sst", "sstNumber", "SST"),
        },
        {
          key: "taxId",
          aliases: ["taxId"],
          text: label("taxId", "Tax ID"),
        },
      ].forEach(({ key, aliases, text }) => {
        if (stringifyFieldValue(p[key]) && taxIdShown(invoice, p, aliases)) {
          add(text, p[key]);
        }
      });
    }
    return rows;
  });

  // The client's contact person: the name, plus their email and phone when the
  // contact asks for them (contactPerson.displayFields). The name is skipped
  // when one of the party's own fields already carries it.
  HB.registerHelper("contactPersonFields", function (party: any, options: any) {
    const p = asRecord(party);
    const person = asRecord(p.contactPerson);
    const label = (...args: string[]) => documentLabel(...args, options);
    const name = stringifyFieldValue(person.name);
    const shows = (field: string) =>
      asList(person.displayFields).map(stringifyFieldValue).includes(field);
    const ownValues = [
      ...asList(p.customFields),
      ...asList(p.additionalIds),
      ...asList(p.customHeaders),
    ].map((field) => stringifyFieldValue(asRecord(field).value).toLowerCase());

    const rows: Array<{ label: string; value: string; isPhone?: boolean }> = [];
    if (name && !ownValues.includes(name.toLowerCase())) {
      rows.push({
        label: label("contactPerson", "responsiblePerson", "Contact Person"),
        value: name,
      });
    }
    if (shows("email") && stringifyFieldValue(person.email)) {
      rows.push({
        label: label("contactPersonEmail", "Contact Email"),
        value: stringifyFieldValue(person.email),
      });
    }
    if (shows("phone") && stringifyFieldValue(person.phone)) {
      rows.push({
        label: label("contactPersonPhone", "Contact Phone"),
        value: stringifyFieldValue(person.phone),
        isPhone: true,
      });
    }
    return rows;
  });

  // The business's e-invoice / e-way bill settings, the document's own
  // (einvoiceConfig / ewayConfig) over the account's.
  const complianceSettings = (invoice: any) => {
    const configuration = ownerConfiguration(invoice);
    return {
      einvoice: {
        ...asRecord(configuration.einvoice),
        ...asRecord(invoice.einvoiceConfig),
      },
      eway: {
        ...asRecord(configuration.eway),
        ...asRecord(invoice.ewayConfig),
      },
    };
  };

  // What the details column's QR is, for its label. `mapped.qr.top` is the
  // first of these the document carries (shared normalizer): the e-invoice QR
  // while the IRN is active, then the ZATCA and LHDN QRs, then the document's
  // own QR. The same order and the same "is it there" test are used here, so
  // the label always names the code that printed.
  HB.registerHelper("topQrLabel", function (options: any) {
    const invoice = asRecord(rootOf(options).invoice);
    const irn = asRecord(invoice.irn);
    const present = (val: any) => {
      const text = stringifyFieldValue(val);
      return Boolean(text) && text !== "null" && text !== "undefined";
    };
    const label = (...args: string[]) => documentLabel(...args, options);
    if (
      (present(invoice.qrCode) || present(irn.qrCode)) &&
      !present(irn.CancelDate)
    ) {
      return label("einvoiceQr", "irnQr", "e-Invoice QR");
    }
    if (present(invoice.zatcaQrCode)) return label("zatcaQr", "ZATCA QR");
    if (present(invoice.lhdnQrCode)) return label("lhdnQr", "LHDN QR");
    return label("documentQr", "Document QR");
  });

  // The IRN itself, unless the business's e-invoice settings hide it.
  HB.registerHelper("irnNumber", function (_invoice: any, options: any) {
    const invoice = asRecord(rootOf(options).invoice);
    const { einvoice } = complianceSettings(invoice);
    if (isOffFlag(einvoice.irnNumber)) return "";
    return stringifyFieldValue(asRecord(invoice.irn).Irn);
  });

  // The e-invoice acknowledgement, IRN cancellation and e-way bill rows for the
  // details table. Each row prints only with a value and unless the business's
  // settings hide it; a cancelled IRN drops its acknowledgement.
  HB.registerHelper("complianceRows", function (_invoice: any, options: any) {
    const root = rootOf(options);
    const invoice = asRecord(root.invoice);
    const irn = asRecord(invoice.irn);
    const { einvoice, eway } = complianceSettings(invoice);
    const isCancelled =
      asRecord(asRecord(root.mapped).irn).isCancelled === true;
    const label = (...args: string[]) => documentLabel(...args, options);
    const rows = [
      {
        label: label("irnAcknowledgementNumber", "ackNo", "Ack No"),
        value:
          isOffFlag(einvoice.irnAcknowledgementNumber) || isCancelled
            ? ""
            : stringifyFieldValue(irn.AckNo),
      },
      {
        label: label(
          "irnAckDate",
          "irnAcknowledgementDate",
          "ackDate",
          "IRN Ack Date"
        ),
        value:
          isOffFlag(einvoice.irnAcknowledgementDate) || isCancelled
            ? ""
            : stringifyFieldValue(irn.AckDt),
        isUtcDate: true,
      },
      {
        label: label(
          "irnCancelled",
          "irnCancelledDate",
          "cancelDate",
          "IRN Cancelled"
        ),
        value: isOffFlag(einvoice.irnCancelledDate)
          ? ""
          : stringifyFieldValue(irn.CancelDate),
        isDate: true,
      },
      {
        label: label("ewayBillNumber", "Eway Bill"),
        value: isOffFlag(eway.billNumber) ? "" : stringifyFieldValue(irn.EwbNo),
      },
      {
        label: label("ewayBillDate", "E-Way Bill Date"),
        value: isOffFlag(eway.billDate) ? "" : stringifyFieldValue(irn.EwbDt),
        isUtcDate: true,
      },
      {
        label: label("validTillDate", "ewayValidTill", "Valid Till"),
        value: isOffFlag(eway.billValidTillDate)
          ? ""
          : stringifyFieldValue(irn.EwbValidTill),
        isUtcDate: true,
      },
    ];
    return rows.filter((row) => row.value);
  });

  // A credit / debit note's linked invoices, by number. A bare id prints nothing.
  HB.registerHelper("linkedDocumentNumbers", function (invoice: any) {
    const inv = asRecord(invoice);
    return [...asList(inv.linkedInvoices), ...asList(inv.linkedDocuments)]
      .map((linked) => stringifyFieldValue(asRecord(linked).invoiceNumber))
      .filter(Boolean)
      .join(", ");
  });

  // The document's attachments as { url, name }; a file's name is the last
  // segment of its URL, without the query string.
  HB.registerHelper("attachmentFiles", function (invoice: any) {
    return asList(asRecord(invoice).attachments)
      .map((entry) => {
        const record = asRecord(entry);
        return stringifyFieldValue(
          typeof entry === "string" ? entry : record.url || record.link
        );
      })
      .filter(Boolean)
      .map((url) => {
        const path = url.split(/[?#]/)[0];
        let name = path.substring(path.lastIndexOf("/") + 1);
        try {
          name = decodeURIComponent(name);
        } catch {
          /* keep it encoded */
        }
        return { url, name: name || url };
      });
  });

  // Batch Summary — Refrens' "Show Batch Summary in Invoice"
  // (advanceOptions.showStockSummary). Rows are the document's own
  // batchSummary (sent only when the setting is on), else, when the setting is
  // explicitly on, the items' batches. An explicit off hides it. Columns follow
  // the business's batch summary config (order, labels, hidden ones left out);
  // without one, the standard set less any column no row fills.
  const BATCH_COLUMNS = [
    {
      key: "itemName",
      label: "Item Name",
      showSku: true,
      showBatchCode: false,
    },
    {
      key: "batchName",
      label: "Batch Name",
      showSku: false,
      showBatchCode: true,
    },
    { key: "quantity", label: "Qty", showSku: false, showBatchCode: false },
    {
      key: "warehouse",
      label: "Warehouse",
      showSku: false,
      showBatchCode: false,
    },
    {
      key: "manufacturerName",
      label: "Mfg Name",
      showSku: false,
      showBatchCode: false,
    },
    {
      key: "manufacturingDate",
      label: "Mfg Date",
      showSku: false,
      showBatchCode: false,
    },
    {
      key: "expiryDate",
      label: "Expiry Date",
      showSku: false,
      showBatchCode: false,
    },
  ];

  const pickFirstText = (...values: any[]) =>
    values.map(stringifyFieldValue).find(Boolean) || "";

  const withCode = (name: string, code: string, show: boolean) => {
    const extra = show ? code : "";
    if (name && extra) return `${name} (${extra})`;
    return name || extra;
  };

  const batchValue = (
    entry: Record<string, any>,
    column: (typeof BATCH_COLUMNS)[number]
  ): string => {
    const batch = asRecord(entry.batch);
    if (column.key === "itemName") {
      return withCode(
        pickFirstText(entry.itemName),
        pickFirstText(entry.sku, batch.sku),
        column.showSku
      );
    }
    if (column.key === "batchName") {
      return withCode(
        pickFirstText(
          entry.batchName,
          batch.batchName,
          batch.name,
          typeof entry.batch === "string" ? entry.batch : ""
        ),
        pickFirstText(entry.batchCode, batch.batchCode),
        column.showBatchCode
      );
    }
    if (column.key === "warehouse") {
      return pickFirstText(
        entry.warehouseName,
        batch.warehouseName,
        typeof entry.warehouse === "object" ? "" : entry.warehouse
      );
    }
    return pickFirstText(
      entry[column.key],
      batch[column.key],
      asRecord(entry.custom)[column.key],
      asRecord(batch.custom)[column.key]
    );
  };

  HB.registerHelper("batchSummary", function (_invoice: any, options: any) {
    const root = rootOf(options);
    const invoice = asRecord(root.invoice);
    const explicit = [
      asRecord(root.advanceOptions).showStockSummary,
      asRecord(invoice.advanceOptions).showStockSummary,
      invoice.showStockSummary,
    ]
      .map(optionalFlag)
      .find((flag) => flag !== undefined);
    if (explicit === false) return null;

    let entries = asList(invoice.batchSummary).map(asRecord);
    if (!entries.length && explicit === true) {
      entries = asList(invoice.items)
        .map(asRecord)
        .flatMap((item) =>
          asList(item.batchSummary)
            .map(asRecord)
            .map((batch) => ({
              ...batch,
              itemName: pickFirstText(batch.itemName, item.name),
              sku: pickFirstText(batch.sku, item.sku),
            }))
        );
    }
    if (!entries.length) return null;

    const configured = asList(
      asList(asRecord(invoice.stockSummaryConfig).batchSummaryColumns).length
        ? asRecord(invoice.stockSummaryConfig).batchSummaryColumns
        : invoice.defaultBatchColumns
    )
      .map(asRecord)
      .filter((column) => column.isHidden !== true)
      .map((column) => ({
        key: pickFirstText(column.key, column.name),
        label: pickFirstText(column.label, column.name, column.key),
        showSku: column.showSku === true,
        showBatchCode: column.showBatchCode === true,
      }))
      .filter((column) => column.key && column.label);
    const source = configured.length ? configured : BATCH_COLUMNS;

    const isDateKey = (key: string) => /date$/i.test(key);
    const isQtyKey = (key: string) => /^(?:quantity|qty)$/i.test(key);
    const cells = entries.map((entry) =>
      source.map((column) => ({
        value: batchValue(entry, column),
        isDate: isDateKey(column.key),
        isNum: isQtyKey(column.key),
      }))
    );
    // The business's own columns all print, filled or not (as Refrens does).
    const kept = source
      .map((column, index) => ({ ...column, index }))
      .filter(
        (column) =>
          configured.length || cells.some((row) => row[column.index].value)
      );
    if (!kept.length) return null;

    return {
      columns: kept.map((column) => ({
        label: column.label,
        isNum: isQtyKey(column.key),
      })),
      rows: cells.map((row) => kept.map((column) => row[column.index])),
    };
  });
}

export default registerFitkingTemplateHelpers;

/* eslint-enable @typescript-eslint/no-explicit-any */
