import template from "./template.hbs";
import { mapSolvinTemplateData, registerSolvinPrintFit } from "../helpers";
import registerSolvinHelpers from "./helpers";
import "./styles.css";

// Register every partial/helper used by the Solvin template before rendering.
import "../../widgets/date-time";
import "../../widgets/markdown-viewer";
import "../../widgets/refrens-branding";
import "../../widgets/phone-number";
import "../../widgets/image";
import "../../widgets/currency-format";

// Keep a known currency-capable face available even when Lydia applies a
// decorative/custom body font that does not contain monetary symbols.
if (typeof document !== "undefined") {
  const currencyFontId = "ceres-solvin-currency-font";
  if (!document.getElementById(currencyFontId)) {
    const currencyFont = document.createElement("link");
    currencyFont.id = currencyFontId;
    currencyFont.rel = "stylesheet";
    currencyFont.href =
      "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap";
    currencyFont.setAttribute("data-ceres-font", "Roboto");
    document.head.appendChild(currencyFont);
  }
}

const hb = (window as any).Handlebars;
registerSolvinHelpers(hb);

window.CeresTemplateDataMapper = mapSolvinTemplateData as any;
window.CeresTemplate = template;
registerSolvinPrintFit();
