export const MAALEM_ACCESS_ERROR_TYPE = 'MAALEM_ACCESS_DENIED';

export const MAALEM_ACCESS_DENIAL_REASONS = Object.freeze({
  NO_PROFILE: 'NO_MAALEM_PROFILE',
  DRAFT: 'MAALEM_PROFILE_DRAFT',
  SUBMITTED: 'MAALEM_PROFILE_SUBMITTED',
  UNDER_REVIEW: 'MAALEM_PROFILE_UNDER_REVIEW',
  REJECTED: 'MAALEM_PROFILE_REJECTED',
  SUSPENDED: 'MAALEM_PROFILE_SUSPENDED',
  UNKNOWN: 'MAALEM_PROFILE_NOT_APPROVED',
});

const DENIAL_REASON_BY_STATUS = Object.freeze({
  draft: MAALEM_ACCESS_DENIAL_REASONS.DRAFT,
  submitted: MAALEM_ACCESS_DENIAL_REASONS.SUBMITTED,
  under_review: MAALEM_ACCESS_DENIAL_REASONS.UNDER_REVIEW,
  rejected: MAALEM_ACCESS_DENIAL_REASONS.REJECTED,
  suspended: MAALEM_ACCESS_DENIAL_REASONS.SUSPENDED,
});

export function isApprovedMaalem(profile) {
  return profile?.status === 'approved';
}

export function canAccessMaalemFeatures(profile) {
  return isApprovedMaalem(profile);
}

// KAN-8 centralizes this capability now; the assignment domain itself belongs
// to a future ticket and must call this policy instead of rechecking a status.
export function canReceiveServiceAssignments(profile) {
  return canAccessMaalemFeatures(profile);
}

export function buildMaalemAccessDecision(profile) {
  const status = typeof profile?.status === 'string' ? profile.status : null;
  const allowed = canAccessMaalemFeatures(profile);
  return {
    allowed,
    status,
    profile_id: profile?.id == null ? null : Number(profile.id),
    reason: allowed
      ? null
      : (status ? DENIAL_REASON_BY_STATUS[status] || MAALEM_ACCESS_DENIAL_REASONS.UNKNOWN : MAALEM_ACCESS_DENIAL_REASONS.NO_PROFILE),
    capabilities: {
      operational_features: allowed,
      service_assignments: canReceiveServiceAssignments(profile),
    },
  };
}

