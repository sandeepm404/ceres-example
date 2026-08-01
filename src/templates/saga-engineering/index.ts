// @ts-ignore - compiled via handlebars-loader
import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import "./styles.css";

// Register widgets
import "../../widgets/invoice-status";
import "../../widgets/demo-badge";
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/qr-code";
import "../../widgets/tax-summary";
import "../../widgets/hsn-summary";

import registerFormatCurrencyHelper from "../../widgets/shared/registerFormatCurrencyHelper";
import { registerSagaEngineeringTemplateHelpers } from "./helpers";

// Register custom helpers
declare const Handlebars: any;
registerFormatCurrencyHelper(Handlebars);
registerSagaEngineeringTemplateHelpers(Handlebars);

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
