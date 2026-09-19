/*
 * Canonical coercions for reading the invoice payload.
 *
 * The payload is external data that arrives from three different producers (the serana
 * document GET, Lydia's in-app wrapper, and postMessage deltas), and the same bucket can
 * arrive as a number, a numeric string, or null — see the MoneyValue note in
 * invoicePayloadContract. Every reader funnels values through these, so the coercion rules
 * live in exactly one place rather than being re-guessed per call site.
 *
 * `isRecord` narrows to a record; the fields stay `unknown` on purpose. It proves an object
 * and nothing more, so read each field through the accessor that matches its declared type.
 */

export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const asRecord = (value: unknown): UnknownRecord =>
  isRecord(value) ? value : {};

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

/* Strictly `true`. A truthy string or 1 is not a set boolean flag on this contract. */
export const asFlag = (value: unknown): boolean => value === true;

/* Money buckets: number, numeric string, or null. Anything unparseable reads as 0. */
export const toAmount = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

/*
 * First value that is defined, non-null and not blank. Used where the host may send a field
 * under either of two keys — a canonical home and a deprecated one.
 */
export const pickFirst = (...values: unknown[]): unknown =>
  values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && value.trim().length === 0)
  );
