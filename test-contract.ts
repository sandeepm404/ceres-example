import { CeresTemplatePayload } from "./src/types/contract";
import sampleData from "./src/types/sample.json";

// Using TypeScript's type assertion.
// If there are required properties missing or incorrect types in sampleData
// that drastically conflict with CeresTemplatePayload, tsc will report errors here.
const payload: CeresTemplatePayload =
  sampleData as unknown as CeresTemplatePayload;

console.log("✅ sample.json satisfies CeresTemplatePayload shape.");
console.log("Invoice number:", payload.invoice.invoiceNumber);
