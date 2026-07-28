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

  // Owned by the invoice-status widget (src/widgets/invoice-status), which
  // registers against `window.Handlebars` and isn't importable as a module —
  // mirrors mapStatusToTag's real logic so fitking's own integration (CSS
  // class hookup, title-bar placement) is still exercised under Jest.
  HB.registerHelper("computeInvoiceStatus", (invoice: any) => {
    const status = String(invoice?.status ?? "").toUpperCase();
    const isOverdue = Boolean(invoice?.isOverdue);
    const tag =
      isOverdue && status !== "PAID"
        ? { text: "Overdue", color: "danger" }
        : status === "PAID"
          ? { text: "Paid", color: "success" }
          : status === "PARTIAL" || status === "PARTIALLY_PAID"
            ? { text: "Partially Paid", color: "info" }
            : status === "DRAFT"
              ? { text: "Draft", color: "devider" }
              : status === "CANCELED" || status === "CANCELLED"
                ? { text: "Canceled", color: "danger" }
                : status === "REJECTED"
                  ? { text: "Rejected", color: "danger" }
                  : { text: "Unpaid", color: "warning" };
    return {
      tags: [{ ...tag, finalClass: `invoice-tag ${tag.color}` }],
    };
  });
  HB.registerPartial("InvoiceStatus", (invoice: any) => {
    const { tags } = HB.helpers.computeInvoiceStatus(invoice);
    const tag = tags[0];
    return `<span class="${tag.finalClass}">${tag.text}</span>`;
  });
}
