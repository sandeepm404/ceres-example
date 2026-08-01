// @ts-ignore - compiled via handlebars-loader
import template from "./template.hbs";
import { mapInvoiceToSagaEngineeringModel } from "./mapping";
import "./styles.css";

import "../../widgets/invoice-status";
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/qr-code";

window.CeresTemplateDataMapper = mapInvoiceToSagaEngineeringModel;
window.CeresTemplate = template;
