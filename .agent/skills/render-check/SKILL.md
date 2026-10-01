---
name: render-check
description: Render a Ceres template headlessly and look at the result. Use after writing or changing template.hbs or styles.css, and before handing any template over — it is the only step in the workflow that sees the rendered document rather than reasoning about markup.
---

# Render Check

Markup review does not tell you what the page looks like. This does. Run it after every
meaningful edit to `template.hbs` or `styles.css`, not once at the end — a defect found on the
first render costs a minute, the same defect found by the account costs a round trip.

```bash
npm run render -- --template=<name>
```

The template must be built first (`npm run build:template --template=<name>`).

## What comes back

Artifacts land in `.ceres-render/<template>/<sample>/` (gitignored):

| File | Use it for |
|---|---|
| `screen.png` | **Read this.** Full-page capture at A4 width, 2x — compare against the design |
| `page-1.png`, `page-2.png`, … | Per-page slices under print media — page breaks, what lands where |
| `print.pdf` | Ground-truth A4 pagination; hand to the user, or read if poppler is installed |
| `rendered.html` | The template's own output — grep it for a binding you cannot see |
| `report.json` | Full lint findings; the console prints a summary |

**Actually read `screen.png`.** The artifacts existing is not the check; looking at them is.

## What the lint catches

Console output flags these automatically. Errors fail the command (exit 1); warnings do not.

- `placeholder` / `placeholder-attr` — `undefined`, `NaN`, `[object Object]` reached the page or an
  attribute. Almost always a path that does not exist in the contract.
- `broken-image` — a **visible** `<img>` that did not load. Hidden letterhead slots are excluded.
- `font-floor:screen` / `font-floor:print` — type below the 10px floor, measured from computed
  style. The print pass is the valuable one: `@media print` custom-property overrides never appear
  as resolved declarations in a screen DOM, so nothing else in the workflow can see them.
- `overflow` — content spilling past the page box.
- `empty-box` — a bordered block a visibility gate emptied but left framed.
- `render` / `console` / `page-error` / `request-failed` — the render did not complete.

A clean report is not a correct document. It means nothing is obviously broken; whether the layout
matches the design is still a question only the screenshot answers.

## Payloads

`samples.json` names the documents a template renders; `payloads/` caches what came back. The first
run fetches the sample live — pass `--record` and the response is cached to `payloads/<doc>.json` at
the repo root (gitignored), and every later run replays it offline.

**One folder for the whole repo, keyed by the document, not by the template.** Templates routinely
share a sample URL — five of them name the same Refrens invoice — so a per-template cache stored
that document five times over. Keyed by document it is recorded once, and any template can replay
any recorded document:

```bash
npm run render -- --template=fitking --payload=payloads/6889e52e70b524001974dd2d.json
```

Record a payload as soon as a template has a working sample. Sample URLs carry access tokens that
expire and hosts that move — `fitking`'s first sample already 301s — and a cached payload is also
what lets you re-render a template months later without chasing a fresh link. The flip side: a
recorded payload goes stale on its own terms. Presigned asset URLs inside it (logo, signature, item
photos) expire within minutes, so a `broken-image` finding on an old cache is the cache's age, not
the template's markup — delete the file and re-record before believing it.

```bash
npm run render -- --template=fitking --sample="Refrens Example" --record
npm run render -- --template=fitking --all-samples      # every sample in samples.json
npm run render -- --template=fitking --payload=./some.json
npm run render -- --template=fitking --width=1000       # non-A4 preview width
```

## Exercise more than one document

One render verifies one document. The latent rows `architect-template` had you build — inter-state
tax, partial payment, multi-rate summaries, additional charges — are invisible until a payload turns
them on. Record a second payload that does, and render that too. A template that renders the
reference document perfectly and nothing else is the normal failure, not an unusual one.

## Related

- `.agent/skills/snapshot-testing/SKILL.md` — baseline diffing across runs (still not wired up)
- `.agent/skills/design-to-template/SKILL.md` §4a — the font floor this enforces
