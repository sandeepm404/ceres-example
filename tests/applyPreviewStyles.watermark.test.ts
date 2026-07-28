/**
 * @jest-environment jsdom
 */
import { applyPreviewStyles } from "../src/main/commonUtils";

// Helper to read a CSS variable value from :root
const getCssVar = (name: string): string =>
  document.documentElement.style.getPropertyValue(name);

// Helper to check if a CSS variable has been removed (returns empty string when removed)
const cssVarRemoved = (name: string): boolean =>
  document.documentElement.style.getPropertyValue(name) === "";

beforeEach(() => {
  // Reset :root inline styles and body data attributes before each test
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("data-watermark-text");
});

describe("applyPreviewStyles — watermark", () => {
  describe("when watermark is absent", () => {
    it("does not set any watermark variables when options has no watermark key", () => {
      applyPreviewStyles({ templateColor: { primaryColor: "red" } });
      expect(getCssVar("--watermark-opacity")).toBe("");
      expect(getCssVar("--watermark-logo")).toBe("");
      expect(document.body.hasAttribute("data-watermark-text")).toBe(false);
    });
  });

  describe("when watermark.isEnabled is false", () => {
    it("removes all watermark CSS variables and data-watermark-text attribute", () => {
      // Pre-set some values to verify they get cleared
      document.documentElement.style.setProperty(
        "--watermark-logo",
        "url(old.png)"
      );
      document.documentElement.style.setProperty("--watermark-opacity", "0.5");
      document.body.setAttribute("data-watermark-text", "OLD TEXT");

      applyPreviewStyles({
        watermark: { isEnabled: false, repeatedPatterns: false },
      });

      expect(cssVarRemoved("--watermark-logo")).toBe(true);
      expect(cssVarRemoved("--watermark-opacity")).toBe(true);
      expect(cssVarRemoved("--watermark-rotate")).toBe(true);
      expect(cssVarRemoved("--watermark-scale")).toBe(true);
      expect(cssVarRemoved("--watermark-repeated-pattern")).toBe(true);
      expect(cssVarRemoved("--watermark-z-index")).toBe(true);
      expect(document.body.hasAttribute("data-watermark-text")).toBe(false);
    });
  });

  describe("image watermark (logo)", () => {
    const imageWatermark = {
      isEnabled: true,
      type: "image",
      logo: "https://example.com/logo.png",
      opacity: 50,
      rotation: 30,
      scale: 1.5,
      repeatedPatterns: true,
    };

    it("sets --watermark-logo with sanitized url()", () => {
      applyPreviewStyles({ watermark: imageWatermark });
      expect(getCssVar("--watermark-logo")).toBe(
        "url(https://example.com/logo.png)"
      );
    });

    it("sets --watermark-z-index to 5 for image watermarks", () => {
      applyPreviewStyles({ watermark: imageWatermark });
      expect(getCssVar("--watermark-z-index")).toBe("5");
    });

    it("sets --watermark-opacity as opacity/100", () => {
      applyPreviewStyles({ watermark: imageWatermark });
      expect(getCssVar("--watermark-opacity")).toBe("0.5");
    });

    it("sets --watermark-opacity to 0.1 when opacity is absent", () => {
      const w = {
        isEnabled: true,
        type: "image",
        logo: "https://example.com/logo.png",
        repeatedPatterns: false,
      };
      applyPreviewStyles({ watermark: w });
      expect(getCssVar("--watermark-opacity")).toBe("0.1");
    });

    it("correctly sets --watermark-opacity of 0 (not silently skipped)", () => {
      const w = { ...imageWatermark, opacity: 0 };
      applyPreviewStyles({ watermark: w });
      expect(getCssVar("--watermark-opacity")).toBe("0");
    });

    it("sets --watermark-rotate with deg suffix", () => {
      applyPreviewStyles({ watermark: imageWatermark });
      expect(getCssVar("--watermark-rotate")).toBe("30deg");
    });

    it("sets --watermark-rotate to 0deg when rotation is absent", () => {
      const w = {
        isEnabled: true,
        type: "image",
        logo: "https://example.com/logo.png",
        repeatedPatterns: false,
      };
      applyPreviewStyles({ watermark: w });
      expect(getCssVar("--watermark-rotate")).toBe("0deg");
    });

    it("correctly sets --watermark-rotate of 0deg (not silently skipped)", () => {
      const w = { ...imageWatermark, rotation: 0 };
      applyPreviewStyles({ watermark: w });
      expect(getCssVar("--watermark-rotate")).toBe("0deg");
    });

    it("sets --watermark-scale", () => {
      applyPreviewStyles({ watermark: imageWatermark });
      expect(getCssVar("--watermark-scale")).toBe("1.5");
    });

    it("sets --watermark-repeated-pattern to repeat-y when repeatedPatterns is true", () => {
      applyPreviewStyles({ watermark: imageWatermark });
      expect(getCssVar("--watermark-repeated-pattern")).toBe("repeat-y");
    });

    it("sets --watermark-repeated-pattern to no-repeat when repeatedPatterns is false", () => {
      const w = { ...imageWatermark, repeatedPatterns: false };
      applyPreviewStyles({ watermark: w });
      expect(getCssVar("--watermark-repeated-pattern")).toBe("no-repeat");
    });

    it("removes data-watermark-text attribute (clears stale text)", () => {
      document.body.setAttribute("data-watermark-text", "stale");
      applyPreviewStyles({ watermark: imageWatermark });
      expect(document.body.hasAttribute("data-watermark-text")).toBe(false);
    });
  });

  describe("enabled watermark with neither logo nor customText", () => {
    it("sets numeric variables but does not set logo or text", () => {
      // Neither logo nor customText — the if/else-if both skip, only numerics are set
      applyPreviewStyles({
        watermark: {
          isEnabled: true,
          type: "image",
          opacity: 30,
          rotation: 15,
          scale: 2,
          repeatedPatterns: false,
        },
      });
      expect(getCssVar("--watermark-logo")).toBe("");
      expect(getCssVar("--watermark-z-index")).toBe("");
      expect(document.body.hasAttribute("data-watermark-text")).toBe(false);
      // Numeric vars are still set
      expect(getCssVar("--watermark-opacity")).toBe("0.3");
      expect(getCssVar("--watermark-rotate")).toBe("15deg");
      expect(getCssVar("--watermark-scale")).toBe("2");
      expect(getCssVar("--watermark-repeated-pattern")).toBe("no-repeat");
    });
  });

  describe("text watermark (customText)", () => {
    const textWatermark = {
      isEnabled: true,
      type: "text",
      customText: "DRAFT",
      opacity: 20,
      rotation: 45,
      scale: 1,
      repeatedPatterns: false,
    };

    it("sets data-watermark-text on body", () => {
      applyPreviewStyles({ watermark: textWatermark });
      expect(document.body.getAttribute("data-watermark-text")).toBe("DRAFT");
    });

    it("removes --watermark-logo variable (clears stale image)", () => {
      document.documentElement.style.setProperty(
        "--watermark-logo",
        "url(old.png)"
      );
      applyPreviewStyles({ watermark: textWatermark });
      expect(cssVarRemoved("--watermark-logo")).toBe(true);
    });

    it("removes --watermark-z-index variable for text watermarks", () => {
      document.documentElement.style.setProperty("--watermark-z-index", "5");
      applyPreviewStyles({ watermark: textWatermark });
      expect(cssVarRemoved("--watermark-z-index")).toBe(true);
    });

    it("still sets opacity, rotate, scale, repeated-pattern", () => {
      applyPreviewStyles({ watermark: textWatermark });
      expect(getCssVar("--watermark-opacity")).toBe("0.2");
      expect(getCssVar("--watermark-rotate")).toBe("45deg");
      expect(getCssVar("--watermark-scale")).toBe("1");
      expect(getCssVar("--watermark-repeated-pattern")).toBe("no-repeat");
    });
  });
});
