/**
 * Typed wrappers for the social / push / notifications API endpoints.
 * Server responses stay authoritative; these only shape the calls.
 */
import { fetchClient } from '@/lib/api/client';
import type {
  AdminReportListDto,
  AdminReportsQueryDto,
  CreateBlockDto,
  CreateReportDto,
  FriendInviteDto,
  FriendListsDto,
  HandleAvailabilityDto,
  NotificationListDto,
  PushConfigDto,
  PushPreferencesDto,
  ResolveReportDto,
  SocialProfileDto,
  SocialSettingsDto,
  SocialUserDto,
  UpdatePushPreferencesDto,
  UpdateSocialProfileDto,
  UpdateSocialSettingsDto,
} from '@luki-fitti/common/schemas';

export const socialApi = {
  me: () => fetchClient<SocialProfileDto>('/social/me'),
  updateMe: (data: UpdateSocialProfileDto) =>
    fetchClient<SocialProfileDto>('/social/me', { method: 'PATCH', body: JSON.stringify(data) }),
  handleAvailability: (handle: string) =>
    fetchClient<HandleAvailabilityDto>(
      `/social/handles/${encodeURIComponent(handle)}/availability`,
    ),
  uploadAvatar: (file: Blob) => {
    const form = new FormData();
    form.append('avatar', file, 'avatar.jpg');
    return fetchClient<SocialProfileDto>('/social/me/avatar', { method: 'PUT', body: form });
  },
  removeAvatar: () => fetchClient<SocialProfileDto>('/social/me/avatar', { method: 'DELETE' }),
  lookupUser: (handle: string) =>
    fetchClient<SocialUserDto>(`/social/users/${encodeURIComponent(handle)}`),
  search: (q: string) => fetchClient<SocialUserDto[]>(`/social/search?q=${encodeURIComponent(q)}`),
  friends: () => fetchClient<FriendListsDto>('/social/friends'),
  sendRequest: (userId: string) =>
    fetchClient('/social/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  acceptRequest: (userId: string) =>
    fetchClient(`/social/friends/requests/${userId}/accept`, { method: 'POST' }),
  declineRequest: (userId: string) =>
    fetchClient(`/social/friends/requests/${userId}/decline`, { method: 'POST' }),
  removeFriend: (userId: string) => fetchClient(`/social/friends/${userId}`, { method: 'DELETE' }),
  createInvite: () => fetchClient<FriendInviteDto>('/social/invites', { method: 'POST' }),
  invitePreview: (token: string) =>
    fetchClient<SocialUserDto>(`/social/invites/${encodeURIComponent(token)}`, { retry: false }),
  acceptInvite: (token: string) =>
    fetchClient(`/social/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  matchContacts: (hashes: string[]) =>
    fetchClient<SocialUserDto[]>('/social/contacts/match', {
      method: 'POST',
      body: JSON.stringify({ hashes }),
    }),
  blocks: () => fetchClient<{ blocked: SocialUserDto[] }>('/social/blocks'),
  block: (data: CreateBlockDto) =>
    fetchClient('/social/blocks', { method: 'POST', body: JSON.stringify(data) }),
  unblock: (userId: string) => fetchClient(`/social/blocks/${userId}`, { method: 'DELETE' }),
  report: (data: CreateReportDto) =>
    fetchClient('/social/reports', { method: 'POST', body: JSON.stringify(data) }),
};

export const notificationsApi = {
  list: (cursor?: string | null, limit = 20) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    return fetchClient<NotificationListDto>(`/notifications?${params.toString()}`);
  },
  markRead: (all = true) =>
    fetchClient('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ all }),
    }),
};

export const pushApi = {
  config: () => fetchClient<PushConfigDto>('/push/config', { retry: false }),
  registerDevice: (body: {
    platform: 'APNS' | 'WEBPUSH';
    token: string;
    p256dh?: string;
    auth?: string;
    locale: string;
    timeZone: string;
  }) => fetchClient('/push/devices', { method: 'PUT', body: JSON.stringify(body) }),
  deleteDevice: (token: string) =>
    fetchClient('/push/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),
  preferences: () => fetchClient<PushPreferencesDto>('/push/preferences'),
  updatePreferences: (data: UpdatePushPreferencesDto) =>
    fetchClient<PushPreferencesDto>('/push/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

export const adminSocialApi = {
  settings: () => fetchClient<SocialSettingsDto>('/admin/settings/social'),
  updateSettings: (data: UpdateSocialSettingsDto) =>
    fetchClient<SocialSettingsDto>('/admin/settings/social', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  reports: (query: Partial<AdminReportsQueryDto>) => {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    return fetchClient<AdminReportListDto>(`/admin/reports?${params.toString()}`);
  },
  resolveReport: (id: string, data: ResolveReportDto) =>
    fetchClient(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
