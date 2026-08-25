import { Router } from 'express';

import pool from '../db/pool.js';
import { isEcommerceRequester } from '../utils/serviceRequest.js';
import {
  reviewInvitationEligibility,
  verifyReviewInvitationToken,
} from '../utils/reviewInvitation.js';

const router = Router();

router.use((req, res, next) => {
  if (!isEcommerceRequester(req.user)) {
    return res.status(403).json({
      message: 'Compte e-commerce authentifié requis',
      error_type: 'ECOMMERCE_ACCOUNT_REQUIRED',
    });
  }
  return next();
});

router.get('/:token', async (req, res, next) => {
  try {
    const verification = verifyReviewInvitationToken(req.params.token);
    if (verification.reason === 'INVALID_TOKEN') {
      return res.status(404).json({ message: 'Invitation introuvable', error_type: 'INVITATION_NOT_FOUND' });
    }
    const [rows] = await pool.query(
      `SELECT mri.id AS invitation_id, mri.status AS invitation_status, mri.expires_at,
              sr.id AS service_request_id, sr.request_number, sr.request_source,
              sr.requester_contact_id, sr.status AS request_status, sr.cancelled_at,
              sr.deleted_at AS request_deleted_at,
              si.id AS intervention_id, si.status AS intervention_status, si.closed_at,
              si.closed_by_employee_id, si.completed_at, si.completed_by_contact_id,
              si.executing_assignment_id, sra.maalem_profile_id,
              mp.contact_id AS maalem_contact_id, maalem.nom_complet AS maalem_public_name,
              COALESCE(mr.id, mri.review_id) AS review_id,
              COALESCE(mr.submitted_at, mri.submitted_at) AS review_submitted_at
       FROM maalem_review_invitations mri
       INNER JOIN service_requests sr ON sr.id = mri.service_request_id
       INNER JOIN service_interventions si ON si.id = mri.intervention_id AND si.service_request_id = sr.id
       LEFT JOIN service_request_assignments sra
         ON sra.id = si.executing_assignment_id AND sra.service_request_id = sr.id
       LEFT JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
       LEFT JOIN contacts maalem ON maalem.id = mp.contact_id
       LEFT JOIN maalem_reviews mr ON mr.service_request_id = sr.id AND mr.deleted_at IS NULL
       WHERE mri.public_key = ? AND mri.customer_contact_id = ? AND sr.requester_contact_id = ?
       LIMIT 1`,
      [verification.publicKey, Number(req.user.id), Number(req.user.id)]
    );
    const invitation = rows[0];
    if (!invitation) {
      return res.status(404).json({ message: 'Invitation introuvable', error_type: 'INVITATION_NOT_FOUND' });
    }
    res.set('Cache-Control', 'private, no-store');

    const now = new Date();
    if (!verification.valid || new Date(invitation.expires_at).getTime() <= now.getTime()
      || invitation.invitation_status === 'expired') {
      await pool.query(
        `UPDATE maalem_review_invitations
         SET status = 'expired', next_attempt_at = NULL, next_reminder_at = NULL
         WHERE id = ? AND status <> 'review_received'`,
        [invitation.invitation_id]
      );
      return res.status(410).json({ message: 'Cette invitation a expiré', error_type: 'INVITATION_EXPIRED' });
    }

    if (invitation.review_id || invitation.invitation_status === 'review_received') {
      await pool.query(
        `UPDATE maalem_review_invitations
         SET status = 'review_received', review_id = COALESCE(review_id, ?),
             submitted_at = COALESCE(submitted_at, ?), next_attempt_at = NULL, next_reminder_at = NULL
         WHERE id = ?`,
        [invitation.review_id || null, invitation.review_submitted_at || now, invitation.invitation_id]
      );
      return res.json({
        already_reviewed: true,
        request: { id: Number(invitation.service_request_id), request_number: invitation.request_number },
      });
    }

    const eligibility = reviewInvitationEligibility(invitation);
    if (!eligibility.eligible) {
      await pool.query(
        `UPDATE maalem_review_invitations
         SET status = 'suspended', next_attempt_at = NULL, last_error = ? WHERE id = ?`,
        [eligibility.reason, invitation.invitation_id]
      );
      return res.status(409).json({
        message: 'Cette intervention ne peut pas être évaluée actuellement',
        error_type: 'INVITATION_SUSPENDED',
      });
    }

    await pool.query(
      `UPDATE maalem_review_invitations SET opened_at = COALESCE(opened_at, ?) WHERE id = ?`,
      [now, invitation.invitation_id]
    );
    return res.json({
      already_reviewed: false,
      request: { id: Number(invitation.service_request_id), request_number: invitation.request_number },
      maalem: { id: Number(invitation.maalem_profile_id), public_name: invitation.maalem_public_name },
      expires_at: invitation.expires_at,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
