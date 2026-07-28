import {
    safeDate,
    parseOffset,
    formatByStyle,
} from "../src/widgets/date-time/index";

describe("DateTime Widget", () => {
    describe("safeDate", () => {
        it("returns null for null/undefined/empty input", () => {
            expect(safeDate(null)).toBeNull();
            expect(safeDate(undefined)).toBeNull();
            expect(safeDate("")).toBeNull();
        });

        it("returns Date object for valid date string", () => {
            const d = safeDate("2023-01-01");
            expect(d).toBeInstanceOf(Date);
            expect(d?.getFullYear()).toBe(2023);
        });

        it("returns Date object for timestamp", () => {
            const d = safeDate(1672531200000); // 2023-01-01
            expect(d).toBeInstanceOf(Date);
        });

        it("returns null for invalid date string", () => {
            expect(safeDate("invalid-date")).toBeNull();
        });
    });

    describe("parseOffset", () => {
        it("returns 0 for empty input", () => {
            expect(parseOffset(undefined)).toBe(0);
            expect(parseOffset("")).toBe(0);
        });

        it("returns number as is", () => {
            expect(parseOffset(330)).toBe(330);
        });

        it("parses +HH:mm format", () => {
            expect(parseOffset("+05:30")).toBe(330); // 5*60 + 30
            expect(parseOffset("05:30")).toBe(330);
        });

        it("parses -HH:mm format", () => {
            expect(parseOffset("-05:00")).toBe(-300);
        });

        it("parses HH format", () => {
            expect(parseOffset("05")).toBe(300);
        });
    });

    describe("formatByStyle", () => {
        // Mock Intl.DateTimeFormat if needed, or rely on node's implementation
        const d = new Date("2023-01-01T12:00:00Z");

        it("formats 'half' style", () => {
            // In UTC context or system locale, output might vary slightly but usually "Jan 01"
            // We can check if it contains the month and day
            const result = formatByStyle(d, "half", "en-US", "UTC");
            expect(result).toBe("Jan 01");
        });

        it("formats 'short' style", () => {
            const result = formatByStyle(d, "short", "en-US", "UTC");
            expect(result).toBe("Jan 01, 2023");
        });

        it("formats 'primary' style", () => {
            const result = formatByStyle(d, "primary", "en-US", "UTC");
            expect(result).toBe("January 01, 2023");
        });

        it("formats 'month' style", () => {
            const result = formatByStyle(d, "month", "en-US", "UTC");
            expect(result).toBe("January 2023");
        });
    });
});
