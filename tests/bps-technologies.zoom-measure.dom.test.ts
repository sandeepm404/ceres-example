/**
 * @jest-environment jsdom
 */
import { drawnRect } from "../src/templates/bps-technologies/helpers";

/*
 * Refrens' PDF service runs Chrome 122, which reports anything inside a CSS-zoomed element
 * divided by that zoom; Chrome 128+ reports what is drawn (Element.currentCSSZoom exists there).
 */
describe("BPS Technologies — measuring inside the zoomed print table", () => {
  const mount = () => {
    document.body.innerHTML = `<table class="bp-items" style="zoom: 0.5"><tbody><tr><td id="cell">1</td></tr></tbody></table>`;
    const cell = document.getElementById("cell") as HTMLElement;
    cell.getBoundingClientRect = () =>
      ({
        x: 400,
        y: 100,
        width: 200,
        height: 40,
        left: 400,
        right: 600,
        top: 100,
        bottom: 140,
      } as DOMRect);
    const real = window.getComputedStyle;
    jest
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element: Element) => {
        const style = real(element);
        // jsdom drops the zoom property; it is read from the style attribute.
        const zoom =
          /zoom:\s*([\d.]+)/.exec(element.getAttribute("style") || "")?.[1] ||
          "1";
        return { ...style, zoom } as CSSStyleDeclaration;
      });
    return cell;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    delete (Element.prototype as unknown as Record<string, unknown>)
      .currentCSSZoom;
  });

  it("scales Chrome 122's figures by the zoom, to what is drawn", () => {
    const rect = drawnRect(mount());
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
      200, 50, 100, 20,
    ]);
  });

  it("leaves a Chrome 128+ rect as it is", () => {
    Object.defineProperty(Element.prototype, "currentCSSZoom", {
      configurable: true,
      get: () => 1,
    });
    const rect = drawnRect(mount());
    expect([rect.x, rect.width]).toEqual([400, 200]);
  });
});
