import { computePaymentColumns } from "../src/widgets/payment-table/utils";

describe("computePaymentColumns", () => {
  describe("empty / null input", () => {
    it("returns hasRows=false for empty array", () => {
      const result = computePaymentColumns([]);
      expect(result.hasRows).toBe(false);
      expect(result.payments).toEqual([]);
    });

    it("returns hasRows=false for null input", () => {
      expect(computePaymentColumns(null as any).hasRows).toBe(false);
    });

    it("returns hasRows=false for undefined input", () => {
      expect(computePaymentColumns(undefined as any).hasRows).toBe(false);
    });

    it("returns zero totals for empty input", () => {
      const result = computePaymentColumns([]);
      expect(result.totalAmount).toBe(0);
      expect(result.totalTds).toBe(0);
      expect(result.totalTransactionCharge).toBe(0);
    });
  });

  describe("basic payment rows", () => {
    it("maps a single payment to a row", () => {
      const payments = [
        {
          paymentDate: "2024-01-15",
          paymentMethod: "Bank Transfer",
          amount: 1000,
          status: "Received",
        },
      ];
      const result = computePaymentColumns(payments);
      expect(result.hasRows).toBe(true);
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].paymentDate).toBe("2024-01-15");
      expect(result.payments[0].paymentMethodLabel).toBe("Bank Transfer");
      expect(result.payments[0].amount).toBe(1000);
      expect(result.payments[0].status).toBe("Received");
    });

    it("maps multiple payments to multiple rows", () => {
      const payments = [
        { paymentDate: "2024-01-15", amount: 1000, status: "Received" },
        { paymentDate: "2024-02-10", amount: 500, status: "Pending" },
      ];
      const result = computePaymentColumns(payments);
      expect(result.payments).toHaveLength(2);
    });

    it("accumulates totalAmount across rows", () => {
      const payments = [{ amount: 1000 }, { amount: 500 }, { amount: 250 }];
      const result = computePaymentColumns(payments);
      expect(result.totalAmount).toBe(1750);
    });

    it("treats missing amount as 0", () => {
      const payments = [{ paymentDate: "2024-01-15", status: "Received" }];
      const result = computePaymentColumns(payments);
      expect(result.payments[0].amount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it("treats missing paymentDate as empty string", () => {
      const payments = [{ amount: 100 }];
      const result = computePaymentColumns(payments);
      expect(result.payments[0].paymentDate).toBe("");
    });

    it("treats missing paymentMethod as empty string", () => {
      const payments = [{ amount: 100 }];
      const result = computePaymentColumns(payments);
      expect(result.payments[0].paymentMethodLabel).toBe("");
    });

    it("treats missing status as empty string", () => {
      const payments = [{ amount: 100 }];
      const result = computePaymentColumns(payments);
      expect(result.payments[0].status).toBe("");
    });
  });

  describe("showTds detection", () => {
    it("showTds=false when no payment has tds > 0", () => {
      const payments = [{ amount: 1000, tds: 0 }];
      const result = computePaymentColumns(payments);
      expect(result.showTds).toBe(false);
    });

    it("showTds=true when at least one payment has tds > 0", () => {
      const payments = [
        { amount: 1000, tds: 100 },
        { amount: 500, tds: 0 },
      ];
      const result = computePaymentColumns(payments);
      expect(result.showTds).toBe(true);
    });

    it("showTds=false when tds field is missing", () => {
      const payments = [{ amount: 1000 }];
      const result = computePaymentColumns(payments);
      expect(result.showTds).toBe(false);
    });

    it("accumulates totalTds when tds present", () => {
      const payments = [
        { amount: 1000, tds: 100 },
        { amount: 500, tds: 50 },
      ];
      const result = computePaymentColumns(payments);
      expect(result.totalTds).toBe(150);
    });

    it("treats missing tds as 0", () => {
      const payments = [{ amount: 1000 }];
      const result = computePaymentColumns(payments);
      expect(result.payments[0].tds).toBe(0);
    });
  });

  describe("showTransactionCharge detection", () => {
    it("showTransactionCharge=false when no payment has transactionCharge > 0", () => {
      const payments = [{ amount: 1000, transactionCharge: 0 }];
      const result = computePaymentColumns(payments);
      expect(result.showTransactionCharge).toBe(false);
    });

    it("showTransactionCharge=true when at least one payment has transactionCharge > 0", () => {
      const payments = [
        { amount: 1000, transactionCharge: 25 },
        { amount: 500, transactionCharge: 0 },
      ];
      const result = computePaymentColumns(payments);
      expect(result.showTransactionCharge).toBe(true);
    });

    it("showTransactionCharge=false when transactionCharge field is missing", () => {
      const payments = [{ amount: 1000 }];
      const result = computePaymentColumns(payments);
      expect(result.showTransactionCharge).toBe(false);
    });

    it("accumulates totalTransactionCharge when present", () => {
      const payments = [
        { amount: 1000, transactionCharge: 25 },
        { amount: 500, transactionCharge: 10 },
      ];
      const result = computePaymentColumns(payments);
      expect(result.totalTransactionCharge).toBe(35);
    });

    it("treats missing transactionCharge as 0", () => {
      const payments = [{ amount: 1000 }];
      const result = computePaymentColumns(payments);
      expect(result.payments[0].transactionCharge).toBe(0);
    });
  });

  describe("combined scenarios", () => {
    it("shows both tds and transactionCharge when both present", () => {
      const payments = [{ amount: 1000, tds: 100, transactionCharge: 25 }];
      const result = computePaymentColumns(payments);
      expect(result.showTds).toBe(true);
      expect(result.showTransactionCharge).toBe(true);
    });
  });

  describe("paymentMethodLabel", () => {
    it("maps ACCOUNT_TRANSFER to Account Transfer", () => {
      const payments = [{ amount: 100, paymentMethod: "ACCOUNT_TRANSFER" }];
      expect(
        computePaymentColumns(payments).payments[0].paymentMethodLabel
      ).toBe("Account Transfer");
    });

    it("passes through unknown payment method unchanged", () => {
      const payments = [{ amount: 100, paymentMethod: "FOOBAR" }];
      expect(
        computePaymentColumns(payments).payments[0].paymentMethodLabel
      ).toBe("FOOBAR");
    });

    it("returns empty string when paymentMethod is missing", () => {
      const payments = [{ amount: 100 }];
      expect(
        computePaymentColumns(payments).payments[0].paymentMethodLabel
      ).toBe("");
    });
  });

  describe("paymentAccountName", () => {
    it("uses paymentAccount name when present", () => {
      const payments = [
        { amount: 100, paymentAccount: { name: "dummy@okicici" } },
      ];
      expect(
        computePaymentColumns(payments).payments[0].paymentAccountName
      ).toBe("dummy@okicici");
    });

    it("uses dash when paymentAccount is missing", () => {
      const payments = [{ amount: 100 }];
      expect(
        computePaymentColumns(payments).payments[0].paymentAccountName
      ).toBe("-");
    });
  });

  describe("amountInBizCurrency / showBizAmount", () => {
    it("showBizAmount=false when no businessCurrency provided", () => {
      expect(computePaymentColumns([{ amount: 1000 }]).showBizAmount).toBe(
        false
      );
    });

    it("computes amountInBizCurrency from conversionRates", () => {
      const payments = [{ amount: 1000, conversionRates: { USD: 0.012 } }];
      const result = computePaymentColumns(payments, {
        businessCurrency: "USD",
      });
      expect(result.payments[0].amountInBizCurrency).toBeCloseTo(12);
      expect(result.showBizAmount).toBe(true);
    });

    it("amountInBizCurrency=0 when conversionRates missing", () => {
      const payments = [{ amount: 1000 }];
      const result = computePaymentColumns(payments, {
        businessCurrency: "USD",
      });
      expect(result.payments[0].amountInBizCurrency).toBe(0);
      expect(result.payments[0].amountInBizCurrencyFormatted).toBe("");
      expect(result.showBizAmount).toBe(false);
    });

    it("amountInBizCurrency=0 when bizCurrency key not in conversionRates", () => {
      const payments = [{ amount: 1000, conversionRates: { EUR: 0.01 } }];
      const result = computePaymentColumns(payments, {
        businessCurrency: "USD",
      });
      expect(result.payments[0].amountInBizCurrency).toBe(0);
    });

    it("echoes businessCurrency in result", () => {
      expect(
        computePaymentColumns([], { businessCurrency: "USD" }).businessCurrency
      ).toBe("USD");
    });

    it("showBizAmount=false when invoice currency equals businessCurrency", () => {
      const payments = [{ amount: 1000, conversionRates: { INR: 1 } }];
      const result = computePaymentColumns(payments, {
        businessCurrency: "INR",
        currency: "INR",
      });
      expect(result.showBizAmount).toBe(false);
      expect(result.payments[0].amountInBizCurrencyFormatted).toBe("");
    });

    it("formats amountInBizCurrencyFormatted with currency symbol", () => {
      const payments = [{ amount: 1000, conversionRates: { USD: 0.012 } }];
      const result = computePaymentColumns(payments, {
        businessCurrency: "USD",
        currency: "INR",
      });
      expect(result.payments[0].amountInBizCurrencyFormatted).toMatch(
        /\$\s?12\.00/
      );
      expect(result.showBizAmount).toBe(true);
    });

    it("amountInBizCurrencyFormatted is empty when amountInBizCurrency is 0", () => {
      const payments = [{ amount: 1000, conversionRates: { EUR: 0 } }];
      const result = computePaymentColumns(payments, {
        businessCurrency: "EUR",
        currency: "INR",
      });
      expect(result.payments[0].amountInBizCurrencyFormatted).toBe("");
    });

    it("auto-detects bizCurrency from conversionRates when businessCurrency not provided", () => {
      const payments = [{ amount: 1000, conversionRates: { USD: 0.012 } }];
      const result = computePaymentColumns(payments, { currency: "INR" });
      expect(result.businessCurrency).toBe("USD");
      expect(result.payments[0].amountInBizCurrency).toBeCloseTo(12);
      expect(result.payments[0].amountInBizCurrencyFormatted).toMatch(
        /\$\s?12\.00/
      );
      expect(result.showBizAmount).toBe(true);
    });

    it("skips payment with empty conversionRates and stays no-forex", () => {
      const payments = [{ amount: 1000, conversionRates: {} }];
      const result = computePaymentColumns(payments, { currency: "INR" });
      expect(result.showBizAmount).toBe(false);
      expect(result.payments[0].amountInBizCurrencyFormatted).toBe("");
    });

    it("falls back to 'CURRENCY amount' string when bizCurrency is not a valid ISO 4217 code", () => {
      const payments = [{ amount: 1000, conversionRates: { CUSTOM: 0.5 } }];
      const result = computePaymentColumns(payments, { currency: "INR" });
      expect(result.payments[0].amountInBizCurrencyFormatted).toBe("CUSTOM 500.00");
    });
  });

  describe("rounding totals", () => {
    it("rounds totalAmount to 2 decimal places", () => {
      const payments = [{ amount: 0.1 }, { amount: 0.2 }];
      const result = computePaymentColumns(payments);
      expect(result.totalAmount).toBe(0.3);
    });

    it("rounds totalTds to 2 decimal places", () => {
      const payments = [{ amount: 100, tds: 0.1 }, { amount: 100, tds: 0.2 }];
      const result = computePaymentColumns(payments);
      expect(result.totalTds).toBe(0.3);
    });

    it("rounds totalTransactionCharge to 2 decimal places", () => {
      const payments = [{ amount: 100, transactionCharge: 0.1 }, { amount: 100, transactionCharge: 0.2 }];
      const result = computePaymentColumns(payments);
      expect(result.totalTransactionCharge).toBe(0.3);
    });
  });
});
