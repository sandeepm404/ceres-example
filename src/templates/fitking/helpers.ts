// Handlebars helpers for the fitking template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function registerFitkingTemplateHelpers(HB: any): void {
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

  function extractNumericValue(val: any): number | null {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === "number") return isNaN(val) ? null : val;
    if (typeof val === "string") {
      const cleaned = val.replace(/,/g, "").trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    if (typeof val === "object" && val !== null) {
      const candidateKeys = ["amount", "total", "value", "totalDiscount", "discountAmount", "val", "price", "rate"];
      for (const k of candidateKeys) {
        if (val[k] !== undefined && val[k] !== null) {
          const res = extractNumericValue(val[k]);
          if (res !== null) return res;
        }
      }
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
    if (typeof val === "number") return isNaN(val) ? "" : String(val);
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      return val.map(stringifyFieldValue).filter(Boolean).join(", ");
    }
    // Objects have no sensible single-line form; printing one would render
    // "[object Object]" onto the document.
    return "";
  }

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
    for (const field of asArray(party.customFields)) {
      add(field?.label ?? field?.name, field?.value, field?.params?.showInInvoice === false);
    }
    for (const id of asArray(party.additionalIds)) {
      add(id?.label, id?.value, id?.showInInvoice === false);
    }
    for (const header of asArray(party.customHeaders)) {
      add(header?.label, header?.value, header?.showInInvoice === false);
    }

    return fields;
  });

  // Letterhead/footer assets are documented as strings, but the platform also
  // ships them as { url } — see toAssetUrl in src/main/commonUtils.ts. Printing
  // the raw value in an `src` renders "[object Object]", which the browser
  // resolves to a broken image: the block keeps its height but shows nothing.
  // Resolving here means a value we cannot turn into a URL reads as absent, so
  // the surrounding `is-empty` guard collapses the block instead.
  function resolveAssetUrl(val: any): string {
    if (typeof val === "string") return val.trim();
    if (val && typeof val === "object") {
      for (const key of ["url", "src", "link", "href"]) {
        const nested = (val as any)[key];
        if (typeof nested === "string" && nested.trim()) return nested.trim();
      }
    }
    return "";
  }

  HB.registerHelper("assetUrl", function (val: any) {
    return resolveAssetUrl(val);
  });

  HB.registerHelper("isPositive", function (val: any) {
    const num = extractNumericValue(val);
    return num !== null && num > 0;
  });

  function formatCurrencyValue(value: any, invoiceOrSymbol?: any): string {
    const num = extractNumericValue(value);
    if (num === null) {
      if (typeof value === "string") return value;
      return "";
    }

    const absNum = Math.abs(num);
    const formattedNum = absNum.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    let sym = "";
    if (typeof invoiceOrSymbol === "string") {
      sym = invoiceOrSymbol.trim();
    } else if (typeof invoiceOrSymbol === "object" && invoiceOrSymbol !== null) {
      if (invoiceOrSymbol.customCurrencySymbol !== undefined && invoiceOrSymbol.customCurrencySymbol !== null && invoiceOrSymbol.customCurrencySymbol !== "") {
        sym = String(invoiceOrSymbol.customCurrencySymbol).trim();
      } else if (invoiceOrSymbol.currencySymbol) {
        sym = String(invoiceOrSymbol.currencySymbol).trim();
      } else if (invoiceOrSymbol.currency === "INR" || invoiceOrSymbol.businessCurrency === "INR") {
        sym = "₹";
      } else if (invoiceOrSymbol.currency) {
        sym = String(invoiceOrSymbol.currency).trim();
      } else {
        sym = "₹";
      }
    }

    const text = sym ? `${sym}${formattedNum}` : formattedNum;
    if (num < 0) {
      return `(${text})`;
    }
    return text;
  }

  HB.registerHelper("formatCurrency", formatCurrencyValue);

  HB.registerHelper("formatPhone", function (phone: any) {
    if (!phone) return "";
    let str = String(phone).trim();
    if (!str) return "";

    if (str.includes(" ") || str.includes("-")) {
      return str;
    }

    const hasPlus = str.startsWith("+");
    const digits = str.replace(/\D/g, "");
    if (!digits) return str;

    if (digits.length === 12 && digits.startsWith("91")) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }

    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }

    if (hasPlus) {
      if (digits.length === 12 && digits.startsWith("91")) {
        return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
      }
      return `+${digits}`;
    }

    return str;
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

  HB.registerHelper("getColumnLabel", function (key: string, fallback: string, options: any) {
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
        columns.find((c: any) => (COLUMN_ALIASES[target] || []).includes(keyOf(c)));
      if (col && col.label && typeof col.label === "string" && col.label.trim()) {
        return col.label.trim();
      }
    }

    const customLabels = root?.invoice?.customLabels;
    if (customLabels && customLabels[key]) {
      return customLabels[key];
    }

    return fallback;
  });

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
    total: "amount",
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
    model: { colClass: "fk-col-model", label: "Model  No", labelKey: "model" },
    hsn: { colClass: "fk-col-hsn", label: "HSN/SAC", labelKey: "hsn" },
    rate: { colClass: "fk-col-price", label: "Unit Price", labelKey: "rate" },
    qty: { colClass: "fk-col-qty", label: "Qty", labelKey: "quantity" },
    discount: { colClass: "fk-col-disc", label: "Discount", labelKey: "discount" },
    igst: { colClass: "fk-col-tax", label: "IGST", labelKey: "igst" },
    cgst: { colClass: "fk-col-tax", label: "CGST", labelKey: "cgst" },
    sgst: { colClass: "fk-col-tax", label: "SGST", labelKey: "sgst" },
    amount: { colClass: "fk-col-total", label: "Total", labelKey: "total" },
    custom: { colClass: "fk-col-custom", label: "" },
  };

  const normalizeColumnKey = (key: any) =>
    String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // Tax, discount and HSN columns stay subject to the document's visibility
  // flags: a declared column set lists every column the account has configured,
  // including ones that do not apply to this document (an intra-state invoice
  // still declares IGST), and rendering those would print a column of zeros.
  function isKindVisible(kind: string, root: any): boolean {
    const visibility = root?.mapped?.visibility || {};
    if (kind === "hsn") return Boolean(root?.derived?.showHsnColumn);
    if (kind === "discount") return Boolean(root?.invoice?.finalTotal?.discount);
    if (kind === "igst") return Boolean(visibility.showIgst);
    if (kind === "cgst" || kind === "sgst") return Boolean(visibility.showCgstSgst);
    return true;
  }

  function getItemColumns(root: any): Array<Record<string, any>> {
    const rawColumns = root?.columns || root?.invoice?.columns;
    const customLabels = root?.invoice?.customLabels || {};

    // The declared set, minus the entries that never print, resolved to kinds.
    const declared: Array<Record<string, any>> = [];
    for (const col of Array.isArray(rawColumns) ? rawColumns : []) {
      if (!col || typeof col !== "object") continue;
      if (col.isHidden === true || col.private === true) continue;

      const key = String(col.key || col.id || col.name || "").trim();
      if (!key) continue;
      const label = typeof col.label === "string" ? col.label.trim() : "";
      const kind = COLUMN_KEY_KINDS[normalizeColumnKey(key)];

      // An unrecognised key is a user-defined column, rendered from item data.
      if (!kind && !label) continue;
      declared.push({
        kind: kind || "custom",
        label,
        key,
        dataType: String(col.dataType || "").toLowerCase(),
        fxReturnType: String(col.fxReturnType || "").toLowerCase(),
      });
    }

    const columns: Array<Record<string, any>> = [];
    const usedKinds = new Set<string>();
    const declares = (kind: string) => declared.some((col) => col.kind === kind);

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
      columns.push({ ...extra, kind, colClass: extra.colClass || meta.colClass, label });
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

    // Payloads ship both an `amount` and a `total` column for what this
    // template renders as one; `total` carries the heading meant for it.
    const totalLabel = declared.find(
      (col) => col.kind === "amount" && normalizeColumnKey(col.key) === "total"
    )?.label;

    add("sno");
    if (!declares("name")) addItemColumns();

    for (const col of declared) {
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
        const label = col.kind === "amount" ? totalLabel || col.label : col.label;
        add(col.kind, label ? { label } : {});
      }
    }

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

    return columns;
  }

  HB.registerHelper("itemColumns", function (options: any) {
    return getItemColumns(options?.data?.root);
  });

  // The rendered cell for a user-defined column: the text plus whether it came
  // out numeric, which the markup uses to stop long figures wrapping mid-number.
  // Payloads put these values on `custom` keyed by column key, on a
  // `customFields` list, or occasionally flat on the item itself, so all three
  // are checked before giving up.
  HB.registerHelper("customColumnCell", function (item: any, column: any, invoice?: any) {
    if (!item || !column?.key) return { text: "", isNumber: false };

    const key = String(column.key);
    let value = item.custom?.[key];

    if (value === undefined || value === null || value === "") {
      const match = (Array.isArray(item.customFields) ? item.customFields : []).find((field: any) => {
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
    const declaredType = `${column.dataType || ""} ${column.fxReturnType || ""}`;
    if (declaredType.includes("currency") && extractNumericValue(value) !== null) {
      return { text: formatCurrencyValue(value, invoice), isNumber: true };
    }

    return {
      text: stringifyFieldValue(value),
      isNumber: extractNumericValue(value) !== null,
    };
  });

  // Column count of the line-item table. The full-width description row spans
  // the whole table, and a colspan larger than the real column count makes the
  // browser invent the missing columns — they eat the width the auto-sized Item
  // column should get and leave a dead strip at the right edge.
  HB.registerHelper("itemColspan", function (options: any) {
    return getItemColumns(options?.data?.root).length;
  });

  HB.registerHelper("getTotalsLabel", function (key: string, fallback: string, options: any) {
    const root = options?.data?.root;
    const customLabels = root?.invoice?.customLabels;
    if (customLabels) {
      const k = (key || "").toLowerCase();
      for (const [ckey, cval] of Object.entries(customLabels)) {
        if (ckey.toLowerCase() === k && typeof cval === "string" && cval.trim()) {
          return cval.trim();
        }
      }
    }
    return fallback;
  });

  HB.registerHelper("getChargeName", function (item: any, fallback?: string) {
    if (!item) return typeof fallback === "string" ? fallback : "Extra Charges";
    if (typeof item === "string") return item;

    const name =
      item.name ||
      item.label ||
      item.chargeName ||
      item.title ||
      item.description ||
      item.customLabel ||
      item.type;

    if (name && typeof name === "string" && name.trim()) {
      return name.trim();
    }

    return typeof fallback === "string" ? fallback : "Extra Charges";
  });

  function isDatabaseId(str: string): boolean {
    if (!str) return false;
    const trimmed = str.trim();
    return /^[a-z0-9]{10,}$/i.test(trimmed) || /^[0-9a-fA-F]{24}$/.test(trimmed);
  }

  function lookupUnitInObjectOrArray(unitId: string, src: any): string {
    if (!src || !unitId) return "";
  
    if (typeof src === "object" && !Array.isArray(src)) {
      const match = src[unitId];
      if (typeof match === "string" && !isDatabaseId(match)) return match;
      if (typeof match === "object" && match !== null) {
        const name = match.symbol || match.name || match.shortName || match.label || match.title;
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
          const name = match.symbol || match.name || match.shortName || match.label || match.title || match.code;
          if (name && !isDatabaseId(name)) return name;
        }
      }
    }

    return "";
  }

  function resolveUnit(unitRaw: any, item?: any, invoice?: any): string {
    let candidates = [
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

    for (const cand of candidates) {
      if (cand && typeof cand === "string" && !isDatabaseId(cand)) {
        return cand.trim();
      }
    }

    let rawStr = "";
    if (typeof unitRaw === "string") {
      rawStr = unitRaw.trim();
    } else if (typeof unitRaw === "object" && unitRaw !== null) {
      rawStr = unitRaw.symbol || unitRaw.name || unitRaw.shortName || unitRaw.label || "";
    }

    if (rawStr && !isDatabaseId(rawStr)) {
      return rawStr;
    }

    const unitIdToLookup = rawStr || (typeof item?.unit === "string" ? item.unit : "");
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

      for (const src of sources) {
        const found = lookupUnitInObjectOrArray(unitIdToLookup, src);
        if (found) return found;
      }
    }

    if (isDatabaseId(unitIdToLookup)) {
      return "Nos";
    }

    return rawStr;
  }

  HB.registerHelper("formatQtyCell", function (item: any, invoice: any, advanceOptions: any) {
    if (!item) return "";
    const qty = item.quantity !== undefined && item.quantity !== null ? item.quantity : item.qty;
    if (qty === undefined || qty === null) return "";

    const unitCol = (
      advanceOptions?.unitColumn ||
      invoice?.advanceOptions?.unitColumn ||
      "MERGE_QUANTITY"
    ).toUpperCase();

    if (["MERGE_NAME", "SEPARATE", "HIDE", "NONE", "FALSE"].includes(unitCol)) {
      return String(qty);
    }

    const unit = resolveUnit(item.unit, item, invoice);
    if (unit) {
      return new HB.SafeString(`<div class="fk-qty-num">${qty}</div><div class="fk-qty-unit">${unit}</div>`);
    }
    return String(qty);
  });

}
