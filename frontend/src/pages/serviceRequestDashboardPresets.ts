import type { ServiceRequestFilters } from '../store/api/serviceRequestsApi';

export const serviceRequestDashboardKpiFilters = Object.freeze({
  new_requests: { status: 'new' },
  to_contact: { status: 'to_contact' },
  processing: { status: 'processing' },
  waiting_customer: { status: 'waiting_customer' },
  confirmed_without_maalem: { status: 'confirmed', assigned: false },
  assigned_without_schedule: { status: 'assigned', assigned: true, planned: false },
  scheduled_today: { quick_view: 'today' },
  in_progress: { quick_view: 'in_progress' },
  overdue: { quick_view: 'overdue' },
  completed_to_verify: { quick_view: 'to_close' },
  closed: { status: 'closed' },
  cancelled: { status: 'cancelled' },
}) satisfies Record<string, Partial<ServiceRequestFilters>>;

