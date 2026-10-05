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
import "../../widgets/watermark";
import "../../widgets/refrens-branding";

import {
  descriptionInItemCell,
  productCodeFirst,
  registerSamiContractingTemplateHelpers,
  withFillerRow,
} from "./helpers";

// Register custom helpers
declare const Handlebars: any;
registerSamiContractingTemplateHelpers(Handlebars);

// Multi-page print: summary at the foot of the last page (helpers.ts).
// Off with the single-page fill in styles.css; to restore, uncomment both and
// import installPrintFit from ./helpers again.
// installPrintFit();

// Export template to global for main renderer to consume
window.CeresTemplateDataMapper = ((payload: any) =>
  withFillerRow(
    descriptionInItemCell(
      productCodeFirst(normalizeInvoiceTemplateState(payload))
    )
  )) as any;
window.CeresTemplate = template;
