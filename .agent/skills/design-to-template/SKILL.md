---
name: design-to-template
description: Convert a Figma export or screenshot into a Ceres Handlebars template
---

# Design to Template

## When to use this

When someone gives you a visual design (Figma export, screenshot, mockup image) and wants it turned into a working Ceres template.

## Step-by-step process

### 1. Analyze the design

Look at the image and identify these sections (most invoice/document templates follow this pattern):

| Section | What to look for | Maps to |
|---------|-----------------|---------|
| **Letterhead** | Logo, company name, address at the top | `billedBy.name`, `billedBy.street`, `billedBy.city`, etc. |
| **Document info** | Invoice number, date, due date, PO number | `invoiceNumber`, `invoiceDateUserInput`, `formattedDueDate` |
| **Billed to** | Client name, address, tax ID | `billedTo.name`, `billedTo.street`, `billedTo.gstin` |
| **Status** | Paid/Unpaid/Overdue tag | Use `{{> InvoiceStatus}}` widget |
| **Line items** | The table's *visual* treatment only — borders, header fill, row density, serial column, thumbnails. Not its column set or header wording | `{{#each items}}` over `{{#each mapped.columns}}` — columns, labels and order come from the account (§4c) |
| **Totals** | Subtotal, tax, discount, total | `totals.subTotal`, `totals.total`, `totals.igst`, etc. |
| **Notes** | Free text area for notes | `{{> MarkdownViewer (prepareMarkdownViewerData notes)}}` |
| **Terms** | List of terms and conditions | `{{#each terms}}...{{/each}}` |
| **Footer** | Signature area, bank details | `billedBy.bankDetails`, signature fields |

### 2. Build the template folder

Create the standard structure:

```
src/templates/my-template/
  index.ts
  template.hbs
  styles.css
  version.json
  samples.json
```

Use the `scaffold-template` skill for the boilerplate of each file.

### 3. Translate visual layout to CSS

Map visual properties to CSS:

| Visual element | CSS approach |
|---------------|-------------|
| Side-by-side sections | `display: flex` or `display: grid` |
| Colored header bar | `background-color` on the header div |
| Borders/separators | `border-bottom` or `border-top` |
| Rounded corners | `border-radius` |
| Shadows | `box-shadow` (but avoid for print) |
| Custom fonts | Load via `@import` or use `--ceres-font-family` |

### 4. Map design colors to CSS custom properties

If the design uses a primary accent color, map it to `--ceres-primary-color` so users can customize it later:

```css
.header {
  background-color: var(--ceres-primary-color, #2e8555);
}
```

Always provide a fallback value that matches the design.

### 4a. Typography scale — 13px base, hard 10px floor

Declare six font sizes as custom properties on the template's root shell and reference them with `var(...)` everywhere. Override the same six inside `@media print` on the same selector.

**Naming is fixed: `--<prefix>-font-size-<step>`, with the steps `xs`, `s`, `base`, `m`, `lg`, `xl`.** Spell out `font-size`, not `fs`. Do not invent `sm`, `md` or `xxl` — six steps, those six names. `--sg-font-size-base`, `--fk-font-size-base`, `--mmd-font-size-base`.

Either `px` or `pt` is acceptable, but be consistent within a template and remember the floor below is a **px** figure — `1pt = 4/3 px`, so the smallest legal `pt` step is `7.5pt`.

**The `base` step is `13px`. Always — every template, and the same value in print as on screen.** Body copy is the one size a reader spends the whole document in; it does not get retuned per design, and it does not change between the screen preview and the printed PDF. Size the other five steps around it, not the reverse.

**No step may ever be below `10px` — screen or print.** Below that, the fine print that carries legal and tax meaning stops being reliably legible in a PDF.

Those two rules together determine where print density comes from: **take it out of the steps above the base only.** The base is pinned, `xs`/`s` sit at or near the floor, so the space is recovered by compressing `m`/`lg`/`xl`. The older blanket "-2px everywhere for print" does not survive contact with either rule.

```css
.my-template {
  --tpl-font-size-xs: 10px;    /* floor */
  --tpl-font-size-s: 11px;
  --tpl-font-size-base: 13px;  /* pinned */
  --tpl-font-size-m: 15px;
  --tpl-font-size-lg: 18px;
  --tpl-font-size-xl: 28px;
  line-height: 1.5;
}

@media print {
  .my-template {
    --tpl-font-size-xs: 10px;    /* at the floor, unchanged */
    --tpl-font-size-s: 11px;     /* fine print stays readable */
    --tpl-font-size-base: 13px;  /* pinned — same as screen */
    --tpl-font-size-m: 14px;     /* density comes from here up */
    --tpl-font-size-lg: 16px;
    --tpl-font-size-xl: 24px;
  }
}
```

A 10px floor makes dense tables wider and wrap more. That is the intended trade: reduce the column count or widen the cell, do not shrink the type below the floor.

**Enforce it with a test**, not just review — the values that break the floor are custom-property definitions inside `@media print`, which never appear in a rendered DOM as resolved `font-size` declarations and so are invisible to snapshot tests. See `tests/mmd.test.ts` for the pattern: parse `styles.css`, collect every px-valued `font-size` and `--*-fs-*` declaration, and assert none is below 10. Include a guard asserting the parser found declarations at all, so a refactor cannot make the check pass vacuously.

These checks go in the template's **existing** `tests/<template>.test.ts`, in their own `describe`. Do not open a separate CSS test file — `data-binding-tests` allows a template exactly one.

### 4b. Spacing — multiples of 4px

**Every spacing value is a multiple of 4px**: `padding`, `margin`, `gap`, `row-gap`, `column-gap`, and any offset. `4 8 12 16 20 24 28 32`. Not `6px`, not `10px`, not `18px` — reading a value off a design and transcribing it literally is how those get in.

Round to the nearest step. On a tie, pick the tighter one for dense areas like table cells: `padding: 8px 6px` becomes `8px 4px`, not `8px 8px`.

This does not apply to values that are not spacing — `1px` borders, `letter-spacing`, `max-width` on a logo, `line-height` (set `1.5` once on the root shell rather than per selector).

**Enforce it with a test alongside the font-size checks** — the same parse of `styles.css`, collecting `padding`/`margin`/`gap`/offset declarations and asserting every px value is divisible by 4. See `tests/mmd.test.ts`.

### 4c. Item table column widths — data-driven, so size for that

The item table's visible columns are decided at render time by the account's own `columns[]`, not by the design. Size the table for that, or it will look right on the reference document and wrong on the next one.

**Never give a serial/index column a share of the table width.** It holds one or two characters and must shrink to its content, always. The same goes for quantity, rate, discount and money columns — they size to their content; only the text columns absorb slack.

```css
.tpl-table {
  width: 100%;
  table-layout: auto;
}

/* Shrink-to-fit: a browser cannot honour a width below the content's minimum,
   so `1%` collapses the column to exactly what it needs and no further. */
.tpl-col-sno,
.tpl-col-qty,
.tpl-col-rate,
.tpl-col-amount {
  width: 1%;
  white-space: nowrap;
}

/* The text columns take every remaining pixel. */
.tpl-col-item {
  width: auto;
}
```

**Avoid `table-layout: fixed` with per-column percentages.** It is the trap this repo has already hit: the percentages are authored against the design's column set, and the moment normalization hides a column — `hsn` on a `MERGE` document, the tax columns on a quotation, `discount` when the document has none — the declared widths no longer sum to 100%. The leftover is then redistributed across *every* column, so a `width: 24px` serial column silently inflates to a large share of the table. A width that is only correct while every column happens to be visible is not a width.

**`width: 1%` and `nowrap` must reach the body cells, not just the header.** If the `<th>` carries the sizing class and the `<td>` carries only an alignment class, a table-wide `overflow-wrap: anywhere` will break a money figure across two lines to satisfy the squeeze. Either put the column class on both, or set `white-space: nowrap` on the numeric cells and let text columns opt back in with `white-space: normal`.

Check the result on a document whose column set differs from the design's — one with the tax columns visible, one with them hidden.

### 5. Handle print styles

Designs often look different on screen versus print. Add these print rules:

```css
@media print {
  /* Remove shadows (they look bad when printed) */
  * { box-shadow: none !important; }

  /* Remove background colors if they waste ink */
  .header { background-color: transparent; color: #333; }

  /* Remove padding/margin that exists for screen layout */
  .page { padding: 0; margin: 0; max-width: none; }

  /* Make sure the content does not overflow */
  body { overflow: visible !important; }
}
```

### 6. Check your work

Use this checklist:

- [ ] Does the rendered template match the design visually?
- [ ] Are all the right API fields being used in the right places?
- [ ] Do the colors respond to `--ceres-*` custom properties?
- [ ] Does it look good when printed (Ctrl+P)?
- [ ] Are all widget imports present in `index.ts`?
- [ ] Does `npm run build:template --template=my-template` succeed?
- [ ] Are snapshot baselines generated and eyeballed? Required — see `snapshot-testing`.

## Layout patterns catalog

### Split header (logo left, info right)

```handlebars
<div class="header">
  <div class="header-left">
    {{#if billedBy.logo}}
      <img src="{{billedBy.logo}}" class="logo" />
    {{/if}}
    <h2>{{billedBy.name}}</h2>
  </div>
  <div class="header-right">
    <p>Invoice #{{invoiceNumber}}</p>
    <p>Date: {{formateShortDateWithOffset invoiceDateUserInput ownerOffset}}</p>
  </div>
</div>
```

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
```

### Full-width colored bar

```handlebars
<div class="brand-bar">
  <h1>{{invoiceTitle}}</h1>
</div>
```

```css
.brand-bar {
  background-color: var(--ceres-primary-color, #2e8555);
  color: white;
  padding: 20px 40px;
}
```

### Two-column addresses

```handlebars
<div class="addresses">
  <div class="from">
    <h4>From</h4>
    <p><strong>{{billedBy.name}}</strong></p>
    <p>{{billedBy.street}}</p>
    <p>{{billedBy.city}}, {{billedBy.state}} {{billedBy.pincode}}</p>
  </div>
  <div class="to">
    <h4>To</h4>
    <p><strong>{{billedTo.name}}</strong></p>
    <p>{{billedTo.street}}</p>
    <p>{{billedTo.city}}, {{billedTo.state}} {{billedTo.pincode}}</p>
  </div>
</div>
```

```css
.addresses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  margin: 24px 0;
}
```

### Right-aligned totals

```handlebars
<div class="totals">
  <div class="totals-row">
    <span>Subtotal</span>
    <span>{{totals.subTotal}}</span>
  </div>
  {{#if totals.igst}}
  <div class="totals-row">
    <span>IGST</span>
    <span>{{totals.igst}}</span>
  </div>
  {{/if}}
  <div class="totals-row total-final">
    <span>Total</span>
    <span>{{totals.total}}</span>
  </div>
</div>
```

```css
.totals {
  margin-left: auto;
  width: 300px;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #eee;
}

.total-final {
  font-weight: bold;
  font-size: 1.1em;
  border-bottom: 2px solid #333;
}
```
