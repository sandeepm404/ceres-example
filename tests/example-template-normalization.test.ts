import sample from "../src/types/sample.json";
import type {
  CeresTemplatePayload,
  FlattenedInvoicePayload,
} from "../src/types/contract";
import { normalizeInvoicePayload } from "../src/types/contract";
import { normalizeInvoiceTemplateState } from "../src/main/invoiceTemplateNormalization";

const wrappedSample: CeresTemplatePayload = sample;
const flatSample: FlattenedInvoicePayload =
  normalizeInvoicePayload(wrappedSample);

describe("ceres-example normalizeInvoiceTemplateState", () => {
  it("keeps the example repo aligned with the shared wrapped and flat contract", () => {
    const wrappedState = normalizeInvoiceTemplateState(wrappedSample);
    const flatState = normalizeInvoiceTemplateState(flatSample);

    expect(flatState).toEqual(wrappedState);
    expect(wrappedState.invoice).toEqual(flatSample);
    expect(wrappedState.invoice.invoiceNumber).toBe(
      wrappedSample.invoice.invoiceNumber
    );
    expect(wrappedState.mapped.qr.top).toBe(wrappedSample.invoice.irn?.qrCode);
    expect(wrappedState.mapped.visibility.showLogistics).toBe(true);
    expect(wrappedState.mapped.visibility.showTaxTable).toBe(true);
    expect(wrappedState.derived.showHsnColumn).toBe(true);
  });
});
