const Handlebars = require("handlebars");

module.exports = {
  process(src) {
    const compiled = Handlebars.precompile(src);
    return {
      code: `
        const HandlebarsRuntime = require("handlebars/runtime");
        module.exports = HandlebarsRuntime.template(${compiled});
      `,
    };
  },
};
