/**
 * STUB — Payment provider interface (escrow simulation).
 *
 * No real payment gateway is wired up for the MVP. `MockPaymentProvider`
 * simulates "holding" and "releasing" funds by just resolving immediately
 * and logging — the real escrow bookkeeping lives in Order.escrowStatus
 * (HELD | RELEASED | REFUNDED) in the database, which IS real and
 * auditable. Swap `MockPaymentProvider` for a `PayMongoProvider` /
 * `GCashProvider` implementing the same interface in Phase 2 without
 * touching any calling code.
 */

export interface PaymentProvider {
  holdFunds(params: {
    orderId: string;
    amount: number;
    buyerId: string;
  }): Promise<{ reference: string }>;

  releaseFunds(params: {
    orderId: string;
    amount: number;
    sellerId: string;
  }): Promise<{ reference: string }>;

  refundFunds(params: {
    orderId: string;
    amount: number;
    buyerId: string;
  }): Promise<{ reference: string }>;

  /**
   * Pays the hauler's share of the logistics fee out of escrow at
   * settlement time. The platform's own logistics margin (the rest of the
   * logistics fee) simply stays with the platform and isn't "paid" anywhere
   * — it's recognized as revenue via Order.platformNetRevenueAmountPHP.
   */
  payHauler(params: {
    orderId: string;
    amount: number;
    haulerId: string;
  }): Promise<{ reference: string }>;
}

export const MockPaymentProvider: PaymentProvider = {
  async holdFunds({ orderId, amount, buyerId }) {
    console.log(
      `[payments:mock] HOLD ₱${amount.toFixed(2)} from buyer=${buyerId} for order=${orderId}`
    );
    return { reference: `mock_hold_${orderId}` };
  },
  async releaseFunds({ orderId, amount, sellerId }) {
    console.log(
      `[payments:mock] RELEASE ₱${amount.toFixed(2)} to seller=${sellerId} for order=${orderId}`
    );
    return { reference: `mock_release_${orderId}` };
  },
  async refundFunds({ orderId, amount, buyerId }) {
    console.log(
      `[payments:mock] REFUND ₱${amount.toFixed(2)} to buyer=${buyerId} for order=${orderId}`
    );
    return { reference: `mock_refund_${orderId}` };
  },
  async payHauler({ orderId, amount, haulerId }) {
    console.log(
      `[payments:mock] PAY HAULER ₱${amount.toFixed(2)} to hauler=${haulerId} for order=${orderId} (logistics fee payout)`
    );
    return { reference: `mock_hauler_payout_${orderId}` };
  },
};

// Active provider for the app — swap this single export in Phase 2.
export const paymentProvider: PaymentProvider = MockPaymentProvider;
