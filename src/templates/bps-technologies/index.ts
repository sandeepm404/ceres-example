import template from "./template.hbs";
import { normalizeInvoiceTemplateState } from "../../main/invoiceTemplateNormalization";
import {
  registerBpsHelpers,
  registerBpsImages,
  registerBpsThemeContrast,
  registerBpsPrint,
  registerBpsWords,
  setBpsStylesheetText,
  withGstColumnLabels,
  withMoneyDefaults,
  withRefrensDefaults,
  withTemplateSettings,
} from "./helpers";
import "./styles.css";
// Register only the widgets template.hbs uses.
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/currency-format";
import "../../widgets/image";
import "../../widgets/subtotal";
import "../../widgets/tax-summary";
import "../../widgets/hsn-summary";
import "../../widgets/payment-table";
import "../../widgets/invoice-status";
import "../../widgets/phone-number";
import "../../widgets/refrens-branding";
import "../../widgets/watermark";

// The same CSS as text, for print measurements (helpers withReadableStylesheet): css-loader
// inline, as a plain string, imports and urls left as written (no build config needed).
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, import/no-webpack-loader-syntax, import/no-unresolved
const bpsCss: string = require('!!css-loader?{"exportType":"string","import":false,"url":false}!./styles.css');

setBpsStylesheetText(bpsCss);
registerBpsHelpers(window.Handlebars);
registerBpsPrint();
registerBpsImages();
registerBpsThemeContrast();
registerBpsWords();

// Export template to global for main renderer to consume
// Host template settings onto the document, the shared normalizer, then the document's
// decimal places made explicit (helpers.ts).
window.CeresTemplateDataMapper = ((
  payload: Parameters<typeof normalizeInvoiceTemplateState>[0]
) =>
  withMoneyDefaults(
    normalizeInvoiceTemplateState(
      withGstColumnLabels(withRefrensDefaults(withTemplateSettings(payload)))
    )
  )) as any;
window.CeresTemplate = template;
