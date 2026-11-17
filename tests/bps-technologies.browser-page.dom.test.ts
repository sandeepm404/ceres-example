/**
 * @jest-environment jsdom
 */
import { applyBrowserPrintPage } from "../src/templates/bps-technologies/helpers";

const page = () => document.getElementById("bp-browser-page")?.textContent;

describe("BPS Technologies — a browser's print takes the side margins", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.className = "";
  });

  it("writes an @page margin from the document's setting", () => {
    document.body.innerHTML = `<div class="bp-doc" data-bp-side-margin="60"></div>`;
    applyBrowserPrintPage();
    // Wide (2): two 30 px steps of the paper, as Refrens' PDF service.
    expect(page()).toBe("@page { margin: 0 60px; }");
  });

  it("divides the margins by the print size zoom, which scales them", () => {
    document.body.innerHTML = `<div class="bp-doc" data-bp-side-margin="30"></div>`;
    const zoom = document.createElement("style");
    zoom.id = "ceres-template-zoom";
    zoom.textContent = "@media print { html { zoom: 1.25; } }";
    document.head.append(zoom);
    applyBrowserPrintPage();
    expect(page()).toBe("@page { margin: 0 24px; }");
  });

  it("leaves the PDF service's own margins alone", () => {
    document.body.className = "isDibella";
    document.body.innerHTML = `<div class="bp-doc" data-bp-side-margin="2"></div>`;
    applyBrowserPrintPage();
    expect(page()).toBeUndefined();
  });
});
