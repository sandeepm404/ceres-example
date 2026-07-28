// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - template compiled by loader
import template from "./PaymentTable.hbs";
import "./styles.css";
import { computePaymentColumns } from "./utils";
import registerFormatCurrencyHelper from "../shared/registerFormatCurrencyHelper";

function getHB(): any {
  return (window as any).Handlebars;
}

function register(): void {
  const HB = getHB();
  if (!HB) return;

  HB.registerHelper(
    "computePaymentColumns",
    function (payments: any, options: any) {
      return computePaymentColumns(Array.isArray(payments) ? payments : [], {
        businessCurrency: options?.hash?.businessCurrency,
        currency: options?.hash?.currency,
      });
    }
  );

  registerFormatCurrencyHelper(HB);

  HB.registerPartial("PaymentTable", template);

  (window as any).CeresWidgets = (window as any).CeresWidgets || {};
  (window as any).CeresWidgets.PaymentTable = { register };
}

try {
  register();
} catch (_) {
  /* noop */
}

export {};
