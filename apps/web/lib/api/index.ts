import { apiFetch } from './client';
import type {
  AnalyticsQueryDto,
  AnalyticsSummaryDto,
  ChangePasswordDto,
  ConfirmAccountDeletionDto,
  CreateExerciseDto,
  CreateFolderDto,
  CreateStretchingRoutineDto,
  CreateTemplateDto,
  ExerciseDto,
  ExerciseQueryDto,
  ForgotPasswordDto,
  ImportCommitRequestDto,
  ImportCommitResultDto,
  ImportPreviewRequestDto,
  ImportPreviewResultDto,
  LoginDto,
  RegisterDto,
  RegisterResponseDto,
  RequestAccountDeletionDto,
  ResendConfirmationDto,
  ResetPasswordDto,
  StartSessionDto,
  StretchingRoutineDto,
  SyncSessionPayloadDto,
  SyncSessionResponseDto,
  UpdateExerciseDto,
  UpdateFolderDto,
  UpdatePreferencesDto,
  UpdateStretchingRoutineDto,
  UpdateTemplateDto,
  UserDto,
  VerifyEmailDto,
  WorkoutFolderDto,
  WorkoutSessionDto,
  WorkoutTemplateDto,
} from '@luki-fitti/common/schemas';

export const auth = {
  register: (data: RegisterDto) =>
    apiFetch<RegisterResponseDto>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  verifyEmail: (data: VerifyEmailDto) =>
    apiFetch<UserDto>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  resendConfirmation: (data: ResendConfirmationDto) =>
    apiFetch<{ success: boolean; message: string }>('/auth/resend-confirmation', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  forgotPassword: (data: ForgotPasswordDto) =>
    apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  resetPassword: (data: ResetPasswordDto) =>
    apiFetch<{ success: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  login: (data: LoginDto) =>
    apiFetch<UserDto>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  me: () => apiFetch<UserDto>('/auth/me'),
  updatePreferences: (data: UpdatePreferencesDto) =>
    apiFetch<UserDto>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  changePassword: (data: ChangePasswordDto) =>
    apiFetch<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  requestAccountDeletion: (data: RequestAccountDeletionDto) =>
    apiFetch<{ success: boolean; message: string }>('/auth/request-delete-account', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  confirmAccountDeletion: (data: ConfirmAccountDeletionDto) =>
    apiFetch<{ success: boolean; message: string }>('/auth/confirm-delete-account', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: false,
    }),
  logout: () =>
    apiFetch<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),
  refreshToken: () =>
    apiFetch<{ success: boolean }>('/auth/refresh-token', {
      method: 'POST',
      retry: false,
    }),
};

export const exercises = {
  list: (query?: ExerciseQueryDto) => {
    const params = new URLSearchParams();
    if (query?.search) params.set('search', query.search);
    if (query?.muscleGroup) params.set('muscleGroup', query.muscleGroup);
    if (query?.exerciseType) params.set('exerciseType', query.exerciseType);
    if (query?.equipment) params.set('equipment', query.equipment);
    const qs = params.toString();
    return apiFetch<ExerciseDto[]>(`/exercises${qs ? `?${qs}` : ''}`);
  },
  getById: (id: string) => apiFetch<ExerciseDto>(`/exercises/${id}`),
  create: (data: CreateExerciseDto) =>
    apiFetch<ExerciseDto>('/exercises', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateExerciseDto) =>
    apiFetch<ExerciseDto>(`/exercises/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/exercises/${id}`, {
      method: 'DELETE',
    }),
};

export const workouts = {
  getOverview: () =>
    apiFetch<{ folders: WorkoutFolderDto[]; unfiledTemplates: WorkoutTemplateDto[] }>('/workouts'),
  createFolder: (data: CreateFolderDto) =>
    apiFetch<WorkoutFolderDto>('/workouts/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateFolder: (id: string, data: UpdateFolderDto) =>
    apiFetch<WorkoutFolderDto>(`/workouts/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFolder: (id: string) =>
    apiFetch<{ success: boolean }>(`/workouts/folders/${id}`, {
      method: 'DELETE',
    }),
  getTemplate: (id: string) => apiFetch<WorkoutTemplateDto>(`/workouts/templates/${id}`),
  createTemplate: (data: CreateTemplateDto) =>
    apiFetch<WorkoutTemplateDto>('/workouts/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTemplate: (id: string, data: UpdateTemplateDto) =>
    apiFetch<WorkoutTemplateDto>(`/workouts/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  duplicateTemplate: (id: string) =>
    apiFetch<WorkoutTemplateDto>(`/workouts/templates/${id}/duplicate`, {
      method: 'POST',
    }),
  moveTemplate: (id: string, folderId: string | null) =>
    apiFetch<WorkoutTemplateDto>(`/workouts/templates/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    }),
  deleteTemplate: (id: string) =>
    apiFetch<{ success: boolean }>(`/workouts/templates/${id}`, {
      method: 'DELETE',
    }),
};

export const stretching = {
  listRoutines: () => apiFetch<StretchingRoutineDto[]>('/stretching/routines'),
  createRoutine: (data: CreateStretchingRoutineDto) =>
    apiFetch<StretchingRoutineDto>('/stretching/routines', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRoutine: (id: string, data: UpdateStretchingRoutineDto) =>
    apiFetch<StretchingRoutineDto>(`/stretching/routines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteRoutine: (id: string) =>
    apiFetch<{ success: boolean }>(`/stretching/routines/${id}`, {
      method: 'DELETE',
    }),
};

export const sessions = {
  getActive: () => apiFetch<WorkoutSessionDto | null>('/sessions/active'),
  list: (params?: { from?: string; to?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.status) qs.set('status', params.status);
    const queryStr = qs.toString();
    return apiFetch<WorkoutSessionDto[]>(`/sessions${queryStr ? `?${queryStr}` : ''}`);
  },
  getById: (id: string) => apiFetch<WorkoutSessionDto>(`/sessions/${id}`),
  start: (data: StartSessionDto) =>
    apiFetch<WorkoutSessionDto>('/sessions/start', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sync: (data: SyncSessionPayloadDto) =>
    apiFetch<SyncSessionResponseDto>('/sessions/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: SyncSessionPayloadDto) =>
    apiFetch<SyncSessionResponseDto>(`/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/sessions/${id}`, {
      method: 'DELETE',
    }),
};

export const analytics = {
  getSummary: (query?: AnalyticsQueryDto) => {
    const qs = new URLSearchParams();
    if (query?.period) qs.set('period', query.period);
    if (query?.from) qs.set('from', query.from);
    if (query?.to) qs.set('to', query.to);
    if (query?.exerciseId) qs.set('exerciseId', query.exerciseId);
    if (query?.templateId) qs.set('templateId', query.templateId);
    if (query?.muscleGroup) qs.set('muscleGroup', query.muscleGroup);
    const queryStr = qs.toString();
    return apiFetch<AnalyticsSummaryDto>(`/analytics/summary${queryStr ? `?${queryStr}` : ''}`);
  },
};

export const imports = {
  preview: (data: ImportPreviewRequestDto) =>
    apiFetch<ImportPreviewResultDto>('/import/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  commit: (data: ImportCommitRequestDto) =>
    apiFetch<ImportCommitResultDto>('/import/commit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listJobs: () => apiFetch<Record<string, unknown>[]>('/import/jobs'),
};

export * from './client';

export const api = {
  auth,
  exercises,
  workouts,
  stretching,
  sessions,
  analytics,
  imports,
};
