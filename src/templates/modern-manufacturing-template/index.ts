import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import {
  registerModernManufacturingHelpers,
  registerModernManufacturingPrint,
  withMoneyDefaults,
} from "./helpers";
import "./styles.css";
// Register only the widgets template.hbs uses.
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/currency-format";
import "../../widgets/image";
import "../../widgets/subtotal";
import "../../widgets/tax-summary";
import "../../widgets/payment-table";
import "../../widgets/refrens-branding";
import "../../widgets/watermark";

registerModernManufacturingHelpers(window.Handlebars);
registerModernManufacturingPrint();

// Export template to global for main renderer to consume
// The shared normalizer, then the document's decimal places made explicit (helpers.ts).
window.CeresTemplateDataMapper = ((
  payload: Parameters<typeof normalizeInvoiceTemplateState>[0]
) => withMoneyDefaults(normalizeInvoiceTemplateState(payload))) as any;
window.CeresTemplate = template;
