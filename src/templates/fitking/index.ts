// @ts-ignore - compiled via handlebars-loader
import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import "./styles.css";

// Register widgets
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/qr-code";

import { registerFitkingTemplateHelpers } from "./helpers";

// Register custom helpers
declare const Handlebars: any;
registerFitkingTemplateHelpers(Handlebars);

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = normalizeInvoiceTemplateState as any;
window.CeresTemplate = template;
