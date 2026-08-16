export const INTERVENTION_STATUSES = Object.freeze([
  'assigned', 'scheduled', 'to_do', 'en_route', 'arrived',
  'work_in_progress', 'completed', 'closed',
]);

export const TEAM_INTERVENTION_TRANSITIONS = Object.freeze({
  scheduled: Object.freeze(['to_do']),
  completed: Object.freeze(['closed']),
});

export const MAALEM_INTERVENTION_TRANSITIONS = Object.freeze({
  to_do: Object.freeze(['en_route']),
  en_route: Object.freeze(['arrived']),
  arrived: Object.freeze(['work_in_progress']),
  work_in_progress: Object.freeze(['completed']),
});

export function canTransitionIntervention(actorType, from, to) {
  const transitions = actorType === 'EMPLOYEE' ? TEAM_INTERVENTION_TRANSITIONS : MAALEM_INTERVENTION_TRANSITIONS;
  return Boolean(transitions[from]?.includes(to));
}

export function validateProgress(value) {
  const progress = Number(value);
  return Number.isInteger(progress) && progress >= 0 && progress <= 100
    ? { valid: true, value: progress }
    : { valid: false, error: 'Le pourcentage doit être un entier entre 0 et 100' };
}

function text(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function validateCompletionReport(input) {
  const source = input && typeof input === 'object' ? input : {};
  const errors = {};
  const workSummary = text(source.work_summary, 10000);
  const observations = source.maalem_observations == null || source.maalem_observations === ''
    ? null : text(source.maalem_observations, 10000);
  const incompleteReason = source.incomplete_reason == null || source.incomplete_reason === ''
    ? null : text(source.incomplete_reason, 10000);
  const progress = validateProgress(source.progress_percent);
  if (!workSummary) errors.work_summary = 'Le résumé du travail est obligatoire';
  if (!progress.valid) errors.progress_percent = progress.error;
  if (typeof source.work_finished !== 'boolean') errors.work_finished = 'Indiquez si le travail est terminé';
  if (typeof source.additional_intervention_required !== 'boolean') errors.additional_intervention_required = 'Indiquez si une intervention supplémentaire est nécessaire';
  if (source.work_finished === false && !incompleteReason) errors.incomplete_reason = 'Un motif est obligatoire si le travail n’est pas terminé';
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      work_summary: workSummary,
      maalem_observations: observations,
      progress_percent: progress.valid ? progress.value : null,
      work_finished: source.work_finished,
      additional_intervention_required: source.additional_intervention_required,
      incomplete_reason: incompleteReason,
    },
  };
}

export function validateSchedule(input) {
  const source = input && typeof input === 'object' ? input : {};
  const errors = {};
  const plannedDate = typeof source.planned_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.planned_date) ? source.planned_date : null;
  const plannedTimeSlot = text(source.planned_time_slot, 100);
  const address = text(source.mission_address, 500);
  const city = text(source.mission_city, 100);
  const contactName = text(source.mission_contact_name, 255);
  const contactPhone = text(source.mission_contact_phone, 50);
  const sharedInstructions = source.shared_instructions == null || source.shared_instructions === '' ? null : text(source.shared_instructions, 10000);
  const specialInformation = source.special_information == null || source.special_information === '' ? null : text(source.special_information, 10000);
  const serviceId = Number(source.planned_service_id) || null;
  const categoryId = Number(source.planned_category_id) || null;
  const latitude = source.latitude == null || source.latitude === '' ? null : Number(source.latitude);
  const longitude = source.longitude == null || source.longitude === '' ? null : Number(source.longitude);
  if (!plannedDate) errors.planned_date = 'La date planifiée est obligatoire';
  if (!plannedTimeSlot) errors.planned_time_slot = 'Le créneau est obligatoire';
  if (!address) errors.mission_address = 'L’adresse est obligatoire';
  if (!city) errors.mission_city = 'La ville est obligatoire';
  if (!contactName) errors.mission_contact_name = 'Le contact utile est obligatoire';
  if (!contactPhone) errors.mission_contact_phone = 'Le téléphone utile est obligatoire';
  if (!serviceId && !categoryId) errors.qualification = 'Un Service ou une catégorie est obligatoire';
  if ((latitude == null) !== (longitude == null)
    || (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    errors.coordinates = 'Les coordonnées sont invalides';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { planned_date: plannedDate, planned_time_slot: plannedTimeSlot, mission_address: address,
      mission_city: city, latitude, longitude, planned_service_id: serviceId, planned_category_id: categoryId,
      mission_contact_name: contactName, mission_contact_phone: contactPhone,
      shared_instructions: sharedInstructions, special_information: specialInformation },
  };
}
