---
name: architect-template
description: Decide what a Ceres template must be able to render before writing markup. Use when building or restructuring a template from a design image, PDF, or block-name annotation — expands each named block to its full contract row set, so rows the sample document happens not to show still render when the data arrives. Use when a design is the only spec, when annotations name blocks but not fields, or when a shipped template breaks on a document that carries data the design never showed.
---

# Architect Template

A design shows one document; a template serves every document that account will ever issue. This skill decides the complete row set each block must render, so a row absent today still renders correctly the day its data exists. Building only what's visible in the reference is the single most common way a Ceres template ships broken.

## Vs. other skills

| Skill | Question it answers |
|---|---|
| **This skill** | *What must this block be able to render?* — the completeness spec, before markup |
| `ceres-template-data-contract` | *Which contract field feeds this visible row?* — path resolution, missing-data gate |
| `design-to-template` | *How do I lay it out?* — CSS, print typography, pagination |
| `scaffold-template` | File boilerplate |
| `data-mapping` | *What does the built template actually do with this payload?* — the audit that verifies the spec |
| `data-binding-tests` | Freezes the verified mapping as tests |

Run before `design-to-template`. Run `data-mapping` after and diff its output against this spec.

## The annotation contract

Designs arrive annotated with **block names only** — `Totals Block`, `Line item table`, `Invoice Details`, `HSN Summary Table`, `Tax Summary Table`, `Payment Table`. Nothing else is supplied or expected.

A block name means: instantiate that entire group from the field inventory in `.agent/skills/data-mapping/SKILL.md`, whether or not the sample document exercises it. It does not describe what's in the picture.

Never ask the user to annotate paths or visibility. Paths come from `src/main/invoicePayloadContract.ts`; visibility from `src/main/invoiceTemplateNormalization.ts`. Hand-written visibility intent gets the real gates backwards — "hide when zero" and "hide when not set" are both wrong.

## Step 1 — Block census

Map each annotated block to its reference group. Unnamed blocks are out of scope; named blocks are in scope **in full**.

| Annotated block | Reference group |
|---|---|
| Letterhead / header | §1 Document chrome |
| Invoice Details / document meta | §2 Invoice details |
| Seller / Billed By | §3 |
| Buyer / Bill To / Consignee | §4, §5 |
| Transport / dispatch | §6 |
| Line item table | §7 |
| In-table summary row | §8 |
| Totals Block | §9 |
| Tax Summary / HSN Summary / Stock Summary / Payment Table | §10 |
| Bank / UPI / payment info | §11 (§14 for the UPI QR) |
| Terms / notes / declaration / signature / footer | §12 (§14 for signature image + digital-signature flow — don't scope Signature from §12 alone) |
| IRN / e-way bill / QR Code / compliance strip | §13 (§14 for how each QR is sourced/rendered) |

## Step 2 — Expand each block to its full row set

| Class | Meaning | Action |
|---|---|---|
| **Present** | Visible in design, data in payload | Build and verify |
| **Latent** | Not in design, contract can supply it | **Build it, gated** — the class most often skipped |
| **Derived** | No payload key, computable from present data | **Build from a shared widget/helper.** Never ask |
| **Unsourced** | Visible, no field and nothing to compute it | Ask — the only category worth interrupting for |
| **Excluded** | Deliberately not on this document type | Record the decision and why |

**Output the spec as JSON, one object per row** — this is what gets diffed against `data-mapping`'s audit in Verification, and prose drifts under that diff in ways JSON can't:

```json
{
  "block": "Totals Block",
  "row": "Round Off",
  "class": "latent",
  "path": "invoice.roundOff",
  "gate": "mapped.visibility.showRoundOff",
  "widget": null,
  "confidence": 95,
  "notes": null
}
```

| Field | Type | Rules |
|---|---|---|
| `block` | string | matches the "Annotated block" name from Step 1 |
| `row` | string | short human label for the row |
| `class` | `"present" \| "latent" \| "derived" \| "unsourced" \| "excluded"` | from the table above |
| `path` | string \| `null` | contract path from `invoicePayloadContract.ts`; `null` for `derived`/`unsourced`/`excluded` |
| `gate` | string \| `null` | resolved boolean expression from `invoiceTemplateNormalization.ts`; `null` if unconditional or not yet resolvable |
| `widget` | string \| `null` | shared widget/helper name if the row is built from one (Step 4 table), else `null` |
| `confidence` | integer 0–100 | per the bands below; `derived` rows score on the source figure, not the printed string |
| `notes` | string \| `null` | required for the 70–89% band (state the assumption) and for `excluded` (state the reason); `null` otherwise |

Emit the full array — every row, every block, in Step 1's block order — either inline in the response or to a scratch file, so Verification can diff it directly against `data-mapping`'s output instead of eyeballing prose against prose.

### The item table is not scoped from the design

Its columns, their labels, and their order all arrive in `mapped.columns`. Nothing in the design's table header reaches the page, and the design's column set is one account's — the next document's differs. So take from the design only the table's **visual treatment**: rules and borders, header fill, row density, which columns are numeric-aligned, whether a serial column or item thumbnails are present. Never the header wording, never the column list.

That makes the item table the one block with no field-by-field scoping step. Its work is the switch — a case for every column key — plus the CSS in `design-to-template` §4c. Skip straight to those.

### Reconcile arithmetic before mapping authored money rows

This applies to rows you write out one at a time — totals-block rows against `finalTotal.*`, summary tables, a template-local derived column — **not** to the item table, which never asks you to pick a key.

Multiple money figures (`Unit Price`, `Price`, `Discount`, `Amount`, `Total`) don't self-identify by header. Solve from a decidable row:

```
EACH  Unit price  Price   Discount  Total
 50      1.81     90.50    1.65 %   89.01

50 x 1.81      = 90.50   ->  Price is the pre-discount gross
90.50 - 1.65%  = 89.01   ->  Total is net of discount
```

**Quantity of 1 proves nothing** — every candidate collapses to the same figure. Use a row with quantity ≠ 1 and non-zero discount; if none exists, the design is arithmetically ambiguous — ask, don't guess.

Before calling anything Derived, check in order:
1. **Contract field already holds it** — `items[n].subTotal` = pre-discount gross, `items[n].amount` = net of discount, `items[n].total` = amount + tax. Read it; recomputing is a guess that drifts the moment rounding differs (e.g. `quantity × rate` when `subTotal` already exists).
2. **Normalization exposes it** — `mapped.payments.paid`, `mapped.columns`, `mapped.visibility.*`.
3. Only then is it Derived.

**Prove a derived column distinct** from every existing column on the reference data — two money columns matching on every row means one is redundant or mis-mapped (see Verification).

### Derivability before scoring

**"No payload key" ≠ "no source."** A row computable from present data is Derived, scored on the **source figure** — a 90%-confident tax total renders as words at 90%, not 20%.

| Row that looks unsourced | Actually |
|---|---|
| `Tax Amount (in words)` | `amountInWords` over the tax total |
| Quantity total in table footer | Σ `items[n].quantity` |
| `Amount Paid` in settlement band | `mapped.payments.paid` = received + transaction charge |
| Summary table `Total` row | Σ of rows above, or the summary's own `total*` aggregates |
| Tax rate beside a totals label | column label + rate, composed |

Missing this fires a blocking question that didn't need asking.

### Confidence and the 40% rule

Score **the path**, not the layout:

| Band | Meaning | Action |
|---|---|---|
| 90–100% | Direct field, verified in this payload | Build |
| 70–89% | Field exists but composed/reformatted/aliased, or not in this payload | Build, state the assumption |
| 40–69% | A plausible candidate, but another key is equally defensible | Build against the best candidate, flag it, confirm at review |
| **< 40%** | No field, nothing derives it, no widget renders it — or several candidates with nothing to choose between | **Stop and ask before writing markup** |

Guessing below 40% is how `_id` gets printed as `Client ID`. Batch sub-40% rows into one question — row, candidates considered, why none wins, ask for source field + sample value — and keep building everything else while you wait. Check the widget inventory (Step 4) and the derivability table above first: a row an existing widget already renders isn't a question. Never downgrade a sub-40% row to "hardcoded" to dodge asking — hardcoding is a recorded decision, not an escape hatch.

## Step 3 — The latent rows

Absent from most reference designs, present in production. Checklist per block:

| Block | Build anyway |
|---|---|
| Document meta | due date, PO number, place/country of supply, reverse charge, status badge, `customFields[]`, `customHeaders[]` |
| Parties | contact person, VAT, PAN, `additionalIds[]`, `customFields[]`, party `customHeaders[]`, second shipping block |
| Transport | every `transportDetails.*` key — gates on *any* of them |
| Item table | tax columns (`gstRate`, `igst`, `cgst`, `sgst`, `total`), `discount`, inline HSN, SKU, unit, description body, item images, `originalImages[]` (separate from `images[]`), thumbnail column, group subtotals |
| Totals | discount, cess, **all** `additionalCharges[]`, round off, `extraTotalFields[]`, late fee, whole `balance.*` band (TDS, Amount Paid, Amount Received, Transaction Charge, Due Amount) |
| Summaries | tax/HSN/stock summary, payments table — gated on config **and** non-empty rows |
| Payment info | UPI id + QR alongside bank, both QR fallback chains |
| Signature | `signatureMethod === DIGITAL` → three states: awaiting (placeholder + banner), signed (banner + signer name + verify link), plain image (the only one naive builds handle) |
| Compliance / IRN | per-field `einvoiceConfig.*`/`ewayConfig.*` opt-ins, cancelled state (suppresses QR+Ack, keeps IRN), ZATCA/LHDN QRs even on India-only designs |
| Footer | notes, attachments, contact strip, `customFooters[]`, `footers[]`, branding |

A fully-paid design hides the settlement band; a single-rate design hides multi-rate summaries; an intra-state design hides IGST forever. None are optional.

## Step 4 — Build rules

### Reuse shared widgets

Check `src/widgets/` before writing block markup or a template-local helper — a second implementation drifts from the original and only one gets fixed.

| Need | Use |
|---|---|
| Tax summary | `tax-summary` (`TaxSummaryTable`) |
| HSN summary | `hsn-summary` (`HsnSummaryTable`) |
| Payments table | `payment-table` |
| Amount in words | `amountInWords`, `src/widgets/shared/amountInWords.ts` |
| Money formatting | `formatCurrency`/`registerFormatCurrencyHelper`, `currency-format` |
| Phone formatting | `phone-number` |
| Dates | `date-time` |
| QR rendering | `qr-code` (`qrSrc`) — IRN/ZATCA/LHDN/document QRs arrive PRE-RESOLVED as data-URLs; `qrSrc` also encodes a raw `upi://…` string client-side. Never route a compliance QR through the image-resize widget (that's for asset URLs, not data URIs) |
| Markdown (notes, item descriptions) | `markdown-viewer` |
| Status tag, watermark, images, branding | `invoice-status`, `watermark` (CSS pattern, not `<img>`), `image` (own resize box + `srcSet` per asset, see data-mapping §14), `refrens-branding` |

- Importing a widget registers its partial/helpers on `window.CeresWidgets` — skip the import and the block renders empty. Import only what `template.hbs` uses.
- Logic shared across widgets/templates goes in `src/widgets/shared/`, not a template's `helpers.ts`.
- Need a new derived value → add a shared helper, not a payload field. Ask for a field only when the data is missing, never when only its rendering is.
- Template-local `helpers.ts` is for genuinely local decisions (this layout's column grouping) only.

### Columns are data, not layout

`mapped.columns` renders in the **account's** order — never hardcode column list, order, or header text from the design. Headers print `{{label}}` off the same loop as the cells; the design decides how that row looks, not what it says.

- Item-cell `switch` needs a case for **every** possible column key — `name`, `hsn`, `quantity`, `rate`, `discount`, `amount`, `gstRate`, `igst`, `cgst`, `sgst`, `total`, plus template-local keys. Missing case → generic fallback prints a raw unformatted number.
- Full-width rows (description body, group subtotal, filler) take `colspan` from `mapped.visibility.visibleColumnCount`, never a literal.

### Geometry must survive rows appearing/disappearing

Boxed, ruled, Tally-style layouts only look right while every cell is populated.

- A gated-off block must not leave a bordered empty box — collapse it, or span the neighbour across the gap.
- No fixed heights to reach a page edge — use a flexible filler row so the frame holds at 2 items and at 40.
- Later-appearing rows must not push arithmetic out of the printed area — `additionalCharges[]` sit above the grand total and are part of the sum.

### Labels

This section is about **authored** labels — headings, totals rows, bank block, signature. Item-table column headers are not among them: they come off the loop, and there is no decision to make.

- **Variable** — sourced from `customLabels.*`/`columns[n].label`/`terms[g].label`. Guarded headings vanish on empty override; unguarded print blank — pick deliberately.
- **Hardcoded** — can't be renamed per account. Fine for structural words, but confirm: `Bank Name`, `Round Off`, `Authorised Signatory`, `Sl No.` are label decisions, not typography.
- Forced by normalization, never from payload: `cgst` always prints `CGST`; `sgst` prints `UTGST` when `invoice.utgst` is true.

"Prefer the payload" ≠ "the payload always has one." No key → hardcode; a blank element is worse than a readable hardcoded one.

**The item table's summary row (`showTotalsRow`)** is the trap: hardcode its label `Total` — no `customLabels` key exists for it. Don't reach for `customLabels.total` — that's the grand-total label, a different element further down the page. Both default to "Total," which is why the swap survives review, but an account renaming its grand total to "Net Payable" would then print that under the item table, and `customLabels.total: ""` would print no label at all.

Confirm a key genuinely doesn't exist before hardcoding — then record the decision in the spec.

### Values

- Money via `formatCurrency` with `subUnitLength` — read it, don't assume 2.
- Dates via `formateShortDateWithOffset` with `ownerOffset`.
- Quantities via `formatQty`; unit merges into quantity unless `unitColumn` is `MERGE_NAME`.
- `extraTotalFields[]` are free text — never currency-formatted — and render **below** the grand total, above the settlement band (data-mapping §9 Row order). `additionalCharges[]` are the opposite on both counts: money, and above the total as part of its sum.
- Markdown in `notes`/item `description` routes through the markdown partial, or tables print raw pipes.
- Every repeated group loops the array — never a fixed entry count.

### Never hardcode a sample value

No name, address, GSTIN, bank, term, or footer string from the reference belongs in markup. A row with no source yet stays conditional and empty.

## Two traps the build rules don't cover

- **Latent-row arithmetic** reconciles only because the reference had no charges, cess, or settlement rows — check against a payload carrying all three.
- **Tax path bound to the picture** — an intra-state reference gives CGST/SGST, but the same template must render IGST inter-state and a generic tax slot outside India. Resolve the tax path before any per-key rule.
- **Images that aren't images** — a QR looks like an asset but is host-resolved data: route via `qrSrc`/direct `<img src>`, never the image-resize widget. A signature that looks static is one of three states (awaiting/signed/plain) once `signatureMethod` is DIGITAL — build from the field, not the reference.

## Files this task creates

Only, inside the template's folder: `index.ts`, `template.hbs`, `styles.css`, `helpers.ts`, `version.json`, `samples.json`. Nothing else without the user asking.

`samples.json` holds real payload links only. No real link yet → reuse an existing real link from elsewhere in the repo and say plainly it's a stand-in, not this account's document. Never fabricate a payload.

## What to ask about

Only data-shaped conflicts, where proceeding either way changes numbers or invents a field:

- Any row still **< 40%** after Step 2's derivability check — the threshold is the rule.
- A visible row with no field and nothing to compute it from (`e-Way Bill No.`, bank branch name, `Mode/Terms of Payment`).
- A row the design omits that the contract would render, where including it changes the arithmetic.
- Whether one layout serves several `billType` variants, per the contract skill's consistency rule.

Not layout, spacing, or styling — design is refined later, data correctness is not.

## Verification

- Run the payload through `normalizeInvoiceTemplateState`; read `mapped.visibility`, `mapped.columns`, `mapped.payments` instead of reasoning about the gates.
- Run `data-mapping` against the built template and **diff it against this spec** — divergence is a bug in one of the two.
- **Read the rendered table**, not just markup — matching adjacent money columns on every row is a defect signal, invisible in markup review and hidden entirely when quantities are all 1.
- Exercise a second payload that turns latent rows on — inter-state, partially paid, multi-rate, with charges. One-document verification verifies nothing.
- `npm run build:template --template=<name>`, then freeze with `data-binding-tests` **and** baseline
  the render with `snapshot-testing` — both are required before handover, and neither covers the
  other's failures.

State plainly which of these ran and which didn't.
