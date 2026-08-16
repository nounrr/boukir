import { canReceiveServiceAssignments } from './maalemAccess.js';

export const ASSIGNMENT_EVENTS = Object.freeze({
  ASSIGNED: 'MaalemAssigned',
  REASSIGNED: 'MaalemReassigned',
  UNASSIGNED: 'MaalemUnassigned',
});

export function evaluateMaalemCompatibility(request, maalemProfile) {
  if (!canReceiveServiceAssignments(maalemProfile)) {
    return { eligible: false, compatible: false, reason: 'MAALEM_NOT_APPROVED' };
  }
  if (maalemProfile.deleted_at || !Number(maalemProfile.contact_is_active) || Number(maalemProfile.contact_is_blocked)) {
    return { eligible: false, compatible: false, reason: 'MAALEM_UNAVAILABLE' };
  }
  const maalemCategoryId = Number(maalemProfile.category_id) || null;
  const qualifiedCategoryId = Number(request?.qualified_category_id) || null;
  if (qualifiedCategoryId) {
    return {
      eligible: true,
      compatible: maalemCategoryId === qualifiedCategoryId,
      reason: maalemCategoryId === qualifiedCategoryId ? null : 'QUALIFIED_CATEGORY_MISMATCH',
    };
  }
  const serviceId = Number(request?.qualified_service_id || request?.service_id) || null;
  if (!serviceId) return { eligible: true, compatible: false, reason: 'REQUEST_NOT_QUALIFIED' };
  const compatible = Boolean(Number(maalemProfile.service_compatible));
  return { eligible: true, compatible, reason: compatible ? null : 'SERVICE_CATEGORY_MISMATCH' };
}

export function validateAssignmentCommand({ request, maalemProfile, currentAssignment, reason, allowOverride, overrideReason, allowStartedReassignment = false }) {
  const errors = {};
  const isReassignment = Boolean(currentAssignment);
  const preStartStatuses = ['confirmed', 'assigned', 'scheduled', 'to_do'];
  const startedStatuses = ['en_route', 'arrived', 'work_in_progress'];
  if (!request || (!preStartStatuses.includes(request.status)
      && !(isReassignment && startedStatuses.includes(request.status) && allowStartedReassignment))) {
    errors.request = 'La demande doit être confirmée avant toute affectation';
  }
  if (request && request.status !== 'confirmed' && !currentAssignment) {
    errors.current_assignment = 'La référence d’affectation courante est incohérente';
  }
  if (request?.status === 'confirmed' && currentAssignment) {
    errors.current_assignment = 'Une affectation courante existe déjà pour cette demande';
  }
  if (isReassignment && Number(currentAssignment.maalem_profile_id) === Number(maalemProfile?.id)) {
    errors.maalem_profile_id = 'Ce Maalem est déjà affecté';
  }
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!normalizedReason) errors.reason = isReassignment
    ? 'Le motif de réaffectation est obligatoire'
    : 'Le motif d’affectation est obligatoire';

  const compatibility = evaluateMaalemCompatibility(request, maalemProfile);
  if (!compatibility.eligible) errors.maalem_profile_id = 'Ce Maalem ne peut pas recevoir de mission';
  if (compatibility.eligible && !compatibility.compatible) {
    if (!allowOverride) errors.compatibility = 'Le Maalem n’est pas compatible avec la qualification';
    if (allowOverride && !String(overrideReason || '').trim()) errors.override_reason = 'Le motif de dérogation est obligatoire';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    compatibility,
    reason: normalizedReason,
    overrideReason: String(overrideReason || '').trim() || null,
    isReassignment,
    startedReassignment: isReassignment && startedStatuses.includes(request?.status),
  };
}

export function validateUnassignmentCommand({ request, currentAssignment, reason }) {
  const errors = {};
  if (!request || request.status !== 'assigned') errors.request = 'La demande n’est pas affectée';
  if (!currentAssignment) errors.current_assignment = 'Aucune affectation courante à clôturer';
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!normalizedReason) errors.reason = 'Le motif de désaffectation est obligatoire';
  return { valid: Object.keys(errors).length === 0, errors, reason: normalizedReason };
}
