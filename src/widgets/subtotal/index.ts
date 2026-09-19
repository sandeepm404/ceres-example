// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - template compiled by loader
import subtotalTemplate from "./Subtotal.hbs";
import "./styles.css";
import { computeSubtotalRows } from "./utils";
import registerTaxFlagHelpers from "../shared/registerTaxFlagHelpers";

/*
 * Registration only. Every decision lives in ./utils so a test can reach it without a DOM —
 * which is also why jest.config.cjs excludes index.ts from coverage: nothing that can be got
 * wrong belongs in this file.
 */

interface HelperOptions {
  hash?: Record<string, unknown>;
}

/**
 * Registers the Subtotal partial and its data helper on the page's Handlebars instance.
 */
function register(): void {
  const HB = window.Handlebars;
  if (!HB) return;

  /*
   * Takes the invoice as an explicit argument rather than reading the template root, because
   * the root is whatever the template's data mapper returns and there are two live shapes.
   * `columns` and the business currency/locale arrive as hash args; when the host does not
   * send them the helper falls back to invoice.columns and invoice.owner.*, which is what
   * makes this work in the iframe as well as in Lydia's in-app render.
   */
  HB.registerHelper(
    "computeSubtotalRows",
    function computeSubtotalRowsHelper(...args: unknown[]) {
      const invoice = args[0];
      const options = args[args.length - 1] as HelperOptions | undefined;
      const hash = options?.hash ?? {};
      return computeSubtotalRows(invoice, {
        columns: hash.columns,
        businessCurrency: hash.businessCurrency,
        businessLocale: hash.businessLocale,
        ownerConfiguration: hash.ownerConfiguration,
      });
    }
  );

  /*
   * Registered here as well as in the summary widgets: every template with totals imports
   * this one, and a template that names its tax columns must not have to import a table
   * widget it does not render just to get the helper.
   */
  registerTaxFlagHelpers(HB);

  HB.registerPartial("Subtotal", subtotalTemplate);

  window.CeresWidgets = window.CeresWidgets || {};
  window.CeresWidgets.Subtotal = { register };
}

try {
  register();
} catch {
  /* A throwing widget must not take the document down with it. */
}

export {};
