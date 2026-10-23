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

/**
 *
 * @param HB
 */
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

  /**
   *
   * @param val
   */
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
      const match = candidateKeys
        .filter((k) => val[k] !== undefined && val[k] !== null)
        .map((k) => extractNumericValue(val[k]))
        .find((res) => res !== null);
      if (match !== undefined) return match;
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
  /**
   *
   * @param val
   */
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

  // Keys and labels compared with punctuation and case stripped.
  const normalizeColumnKey = (key: any) =>
    String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  // The first of `keys` a label map carries, matched on normalized keys.
  const firstLabel = (labels: any, keys: string[]): string => {
    const available = new Map<string, string>();
    Object.entries(labels).forEach(([key, val]) => {
      if (typeof val === "string" && val.trim()) {
        available.set(normalizeColumnKey(key), val.trim());
      }
    });
    return (
      keys.map((key) => available.get(normalizeColumnKey(key))).find(Boolean) ||
      ""
    );
  };

  // Strips a trailing blank line/`<br>` a rich-text editor leaves behind when
  // a description is composed with an empty line at the end. MarkdownViewer
  // renders that as a genuine empty `<p><br></p>`, which — inside a table
  // cell sharing its row's height with much shorter cells (rate, total, tax)
  // — shows up as dead space at the bottom of the row, bounded by the row's
  // own borders like an extra blank row. Only trailing emptiness is removed;
  // a `<br>` anywhere else in the text is a deliberate line break. Line-item
  // descriptions go through the same trim in `fitkingLineItems` below.
  /**
   *
   * @param text
   */
  function trimTrailingBlankLines(text: any) {
    if (typeof text !== "string") return text;
    return text.replace(/(?:\s*<br\s*\/?>\s*)+$/gi, "").replace(/\s+$/, "");
  }

  HB.registerHelper("trimTrailingBlankLines", trimTrailingBlankLines);

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
  // the surrounding `is-empty` guard collapses the block instead. The photo
  // column below reuses the same unwrapping for line-item photos.
  /**
   *
   * @param val
   */
  function resolveAssetUrl(val: any): string {
    if (typeof val === "string") return val.trim();
    if (val && typeof val === "object") {
      const key = ["url", "src", "link", "href"].find(
        (candidate) =>
          typeof val[candidate] === "string" && val[candidate].trim()
      );
      if (key) return val[key].trim();
    }
    return "";
  }

  HB.registerHelper("assetUrl", function (val: any) {
    return resolveAssetUrl(val);
  });

  // ── Line items ───────────────────────────────────────────────────────────
  //
  // The table is the shared LineItemsTable widget, which stays pinned. What
  // fitking prints differently is done here, on a copy of `mapped` handed to
  // the widget, rather than by editing it: descriptions lose their trailing
  // blank lines, each line's photo gets a column of its own beside the item
  // name, and a description that is not full width prints in the item cell,
  // under the name. The widget prints a cell's `text` as `{{text}}`, and
  // Handlebars passes a SafeString through unescaped, so the photo and item
  // cells carry their markup that way.

  // Every real line is one row, in `invoice.items` order; totals and the
  // stretch filler are the only rows normalization adds in between.
  const isLineRow = (row: any) => !row.isTotalsRow && !row.isFillerRow;

  // Whether anything is left to print in the widget's row under the line.
  const extrasHaveAny = (extras: any) =>
    Boolean(
      extras?.hasDescription ||
        extras?.imagesInline ||
        extras?.imagesRow ||
        extras?.hasOriginalImages ||
        extras?.hasSerials
    );

  /**
   *
   * @param mapped
   */
  function withTrimmedDescriptions(mapped: any) {
    const rows = Array.isArray(mapped?.rows) ? mapped.rows : [];
    return {
      ...mapped,
      rows: rows.map((row: any) => {
        const extras = row?.extras;
        if (!extras?.hasDescription) return row;
        const description = trimTrailingBlankLines(extras.description);
        const next = {
          ...extras,
          description,
          hasDescription: description.length > 0,
        };
        return { ...row, extras: { ...next, hasAny: extrasHaveAny(next) } };
      }),
    };
  }

  // A line item's pictures. The photo column always shows the thumbnail
  // array (`images`), never `originalImages` — those are full-resolution
  // uploads that are too heavy for the small in-table photo.
  /**
   *
   * @param item
   */
  function resolveItemImages(item: any): string[] {
    if (!item || typeof item !== "object") return [];

    return (Array.isArray(item.images) ? item.images : [])
      .map(resolveAssetUrl)
      .filter(Boolean);
  }

  /**
   *
   * @param mapped
   * @param invoice
   */
  function withPhotoColumn(mapped: any, invoice: any) {
    const columns = Array.isArray(mapped?.columns) ? mapped.columns : [];
    const rows = Array.isArray(mapped?.rows) ? mapped.rows : [];
    const items = Array.isArray(invoice?.items) ? invoice.items : [];
    // Only the first image per line item.
    const photos = items.map((item: any) => resolveItemImages(item)[0] || "");
    // No item has a photo: no column at all, rather than an empty strip.
    if (!photos.some(Boolean)) return mapped;

    const at = (rows.find(isLineRow)?.cells || []).findIndex(
      (cell: any) => cell.isItemCell
    );
    if (at === -1) return mapped;

    // Cells exist only for visible columns, so the photo column goes in
    // after the same visible column the item cell sits under.
    const visible = columns.filter((column: any) => !column.isHidden);
    const columnAt = columns.indexOf(visible[at]);
    const photoColumn = {
      ...visible[at],
      key: "photo",
      label: "",
      className: "col-photo",
      summarise: false,
    };

    const esc = HB.Utils.escapeExpression;
    let line = 0;
    const nextRows = rows.map((row: any) => {
      let src = "";
      if (isLineRow(row)) {
        src = photos[line] || "";
        line += 1;
      }
      const cells = [...row.cells];
      cells.splice(at + 1, 0, {
        key: "photo",
        className: "col-photo",
        label: "",
        isItemCell: false,
        text: src
          ? new HB.SafeString(
              `<img src="${esc(src)}" alt="${esc(
                row.item?.name || ""
              )}" class="fk-product-img" />`
            )
          : "",
      });
      if (!isLineRow(row)) return { ...row, cells };

      // The photo column is where a line's picture prints, so the widget's
      // own thumbnail and image gallery would print it a second time.
      const extras = { ...row.extras, imagesInline: false, imagesRow: false };
      return {
        ...row,
        cells,
        item: { ...row.item, showThumbnail: false },
        extras: { ...extras, hasAny: extrasHaveAny(extras) },
      };
    });

    return {
      ...mapped,
      columns: [
        ...columns.slice(0, columnAt + 1),
        photoColumn,
        ...columns.slice(columnAt + 1),
      ],
      rows: nextRows,
    };
  }

  // The widget's own item-cell markup (name, SKU, merged notes, thumbnail),
  // followed by the description. Kept in step with LineItemsTable.hbs.
  /**
   *
   * @param item
   * @param description
   */
  function itemCellWithDescription(item: any, description: string): any {
    const esc = HB.Utils.escapeExpression;
    const parts = [`<span class="item-name">${esc(item?.name)}</span>`];
    if (item?.showSku) {
      parts.push(`<small class="item-sku">SKU: ${esc(item.sku)}</small>`);
    }
    (Array.isArray(item?.mergedNotes) ? item.mergedNotes : []).forEach(
      (note: any) =>
        parts.push(
          item.mergedAsNote
            ? `<small class="item-merged-note">${esc(note)}</small>`
            : `<span class="item-merged-inline">${esc(note)}</span>`
        )
    );
    if (item?.showThumbnail) {
      parts.push(
        HB.partials.CeresImageGallery(
          HB.helpers.prepareImageGallery(item.thumbnailImages, {
            hash: { variant: "thumbnail", alt: item.name },
          })
        )
      );
    }
    const viewer = HB.partials.MarkdownViewer(
      HB.helpers.prepareMarkdownViewerData(description, { hash: {} })
    );
    parts.push(`<div class="item-description">${viewer}</div>`);
    return new HB.SafeString(parts.join("\n"));
  }

  /**
   *
   * @param mapped
   */
  function withDescriptionsInItemCell(mapped: any) {
    // Both come from other widgets' registrations; without them the
    // description stays in the widget's own row rather than going missing.
    const canRender =
      typeof HB.partials?.MarkdownViewer === "function" &&
      typeof HB.helpers?.prepareMarkdownViewerData === "function" &&
      typeof HB.partials?.CeresImageGallery === "function" &&
      typeof HB.helpers?.prepareImageGallery === "function";
    if (!canRender) return mapped;

    const rows = Array.isArray(mapped?.rows) ? mapped.rows : [];
    return {
      ...mapped,
      rows: rows.map((row: any) => {
        const { extras } = row;
        if (!isLineRow(row) || !extras?.hasDescription) return row;
        // The account's full-width choice keeps the widget's own row.
        if (extras.descriptionFullWidth) return row;
        const at = row.cells.findIndex((cell: any) => cell.isItemCell);
        if (at === -1) return row;

        const cells = [...row.cells];
        cells[at] = {
          ...cells[at],
          isItemCell: false,
          text: itemCellWithDescription(row.item, extras.description),
        };
        const next = { ...extras, hasDescription: false };
        return {
          ...row,
          cells,
          extras: { ...next, hasAny: extrasHaveAny(next) },
        };
      }),
    };
  }

  // ── Column widths ──
  //
  // The table is `table-layout: fixed`, so nothing in it — a long figure, a
  // table pasted into a description — can push it past the page edge. Each
  // column is as wide as the text this document prints in it, and the item
  // column keeps the rest. Everything is a percentage of the table, so the
  // smaller print font scales with it. The widths go out as a <style> block
  // in front of the widget, keyed by the widget's own column classes.

  // Rough advance width of one character at the table's base font. Digits and
  // uppercase run wider than lowercase, so this errs high — a column half a
  // character too wide costs the item nothing noticeable, a column half a
  // character too narrow clips a figure.
  const CHAR_PX = 7;
  // Headings are bold, so a character runs wider.
  const HEADING_CHAR_PX = 8;
  // Cell padding plus both borders, which the text never gets to use.
  const CELL_CHROME_PX = 18;
  // Nominal content width of the table: page width less the page and
  // main-box padding. Only used to turn px into a share.
  const TABLE_PX = 950;
  // The item column is the point of the table; it keeps this share unless
  // the other columns' content alone needs more.
  const MIN_ITEM_PCT = 26;
  // How far the photo may shrink to make room.
  const MIN_PHOTO_SHARE = 0.6;

  // Per column class: floor, ceiling, and whether the text can wrap. A
  // wrapping column is measured by its longest word, since the rest can fall
  // to the next line.
  type WidthRule = { min: number; max: number; wraps?: boolean };
  const TAX_RULE: WidthRule = { min: 60, max: 130 };
  const MONEY_RULE: WidthRule = { min: 90, max: 200 };
  const WIDTH_RULES: Record<string, WidthRule> = {
    "col-index": { min: 30, max: 46 },
    "col-photo": { min: 152, max: 152 },
    "col-hsn-sac": { min: 66, max: 110 },
    "col-rate": { min: 82, max: 190 },
    "col-qty": { min: 46, max: 90 },
    "col-discount": { min: 64, max: 130 },
    "col-gst-rate": TAX_RULE,
    "col-igst": TAX_RULE,
    "col-cgst": TAX_RULE,
    "col-sgst": TAX_RULE,
    "col-tax": TAX_RULE,
    "col-cess": TAX_RULE,
    "col-amount": MONEY_RULE,
    "col-total": MONEY_RULE,
  };
  // An account's own column: one that prints figures is treated like money,
  // anything else as wrapping text. Decided from what its cells print, not
  // its declared type — payloads mark text columns (Unit, Model No.) with a
  // numeric `fxReturnType` too.
  const TEXT_RULE: WidthRule = { min: 70, max: 150, wraps: true };

  const longestWord = (text: string) =>
    text
      .split(/\s+/)
      .reduce((longest, word) => Math.max(longest, word.length), 0);

  type SizedColumn = { cls: string; px: number; need: number };

  // Shrinks the columns to `budget` px in the order that costs the least:
  // first the room a column's floor gives it beyond what its content needs,
  // then the photo, down to MIN_PHOTO_SHARE. Whatever is still over is the
  // item column's to give; a figure or a word is never cut.
  /**
   *
   * @param sized
   * @param budget
   */
  function fitColumns(sized: SizedColumn[], budget: number): void {
    const sum = () => sized.reduce((total, column) => total + column.px, 0);

    let over = sum() - budget;
    const slack = sized.reduce(
      (total, column) => total + (column.px - column.need),
      0
    );
    if (over > 0 && slack > 0) {
      const share = Math.min(1, over / slack);
      sized.forEach((column) => {
        column.px -= (column.px - column.need) * share;
      });
    }

    over = sum() - budget;
    const photo = sized.find((column) => column.cls === "col-photo");
    if (over > 0 && photo) {
      photo.px = Math.max(photo.px * MIN_PHOTO_SHARE, photo.px - over);
    }
  }

  /**
   *
   * @param mapped
   */
  function withColumnWidths(mapped: any) {
    const columns = Array.isArray(mapped?.columns) ? mapped.columns : [];
    const rows = Array.isArray(mapped?.rows) ? mapped.rows : [];
    const lines = rows.filter(isLineRow);
    const itemAt = (lines[0]?.cells || []).findIndex(
      (cell: any) => cell.isItemCell
    );
    const visible = columns.filter((column: any) => !column.isHidden);

    const sized: SizedColumn[] = [];
    const measure = (
      cls: string,
      rule: WidthRule,
      label: string,
      values: string[]
    ) => {
      // A heading wraps between its words, never inside one.
      const headingPx = longestWord(label) * HEADING_CHAR_PX;
      const contentPx =
        values.reduce(
          (most, text) =>
            Math.max(most, rule.wraps ? longestWord(text) : text.length),
          0
        ) * CHAR_PX;
      const need = Math.min(
        rule.max,
        Math.max(headingPx, contentPx) + CELL_CHROME_PX
      );
      // The photo has no text to measure: its floor is its size.
      const floor = cls === "col-photo" ? rule.min : need;
      sized.push({
        cls,
        px: Math.min(rule.max, Math.max(rule.min, need)),
        need: floor,
      });
    };

    // The widget's own line-number column.
    measure("col-index", WIDTH_RULES["col-index"], "", [String(lines.length)]);
    visible.forEach((column: any, i: number) => {
      if (i === itemAt) return;
      const cls = String(column.className || "").split(/\s+/)[0];
      const values: string[] = [];
      if (cls !== "col-photo") {
        lines.forEach((row: any) => {
          const cell = row.cells?.[i];
          if (typeof cell?.text === "string") values.push(cell.text);
          if (cell?.secondaryText) values.push(String(cell.secondaryText));
        });
      }
      const printed = values.filter((text) => text.trim());
      const numeric =
        printed.length > 0 && printed.every((text) => !/\p{L}/u.test(text));
      const rule = WIDTH_RULES[cls] || (numeric ? MONEY_RULE : TEXT_RULE);
      measure(cls, rule, String(column.label || ""), values);
    });

    fitColumns(sized, TABLE_PX * (1 - MIN_ITEM_PCT / 100));

    const head = ".fk-items .line-items-table > thead > tr > th";
    const css = sized
      // A class from an account's own column key is only trusted as a
      // selector when it is plainly one.
      .filter((column) => /^[A-Za-z0-9_-]+$/.test(column.cls))
      .map(
        (column) =>
          `${head}.${column.cls} { width: ${(
            (column.px / TABLE_PX) *
            100
          ).toFixed(3)}%; }`
      )
      .join("\n");

    return { ...mapped, fitkingColumnCss: new HB.SafeString(css) };
  }

  // The photo column is placed, and the widths measured, before the
  // descriptions move: both find the item cell by `isItemCell`, which a moved
  // description's cell no longer has.
  HB.registerHelper("fitkingLineItems", function (mapped: any, invoice: any) {
    return withDescriptionsInItemCell(
      withColumnWidths(
        withPhotoColumn(withTrimmedDescriptions(mapped), invoice)
      )
    );
  });

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
    const labelFor = (labelKeys: string[], fallback: string) =>
      labelSources
        .filter((source) => source && typeof source === "object")
        .map((source) => firstLabel(source, labelKeys))
        .find(Boolean) || fallback;

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
      if (!value) return;
      rows.push({ label: labelFor(row.labelKeys, row.label), value });
    });

    // Whatever else the account has been configured to carry.
    (Array.isArray(account.customFields) ? account.customFields : []).forEach(
      (field: any) => {
        if (field?.params?.showInInvoice === false) return;
        const label =
          typeof field?.label === "string" ? field.label.trim() : "";
        const value = stringifyFieldValue(field?.value);
        if (label && value) rows.push({ label, value });
      }
    );

    return rows;
  });

  /**
   *
   * @param value
   * @param invoiceOrSymbol
   */
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

  HB.registerHelper("formatPhone", function (phone: any) {
    if (typeof phone !== "string" && typeof phone !== "number") return "";
    const phoneStr = String(phone).trim();
    if (!phoneStr) return "";
    return formatPhoneNumberIntl(phoneStr) ?? phoneStr;
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
  /**
   *
   * @param args
   */
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
      const match = firstLabel(customLabels, keys);
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
}

export default registerFitkingTemplateHelpers;

/* eslint-enable @typescript-eslint/no-explicit-any */
