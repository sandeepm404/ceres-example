import {
  toImageSrc,
  normalizeImages,
  prepareImageGallery,
} from "../src/widgets/image/utils";

describe("toImageSrc", () => {
  it("returns a trimmed string URL", () => {
    expect(toImageSrc("  https://cdn.example.com/a.png  ")).toBe(
      "https://cdn.example.com/a.png"
    );
  });

  it("extracts url from an object", () => {
    expect(toImageSrc({ url: "https://cdn.example.com/b.png" })).toBe(
      "https://cdn.example.com/b.png"
    );
  });

  it("extracts src from an object when url is absent", () => {
    expect(toImageSrc({ src: "https://cdn.example.com/c.png" })).toBe(
      "https://cdn.example.com/c.png"
    );
  });

  it("returns null for empty / whitespace strings", () => {
    expect(toImageSrc("")).toBeNull();
    expect(toImageSrc("   ")).toBeNull();
  });

  it("returns null for unsafe protocols", () => {
    // eslint-disable-next-line no-script-url -- intentional unsafe-URL fixture, never executed
    expect(toImageSrc("javascript:alert(1)")).toBeNull();
    expect(toImageSrc("vbscript:msgbox")).toBeNull();
    expect(toImageSrc("file:///etc/passwd")).toBeNull();
  });

  it("returns null for null / undefined / empty object", () => {
    expect(toImageSrc(null)).toBeNull();
    expect(toImageSrc(undefined)).toBeNull();
    expect(toImageSrc({})).toBeNull();
  });
});

describe("normalizeImages", () => {
  it("returns [] for non-array input", () => {
    expect(normalizeImages(null)).toEqual([]);
    expect(normalizeImages(undefined)).toEqual([]);
    expect(normalizeImages("nope" as any)).toEqual([]);
  });

  it("maps string URLs to renderable images with href defaulting to src", () => {
    const result = normalizeImages(["https://x/1.png", "https://x/2.png"], {
      alt: "Item",
    });
    expect(result).toEqual([
      { src: "https://x/1.png", href: "https://x/1.png", alt: "Item" },
      { src: "https://x/2.png", href: "https://x/2.png", alt: "Item" },
    ]);
  });

  it("drops empty / invalid entries", () => {
    const result = normalizeImages([
      "https://x/1.png",
      "",
      null,
      { nope: true },
      { url: "https://x/2.png" },
    ] as any);
    expect(result.map((i) => i.src)).toEqual([
      "https://x/1.png",
      "https://x/2.png",
    ]);
  });

  it("passes the direct URL through unchanged (no optimization)", () => {
    const url = "https://cdn.example.com/original/huge-photo.jpg?v=1";
    expect(normalizeImages([url])[0].src).toBe(url);
  });

  it("omits href when link is disabled", () => {
    const result = normalizeImages(["https://x/1.png"], { link: false });
    expect(result[0].href).toBe("");
  });
});

describe("prepareImageGallery", () => {
  it("returns hasImages=false for empty / invalid input", () => {
    expect(prepareImageGallery([]).hasImages).toBe(false);
    expect(prepareImageGallery(null).hasImages).toBe(false);
  });

  it("returns hasImages=true with normalized images", () => {
    const payload = prepareImageGallery(["https://x/1.png"], {
      variant: "thumbnail",
      alt: "Photo",
    });
    expect(payload.hasImages).toBe(true);
    expect(payload.variant).toBe("thumbnail");
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0]).toEqual({
      src: "https://x/1.png",
      href: "https://x/1.png",
      alt: "Photo",
    });
  });

  it("defaults variant to 'default' when not provided", () => {
    expect(prepareImageGallery(["https://x/1.png"]).variant).toBe("default");
  });
});
