---
name: ceres-template-data-contract
description: Map Ceres invoice/document template designs to the renderer data contract. Use when creating or modifying a Ceres template from an image, screenshot, Figma/design reference, sample payload, or user description, especially when deciding which `invoice.*`, `mapped.*`, `derived.*`, `advanceOptions`, or `pdfOptions` fields a Handlebars template should consume and when the provided image is missing data needed to reproduce the design.
---

# Ceres Template Data Contract

## Overview

Use this skill to keep new Ceres templates aligned with the invoice payload contract and the normalized template view model. Treat visual references as layout guidance, not as a complete data source.

## Contract Sources

Read only the files needed for the task:

- `src/main/invoicePayloadContract.ts` for the external API payload and `FlattenedInvoicePayload`.
- `src/main/invoiceTemplateNormalization.ts` for the Handlebars-facing state returned by `normalizeInvoiceTemplateState`.
- `src/types/sample.json` for a realistic wrapped payload.
- The closest existing template under `src/templates/<name>/` for local rendering patterns.

Templates usually consume the normalized state:

```ts
{
  invoice: FlattenedInvoicePayload;
  advanceOptions: Record<string, unknown>;
  pdfOptions: Record<string, unknown>;
  mapped: {
    qr: { top: string; upi: string };
    upi: { id: string };
    columns: InvoiceTemplateColumn[];
    irn: { isCancelled: boolean };
    visibility: InvoiceTemplateVisibility;
  };
  derived: InvoiceTemplateDerivedState;
}
```

## Workflow

1. Inspect the provided design/image and list the visible document sections: title, document metadata, biller/customer blocks, shipping/transport, item columns, taxes, totals, payment details, QR codes, notes, terms, signature, branding, footer, and any custom labels.
2. Map each visible section to existing normalized fields first. Prefer `invoice.*` for raw values, `mapped.visibility.*` for conditional sections, `mapped.columns` for dynamic line-item columns, `mapped.qr.*` for QR images, and `derived.*` for HSN/classification/SKU/unit layout decisions.
3. Use `normalizeInvoiceTemplateState` in the template entrypoint unless the template has a specific reason to render the raw payload. Set `window.CeresTemplateDataMapper = normalizeInvoiceTemplateState`.
4. Import only the widgets/helpers used by `template.hbs`, such as `invoice-status`, `date-time`, `demo-badge`, or `markdown-viewer`.
5. Keep optional data conditional in Handlebars. Do not render empty labels, empty QR/image tags, blank tax sections, blank bank details, or placeholder identifiers in production markup.
6. If the requested design needs fields not present in the normalized contract, add the smallest template-local mapper only after checking whether the raw payload already contains the data under another contract field.
7. Update or create a sample payload only when the template needs data that is not represented by the existing sample. Keep sample fields consistent with `src/main/invoicePayloadContract.ts`.

## Missing Data Rule

If the user provides an image/screenshot/design and something required to reproduce it is not visible or not inferable from the contract, ask for it before finalizing the template.

Ask specifically for missing:

- Logo, letterhead, footer, signature, stamp, or QR assets.
- Exact business, tax, bank, UPI, contact, address, or registration identifiers.
- Custom labels or wording that must match the image.
- Line-item columns, totals, tax rows, discount rows, cess rows, payment rows, or summary sections that are partially cropped or absent.
- Print behavior that cannot be inferred, such as first-page letterhead, last-page footer, repeated table headers, or page-break rules.
- Required print font sizing when the image is only a screen preview or when small legal/tax text, item rows, totals, or footers must match a printed/PDF layout.
- Any field that appears visually important but has no obvious source in `invoice.*`, `mapped.*`, `derived.*`, `advanceOptions`, or `pdfOptions`.

Do not ask for every optional invoice field. Ask only for missing information that affects the requested design, data mapping, or reliable preview/testing.

Use concise questions such as:

```text
I can build the layout from the image, but I need these missing data details first: the logo/letterhead asset, the exact bank fields to show, and whether the QR code should use `invoice.irn.qrCode`, `invoice.documentQr`, or UPI QR.
```

## Field Mapping Defaults

Use these defaults unless the current contract or existing template shows a better pattern:

- Document title/number/date: `invoice.invoiceTitle`, `invoice.invoiceSubTitle`, `invoice.invoiceNumber`, `invoice.invoiceDate`, `invoice.dueDate`, `invoice.purchaseOrderNumber`, `invoice.copy`.
- Parties: `invoice.billedBy`, `invoice.billedTo`, `invoice.shippedFrom`, `invoice.shippedTo`.
- Items: `invoice.items`, with visible column decisions from `mapped.columns` or `derived.*`.
- Taxes and totals: `invoice.taxSummary`, `invoice.hsnSummary`, `invoice.finalTotal`, `invoice.totals`, `invoice.balance`, and `mapped.visibility.showIgst/showCgstSgst/showTaxTable/showHsnSummary/showSummaryCess`.
- Payments: `invoice.allPayments`, `invoice.payments`, `invoice.paymentOptions`, `invoice.bankAccount`, `invoice.upi`, `mapped.visibility.showBankAccount`, `mapped.visibility.showUpi`, `mapped.visibility.showBankUpiSection`.
- QR codes: `mapped.qr.top` for document/IRN/ZATCA/LHDN QR, `mapped.qr.upi` for payment QR, `mapped.upi.id` for UPI text.
- Notes/terms/footer: `invoice.notes`, `invoice.terms`, `invoice.footers`, `invoice.customFooters`, `invoice.showBranding`.
- Styling options: use Ceres CSS custom properties where possible: `--ceres-primary-color`, `--ceres-secondary-color`, `--ceres-primary-background`, `--ceres-secondary-background`, `--ceres-font-family`.

## Print Typography

Always handle print font sizing when creating or modifying template CSS:

- Define explicit `@media print` typography for the document shell, tables, totals, notes, terms, and footer. Do not rely only on screen font sizes.
- By default, reduce print font sizes by `2px` from the corresponding screen sizes, then notify the user that this print-density adjustment was applied.
- Use stable units and predictable scaling for printable invoices. Prefer fixed `px` or `pt` sizes inside print media over viewport-based sizing.
- Keep table row text, tax summaries, bank details, and legal terms readable in PDF output while preventing overflow on A4/Letter widths.
- Preserve visual hierarchy in print: document title, metadata labels, line-item body text, totals, and fine print should have deliberate relative sizes.
- If the source image does not show a printed/PDF view and exact print sizing matters, ask the user whether to optimize for A4 or Letter and whether compact or spacious print density is preferred.
- Verify print CSS does not hide required data, clip long values, or create page breaks inside important rows/summary blocks.

## Verification

After implementation, run the narrowest useful checks:

- `npm run build:template --template=<name>` for one template.
- `npm test -- --findRelatedTests <changed-files>` when template behavior or normalization tests exist.
- `npm run typecheck` when TypeScript contract or mapper code changes.

If validation cannot run, report why and name the unverified risk.
