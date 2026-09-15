// FEATURE 2 — Cold-Chain Classification. Listing.cropType is a free-typed
// string (no crop enum/reference table exists), so classification is a
// regex heuristic — the same style already used by the buyer dashboard's
// CATEGORIES matcher (src/app/buyer/dashboard/page.tsx) — rather than a
// lookup table join.
export type ColdChainGuess = {
  requiresColdChain: boolean;
  // false only when the crop type matched neither list confidently — the
  // backfill script uses this to set Listing.coldChainNeedsReview instead
  // of silently guessing on live data.
  confident: boolean;
};

const CHILLED_PATTERN =
  /onion|sibuyas|tomato|kamatis|cabbage|repolyo|pepper|eggplant|talong|carrot|lettuce|spinach|kangkong|pechay|malunggay|mang(o|ga)|banana|saging|calamansi|papaya|watermelon|pakwan|strawberry|dairy|milk|gatas|fish|isda|meat|karne|chicken|manok|pork|baboy|beef|egg|itlog/i;

const AMBIENT_PATTERN =
  /rice|palay|grain|corn|mais|potato|sweet potato|cassava|ube|gabi|camote|garlic|bawang|ginger|luya|dried|dry|coffee|kape|cacao|nuts|mani|coconut|niyog/i;

export function guessRequiresColdChain(cropType: string): ColdChainGuess {
  if (CHILLED_PATTERN.test(cropType)) return { requiresColdChain: true, confident: true };
  if (AMBIENT_PATTERN.test(cropType)) return { requiresColdChain: false, confident: true };
  // Unrecognized crop type — default to ambient (the less disruptive
  // default: an ambient-flagged perishable would show up quickly via a
  // spoiled-delivery dispute, whereas a false cold-chain requirement could
  // strand a listing with no eligible hauler) but mark it unconfident.
  return { requiresColdChain: false, confident: false };
}
