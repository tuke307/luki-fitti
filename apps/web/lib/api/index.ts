import { apiFetch } from './client';
import type {
  AdminDashboardDto,
  AdminUserAiUsageDto,
  AdminUserListDto,
  AdminUserQueryDto,
  AiSettingsDto,
  AiUsageSummaryDto,
  BodyWeightEntryDto,
  BodyWeightRangeQueryDto,
  HealthActivityDto,
  HealthActivityRangeQueryDto,
  ExerciseFeedbackDto,
  MealAnalysisResponseDto,
  MealTextAnalysisRequestDto,
  MealTextAnalysisResponseDto,
  MyAiUsageDto,
  MealEntryDto,
  MealItemDto,
  NutritionSummaryDto,
  NutritionSummaryQueryDto,
  UpdateAiSettingsDto,
  UpdateUserAccessDto,
  UpsertBodyWeightEntryDto,
  UpsertExerciseFeedbackDto,
  UpsertMealEntryDto,
  WorkoutBuilderRequestDto,
  WorkoutBuilderResponseDto,
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

export const nutrition = {
  listEntries: (from: string, to: string) =>
    apiFetch<MealEntryDto[]>(`/nutrition/entries?${new URLSearchParams({ from, to }).toString()}`),
  upsertEntry: (data: UpsertMealEntryDto) =>
    apiFetch<MealEntryDto>('/nutrition/entries', { method: 'PUT', body: JSON.stringify(data) }),
  deleteEntry: (id: string) =>
    apiFetch<{ success: boolean }>(`/nutrition/entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getSummary: (query: NutritionSummaryQueryDto) =>
    apiFetch<NutritionSummaryDto>(
      `/nutrition/summary?${new URLSearchParams({ from: query.from, to: query.to, tz: query.tz }).toString()}`,
    ),
  recentItems: () => apiFetch<MealItemDto[]>('/nutrition/recent-items'),
  deletePhoto: (id: string) =>
    apiFetch<{ success: boolean }>(`/nutrition/photos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export const bodyWeight = {
  listEntries: (range?: BodyWeightRangeQueryDto) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set('from', range.from);
    if (range?.to) qs.set('to', range.to);
    const queryStr = qs.toString();
    return apiFetch<BodyWeightEntryDto[]>(`/body-weight/entries${queryStr ? `?${queryStr}` : ''}`);
  },
  upsertEntry: (data: UpsertBodyWeightEntryDto) =>
    apiFetch<BodyWeightEntryDto>('/body-weight/entries', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteEntry: (id: string) =>
    apiFetch<{ success: boolean }>(`/body-weight/entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

export const activity = {
  /** Apple Health daily energy and workouts imported by the iOS app (read-only on the web). */
  list: (range: HealthActivityRangeQueryDto) =>
    apiFetch<HealthActivityDto>(
      `/activity?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`,
    ),
};

export const ai = {
  buildWorkout: (data: WorkoutBuilderRequestDto) =>
    apiFetch<WorkoutBuilderResponseDto>('/ai/workout-builder', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  analyzeMeal: (form: FormData) =>
    apiFetch<MealAnalysisResponseDto>('/ai/meal-analysis', { method: 'POST', body: form }),
  describeMeal: (data: MealTextAnalysisRequestDto) =>
    apiFetch<MealTextAnalysisResponseDto>('/ai/meal-text-analysis', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  myUsage: (days: number) => apiFetch<MyAiUsageDto>(`/ai/usage/me?days=${days}`),
};

export const exerciseFeedback = {
  list: () => apiFetch<ExerciseFeedbackDto[]>('/exercise-feedback'),
  set: (exerciseId: string, data: UpsertExerciseFeedbackDto) =>
    apiFetch<ExerciseFeedbackDto>(`/exercise-feedback/${encodeURIComponent(exerciseId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (exerciseId: string) =>
    apiFetch<{ success: boolean }>(`/exercise-feedback/${encodeURIComponent(exerciseId)}`, {
      method: 'DELETE',
    }),
};

export const admin = {
  dashboard: () => apiFetch<AdminDashboardDto>('/admin/dashboard'),
  listUsers: (query: Partial<AdminUserQueryDto>) => {
    const qs = new URLSearchParams();
    if (query.search) qs.set('search', query.search);
    if (query.page) qs.set('page', String(query.page));
    if (query.limit) qs.set('limit', String(query.limit));
    return apiFetch<AdminUserListDto>(`/admin/users?${qs.toString()}`);
  },
  updateUserAccess: (userId: string, data: UpdateUserAccessDto) =>
    apiFetch<Pick<AdminUserListDto['items'][number], 'id' | 'permissions' | 'featureGrants'>>(
      `/admin/users/${encodeURIComponent(userId)}/access`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),
  getAiSettings: () => apiFetch<AiSettingsDto>('/admin/settings/ai'),
  updateAiSettings: (data: UpdateAiSettingsDto) =>
    apiFetch<AiSettingsDto>('/admin/settings/ai', { method: 'PUT', body: JSON.stringify(data) }),
  aiUsage: (days: number) => apiFetch<AiUsageSummaryDto>(`/admin/ai-usage?days=${days}`),
  userAiUsage: (userId: string, days: number) =>
    apiFetch<AdminUserAiUsageDto>(
      `/admin/ai-usage/users/${encodeURIComponent(userId)}?days=${days}`,
    ),
};

export * from './client';

export const api = {
  auth,
  exercises,
  workouts,
  stretching,
  sessions,
  analytics,
  nutrition,
  bodyWeight,
  activity,
  ai,
  exerciseFeedback,
  admin,
};
