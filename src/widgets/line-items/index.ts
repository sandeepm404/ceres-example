// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - template compiled by loader
import template from "./LineItemsTable.hbs";
import "./styles.css";

/**
 *
 */
function getHB(): any {
  return (window as any).Handlebars;
}

/**
 *
 */
function register(): void {
  const HB = getHB();
  if (!HB) return;

  HB.registerPartial("LineItemsTable", template);

  (window as any).CeresWidgets = (window as any).CeresWidgets || {};
  (window as any).CeresWidgets.LineItemsTable = { register };
}

// A throw here would take the whole document render down with it — see
// docs/learnings/ceres/handlebars-helper-throw-kills-the-document.md.
try {
  register();
} catch (_) {
  /* noop */
}

export {};
