import formatCurrency from "../src/widgets/shared/formatCurrency";

describe("formatCurrency", () => {
  it("formats INR integer amount without decimals", () => {
    const result = formatCurrency(1000, "INR", "en-IN");
    expect(result).toMatch(/1,000/);
    expect(result).not.toMatch(/\.00/);
  });

  it("formats INR decimal amount with decimals", () => {
    const result = formatCurrency(1000.5, "INR", "en-IN");
    expect(result).toMatch(/1,000/);
  });

  it("returns zero formatted for falsy input", () => {
    const result = formatCurrency(0, "INR", "en-IN");
    expect(result).toMatch(/0/);
  });

  it("wraps negative amounts in parentheses", () => {
    const result = formatCurrency(-500, "INR", "en-IN");
    expect(result).toMatch(/^\(.*500.*\)$/);
  });

  it("replaces SAR symbol with ⃁", () => {
    const result = formatCurrency(100, "SAR", "en-SA");
    expect(result).toContain("⃁");
    expect(result).toMatch(/100/);
  });

  it("replaces SLE symbol with SLE", () => {
    const result = formatCurrency(200, "SLE", "en-US");
    expect(result).toContain("SLE");
    expect(result).toMatch(/200/);
  });

  it("uses customCurrencySymbol when provided", () => {
    const result = formatCurrency(500, "USD", "en-US", null, "$€");
    expect(result).toContain("$€");
    expect(result).toMatch(/500/);
  });

  it("respects subUnitLength for decimal places", () => {
    const result = formatCurrency(100, "INR", "en-IN", 3);
    expect(result).toMatch(/100\.000/);
  });

  it("handles RC currency with emoji", () => {
    const result = formatCurrency(50, "RC", "en-IN");
    expect(result).toContain("🅲");
    expect(result).toContain("50");
  });

  it("defaults to INR/en-IN when no currency/locale provided", () => {
    const result = formatCurrency(250);
    expect(result).toMatch(/250/);
  });

  it("handles non-numeric input gracefully", () => {
    const result = formatCurrency("abc", "INR", "en-IN");
    expect(result).toMatch(/0/);
  });
});

describe("formatCurrency — HB options detection", () => {
  afterEach(() => {
    delete (global as any).window;
  });

  it("reads currency and locale from HB options data.root", () => {
    const opts = {
      hash: {},
      data: { root: { currency: "USD", locale: "en-US" } },
    };
    const result = formatCurrency(12, opts as any);
    expect(result).toContain("$");
    expect(result).toMatch(/12/);
  });

  it("reads window.ceresInvoiceData when data.root is absent", () => {
    (global as any).window = {
      ceresInvoiceData: { currency: "EUR", locale: "de-DE" },
    };
    const opts = { hash: {}, data: {} };
    const result = formatCurrency(50, opts as any);
    expect(result).toContain("€");
  });

  it("falls back to default currency when HB options has no root and no window", () => {
    const opts = { hash: {}, data: {} };
    (global as any).window = { ceresInvoiceData: undefined };
    const result = formatCurrency(100, opts as any);
    expect(result).toMatch(/100/);
  });

  it("reads customCurrencySymbol and subUnitLength from HB options data.root", () => {
    const opts = {
      hash: {},
      data: {
        root: {
          currency: "USD",
          locale: "en-US",
          customCurrencySymbol: "$€",
          subUnitLength: 3,
        },
      },
    };
    const result = formatCurrency(100, opts as any);
    expect(result).toContain("$€");
    expect(result).toMatch(/100\.000/);
  });
});
