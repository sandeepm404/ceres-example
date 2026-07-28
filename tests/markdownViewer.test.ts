import {
  sanitizeAnchorUrl,
  sanitizeMarkdown,
  prepareFallbackMarkdown,
  defaultCustomLinkProps,
} from "../src/widgets/markdown-viewer/utils";

describe("markdown-viewer/utils — no DOMPurify", () => {
  beforeEach(() => {
    (global as any).window = {};
  });

  afterEach(() => {
    delete (global as any).window;
  });

  describe("defaultCustomLinkProps", () => {
    it("is frozen with the expected properties", () => {
      expect(Object.isFrozen(defaultCustomLinkProps)).toBe(true);
      expect(defaultCustomLinkProps.target).toBe("_blank");
      expect(defaultCustomLinkProps.rel).toContain("noreferrer");
    });
  });

  describe("sanitizeAnchorUrl", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeAnchorUrl("", "internal")).toBe("");
    });

    it("returns empty string for non-string input", () => {
      expect(sanitizeAnchorUrl(null as any, "internal")).toBe("");
    });

    it("returns relative URL unchanged for internal policy", () => {
      expect(sanitizeAnchorUrl("/invoices/123", "internal")).toBe(
        "/invoices/123"
      );
    });

    it("returns empty string for relative URL with external-forced policy", () => {
      expect(sanitizeAnchorUrl("/invoices/123", "external-forced")).toBe("");
    });

    it("returns trimmed URL when DOMPurify is absent", () => {
      expect(sanitizeAnchorUrl("  https://example.com  ", "internal")).toBe(
        "https://example.com"
      );
    });
  });

  describe("sanitizeMarkdown", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeMarkdown("", "viewer")).toBe("");
      expect(sanitizeMarkdown("", "fallback")).toBe("");
      expect(sanitizeMarkdown("", "storage")).toBe("");
    });

    it("returns value as-is when DOMPurify is absent (viewer)", () => {
      expect(sanitizeMarkdown("<b>Hello</b>", "viewer")).toBe("<b>Hello</b>");
    });

    it("returns value as-is when DOMPurify is absent (fallback)", () => {
      expect(sanitizeMarkdown("<b>Hello</b>", "fallback")).toBe("<b>Hello</b>");
    });

    it("returns value as-is when DOMPurify is absent (storage)", () => {
      expect(sanitizeMarkdown("<b>Hello</b>", "storage")).toBe("<b>Hello</b>");
    });
  });

  describe("prepareFallbackMarkdown", () => {
    it("returns empty string for empty input", () => {
      expect(prepareFallbackMarkdown("")).toBe("");
    });

    it("converts <br> tags to newlines when DOMPurify is absent", () => {
      const result = prepareFallbackMarkdown("Hello<br/>World");
      expect(result).toContain("Hello");
      expect(result).toContain("World");
      expect(result).toContain("\n");
    });

    it("converts <br > variant to newlines", () => {
      expect(prepareFallbackMarkdown("A<br />B")).toContain("\n");
    });
  });
});

describe("markdown-viewer/utils — with DOMPurify mock", () => {
  const mockSanitize = jest.fn((s: string) => s);

  beforeEach(() => {
    mockSanitize.mockClear();
    mockSanitize.mockImplementation((s: string) => s);
    (global as any).window = { DOMPurify: { sanitize: mockSanitize } };
  });

  afterEach(() => {
    delete (global as any).window;
  });

  describe("sanitizeAnchorUrl", () => {
    it("extracts href from DOMPurify-sanitized output", () => {
      mockSanitize.mockReturnValue('<a href="https://example.com"></a>');
      expect(sanitizeAnchorUrl("https://example.com", "internal")).toBe(
        "https://example.com"
      );
    });

    it("returns empty string when DOMPurify strips the href", () => {
      mockSanitize.mockReturnValue("<a></a>");
      expect(sanitizeAnchorUrl("https://evil.com", "internal")).toBe("");
    });

    it("returns empty for non-http URL with external-forced policy", () => {
      mockSanitize.mockReturnValue('<a href="ftp://example.com"></a>');
      expect(sanitizeAnchorUrl("ftp://example.com", "external-forced")).toBe(
        ""
      );
    });

    it("returns URL for https with external-forced policy", () => {
      mockSanitize.mockReturnValue('<a href="https://example.com"></a>');
      expect(sanitizeAnchorUrl("https://example.com", "external-forced")).toBe(
        "https://example.com"
      );
    });

    it("returns empty string when DOMPurify.sanitize throws", () => {
      mockSanitize.mockImplementation(() => {
        throw new Error("sanitize error");
      });
      expect(sanitizeAnchorUrl("https://example.com", "internal")).toBe("");
    });
  });

  describe("sanitizeMarkdown", () => {
    it("calls DOMPurify.sanitize in viewer mode", () => {
      const result = sanitizeMarkdown("test content", "viewer");
      expect(mockSanitize).toHaveBeenCalled();
      expect(result).toBe("test content");
    });

    it("calls DOMPurify.sanitize in fallback mode", () => {
      sanitizeMarkdown("test", "fallback");
      expect(mockSanitize).toHaveBeenCalled();
    });

    it("calls DOMPurify.sanitize in storage mode", () => {
      sanitizeMarkdown("test", "storage");
      expect(mockSanitize).toHaveBeenCalled();
    });

    it("throws on an invalid mode", () => {
      expect(() => sanitizeMarkdown("test", "invalid" as any)).toThrow(
        "Unreachable code path reached"
      );
    });
  });

  describe("prepareFallbackMarkdown", () => {
    it("sanitizes via DOMPurify and converts br tags to newlines", () => {
      mockSanitize.mockReturnValue("Hello<br/>World");
      const result = prepareFallbackMarkdown("Hello<br/>World");
      expect(result).toContain("\n\n");
    });
  });
});
