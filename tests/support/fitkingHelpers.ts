import HandlebarsRuntime from "handlebars/runtime";
import { qrSrc } from "../../src/widgets/qr-code";

/**
 * Registers everything `src/templates/fitking/template.hbs` needs to render.
 *
 * The template pulls helpers from three places at runtime — the date-time and
 * qr-code widgets, and its own `index.ts` — none of which load under Jest,
 * since they register against `window.Handlebars`. Formatting helpers are
 * stubbed to pass their input through; only `qrSrc` uses the real
 * implementation, because what it returns is what the QR tests assert on.
 */
export function registerFitkingHelpers(): void {
  const HB = HandlebarsRuntime;

  HB.registerPartial(
    "MarkdownViewer",
    (ctx: any) => `<span>${ctx?.markdown ?? ""}</span>`
  );
  HB.registerHelper("prepareMarkdownViewerData", (v: unknown) => ({
    markdown: v,
  }));

  HB.registerHelper("increment", (v: number) => v + 1);
  HB.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  HB.registerHelper("or", (...args: unknown[]) =>
    args.slice(0, -1).some((v) => Boolean(v) && v !== "0" && v !== 0)
  );
  HB.registerHelper("hasValue", (v: unknown) => Boolean(v));
  HB.registerHelper("isPositive", (v: unknown) => Number(v) > 0);

  HB.registerHelper("qrSrc", (v: unknown) => qrSrc(v));

  [
    "formateShortDateWithOffset",
    "formateDateWithOffset",
    "formatDateInTimeZone",
    "formatCurrency",
    "formatPhone",
  ].forEach((name) =>
    HB.registerHelper(name, (v: unknown) => String(v ?? ""))
  );

  HB.registerHelper("formatQtyCell", (item: any) =>
    String(item?.quantity ?? "")
  );

  ["getColumnLabel", "getTotalsLabel"].forEach((name) =>
    HB.registerHelper(name, (_key: string, fallback: string) => fallback)
  );
  HB.registerHelper(
    "getChargeName",
    (_item: unknown, fallback: string) => fallback
  );
}
