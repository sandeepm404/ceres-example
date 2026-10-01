/*
  InvoiceStatus widget for Ceres (Handlebars)
  - Registers partial:  {{> InvoiceStatus invoice=invoice ...options }}
  - Options supported: noUnpaid, withAmount, withExpectedPayDate, hideOverdue, isSelfRejected, hideUnapprovedPayment, i18n
  - Reuses CSS classes like: invoice-tag, success, danger, warning, info, devider, magenta, no-print
*/

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - template compiled by loader
import template from "./InvoiceStatus.hbs";
import "./styles.css";

(function () {
  // Minimal status => tag mapping
  type TagColor = "success" | "danger" | "warning" | "info" | "devider";

  /**
   *
   */
  function getHB(): any {
    return (window as any).Handlebars;
  }

  /**
   *
   * @param obj
   * @param key
   * @param fallback
   */
  function get(obj: any, key: string, fallback?: any) {
    try {
      return obj && obj[key] !== undefined ? obj[key] : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   *
   * @param invoice
   */
  function mapStatusToTag(invoice: any): { text: string; color: TagColor } {
    const status = String(get(invoice, "status", "") || "").toUpperCase();
    const isOverdue = !!get(invoice, "isOverdue", false);

    // Overdue takes precedence if not paid
    if (isOverdue && status !== "PAID")
      return { text: "Overdue", color: "danger" };

    switch (status) {
      case "PAID":
        return { text: "Paid", color: "success" };
      case "PARTIAL":
      case "PARTIALLY_PAID":
        return { text: "Partially Paid", color: "info" };
      case "DRAFT":
        return { text: "Draft", color: "devider" };
      case "CANCELED":
      case "CANCELLED":
        return { text: "Canceled", color: "danger" };
      case "REJECTED":
        return { text: "Rejected", color: "danger" };
      default:
        return { text: "Unpaid", color: "warning" };
    }
  }

  /**
   *
   */
  function register() {
    const HB = getHB();
    if (!HB) return;

    // Helper returns minimal structure compatible with the partial
    HB.registerHelper("computeInvoiceStatus", function (invoice: any) {
      const tag = mapStatusToTag(invoice || {});
      return {
        tags: [
          {
            text: tag.text,
            color: tag.color,
            finalClass: ["invoice-tag", tag.color].join(" "),
          },
        ],
      };
    });

    HB.registerPartial("InvoiceStatus", template);

    (window as any).CeresWidgets = (window as any).CeresWidgets || {};
    (window as any).CeresWidgets.InvoiceStatus = { register, mapStatusToTag };
  }

  try {
    register();
  } catch (_) {
    /* noop */
  }
})();

export {};
