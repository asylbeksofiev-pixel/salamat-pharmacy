// Payment provider interface. No provider is connected: the site never shows a working "Pay" button
// until a real provider (e.g. a bank acquiring or Kaspi Pay integration) is implemented here and configured.
export interface PaymentProvider {
  readonly name: string;
  readonly enabled: boolean;
  /** Creates a payment for a confirmed order and returns a redirect URL. */
  createPayment(order: { publicId: string; amountKzt: number; description: string }): Promise<{ redirectUrl: string; paymentId: string }>;
  /** Verifies a provider callback (signature check) and returns the payment status. */
  verifyCallback(request: Request): Promise<{ paymentId: string; status: "paid" | "failed" | "pending" }>;
}

class NoPaymentProvider implements PaymentProvider {
  readonly name = "none";
  readonly enabled = false;
  async createPayment(): Promise<never> {
    throw new Error("Online payment is not connected");
  }
  async verifyCallback(): Promise<never> {
    throw new Error("Online payment is not connected");
  }
}

export function activePaymentProvider(): PaymentProvider {
  // Add real providers here, selected by PAYMENT_PROVIDER, once contracts and keys are available.
  return new NoPaymentProvider();
}
