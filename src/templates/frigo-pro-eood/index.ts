// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - compiled via handlebars-loader
import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import "./styles.css";

// Register widgets
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/phone-number";
import "../../widgets/qr-code";
import "../../widgets/image";
import "../../widgets/line-items";
import "../../widgets/subtotal";
import "../../widgets/tax-summary";
import "../../widgets/hsn-summary";
import "../../widgets/payment-table";
import "../../widgets/refrens-branding";

import {
  registerFrigoProTemplateHelpers,
  withPaymentRows,
  withoutSecondCurrency,
} from "./helpers";

// Register custom helpers
declare const Handlebars: any;
registerFrigoProTemplateHelpers(Handlebars);

// Export template to global for main renderer to consume. Payments recorded
// against the invoice are appended to the item table as advance-payment lines;
// the business-currency amount under item figures is dropped (for now).
window.CeresTemplateDataMapper = ((payload: any) =>
  withoutSecondCurrency(
    withPaymentRows(normalizeInvoiceTemplateState(payload))
  )) as any;
window.CeresTemplate = template;
