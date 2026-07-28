// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - template compiled by loader
import template from "./HsnSummaryTable.hbs";
import "./styles.css";
import { computeHsnSummary } from "./utils";
import amountInWords from "../shared/amountInWords";
import registerFormatCurrencyHelper from "../shared/registerFormatCurrencyHelper";

function getHB(): any {
  return (window as any).Handlebars;
}

function register(): void {
  const HB = getHB();
  if (!HB) return;

  HB.registerHelper("computeHsnSummary", function (items: any, options: any) {
    return computeHsnSummary(Array.isArray(items) ? items : [], {
      isIgst: !!options?.hash?.isIgst,
      isUtgst: !!options?.hash?.isUtgst,
    });
  });

  HB.registerHelper("amountInWords", function (amount: any) {
    return amountInWords(parseFloat(amount) || 0);
  });

  registerFormatCurrencyHelper(HB);

  HB.registerPartial("HsnSummaryTable", template);

  (window as any).CeresWidgets = (window as any).CeresWidgets || {};
  (window as any).CeresWidgets.HsnSummaryTable = { register };
}

try {
  register();
} catch (_) {
  /* noop */
}

export {};
