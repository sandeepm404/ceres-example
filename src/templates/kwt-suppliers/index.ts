// @ts-ignore
import template from "./template.hbs";
import "./styles.css";

import { parsePhoneNumberFromString } from "libphonenumber-js";

import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/refrens-branding";
import "../../widgets/currency-format";

const hb = (window as any).Handlebars;
if (hb) {
  // Page 1 carries the title/meta header, so it fits fewer grid rows than the
  // pages after it. Tune this if the ruled grid under- or overshoots page one.
  const FIRST_PAGE_ROWS = 26;
  const AMOUNT_DECIMALS = 3;

  // The grid always runs to the bottom of page one, so a short quotation still
  // reads as a full ruled form. Once the items spill past page one they carry the
  // table themselves: no padding, so page two ends right after the last item.
  const rowsToFillFirstPage = (rowCount: number): number =>
    rowCount <= FIRST_PAGE_ROWS ? FIRST_PAGE_ROWS : rowCount;

  // prepareQuotationRows: flattens items (including `group: true` header rows) into
  // a row list the table loop can render directly, adding a running line number to
  // real items only, then pads with blank rows to fill page one when it's short.
  hb.registerHelper("prepareQuotationRows", (items: any[]) => {
    const list = Array.isArray(items) ? items : [];
    let lineNumber = 0;

    const rows = list.map((item) => {
      if (item && item.group) {
        return { isGroup: true, groupName: item.name };
      }
      lineNumber += 1;
      return { ...item, lineNumber };
    });

    const targetRows = rowsToFillFirstPage(rows.length);
    while (rows.length < targetRows) {
      rows.push({ isEmpty: true });
    }

    return rows;
  });

  // findCustomFieldValue: looks up a custom field by a case-insensitive label
  // substring match (e.g. "delivery" -> "Delivery Note Number"), for fields the
  // template doesn't get as a fixed key (like the DN# field in this design).
  hb.registerHelper(
    "findCustomFieldValue",
    (customFields: any[], labelKeyword: string) => {
      if (!Array.isArray(customFields) || !labelKeyword) return null;
      const keyword = String(labelKeyword).toLowerCase();
      const match = customFields.find(
        (field) =>
          field &&
          typeof field.label === "string" &&
          field.label.toLowerCase().includes(keyword)
      );
      return match ? match.value : null;
    }
  );

  // formatLocalPhoneNumber: the shared formatPhoneNumber helper emits the full
  // international form (+965 548 78245); this design shows the national number
  // only, unspaced (54878245). LTR isolate kept so RTL text can't reorder it.
  hb.registerHelper("formatLocalPhoneNumber", (phone: any) => {
    if (typeof phone !== "string" && typeof phone !== "number") return "";

    const phoneStr = String(phone).trim();
    if (!phoneStr) return "";

    const parsed = parsePhoneNumberFromString(
      phoneStr.slice(0, 1) === "+" ? phoneStr : `+${phoneStr}`
    );
    const local = parsed ? parsed.nationalNumber : phoneStr.replace(/\s+/g, "");

    return `\u2066${local}\u2069`;
  });

  // formatPlainAmount: line item columns in this design carry no currency code —
  // only the grand total does. Precision is pinned to 3 regardless of what the
  // payload reports, because the design is built around KWD's 3-decimal subunit.
  hb.registerHelper("formatPlainAmount", function (amount: any, ...rest: any[]) {
    const options = rest[rest.length - 1];
    const root = options?.data?.root || (window as any).ceresInvoiceData || {};
    const value = parseFloat(amount);

    if (Number.isNaN(value)) return "";

    return value.toLocaleString(root.locale || "en-US", {
      minimumFractionDigits: AMOUNT_DECIMALS,
      maximumFractionDigits: AMOUNT_DECIMALS,
    });
  });
}

window.CeresTemplate = template;
