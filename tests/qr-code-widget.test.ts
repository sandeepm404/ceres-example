import { qrSrc, encodeQr } from "../src/widgets/qr-code";

const GIF_DATA_URI = /^data:image\/gif;base64,[A-Za-z0-9+/=]+$/;

describe("qrSrc", () => {
  it("passes through sources an <img> can already load", () => {
    const urls = [
      "https://cdn.example.com/qr.png",
      "http://cdn.example.com/qr.png",
      "//cdn.example.com/qr.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "blob:https://example.com/9a1b",
    ];

    urls.forEach((url) => expect(qrSrc(url)).toBe(url));
  });

  it("encodes a upi:// intent into a renderable image", () => {
    const src = qrSrc("upi://pay?pa=someone@oksbi");

    expect(src).toMatch(GIF_DATA_URI);
  });

  it("encodes an opaque e-invoice payload rather than passing it through", () => {
    const src = qrSrc("eyJEYXRhIjoiMS4xIiwiSXJuIjoiYWJjMTIzIn0=");

    expect(src).toMatch(GIF_DATA_URI);
  });

  it("returns an empty string for absent or placeholder values", () => {
    [undefined, null, "", "   ", "null", "undefined", {}, []].forEach((value) =>
      expect(qrSrc(value)).toBe("")
    );
  });

  it("returns an empty string when the payload exceeds QR capacity", () => {
    expect(encodeQr("x".repeat(5000))).toBe("");
  });

  it("varies the output with the error-correction level", () => {
    expect(qrSrc("upi://pay?pa=someone@oksbi", "H")).not.toBe(
      qrSrc("upi://pay?pa=someone@oksbi", "L")
    );
  });

  it("keeps the raster near the print-resolution target for sparse and dense payloads", () => {
    // A short intent and a long signed blob should land at a comparable size,
    // so neither prints blurry nor bloats the document.
    const sparse = qrSrc("upi://pay?pa=a@b").length;
    const dense = qrSrc("y".repeat(900)).length;

    expect(sparse).toBeGreaterThan(1000);
    expect(dense).toBeLessThan(sparse * 20);
  });
});
