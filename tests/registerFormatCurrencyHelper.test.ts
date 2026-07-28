import registerFormatCurrencyHelper from "../src/widgets/shared/registerFormatCurrencyHelper";
import initDibellaBridge from "../src/main/dibellaBridge";

describe("registerFormatCurrencyHelper", () => {
  let helpers: Record<string, any>;
  let HB: any;

  beforeEach(() => {
    helpers = {};
    HB = {
      registerHelper: jest.fn((name: string, fn: any) => {
        helpers[name] = fn;
      }),
    };
    (global as any).window = { ceresInvoiceData: {} };
  });

  afterEach(() => {
    delete (global as any).window;
  });

  it("registers the formatCurrency helper on the HB instance", () => {
    registerFormatCurrencyHelper(HB);
    expect(HB.registerHelper).toHaveBeenCalledWith(
      "formatCurrency",
      expect.any(Function)
    );
  });

  it("formats amount using currency/locale from options.data.root", () => {
    registerFormatCurrencyHelper(HB);
    const opts = {
      hash: {},
      data: { root: { currency: "INR", locale: "en-IN" } },
    };
    const result = helpers.formatCurrency(1000, opts);
    expect(result).toMatch(/1,000/);
  });

  it("falls back to window.ceresInvoiceData when data.root is absent", () => {
    (global as any).window = {
      ceresInvoiceData: { currency: "USD", locale: "en-US" },
    };
    registerFormatCurrencyHelper(HB);
    const opts = { hash: {}, data: {} };
    const result = helpers.formatCurrency(500, opts);
    expect(result).toContain("$");
  });

  it("uses positional currency argument over root currency", () => {
    registerFormatCurrencyHelper(HB);
    const opts = {
      hash: {},
      data: { root: { currency: "INR", locale: "en-IN" } },
    };
    const result = helpers.formatCurrency(100, "USD", opts);
    expect(result).toContain("$");
  });

  it("uses positional locale argument over root locale", () => {
    registerFormatCurrencyHelper(HB);
    const opts = {
      hash: {},
      data: { root: { currency: "INR", locale: "hi-IN" } },
    };
    const result = helpers.formatCurrency(1000, "INR", "en-IN", opts);
    expect(result).toMatch(/1,000/);
  });

  it("uses positional subUnitLength argument over root value", () => {
    registerFormatCurrencyHelper(HB);
    const opts = {
      hash: {},
      data: { root: { currency: "INR", locale: "en-IN" } },
    };
    const result = helpers.formatCurrency(100, "INR", "en-IN", 3, opts);
    expect(result).toMatch(/100\.000/);
  });

  it("uses positional customCurrencySymbol argument over root value", () => {
    registerFormatCurrencyHelper(HB);
    const opts = {
      hash: {},
      data: { root: { currency: "USD", locale: "en-US" } },
    };
    const result = helpers.formatCurrency(
      100,
      "USD",
      "en-US",
      null,
      "$€",
      opts
    );
    expect(result).toContain("$€");
  });

  it("falls back to window.ceresInvoiceData when options.data is null", () => {
    (global as any).window = {
      ceresInvoiceData: { currency: "USD", locale: "en-US" },
    };
    registerFormatCurrencyHelper(HB);
    const opts = { hash: {}, data: null };
    const result = helpers.formatCurrency(99, opts);
    expect(result).toContain("$");
  });

  it("falls back to window.ceresInvoiceData when called with no options arg", () => {
    (global as any).window = {
      ceresInvoiceData: { currency: "INR", locale: "en-IN" },
    };
    registerFormatCurrencyHelper(HB);
    // No Handlebars options passed — options = undefined, options?.data?.root is undefined
    const result = helpers.formatCurrency(500);
    expect(result).toMatch(/500/);
  });

  it("falls back to empty root when both options.data.root and ceresInvoiceData are absent", () => {
    (global as any).window = {};
    registerFormatCurrencyHelper(HB);
    const result = helpers.formatCurrency(100, { hash: {}, data: {} });
    expect(result).toMatch(/100/);
  });

  it("reads subUnitLength and customCurrencySymbol from data.root when no positional overrides", () => {
    registerFormatCurrencyHelper(HB);
    const opts = {
      hash: {},
      data: {
        root: {
          currency: "USD",
          locale: "en-US",
          subUnitLength: 3,
          customCurrencySymbol: "X$",
        },
      },
    };
    const result = helpers.formatCurrency(100, opts);
    expect(result).toContain("X$");
    expect(result).toMatch(/100\.000/);
  });
});

describe("initDibellaBridge", () => {
  it("runs without error in a non-browser environment", () => {
    expect(() => initDibellaBridge()).not.toThrow();
  });

  it("runs without error when window is available", () => {
    (global as any).window = {};
    (global as any).document = {};
    expect(() => initDibellaBridge()).not.toThrow();
    delete (global as any).window;
    delete (global as any).document;
  });
});
