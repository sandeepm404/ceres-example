/**
 * @jest-environment jsdom
 */
import {
  prepareBrowserPrint,
  printMediaText,
  setBpsStylesheetText,
  syncPrintWidths,
  withPrintRules,
  withReadableStylesheet,
} from "../src/templates/bps-technologies/helpers";

describe("BPS Technologies — a browser's own print", () => {
  it("reads each media query as print would on the page", () => {
    expect(printMediaText("print", 718)).toBe("all");
    expect(printMediaText("screen", 718)).toBe("not all");
    expect(printMediaText("screen and (width <= 720px)", 718)).toBe("not all");
    expect(printMediaText("(width <= 640px)", 718)).toBe("not all");
    expect(printMediaText("(width <= 640px)", 479)).toBe("all");
    expect(printMediaText("(prefers-color-scheme: dark)", 718)).toBeUndefined();
  });

  it("switches the print rules on for one measurement and back", () => {
    document.head.innerHTML =
      "<style>@media print { .probe { color: red; } } @media screen { .probe { color: blue; } }</style>";
    const sheet = document.styleSheets[0];
    const media = () =>
      Array.from(sheet.cssRules).map(
        (rule) => (rule as CSSMediaRule).media.mediaText
      );
    expect(withPrintRules(718, media)).toEqual(["all", "not all"]);
    expect(media()).toEqual(["print", "screen"]);
    expect(() =>
      withPrintRules(718, () => {
        throw new Error("measure failed");
      })
    ).toThrow("measure failed");
    expect(media()).toEqual(["print", "screen"]);
  });

  it("prepares before printing, leaving the screen layout as it was", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px;"><div class="bp-items-scroll"><table class="bp-items is-cards"></table></div></div>`;
    prepareBrowserPrint();
    expect(document.querySelector<HTMLElement>(".bp-doc")?.style.width).toBe(
      ""
    );
    expect(document.querySelector(".bp-items")?.className).toBe(
      "bp-items is-cards"
    );
  });

  // Refrens' PDF service makes its PDF in print media, and making it fires beforeprint.
  it("prepares nothing when print media is on already (the PDF service)", () => {
    document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px;"></div>`;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /print/.test(query),
      media: query,
    })) as unknown as typeof window.matchMedia;
    const layout = jest.fn();
    try {
      prepareBrowserPrint(layout);
    } finally {
      window.matchMedia = original;
    }
    expect(layout).not.toHaveBeenCalled();
  });

  it("measures with a readable copy of a stylesheet from another origin", () => {
    setBpsStylesheetText('@import url("font.css"); .probe { color: red; }');
    document.head.innerHTML =
      '<link rel="stylesheet" href="https://example.com/templates/bps-technologies/1.0.1/bundle.css">';
    const link = document.querySelector("link") as HTMLLinkElement;
    // A sheet whose rules cannot be read, as a cross-origin one.
    const foreign = {
      disabled: false,
      get cssRules(): CSSRuleList {
        throw new DOMException("cross-origin", "SecurityError");
      },
    };
    Object.defineProperty(link, "sheet", { value: foreign });
    const during = withReadableStylesheet(() => ({
      copy: document.querySelector("style[data-bp-measure]")?.textContent,
      on: !(
        document.querySelector("style[data-bp-measure]") as HTMLStyleElement
      ).sheet?.disabled,
      original: foreign.disabled,
    }));
    expect(during).toEqual({
      copy: '@import url("font.css"); .probe { color: red; }',
      on: true,
      original: true,
    });
    expect(foreign.disabled).toBe(false);
    expect(
      (document.querySelector("style[data-bp-measure]") as HTMLStyleElement)
        .sheet?.disabled
    ).toBe(true);
  });

  // Lydia changes the print size live: the renderer rewrites its zoom style, no new render.
  it("follows a print zoom changed live", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px; --bp-browser-print-width: 714px; --bp-print-base: 718.1102px; --bp-browser-print-base: 718.1102px;"></div>`;
    const doc = document.querySelector<HTMLElement>(".bp-doc") as HTMLElement;
    syncPrintWidths();
    expect(doc.style.getPropertyValue("--bp-print-width")).toBe("714px");
    const zoom = document.createElement("style");
    zoom.id = "ceres-template-zoom";
    zoom.textContent = "@media print { html { zoom: 1.2; } }";
    document.head.append(zoom);
    syncPrintWidths();
    expect(doc.style.getPropertyValue("--bp-print-width")).toBe("594px");
    expect(doc.style.getPropertyValue("--bp-browser-print-width")).toBe(
      "594px"
    );
    // Back to 0.8, which the renderer draws by removing its style: zoom 1 widths.
    zoom.remove();
    syncPrintWidths();
    expect(doc.style.getPropertyValue("--bp-print-width")).toBe("714px");
  });

  // Nothing shrinks to fit the paper (user, 2026-11-01): the browser's print lays the page out
  // at its width (over the 75 % print base) and the table keeps the print size.
  it("never scales the document or the table for a browser's print", () => {
    document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 714px;"><div class="bp-items-scroll"><table class="bp-items"></table></div></div>`;
    const doc = document.querySelector(".bp-doc") as HTMLElement;
    let widthWhilePreparing = "";
    prepareBrowserPrint(() => {
      widthWhilePreparing = doc.style.width;
    });
    // jsdom drops a calc() with a variable; Chrome lays the page out at 714 px / the 75 % base.
    expect(["", "calc(714px / var(--bp-print-scale, 1))"]).toContain(
      widthWhilePreparing
    );
    expect(doc.getAttribute("style")).not.toMatch(/zoom|fit/);
    expect(doc.dataset.bpPreparedZoom).toBeUndefined();
  });

  // The item photos' print cap is a share of the page's height: measured in the window's.
  it("measures with the page's vh and leaves none behind", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = `<div class="bp-doc" style="--bp-print-width: 736px; --bp-browser-print-height: 1268px;"></div>`;
    const doc = document.querySelector<HTMLElement>(".bp-doc") as HTMLElement;
    let during = "";
    prepareBrowserPrint(() => {
      during = doc.style.getPropertyValue("--bp-vh");
    });
    expect(during).toBe("12.68px");
    expect(doc.style.getPropertyValue("--bp-vh")).toBe("");
  });
});
