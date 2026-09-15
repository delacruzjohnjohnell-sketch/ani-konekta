export type PublicVerificationBadge = "KYC_VERIFIED" | "PENDING" | "NOT_VERIFIED";

/**
 * Collapses the seller's real (uncollapsed) idVerificationStatus/kycStatus
 * into exactly the 3 buyer-facing states the spec calls for. REJECTED on
 * either field collapses to NOT_VERIFIED for buyers — the seller's own
 * dashboard (VerificationStatusCard) and admin still see the real REJECTED
 * status.
 */
export function getPublicVerificationBadge(user: {
  kycStatus: string;
  idVerificationStatus: string;
}): PublicVerificationBadge {
  if (user.kycStatus === "KYC_VERIFIED") return "KYC_VERIFIED";
  if (
    user.kycStatus === "VISIT_SCHEDULED" ||
    user.kycStatus === "UNDER_REVIEW" ||
    user.idVerificationStatus === "PENDING"
  ) {
    return "PENDING";
  }
  return "NOT_VERIFIED";
}
