// What a customer can say once the Maalem has finished: validate the work, or file a complaint,
// with an optional comment. Stored as a SHARED note on the request so the back-office sees it
// next to the other notes, and the customer sees it in their request.

export const CLIENT_FEEDBACK_KINDS = Object.freeze(['validated', 'complaint']);
export const CLIENT_FEEDBACK_MAX = 2000;
/** The work is open to the customer's verdict once the Maalem marked it finished (and until the request is closed). */
export const CLIENT_FEEDBACK_STATUSES = Object.freeze(['completed', 'closed']);

export const CLIENT_FEEDBACK_PREFIX = Object.freeze({
  validated: 'Travaux validés par le client',
  complaint: 'RÉCLAMATION CLIENT',
});

export function validateClientFeedback(input) {
  const source = input && typeof input === 'object' ? input : {};
  const kind = String(source.kind || '');
  const comment = typeof source.comment === 'string' ? source.comment.trim() : '';
  const errors = {};
  if (!CLIENT_FEEDBACK_KINDS.includes(kind)) errors.kind = 'Choisissez « valider » ou « réclamation »';
  if (comment.length > CLIENT_FEEDBACK_MAX) errors.comment = `${CLIENT_FEEDBACK_MAX} caractères au maximum`;
  if (kind === 'complaint' && !comment) errors.comment = 'Décrivez le problème';
  return { valid: Object.keys(errors).length === 0, errors, value: { kind, comment: comment || null } };
}

export function clientFeedbackNote({ kind, comment }) {
  const prefix = CLIENT_FEEDBACK_PREFIX[kind];
  return comment ? `${prefix} : ${comment}` : prefix;
}

/** The customer's last verdict on this request, read back from its shared notes (null when none yet). */
export function lastClientFeedback(notes) {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const note = notes[i];
    if (note.actor_type !== 'CONTACT') continue;
    for (const kind of CLIENT_FEEDBACK_KINDS) {
      if (String(note.body || '').startsWith(CLIENT_FEEDBACK_PREFIX[kind])) return { kind, at: note.created_at };
    }
  }
  return null;
}
