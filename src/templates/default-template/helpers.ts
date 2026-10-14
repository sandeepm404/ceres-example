// Handlebars helpers for the default-template template.
//
// Split out of index.ts so the logic is reachable from tests: index.ts registers
// against the global `Handlebars` the browser bundle provides, which does not
// exist under Jest. Callers pass whichever Handlebars instance they have.

// The key of a line-item column linked to the item's SKU. Lydia gives a SKU
// column this fixed key (`source: { entity: "INVENTORY", field: "sku" }`), and
// the line's own value — editable per document — sits in `item.custom.inv_sku`.
export const SKU_COLUMN_KEY = "inv_sku";

type Column = { key?: string; isHidden?: boolean };

// The SKU column when the business shows it, else undefined. The item table
// here is fixed, so this is the one business column it prints.
export const skuColumn = (columns: unknown): Column | undefined =>
  (Array.isArray(columns) ? (columns as Column[]) : []).find(
    (column) => column?.key === SKU_COLUMN_KEY && !column.isHidden
  );

/**
 *
 * @param HB
 */
export function registerDefaultTemplateHelpers(HB: {
  registerHelper(name: string, fn: typeof skuColumn): void;
}): void {
  HB.registerHelper("skuColumn", skuColumn);
}
