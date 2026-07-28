import formatCurrency from "../shared/formatCurrency";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ACCOUNT_TRANSFER: "Account Transfer",
  UPI: "UPI",
  CASH: "Cash Payment",
  Cheque: "Cheque",
  DD: "Demand Draft",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  WALLET: "Digital Wallet",
  PREPAID_CARD: "Prepaid Card",
  PROFORMA_PAYMENT: "Proforma Payment",
  OTHER: "Other",
  PAYMENT_RECEIPT: "Payment Receipt",
};

type Payment = {
  paymentDate?: string;
  paymentMethod?: string;
  amount?: number;
  status?: string;
  tds?: number;
  transactionCharge?: number;
  paymentAccount?: { name?: string };
  conversionRates?: Record<string, number>;
  [key: string]: any;
};

type PaymentRow = {
  paymentDate: string;
  paymentMethodLabel: string;
  amount: number;
  status: string;
  tds: number;
  transactionCharge: number;
  paymentAccountName: string;
  amountInBizCurrency: number;
  amountInBizCurrencyFormatted: string;
};

export type PaymentTableResult = {
  payments: PaymentRow[];
  showTds: boolean;
  showTransactionCharge: boolean;
  showBizAmount: boolean;
  businessCurrency: string;
  hasRows: boolean;
  totalAmount: number;
  totalTds: number;
  totalTransactionCharge: number;
};

export function computePaymentColumns(
  payments: Payment[],
  options: { businessCurrency?: string; currency?: string } = {}
): PaymentTableResult {
  const { currency: invCurrency = "" } = options;

  // Use provided businessCurrency; if absent, auto-detect from the first conversionRates key
  let bizCurrency = options.businessCurrency || "";
  if (!bizCurrency && Array.isArray(payments)) {
    const firstPaymentWithRate = payments.find(
      (p) => p.conversionRates && Object.keys(p.conversionRates).length > 0
    );
    if (firstPaymentWithRate) {
      bizCurrency = Object.keys(
        firstPaymentWithRate.conversionRates!
      )[0] as string;
    }
  }

  const isForexInvoice = !!(bizCurrency && bizCurrency !== invCurrency);

  const empty: PaymentTableResult = {
    payments: [],
    showTds: false,
    showTransactionCharge: false,
    showBizAmount: false,
    businessCurrency: bizCurrency,
    hasRows: false,
    totalAmount: 0,
    totalTds: 0,
    totalTransactionCharge: 0,
  };

  if (!Array.isArray(payments) || !payments.length) return empty;

  let showTds = false;
  let showTransactionCharge = false;
  let showBizAmount = false;
  let totalAmount = 0;
  let totalTds = 0;
  let totalTransactionCharge = 0;

  const rows: PaymentRow[] = payments
    .filter((p) => !!p)
    .map((p) => {
      const amount = p.amount || 0;
      const tds = p.tds || 0;
      const transactionCharge = p.transactionCharge || 0;
      const bizRate =
        (p.conversionRates && p.conversionRates[bizCurrency]) || 0;
      const amountInBizCurrency = amount * bizRate;

      if (tds > 0) showTds = true;
      if (transactionCharge > 0) showTransactionCharge = true;
      if (isForexInvoice && amountInBizCurrency > 0) showBizAmount = true;

      totalAmount += amount;
      totalTds += tds;
      totalTransactionCharge += transactionCharge;

      return {
        paymentDate: p.paymentDate || "",
        paymentMethodLabel:
          PAYMENT_METHOD_LABELS[p.paymentMethod || ""] || p.paymentMethod || "",
        amount,
        status: p.status || "",
        tds,
        transactionCharge,
        paymentAccountName: p.paymentAccount?.name || "-",
        amountInBizCurrency,
        amountInBizCurrencyFormatted:
          isForexInvoice && amountInBizCurrency > 0
            ? formatCurrency(amountInBizCurrency, bizCurrency, "en-US", 2)
            : "",
      };
    });

  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  return {
    payments: rows,
    showTds,
    showTransactionCharge,
    showBizAmount,
    businessCurrency: bizCurrency,
    hasRows: rows.length > 0,
    totalAmount: round(totalAmount),
    totalTds: round(totalTds),
    totalTransactionCharge: round(totalTransactionCharge),
  };
}
