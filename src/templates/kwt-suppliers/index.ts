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
  // How far the ruled grid runs down page one. Blank rows pad a short quotation out
  // to this, so it still reads as a full form. It has to be a count rather than a
  // stretch-to-fit: a row that grows to absorb leftover height grows unevenly and
  // doubles its rules against the row above. Tune it against the printed page —
  // the letterhead footer sits below the grid, so a taller footer wants fewer rows.
  const FIRST_PAGE_ROWS = 18;
  const AMOUNT_DECIMALS = 3;

  // Once the items spill past page one they carry the table themselves: no padding,
  // so page two ends right after the last item.
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

  // CUSTOM_FIELD_VALUES_PER_LINE: a list-valued field (a DN # carrying a dozen
  // numbers) breaks every this-many values rather than wherever the column runs
  // out, so the block reads as an even grid of numbers.
  const CUSTOM_FIELD_VALUES_PER_LINE = 3;

  // splitFieldValue: cuts a comma-separated field value into fixed-length lines,
  // keeping the comma at each line's end. A value that isn't a list comes back
  // whole — one line, untouched.
  hb.registerHelper("splitFieldValue", (value: any) => {
    const text = value === null || value === undefined ? "" : String(value).trim();
    if (!text) return [];

    const values = text
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");

    if (values.length <= 1) return [text];

    const lines: string[] = [];
    for (let i = 0; i < values.length; i += CUSTOM_FIELD_VALUES_PER_LINE) {
      const line = values.slice(i, i + CUSTOM_FIELD_VALUES_PER_LINE).join(", ");
      const isLastLine = i + CUSTOM_FIELD_VALUES_PER_LINE >= values.length;
      lines.push(isLastLine ? line : `${line},`);
    }

    return lines;
  });

  // visibleCustomFields: the meta block lists the document's own custom fields.
  // Takes every source array it's handed because the payload splits them —
  // document-detail fields arrive as customHeaders on some documents and
  // customFields on others — and merges them by label, first source winning.
  // Drops only fields with no label to sit under, and ones flagged off for print.
  hb.registerHelper("visibleCustomFields", (...args: any[]) => {
    args.pop(); // Handlebars' options object
    const seen = new Set<string>();

    return args
      .flatMap((source) => (Array.isArray(source) ? source : []))
      .filter((field) => {
        if (!field || typeof field.label !== "string") return false;

        const label = field.label.trim();
        if (!label || seen.has(label.toLowerCase())) return false;
        if (field.params?.showInInvoice === false) return false;

        seen.add(label.toLowerCase());
        return true;
      });
  });

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
