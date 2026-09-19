const Handlebars = require("handlebars");

/*
 * Jest 28 changed the transformer contract: `process` must return `{ code }` rather than a
 * bare string. This returned a string, so importing a .hbs file from a test threw "Invalid
 * return value" — which is why nothing did, and why the transform sat here unused. Fixed so
 * a widget's partial can be rendered in a test against the same compile step the bundle uses.
 */
module.exports = {
  process(src) {
    const compiled = Handlebars.precompile(src);
    // Jest's TransformedSource type declares { code }; the runtime still accepts a
    // bare string. Returning the object matches the declared contract.
    return {
      code: `
        const HandlebarsRuntime = require("handlebars/runtime");
        module.exports = HandlebarsRuntime.template(${compiled});
      `,
    };
  },
};
