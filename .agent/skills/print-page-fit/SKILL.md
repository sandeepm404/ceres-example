---
name: print-page-fit
description: Make a template's printed summary block (totals, QR, signature) sit at the foot of the page, just above the letterhead footer, on single-page and multi-page PDFs, with the item table filling the gap as blank space. Covers the dibella PDF service's letterhead/footer bands and page-scope checkboxes, text scale (zoomSize), and how to verify pagination locally. Use when an account asks for "the totals at the bottom of the page" or a stretched item table.
---

# Print page fit: summary at the foot of the page

Reference implementation: `sami-contracting` —
`src/templates/sami-contracting/styles.css` (the `@media print` block),
`src/templates/sami-contracting/helpers.ts` (`withFillerRow`, `installPrintFit`,
`pagedShift`, `lastPageSlack`), `src/templates/sami-contracting/index.ts` (wiring) and
`src/templates/sami-contracting/template.hbs` (letterhead slots). Copy from there; this
skill explains why each piece is the way it is.

All of it is template-scoped. Nothing here needs a change to `src/main` or a widget.

## How the PDF is made (what you are fitting to)

The dibella PDF service prints the Ceres page with headless Chrome.

| Account setting (Letterhead & Footer) | What dibella does | What the template must do |
|---|---|---|
| "Show only on First/Last Page" **off** | Draws the letterhead and footer images in ~200px top/bottom page margins on **every** page, and hides every `.no-dibella` element | Keep both slots marked `no-dibella` |
| **on** (`pdfOptions.letterHeadOnFirstPage` / `footerOnLastPage`) | Draws nothing in the margins | Print them itself, in the flow: drop `no-dibella` for that slot |

```hbs
<div class="{{#unless pdfOptions.letterHeadOnFirstPage}}no-dibella {{/unless}}invoice-letterhead…">
<div class="{{#unless pdfOptions.footerOnLastPage}}no-dibella {{/unless}}invoice-letterhead-footer…">
```

- Page margins belong to dibella. **Never set `@page { margin }` or `@page { size }`**:
  it overrides dibella's bands and the letterhead/footer get drawn over the content.
- Side margins (`pdfOptions.xMargins`) are applied by dibella too. Ignore them in the
  template; adding them doubles the margin.
- In the PDF, `100vh` is the printable page area (page less the bands). In a browser's own
  print preview `100vh` is the window, so cap it: `min(100vh, 296mm)`.
- Text scale is `pdfOptions.zoomSize`. The shared renderer zooms `html` in print for every
  value except 0.8 (`src/main/commonUtils.ts`); a template that wants 0.8 applies it
  itself. Divide any page-height measure by the renderer's zoom, or a zoomed page
  under-fills: the reference passes it in as `--smc-page-zoom`.

## Single page: CSS only

1. The shell is at least one page tall and a flex column; the page body flexes.
2. The items block, the widget's table wrapper and the table flex down the column.
3. A **blank filler row** after the items (before any summary row) takes the spare height.
   Item rows keep their own height; the filler draws nothing, so the gap is white space.

```css
@media print {
  .shell { display: flex; flex-direction: column;
           min-height: calc(min(100vh, 296mm) / var(--page-zoom, 1)); }
  .page  { flex: 1 0 auto; }
  .items, .items .line-items-table-wrapper { display: flex; flex: 1 0 auto; flex-direction: column; }
  .items .line-items-table { flex: 1 0 auto; }
  .items .line-items-table > tbody > tr.row-filler { display: table-row; height: 100%; }
  .items .line-items-table > tbody > tr.row-filler > td { border-color: transparent; background: transparent; }
}
.items .line-items-table > tbody > tr.row-filler { display: none; } /* screen: nothing to fill */
```

The filler row is added in the template's data mapper (`withFillerRow`), mirroring the
line-items widget's own stretch filler (`src/widgets/line-items/styles.css`, S12). If the
account already has the widget stretch on, its filler is reused, never doubled.

Do **not** stretch the last item row instead (`tr:last-child { height: 100% }`): the item's
boxes grow to the page foot, which accounts read as a broken row.

## Multi-page: a print-time script

CSS cannot know how much of the last page is left, so a script runs as printing starts
and pads the summary's top by exactly the space left on the last page. The summary and
everything after it, including an in-flow footer, move to the foot of that page.

Chrome gives two hooks, and dibella may hit either:

| How the PDF is made | Hook that sees the print layout | Layout at that moment |
|---|---|---|
| Straight to PDF | `matchMedia("print")` change, `matches: true` | Already split into pages |
| Print media switched on first | `beforeprint` with `matchMedia("print").matches` already true | One unbroken column |

DOM changes made in either hook reach the PDF. Handle both, and reset on the way back to
screen (`change` with `matches: false`, `afterprint`).

The page breaks are worked out rather than read, so the unbroken-column case works too
(`pagedShift`): walk the item rows, then the blocks after the items marked
`break-inside: avoid`. A unit that would cross a page end moves to the next page, a row
taking the repeated table header with it. On an already-paginated layout nothing
crosses, so the same code is a no-op there. Then:

- page height = a probe sized like the CSS stretch,
  `calc(min(100vh, 296mm) / var(--page-zoom, 1))`, measured with `getBoundingClientRect`;
- slack = pages × page height − content height − 2px (`lastPageSlack`; 0 on one page,
  where the CSS covers it). The 2px keeps rounding from spilling a blank page;
- set the summary's `padding-block-start` to the slack. Use padding, not margin: Chrome
  truncates margins at a page break. Then re-measure and correct by the ratio, because
  a print zoom inside the page scales CSS pixels.

The summary must carry `break-inside: avoid`, so the padded block is never split.

Measured result (sami-contracting, zoom 0.9): straight to PDF, the summary ends at the page
foot; print-media-first, about 50–70px short (the computed breaks are approximate). Both
keep page count and never split the summary.

## Verify

Unit-test the pure maths (`pagedShift`, `lastPageSlack`) in the template's test file;
jsdom has no layout. Then look at real pages:

```bash
# dev server on :1337 serving the built template, payload JSON saved locally
node .agent/skills/print-page-fit/dibella-sim.cjs --template=<name> \
  --payload=/tmp/doc.json --items=40 --out=/tmp/p.pdf                 # boxes off, media first
node .agent/skills/print-page-fit/dibella-sim.cjs … --no-emulate        # straight to PDF
node .agent/skills/print-page-fit/dibella-sim.cjs … --flags             # boxes on
swift .agent/skills/print-page-fit/pdf2png.swift /tmp/p.pdf /tmp/p      # → /tmp/p-1.png …
```

Run 1 item (single page), an item count that ends with the summary on the items' page,
and one that pushes the summary alone onto a new page, each with and without
`--no-emulate` and `--flags`. Read every PNG. Check: page count, the summary unsplit, the
gap above the summary blank, nothing under the footer band.

Pitfalls seen:

- The headless renderer's per-page PNGs are slices of one tall screenshot, cut on an
  A4 grid. They ignore page-break rules and can show a summary "split" that the PDF does
  not have. Judge pagination from the PDF (rasterize it with `pdf2png.swift`).
- A screen-only preview never shows any of this; the padding exists only while printing.
- Real dibella output is the final check: ask the account for a PDF at 2–3 pages with the
  boxes on and off.
