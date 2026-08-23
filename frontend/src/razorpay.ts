import { api } from "./api";

export type CheckoutOrder = {
  checkout?: boolean;
  keyId?: string;
  orderId?: string;
  amountPaise?: number;
  currency?: string;
  name?: string;
  invoiceId?: string;
};

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void };

function loadScript(): Promise<void> {
  if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.head.appendChild(el);
  });
}

export async function openRazorpay(order: CheckoutOrder): Promise<{ orderId: string; paymentId: string; signature: string }> {
  if (!order.keyId || !order.orderId) {
    throw new Error("Razorpay order is missing");
  }
  await loadScript();
  const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency || "INR",
      name: order.name || "Fees",
      order_id: order.orderId,
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        resolve({
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => reject(new Error("Payment window closed before paying")),
      },
    });
    rzp.open();
  });
}

export async function collectInvoice(invoiceId: string, opts?: { method?: string; amount?: string; reference?: string }) {
  const method = opts?.method || "UPI";
  const order = await api<CheckoutOrder>(`/api/actions/invoices/${invoiceId}/collect`, {
    method: "POST",
    body: JSON.stringify({ method, amount: opts?.amount, reference: opts?.reference }),
  });
  if (!order.checkout) {
    return order;
  }
  const paid = await openRazorpay(order);
  return api(`/api/actions/invoices/${invoiceId}/confirm`, {
    method: "POST",
    body: JSON.stringify(paid),
  });
}
