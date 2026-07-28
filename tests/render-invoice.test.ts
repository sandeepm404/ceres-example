import tmpl from "../src/templates/basic-invoice-example/template.hbs";

// Skip during CI/build; enable locally when needed
it.skip("basic-invoice-example template renders snapshot", () => {
  const html = tmpl({
    customLabels: {
      invoiceNumber: "Invoice No.",
      invoiceDate: "Invoice Date",
      dueDate: "Due Date",
      purchaseOrderNumber: "PO No.",
      billedBy: "Billed By",
      billedTo: "Billed To",
      subTotal: "Subtotal",
      total: "Total",
      totalInWords: "Total in words",
      totalInWordsValue: "One Hundred Rupees Only",
      notes: "Notes",
      terms: "Terms",
    },
    invoiceNumber: "INV-001",
    invoiceDateUserInput: "01 Sep 2025",
    formattedDueDate: "15 Sep 2025",
    purchaseOrderNumber: "PO-42",
    billedBy: {
      name: "Acme Corp",
      street: "123 Baker Street",
      city: "Mumbai",
      state: "MH",
      pincode: "400001",
      country: "IN",
      vatLabel: "GSTIN",
      vatNumber: "27ABCDE1234F1Z5",
    },
    billedTo: {
      name: "Alice Pvt Ltd",
      street: "7, MG Road",
      city: "Bengaluru",
      state: "KA",
      pincode: "560001",
      country: "IN",
      gstin: "29ABCDE1234F1Z5",
    },
    items: [
      {
        name: "Consulting",
        sku: "CONS-001",
        description: "Strategy session",
        quantity: 2,
        rate: "₹5,000.00",
        gstRate: 18,
        amount: "₹10,000.00",
        igst: "₹0.00",
        total: "₹11,800.00",
      },
    ],
    totals: {
      subTotal: "₹10,000.00",
      igst: "₹0.00",
      cgst: "₹900.00",
      sgst: "₹900.00",
      amountRoundOff: "₹0.00",
      totalRoundOff: "₹0.00",
      total: "₹11,800.00",
      discount: "₹0.00",
    },
    notes: "Payment due within 15 days.",
    terms: [
      { terms: ["Payment via bank transfer", "Thank you for your business"] },
    ],
  });
  expect(html).toMatchSnapshot();
});
