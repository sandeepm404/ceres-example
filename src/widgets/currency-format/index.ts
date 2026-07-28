import registerFormatCurrencyHelper from "../shared/registerFormatCurrencyHelper";

function getHB(): any {
  return (window as any).Handlebars;
}

function register(): void {
  const HB = getHB();
  if (!HB) return;

  registerFormatCurrencyHelper(HB);

  (window as any).CeresWidgets = (window as any).CeresWidgets || {};
  (window as any).CeresWidgets.CurrencyFormat = { register };
}

try {
  register();
} catch (_) {
  /* noop */
}

export {};
