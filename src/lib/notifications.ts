/**
 * STUB — Notifications service.
 *
 * This is the clearly-marked interface the business plan's "SMS/voice
 * hotline" and push-notification features hang off of. In this MVP every
 * call just logs to the console (and returns a resolved promise) so the
 * app runs with zero external credentials. Swap the body of `sendSms` for
 * a real Twilio call (see ROADMAP.md, Phase 2) without touching any
 * calling code — the interface is the contract.
 */

export interface NotificationPayload {
  to: string; // phone number or user id
  message: string;
}

export const notifications = {
  async sendSms({ to, message }: NotificationPayload): Promise<void> {
    // PLACEHOLDER: Twilio integration goes here.
    // Example (Phase 2):
    //   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    //   await client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER, body: message });
    console.log(`[notifications:sms:mock] to=${to} message="${message}"`);
  },

  async sendPush({ to, message }: NotificationPayload): Promise<void> {
    // PLACEHOLDER: web/mobile push provider goes here.
    console.log(`[notifications:push:mock] to=${to} message="${message}"`);
  },

  async notifyOrderStatusChange(params: {
    phone: string;
    orderId: string;
    status: string;
  }): Promise<void> {
    await this.sendSms({
      to: params.phone,
      message: `ANI-KONEKTA: your order ${params.orderId} is now ${params.status}.`,
    });
  },
};
