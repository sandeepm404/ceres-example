import {
  decodeBase64,
  toCssColor,
  mergeInto,
  isPlainObject,
  applyQrCodeUpdate,
  applyIrnUpdate,
  extractTemplateStyleOptions,
} from "../src/main/commonUtils";

describe("commonUtils", () => {
  describe("decodeBase64", () => {
    it("returns null for empty input", () => {
      expect(decodeBase64(null)).toBeNull();
      expect(decodeBase64("")).toBeNull();
    });

    it("decodes valid base64 strings", () => {
      expect(decodeBase64("SGVsbG8=")).toBe("Hello");
    });

    it("returns null for invalid base64 strings", () => {
      expect(decodeBase64("NotBase64!!")).toBeNull();
    });
  });

  describe("toCssColor", () => {
    it("returns valid css color string", () => {
      expect(toCssColor({ r: 255, g: 0, b: 0 })).toBe("rgb(255, 0, 0)");
      expect(toCssColor({ r: 0, g: 0, b: 0, a: 0.5 })).toBe(
        "rgba(0, 0, 0, 0.5)"
      );
    });

    it("returns null for invalid input", () => {
      expect(toCssColor(null)).toBeNull();
      expect(toCssColor("invalid")).toBe("invalid"); // It returns string if input is string
    });
  });

  describe("applyQrCodeUpdate", () => {
    let mockImg: { src: string; closest: jest.Mock; removeAttribute: jest.Mock };
    let mockContainer: { classList: { remove: jest.Mock; add: jest.Mock } };

    beforeEach(() => {
      mockImg = { src: "", closest: jest.fn(), removeAttribute: jest.fn() };
      mockContainer = { classList: { remove: jest.fn(), add: jest.fn() } };
      (global as any).document = { querySelector: jest.fn() };
    });

    afterEach(() => {
      delete (global as any).document;
    });

    it("no-ops when img element is not found", () => {
      (global as any).document.querySelector.mockReturnValue(null);
      expect(() => applyQrCodeUpdate("data:image/png;base64,abc")).not.toThrow();
    });

    it("sets src and removes is-empty when value is a non-empty string", () => {
      mockImg.closest.mockReturnValue(mockContainer);
      (global as any).document.querySelector.mockReturnValue(mockImg);
      applyQrCodeUpdate("data:image/png;base64,abc");
      expect(mockImg.src).toBe("data:image/png;base64,abc");
      expect(mockContainer.classList.remove).toHaveBeenCalledWith("is-empty");
    });

    it("clears src and adds is-empty when value is an empty string", () => {
      mockImg.closest.mockReturnValue(mockContainer);
      (global as any).document.querySelector.mockReturnValue(mockImg);
      applyQrCodeUpdate("");
      expect(mockImg.removeAttribute).toHaveBeenCalledWith("src");
      expect(mockContainer.classList.add).toHaveBeenCalledWith("is-empty");
    });

    it("clears src and adds is-empty when value is non-string", () => {
      mockImg.closest.mockReturnValue(mockContainer);
      (global as any).document.querySelector.mockReturnValue(mockImg);
      applyQrCodeUpdate(null);
      expect(mockImg.removeAttribute).toHaveBeenCalledWith("src");
      expect(mockContainer.classList.add).toHaveBeenCalledWith("is-empty");
    });

    it("handles absent container without throwing when setting src", () => {
      mockImg.closest.mockReturnValue(null);
      (global as any).document.querySelector.mockReturnValue(mockImg);
      applyQrCodeUpdate("data:image/png;base64,abc");
      expect(mockImg.src).toBe("data:image/png;base64,abc");
    });

    it("handles absent container without throwing when clearing src", () => {
      mockImg.closest.mockReturnValue(null);
      (global as any).document.querySelector.mockReturnValue(mockImg);
      applyQrCodeUpdate(null);
      expect(mockImg.removeAttribute).toHaveBeenCalledWith("src");
    });
  });

  describe("applyIrnUpdate", () => {
    let mockEl: { textContent: string };

    beforeEach(() => {
      mockEl = { textContent: "" };
      (global as any).document = { querySelector: jest.fn() };
    });

    afterEach(() => {
      delete (global as any).document;
    });

    it("no-ops when IRN element is not found", () => {
      (global as any).document.querySelector.mockReturnValue(null);
      expect(() => applyIrnUpdate("IRN12345")).not.toThrow();
    });

    it("sets textContent when value is a string", () => {
      (global as any).document.querySelector.mockReturnValue(mockEl);
      applyIrnUpdate("IRN12345678901234567890");
      expect(mockEl.textContent).toBe("IRN12345678901234567890");
    });

    it("sets textContent to empty string for non-string value", () => {
      (global as any).document.querySelector.mockReturnValue(mockEl);
      applyIrnUpdate(null);
      expect(mockEl.textContent).toBe("");
      applyIrnUpdate(42);
      expect(mockEl.textContent).toBe("");
    });
  });

  describe("mergeInto", () => {
    it("merges two plain objects", () => {
      const target = { a: 1 };
      const source = { b: 2 };
      const result = mergeInto(target, source);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("deep merges objects", () => {
      const target = { a: { x: 1 } };
      const source = { a: { y: 2 } };
      const result = mergeInto(target, source);
      expect(result).toEqual({ a: { x: 1, y: 2 } });
    });

    it("overwrites arrays (does not merge them)", () => {
      const target = { a: [1, 2] };
      const source = { a: [3, 4] };
      const result = mergeInto(target, source);
      expect(result).toEqual({ a: [3, 4] });
    });
  });

  describe("isPlainObject", () => {
    it("returns true for plain objects", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it("returns false for non-objects or null", () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject("string")).toBe(false);
      expect(isPlainObject(123)).toBe(false);
    });
  });

  describe("extractTemplateStyleOptions", () => {
    it("returns null for non-object payload", () => {
      expect(extractTemplateStyleOptions(null)).toBeNull();
      expect(extractTemplateStyleOptions("string")).toBeNull();
      expect(extractTemplateStyleOptions(42)).toBeNull();
    });

    it("returns null when payload has no template key", () => {
      expect(extractTemplateStyleOptions({})).toBeNull();
      expect(extractTemplateStyleOptions({ other: true })).toBeNull();
    });

    it("returns null when template is not a plain object", () => {
      expect(extractTemplateStyleOptions({ template: null })).toBeNull();
      expect(extractTemplateStyleOptions({ template: "string" })).toBeNull();
    });

    it("extracts watermark when it is the only field", () => {
      const watermark = {
        isEnabled: true,
        type: "image",
        logo: "https://example.com/logo.png",
        opacity: 50,
        rotation: 45,
        scale: 1,
        repeatedPatterns: false,
      };
      const result = extractTemplateStyleOptions({ template: { watermark } });
      expect(result).not.toBeNull();
      expect(result!.watermark).toEqual(watermark);
      // No templateColor or template (fonts) keys when absent
      expect(result!.templateColor).toBeUndefined();
      expect(result!.template).toBeUndefined();
    });

    it("extracts watermark alongside colors and fonts", () => {
      const watermark = {
        isEnabled: true,
        type: "text",
        customText: "DRAFT",
        opacity: 20,
        repeatedPatterns: false,
      };
      const result = extractTemplateStyleOptions({
        template: {
          primaryColor: "#fff",
          titleFont: "Inter",
          watermark,
        },
      });
      expect(result).not.toBeNull();
      expect(result!.watermark).toEqual(watermark);
      expect(result!.templateColor).toBeDefined();
      expect(result!.template).toBeDefined();
    });

    it("ignores watermark when it is not a plain object", () => {
      const result = extractTemplateStyleOptions({
        template: { watermark: "invalid" },
      });
      // No colors or fonts either, so whole result is null
      expect(result).toBeNull();
    });

    it("ignores watermark: null", () => {
      const result = extractTemplateStyleOptions({
        template: { watermark: null },
      });
      expect(result).toBeNull();
    });
  });
});
