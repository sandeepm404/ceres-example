---
name: architect-template
description: Decide what a Ceres template must be able to render before writing markup. Use when building or restructuring a template from a design image, PDF, or block-name annotation — expands each named block to its full contract row set, so rows the sample document happens not to show still render when the data arrives. Use when a design is the only spec, when annotations name blocks but not fields, or when a shipped template breaks on a document that carries data the design never showed.
---

# Architect Template

A design shows one document. A template serves every document that account will ever issue. This skill closes that gap: given a set of blocks, decide the complete row set each block must be able to render, and build so that a row absent today appears correctly the day its data exists.

Building only what is visible in the reference is the single most common way a Ceres template ships broken.

## What this covers vs. other skills

| Skill | Question it answers |
|---|---|
| **This skill** | *What must this block be able to render?* — the completeness spec, before markup |
| `ceres-template-data-contract` | *Which contract field feeds this visible row?* — path resolution and the missing-data gate |
| `design-to-template` | *How do I lay it out?* — CSS, print typography, pagination |
| `scaffold-template` | File boilerplate |
| `data-mapping` | *What does the built template actually do with this payload?* — the audit that verifies the spec |
| `data-binding-tests` | Freezing the verified mapping as tests |

Run this **before** `design-to-template`. Run `data-mapping` after, and diff its output against the spec this skill produced.

## The annotation contract

Designs arrive annotated with **block names only** — `Totals Block`, `Line item table`, `Invoice Details`, `HSN Summary Table`, `Tax Summary Table`, `Payment Table`. Nothing else is supplied, and nothing else should be expected.

A block name is not a description of what is in the picture. It is an instruction to **instantiate that entire group from the field inventory in `.agent/skills/data-mapping/SKILL.md`**, whether or not the sample document exercises it.

Never ask the user to annotate paths or visibility. Paths come from `src/main/invoicePayloadContract.ts`; visibility comes from `src/main/invoiceTemplateNormalization.ts`. Hand-written visibility intent contradicts the real gates in ways that are easy to get backwards — "hide when zero" and "hide when not set" are both wrong against the actual rules.

## Step 1 — Block census

List the annotated blocks and map each to its reference group. Blocks the design does not name are out of scope; blocks it names are in scope **in full**.

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
| Bank / UPI / payment info | §11 |
| Terms / notes / declaration / signature / footer | §12 |

## Step 2 — Expand each block to its full row set

For every row in the group, classify:

| Class | Meaning | Action |
|---|---|---|
| **Present** | Visible in the design, data in the payload | Build and verify |
| **Latent** | Not in the design, but the contract can supply it | **Build it, gated.** This is the class that gets skipped |
| **Unsourced** | Visible in the design, no contract field | Ask — it is the only category worth interrupting for |
| **Excluded** | Deliberately not on this document type | Record the decision and why |

The output of this step is the spec: one line per row, with its class, its path, its resolved gate expression, and a confidence score.

### Confidence, and the 40% rule

Score every mapping. The score is about **the path**, not the layout:

| Band | Meaning | Action |
|---|---|---|
| **90–100%** | Direct contract field, verified present in the supplied payload | Build it |
| **70–89%** | Contract field, but composed, reformatted, or aliased — the value is assembled from more than one key, or the key exists in the contract but not in this payload | Build it, state the assumption in the spec |
| **40–69%** | A plausible candidate exists but a different key would be equally defensible | Build it against the best candidate, flag the row in the spec, and confirm at review |
| **Below 40%** | **Stop and ask.** No contract field found, or several unrelated candidates with nothing to choose between them | Ask before writing markup for that row |

**Below 40% is a blocking question for that row, not a guess to be resolved later.** Guessing here is how a Mongo-style `_id` ends up printed as a `Client ID`, or how a visible figure gets bound to a key that happens to hold a similar number on one document.

Batch the sub-40% rows into a single question — one message listing each row, the candidates considered, and the reason none of them wins. Ask for the source field and one sample value. Keep building every other row while you wait; a blocked row must not stall the block it sits in.

Never silently downgrade a sub-40% row to "hardcoded" to avoid asking. A hardcoded label is a deliberate decision recorded in the spec, not a fallback for an unresolved path.

## Step 3 — The latent rows

These are absent from most reference designs and present in production payloads. Treat the list as a checklist per block.

| Block | Latent rows to build anyway |
|---|---|
| Document meta | due date, PO number, place/country of supply, reverse charge, status badge, `customFields[]`, `customHeaders[]` |
| Parties | contact person, VAT number, PAN, `additionalIds[]`, `customFields[]`, party `customHeaders[]`, second shipping block |
| Transport | every `transportDetails.*` key — the block gates on *any* of them |
| Item table | the tax columns (`gstRate`, `igst`, `cgst`, `sgst`, `total`), `discount`, inline HSN, SKU, unit, description body, item images, thumbnail column, group subtotals |
| Totals | discount, cess rows, **all** `additionalCharges[]`, round off, `extraTotalFields[]`, late payment fee, and the whole `balance.*` settlement band — TDS, Amount Paid, Amount Received, Transaction Charge, Due Amount |
| Summaries | tax summary, HSN summary, stock summary, payments table — each gated on config **and** non-empty rows |
| Payment info | UPI id and QR alongside bank, both QR fallback chains |
| Footer | notes, attachments, contact strip, `customFooters[]`, `footers[]`, branding |

A design showing a fully-paid invoice hides the entire settlement band. A design with one tax rate hides multi-rate summaries. A design for an intra-state customer hides IGST forever. None of these are optional.

## Step 4 — Build rules

### Columns are data, not layout

The item table renders `mapped.columns` in the **account's** order. Never hardcode the column list or the header order from the design; the design shows one account's configuration.

- Give the item-cell `switch` a case for **every** column key that can be visible — `name`, `hsn`, `quantity`, `rate`, `discount`, `amount`, `gstRate`, `igst`, `cgst`, `sgst`, `total`, plus any template-local key. A missing case falls to the generic fallback and prints a raw unformatted number.
- Column count is `mapped.visibility.visibleColumnCount`. Every full-width row — description body, group subtotal, summary row filler — must take its `colspan` from it, never from a literal.

### Geometry must survive rows appearing and disappearing

Boxed, ruled, Tally-style layouts are the fragile case: they look correct only while every cell is populated.

- A block that gates off must not leave a bordered empty box. Decide per block: collapse, or span the neighbour across the gap.
- Do not use fixed heights to reach a page edge. Use a flexible filler row that grows, so the frame holds at 2 items and at 40.
- Rows that appear later must not shift the arithmetic out of the printed area — `additionalCharges[]` sit above the grand total and are part of the sum.

### Labels

Decide ownership per label, and write the decision down:

- **Variable** — its own element, sourced from `customLabels.*` / `columns[n].label` / `terms[g].label`. Guarded headings vanish on an empty override; unguarded ones print blank. Pick deliberately.
- **Hardcoded** — cannot be renamed per account. Acceptable for structural words, but confirm before shipping: `Bank Name`, `Round Off`, `Authorised Signatory`, `Sl No.` are all label decisions, not typography.
- Two labels are forced by normalization and must not read the account's value: `cgst` always prints `CGST`, `sgst` prints `UTGST` when `invoice.utgst` is true.

### Values

- Money through `formatCurrency` with `subUnitLength` — read it, do not assume 2.
- Dates through `formateShortDateWithOffset` with `ownerOffset`.
- Quantities through `formatQty`; unit merges into quantity unless `unitColumn` is `MERGE_NAME`.
- `extraTotalFields[]` are free text — never currency-formatted.
- Markdown can appear inside `notes` and item `description`; route both through the markdown partial or tables print as raw pipes.
- Every repeated group loops the array. Never render a fixed number of entries.

### Never hardcode a sample value

No name, address, GSTIN, bank, term, or footer string from the reference document belongs in the markup. If a row has no source yet, it stays conditional and empty — not filled with the picture's text.

## Traps this skill exists to prevent

- **Design-shaped item table.** Columns hardcoded in the design's order, so an account that reorders or renames them gets the wrong table.
- **`colspan` drift.** A literal colspan that was right for the reference and wrong the moment a tax column appears.
- **The vanished heading.** An empty `customLabels` override on a guarded heading removes the header but leaves its bordered container.
- **Latent-row arithmetic.** Totals that reconcile only because the reference had no charges, no cess and no settlement rows.
- **Fixed-height table body.** Correct on a 5-item document, clipped on a 40-item one.
- **A block built from the picture's tax path.** An intra-state reference gives CGST/SGST; the same template must render IGST for inter-state and the single-tax slot for non-India.

## What to ask about

Only data-shaped conflicts — ones where proceeding either way changes numbers or invents a field:

- **Any row scored below 40%** in Step 2 — the threshold is the rule, not a judgement call.
- A visible row with no contract source (`e-Way Bill No.`, `Tax Amount (in words)`, bank branch name).
- A row the design omits where the contract would render one, and including it would change the arithmetic (a discount netted into the amount column with no discount row).
- Whether one layout serves several `billType` variants, per the contract skill's consistency rule.

Do not ask about layout, spacing or styling. Design is refined later; data correctness is not.

## Verification

The spec is a claim about rendered output. Close the loop:

- Run the payload through `normalizeInvoiceTemplateState` and read `mapped.visibility`, `mapped.columns` and `mapped.payments` rather than reasoning about the gates. Executing the real normalization takes a minute and settles every argument.
- Run `data-mapping` against the built template and **diff it against this spec**. Divergence is a bug in one of the two.
- Exercise a second payload that turns latent rows on — inter-state, partially paid, multi-rate, with charges. A template verified against one document is verified against nothing.
- `npm run build:template --template=<name>`, then freeze with `data-binding-tests`.

State plainly which of these were executed and which were not.
