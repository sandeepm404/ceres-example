import amountInWords from "../src/widgets/shared/amountInWords";

describe("amountInWords", () => {
  it("returns zero rupees for 0", () => {
    expect(amountInWords(0)).toBe("ZERO RUPEES ONLY");
  });

  it("handles whole rupee amounts", () => {
    expect(amountInWords(1)).toBe("ONE RUPEE ONLY");
    expect(amountInWords(100)).toBe("ONE HUNDRED RUPEES ONLY");
    expect(amountInWords(1000)).toBe("ONE THOUSAND RUPEES ONLY");
  });

  it("handles paise", () => {
    expect(amountInWords(1.5)).toBe("ONE RUPEE AND FIFTY PAISE ONLY");
    expect(amountInWords(65.4)).toBe("SIXTY FIVE RUPEES AND FORTY PAISE ONLY");
  });

  it("handles Indian numbering system", () => {
    expect(amountInWords(100000)).toBe("ONE LAKH RUPEES ONLY");
    expect(amountInWords(1000000)).toBe("TEN LAKH RUPEES ONLY");
    expect(amountInWords(10000000)).toBe("ONE CRORE RUPEES ONLY");
    expect(amountInWords(12345678)).toBe(
      "ONE CRORE TWENTY THREE LAKH FORTY FIVE THOUSAND SIX HUNDRED SEVENTY EIGHT RUPEES ONLY"
    );
  });

  it("handles teens", () => {
    expect(amountInWords(11)).toBe("ELEVEN RUPEES ONLY");
    expect(amountInWords(19)).toBe("NINETEEN RUPEES ONLY");
  });

  it("handles compound numbers below 100", () => {
    expect(amountInWords(21)).toBe("TWENTY ONE RUPEES ONLY");
    expect(amountInWords(99)).toBe("NINETY NINE RUPEES ONLY");
  });

  it("handles singular paisa", () => {
    expect(amountInWords(5.01)).toBe("FIVE RUPEES AND ONE PAISA ONLY");
  });

  it("handles negative amounts", () => {
    expect(amountInWords(-100)).toBe("MINUS ONE HUNDRED RUPEES ONLY");
    expect(amountInWords(-1.5)).toBe("MINUS ONE RUPEE AND FIFTY PAISE ONLY");
  });

  it("returns zero for non-finite values", () => {
    expect(amountInWords(NaN)).toBe("ZERO RUPEES ONLY");
    expect(amountInWords(Infinity)).toBe("ZERO RUPEES ONLY");
  });
});
