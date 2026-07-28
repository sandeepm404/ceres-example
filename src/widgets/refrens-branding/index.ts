// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - compiled via handlebars-loader
import template from "./RefrensBranding.hbs";
import "./styles.css";

(function () {
  function getHB(): any {
    return (window as any).Handlebars;
  }

  function register() {
    const HB = getHB();
    if (!HB) return;
    HB.registerPartial("RefrensBranding", template);
  }

  try {
    register();
  } catch (_) {
    /* noop */
  }
})();

export { };
