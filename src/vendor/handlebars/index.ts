/* Vendor chunk: Handlebars runtime – template engine */

// Import the full runtime (includes compiler-free helpers + partials support)
// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-extraneous-dependencies
const Handlebars = require("handlebars/dist/handlebars.runtime");

(window as any).Handlebars = Handlebars.default || Handlebars;

export {};
