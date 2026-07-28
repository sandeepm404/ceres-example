import { parsePhoneNumberFromString } from "libphonenumber-js";

function formatPhoneNumberIntl(phone: string): string | undefined {
  const normalized = phone.slice(0, 1) === "+" ? phone : `+${phone}`;
  const parsed = parsePhoneNumberFromString(normalized);
  const formatted = parsed?.formatInternational();
  // Wrap with LTR isolate characters to prevent RTL distortion (same as disco)
  return formatted ? `\u2066${formatted}\u2069` : undefined;
}

function getHB(): any {
  return (window as any).Handlebars;
}

function register() {
  const HB = getHB();
  if (!HB) return;

  HB.registerHelper("formatPhoneNumber", (phone: any) => {
    if (typeof phone !== "string" && typeof phone !== "number") {
      return "";
    }
    const phoneStr = String(phone).trim();
    if (!phoneStr) return "";
    return formatPhoneNumberIntl(phoneStr) ?? phoneStr;
  });

  (window as any).CeresWidgets = (window as any).CeresWidgets || {};
  (window as any).CeresWidgets.PhoneNumber = { register };
}

try {
  register();
} catch (_) {
  /* noop */
}

export default formatPhoneNumberIntl;
