import formatPhoneNumberIntl from "../src/widgets/phone-number/index";

const LTR = "\u2066";
const PDI = "\u2069";

describe("PhoneNumber Widget", () => {
  describe("formatPhoneNumberIntl", () => {
    it("returns undefined for alphabetic input", () => {
      expect(formatPhoneNumberIntl("abc")).toBeUndefined();
    });

    it("returns undefined for a number that fails parsing", () => {
      expect(formatPhoneNumberIntl("00000000000")).toBeUndefined();
    });

    it("formats a valid number and wraps with LTR isolate characters", () => {
      const result = formatPhoneNumberIntl("+919876543210");
      expect(result).toBe(`${LTR}+91 98765 43210${PDI}`);
    });

    it("prepends + when missing and formats correctly", () => {
      const result = formatPhoneNumberIntl("919876543210");
      expect(result).toBe(`${LTR}+91 98765 43210${PDI}`);
    });

    it("formats a valid UK number and wraps with LTR isolate characters", () => {
      const result = formatPhoneNumberIntl("+447911123456");
      expect(result?.startsWith(LTR)).toBe(true);
      expect(result?.endsWith(PDI)).toBe(true);
    });
  });

  describe("formatPhoneNumber Handlebars helper", () => {
    let helper: (phone: any) => string;

    beforeAll(() => {
      const helpers: Record<string, any> = {};
      (global as any).window = {
        Handlebars: {
          registerHelper: (name: string, fn: any) => {
            helpers[name] = fn;
          },
        },
      };
      jest.isolateModules(() => {
        // eslint-disable-next-line global-require
        require("../src/widgets/phone-number/index");
      });
      helper = helpers.formatPhoneNumber;
      delete (global as any).window;
    });

    it("returns empty string when called without arguments (options object guard)", () => {
      expect(helper({ hash: {}, fn: () => "" })).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(helper(undefined)).toBe("");
    });

    it("returns empty string for null", () => {
      expect(helper(null)).toBe("");
    });

    it("returns empty string for whitespace-only string", () => {
      expect(helper("   ")).toBe("");
    });

    it("formats a valid phone number string", () => {
      const result = helper("+919876543210");
      expect(result).toBe(`${LTR}+91 98765 43210${PDI}`);
    });

    it("accepts a number type input", () => {
      const result = helper(919876543210);
      expect(result?.startsWith(LTR)).toBe(true);
      expect(result?.endsWith(PDI)).toBe(true);
    });

    it("falls back to raw string for unrecognizable phone numbers", () => {
      expect(helper("00000")).toBe("00000");
    });
  });
});
