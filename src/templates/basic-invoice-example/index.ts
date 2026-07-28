import template from "./template.hbs";
import "./styles.css";
// Register widgets (ensures InvoiceStatus partial is available and its CSS extracted)
import "../../widgets/invoice-status";
import "../../widgets/demo-badge";
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/watermark";
import "../../widgets/refrens-branding";
import "../../widgets/phone-number";
import "../../widgets/tax-summary";
import "../../widgets/hsn-summary";
import "../../widgets/payment-table";
import "../../widgets/currency-format";
import "../../widgets/image";

// Template-level Handlebars utility helpers
const hb = (window as any).Handlebars;
if (hb) {
  // eq: strict equality — lets templates check boolean false or specific strings
  hb.registerHelper("eq", (a: any, b: any) => a === b);
  // taxTableVisible: true when taxSummaryView is TABLE or BOTH
  hb.registerHelper(
    "taxTableVisible",
    (view: any) => view === "TABLE" || view === "BOTH"
  );
}

// Export template to global for main renderer to consume
window.CeresTemplate = template;
