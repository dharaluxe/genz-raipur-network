export type TrustScoreInput = {
  profileVerified: boolean;
  completedDeals: number;
  successfulCollaborations: number;
  verifiedVisits: number;
  collaborationRequests: number;
  collaborationResponses: number;
  verifiedReviewAverage?: number | null;
  verifiedReviewCount?: number;
  unresolvedDisputes?: number;
  upheldDisputesAgainst?: number;
  duplicateClaimViolations?: number;
};

export type TrustScoreResult = {
  score: number;
  confidence: 'new' | 'developing' | 'established';
  components: {
    verification: number;
    deals: number;
    collaboration: number;
    visits: number;
    responsiveness: number;
    feedback: number;
    integrity: number;
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

const scaled = (value: number, target: number, points: number) =>
  target <= 0 ? 0 : (clamp(value, 0, target) / target) * points;

/**
 * GENZ Trust Score is deliberately mostly objective. Public star ratings remain
 * a separate user-feedback signal; verified feedback contributes only 10/100.
 *
 * The formula is deterministic and should only consume verified platform events.
 * Admins may correct the underlying event/dispute record, but should not manually
 * type a broker's Trust Score.
 */
export function calculateTrustScore(input: TrustScoreInput): TrustScoreResult {
  const verification = input.profileVerified ? 10 : 0;
  const deals = scaled(input.completedDeals, 10, 25);
  const collaboration = scaled(input.successfulCollaborations, 10, 20);
  const visits = scaled(input.verifiedVisits, 20, 10);

  const requests = Math.max(0, Math.floor(input.collaborationRequests || 0));
  const responses = clamp(Math.floor(input.collaborationResponses || 0), 0, requests || 0);
  const responseRate = requests > 0 ? responses / requests : 0;
  const responsiveness = requests > 0 ? responseRate * 10 : 0;

  const reviewAverage = clamp(input.verifiedReviewAverage ?? 0, 0, 5);
  const reviewCount = Math.max(0, Math.floor(input.verifiedReviewCount || 0));
  // Bayesian shrinkage toward a neutral 4/5 until enough verified reviews exist.
  const priorWeight = 5;
  const weightedRating = reviewCount > 0
    ? ((reviewAverage * reviewCount) + (4 * priorWeight)) / (reviewCount + priorWeight)
    : 0;
  const feedback = reviewCount > 0 ? (weightedRating / 5) * 10 : 0;

  const unresolved = Math.max(0, Math.floor(input.unresolvedDisputes || 0));
  const upheld = Math.max(0, Math.floor(input.upheldDisputesAgainst || 0));
  const duplicateViolations = Math.max(0, Math.floor(input.duplicateClaimViolations || 0));
  const integrityPenalty = Math.min(15, unresolved * 2 + upheld * 5 + duplicateViolations * 5);
  const integrity = 15 - integrityPenalty;

  const raw = verification + deals + collaboration + visits + responsiveness + feedback + integrity;
  const score = Math.round(clamp(raw, 0, 100));

  const verifiedActivity = Math.max(0, input.completedDeals || 0)
    + Math.max(0, input.successfulCollaborations || 0)
    + Math.max(0, input.verifiedVisits || 0);
  const confidence = verifiedActivity >= 20 || input.completedDeals >= 5
    ? 'established'
    : verifiedActivity >= 5 || input.completedDeals >= 1
      ? 'developing'
      : 'new';

  return {
    score,
    confidence,
    components: {
      verification: Math.round(verification),
      deals: Math.round(deals),
      collaboration: Math.round(collaboration),
      visits: Math.round(visits),
      responsiveness: Math.round(responsiveness),
      feedback: Math.round(feedback),
      integrity: Math.round(integrity),
    },
  };
}
