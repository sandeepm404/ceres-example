import HandlebarsRuntime from "handlebars/runtime";
import { qrSrc } from "../../src/widgets/qr-code";
import { registerFitkingTemplateHelpers } from "../../src/templates/fitking/helpers";

/**
 * Registers everything `src/templates/fitking/template.hbs` needs to render.
 *
 * The template's own helpers come from the real implementation, so tests
 * exercise the shipping logic rather than a stub that agrees with them. Only
 * things owned by other widgets are faked: the date-time helpers and the
 * MarkdownViewer partial, both of which register against `window.Handlebars`
 * and so never load under Jest. `qrSrc` uses its real implementation too.
 */
export function registerFitkingHelpers(): void {
  const HB = HandlebarsRuntime;

  registerFitkingTemplateHelpers(HB);

  HB.registerPartial(
    "MarkdownViewer",
    (ctx: any) => `<span>${ctx?.markdown ?? ""}</span>`
  );
  HB.registerHelper("prepareMarkdownViewerData", (v: unknown) => ({
    markdown: v,
  }));

  HB.registerHelper("qrSrc", (v: unknown) => qrSrc(v));

  // Owned by the date-time widget; rendered as raw values here.
  [
    "formateShortDateWithOffset",
    "formateDateWithOffset",
    "formatDateInTimeZone",
  ].forEach((name) => HB.registerHelper(name, (v: unknown) => String(v ?? "")));
}
