const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tensWords = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function below100(n: number): string {
  return n < 20
    ? ones[n]
    : (
        tensWords[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : "")
      ).trim();
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  return `${ones[Math.floor(n / 100)]} Hundred${
    n % 100 ? ` ${below100(n % 100)}` : ""
  }`;
}

function toWords(n: number): string {
  if (!n) return "Zero";
  let r = "";
  if (n >= 10000000) {
    r += `${below1000(Math.floor(n / 10000000))} Crore `;
    n %= 10000000;
  }
  if (n >= 100000) {
    r += `${below1000(Math.floor(n / 100000))} Lakh `;
    n %= 100000;
  }
  if (n >= 1000) {
    r += `${below1000(Math.floor(n / 1000))} Thousand `;
    n %= 1000;
  }
  return (r + below1000(n)).trim();
}

export default function amountInWords(amount: number): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "ZERO RUPEES ONLY";
  }
  if (amount < 0) {
    return `MINUS ${amountInWords(Math.abs(amount))}`;
  }
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = `${toWords(rupees)} ${rupees === 1 ? "Rupee" : "Rupees"}`;
  if (paise > 0) words += ` And ${toWords(paise)} ${paise === 1 ? "Paisa" : "Paise"}`;
  return `${words} Only`.toUpperCase();
}
