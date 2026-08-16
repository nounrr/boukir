import { apiSlice } from './apiSlice';

export type ServiceRequestStatus = 'new' | 'to_contact' | 'processing' | 'waiting_customer' | 'confirmed' | 'assigned' | 'scheduled' | 'to_do' | 'en_route' | 'arrived' | 'work_in_progress' | 'completed' | 'closed' | 'cancelled';
export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface BackofficeServiceRequest {
  id: number;
  request_number: string;
  requester_contact_id: number;
  request_source: 'selected_maalem' | 'selected_service' | 'quick_request';
  service_id: number | null;
  qualified_service_id: number | null;
  requested_maalem_profile_id: number | null;
  qualified_category_id: number | null;
  title: string | null;
  problem_description: string | null;
  qualified_description: string | null;
  requester_name: string | null;
  requester_phone: string | null;
  requester_email: string | null;
  city: string | null;
  intervention_address: string | null;
  latitude: number | null;
  longitude: number | null;
  desired_date: string | null;
  desired_time_slot: string | null;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  handled_by_employee_id: number | null;
  handled_by_name: string | null;
  initial_service_name: string | null;
  qualified_service_name: string | null;
  qualified_category_name: string | null;
  requested_maalem_name: string | null;
  contact_account_name: string | null;
  contact_account_phone: string | null;
  contact_account_email: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_public_reason: string | null;
  current_assignment_id: number | null;
  current_assigned_maalem_profile_id: number | null;
  current_assigned_maalem_name: string | null;
  planned_date: string | null;
  planned_time_slot: string | null;
  intervention_status: ServiceRequestStatus | null;
  administrative_status: ServiceRequestStatus;
  operational_status: ServiceRequestStatus | null;
  is_overdue: boolean;
  assignment_eligible: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestFilters {
  page?: number;
  limit?: number;
  q?: string;
  client?: string;
  phone?: string;
  request_number?: string;
  status?: string;
  source?: string;
  priority?: string;
  service_id?: number;
  category_id?: number;
  city?: string;
  created_from?: string;
  created_to?: string;
  planned_date?: string;
  planned_from?: string;
  planned_to?: string;
  assigned_maalem_id?: number;
  overdue?: boolean;
  assigned?: boolean;
  planned?: boolean;
  quick_view?: 'to_process' | 'today' | 'overdue' | 'in_progress' | 'to_close' | 'finished';
  date_from?: string;
  date_to?: string;
  requested_maalem_id?: number;
  handled_by_employee_id?: number;
  untreated?: boolean;
  waiting_customer?: boolean;
}

export interface ServiceRequestDashboardResponse {
  generated_at: string;
  initial_response_sla_minutes: number;
  metrics: {
    new_requests: number;
    to_contact: number;
    processing: number;
    waiting_customer: number;
    confirmed_without_maalem: number;
    assigned_without_schedule: number;
    scheduled_today: number;
    in_progress: number;
    overdue: number;
    completed_to_verify: number;
    closed: number;
    cancelled: number;
  };
}

export interface ServiceRequestListResponse {
  requests: BackofficeServiceRequest[];
  page: number;
  limit: number;
  total: number;
}

interface Option { id: number; nom?: string; name?: string }
export interface ServiceRequestFilterOptions {
  services: Option[];
  categories: Option[];
  maalems: Option[];
  employees: Option[];
  cities: string[];
}

export interface ServiceRequestDetailResponse {
  request: BackofficeServiceRequest;
  attachments: Array<{ id: number; kind: 'PHOTO' | 'DOCUMENT'; original_name: string; mime_type: string; file_size: number; created_at: string }>;
  notes: Array<{ id: number; visibility: 'INTERNAL' | 'SHARED'; body: string; actor_name: string; created_at: string }>;
  contacts: Array<{ id: number; channel: 'WHATSAPP' | 'PHONE' | 'OTHER'; contacted_at: string; result: string; internal_observation: string | null; employee_name: string }>;
  history: Array<{ id: number; event_type: string; old_status: string | null; new_status: string | null; old_value: unknown; new_value: unknown; metadata: unknown; actor_name: string; created_at: string }>;
  assignments: Array<{
    id: number;
    maalem_profile_id: number;
    maalem_name: string;
    category_name: string | null;
    assigned_by_name: string;
    unassigned_by_name: string | null;
    assigned_at: string;
    assignment_reason: string;
    compatibility_override: boolean;
    compatibility_override_reason: string | null;
    unassigned_at: string | null;
    unassignment_reason: string | null;
    is_current: boolean;
  }>;
  notifications: OperationalNotification[];
}

export interface OperationalNotification {
  id: number;
  service_request_id: number;
  intervention_id: number | null;
  notification_type: string;
  source_event: string;
  recipient_type: 'CONTACT' | 'EMPLOYEE' | 'BACKOFFICE_TEAM';
  recipient_contact_id: number | null;
  recipient_address: string;
  recipient_name?: string | null;
  channel: 'IN_APP' | 'WHATSAPP';
  locale: 'fr' | 'ar';
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  title: string;
  body: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  read_at: string | null;
}

export interface AssignmentCandidate {
  id: number;
  category_id: number;
  name: string;
  telephone: string | null;
  category_name: string;
  city: string | null;
  intervention_areas: string[] | string | null;
  declared_availability: string | null;
  compatible: boolean;
  active_missions: number;
}

export interface ServiceIntervention {
  id: number;
  service_request_id: number;
  status: ServiceRequestStatus;
  planned_date: string | null;
  planned_time_slot: string | null;
  mission_address: string | null;
  mission_city: string | null;
  latitude: number | null;
  longitude: number | null;
  planned_service_id: number | null;
  planned_category_id: number | null;
  mission_contact_name: string | null;
  mission_contact_phone: string | null;
  shared_instructions: string | null;
  special_information: string | null;
  progress_percent: number;
  work_summary: string | null;
  maalem_observations: string | null;
  work_finished: boolean | number | null;
  additional_intervention_required: boolean | number | null;
  incomplete_reason: string | null;
  scheduled_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  closure_internal_note: string | null;
  current_maalem_name: string;
}

export interface AdminInterventionResponse {
  intervention: ServiceIntervention | null;
  history?: Array<{ id: number; event_type: string; old_status: string | null; new_status: string | null; actor_name: string; created_at: string }>;
  photos?: Array<{ id: number; phase: 'BEFORE' | 'DURING' | 'AFTER'; original_name: string; mime_type: string; file_size: number; created_at: string }>;
}

export const serviceRequestsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBackofficeServiceRequests: builder.query<ServiceRequestListResponse, ServiceRequestFilters>({
      query: (params) => ({ url: '/admin/service-requests', params }),
    }),
    getServiceRequestDashboard: builder.query<ServiceRequestDashboardResponse, void>({
      query: () => '/admin/service-requests/dashboard',
    }),
    getServiceRequestFilters: builder.query<ServiceRequestFilterOptions, void>({
      query: () => '/admin/service-requests/filters',
    }),
    getBackofficeServiceRequest: builder.query<ServiceRequestDetailResponse, number>({
      query: (id) => `/admin/service-requests/${id}`,
    }),
    updateServiceRequestQualification: builder.mutation<void, { id: number; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/admin/service-requests/${id}/qualification`, method: 'PATCH', body }),
    }),
    addServiceRequestNote: builder.mutation<void, { id: number; visibility: 'INTERNAL' | 'SHARED'; body: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/service-requests/${id}/notes`, method: 'POST', body }),
    }),
    addServiceRequestContact: builder.mutation<void, { id: number; channel: string; contacted_at: string; result: string; internal_observation?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/service-requests/${id}/contacts`, method: 'POST', body }),
    }),
    transitionServiceRequest: builder.mutation<{ status: ServiceRequestStatus; assignment_eligible: boolean }, { id: number; status: ServiceRequestStatus; reason?: string; public_reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/service-requests/${id}/transition`, method: 'POST', body }),
    }),
    addServiceRequestAttachments: builder.mutation<void, { id: number; files: File[] }>({
      query: ({ id, files }) => {
        const body = new FormData();
        files.forEach((file) => body.append('attachments', file));
        return { url: `/admin/service-requests/${id}/attachments`, method: 'POST', body };
      },
    }),
    getAssignmentCandidates: builder.query<{ candidates: AssignmentCandidate[]; availability_notice: string }, { id: number; q?: string; city?: string; category_id?: number; compatible_only?: boolean }>({
      query: ({ id, ...params }) => ({ url: `/admin/service-requests/${id}/assignment-candidates`, params }),
    }),
    assignServiceRequestMaalem: builder.mutation<{
      assignment_id: number;
      status: ServiceRequestStatus;
      event: 'MaalemAssigned' | 'MaalemReassigned';
    }, {
      id: number;
      maalem_profile_id: number;
      expected_current_assignment_id: number | null;
      reason: string;
      compatibility_override?: boolean;
      compatibility_override_reason?: string;
      started_reassignment?: boolean;
    }>({
      query: ({ id, ...body }) => ({ url: `/admin/service-requests/${id}/assign`, method: 'POST', body }),
    }),
    unassignServiceRequestMaalem: builder.mutation<{ status: 'confirmed'; event: 'MaalemUnassigned' }, { id: number; expected_current_assignment_id: number; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/service-requests/${id}/unassign`, method: 'POST', body }),
    }),
    getAdminServiceIntervention: builder.query<AdminInterventionResponse, number>({
      query: (requestId) => `/admin/service-interventions/by-request/${requestId}`,
    }),
    scheduleServiceIntervention: builder.mutation<{ intervention_id: number; status: 'scheduled' }, { requestId: number; body: Record<string, unknown> }>({
      query: ({ requestId, body }) => ({ url: `/admin/service-interventions/by-request/${requestId}/schedule`, method: 'PUT', body }),
    }),
    transitionAdminServiceIntervention: builder.mutation<{ intervention_id: number; status: ServiceRequestStatus }, { id: number; status: 'to_do' | 'closed'; closure_internal_note?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/service-interventions/${id}/transition`, method: 'POST', body }),
    }),
    retryServiceRequestNotification: builder.mutation<void, { requestId: number; notificationId: number }>({
      query: ({ requestId, notificationId }) => ({
        url: `/admin/service-requests/${requestId}/notifications/${notificationId}/retry`, method: 'POST',
      }),
    }),
  }),
});

export const {
  useGetBackofficeServiceRequestsQuery,
  useGetServiceRequestDashboardQuery,
  useGetServiceRequestFiltersQuery,
  useGetBackofficeServiceRequestQuery,
  useUpdateServiceRequestQualificationMutation,
  useAddServiceRequestNoteMutation,
  useAddServiceRequestContactMutation,
  useTransitionServiceRequestMutation,
  useAddServiceRequestAttachmentsMutation,
  useGetAssignmentCandidatesQuery,
  useAssignServiceRequestMaalemMutation,
  useUnassignServiceRequestMaalemMutation,
  useGetAdminServiceInterventionQuery,
  useScheduleServiceInterventionMutation,
  useTransitionAdminServiceInterventionMutation,
  useRetryServiceRequestNotificationMutation,
} = serviceRequestsApi;
