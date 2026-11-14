/**
 * Typed wrappers for the social / push / notifications API endpoints.
 * Server responses stay authoritative; these only shape the calls.
 */
import { RaidDifficulty } from '@luki-fitti/common/enums';
import { fetchClient } from '@/lib/api/client';
import type {
  AdminLeaguePreviewDto,
  AdminReportListDto,
  AdminReportsQueryDto,
  CreateBlockDto,
  CreateReportDto,
  DuelDetailDto,
  DuelItemDto,
  DuelListDto,
  FriendInviteDto,
  FriendListsDto,
  HandleAvailabilityDto,
  LeagueCurrentDto,
  LeagueFriendRowDto,
  LeagueHistoryEntryDto,
  LeagueSettingsDto,
  NotificationListDto,
  PointsWeekDto,
  PushConfigDto,
  PushPreferencesDto,
  RaidBossDto,
  RaidDetailDto,
  RaidFeedDto,
  RaidListDto,
  ResolveReportDto,
  SquadListDto,
  SocialProfileDto,
  SocialSettingsDto,
  SocialUserDto,
  StreakListDto,
  TrophyListDto,
  UpdateLeagueSettingsDto,
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

export const duelsApi = {
  list: () => fetchClient<DuelListDto>('/duels'),
  detail: (duelId: string) => fetchClient<DuelDetailDto>(`/duels/${duelId}`),
  challenge: (opponentId: string) =>
    fetchClient<DuelItemDto>('/duels', { method: 'POST', body: JSON.stringify({ opponentId }) }),
  accept: (duelId: string) =>
    fetchClient<DuelItemDto>(`/duels/${duelId}/accept`, { method: 'POST', body: '{}' }),
  decline: (duelId: string) =>
    fetchClient(`/duels/${duelId}/decline`, { method: 'POST', body: '{}' }),
  cancel: (duelId: string) =>
    fetchClient(`/duels/${duelId}/cancel`, { method: 'POST', body: '{}' }),
  markSeen: (duelId: string) =>
    fetchClient(`/duels/${duelId}/seen`, { method: 'POST', body: '{}' }),
};

export const streaksApi = {
  list: () => fetchClient<StreakListDto>('/streaks'),
  invite: (friendId: string) =>
    fetchClient('/streaks', { method: 'POST', body: JSON.stringify({ friendId }) }),
  accept: (streakId: string) =>
    fetchClient(`/streaks/${streakId}/accept`, { method: 'POST', body: '{}' }),
  end: (streakId: string) => fetchClient(`/streaks/${streakId}`, { method: 'DELETE' }),
};

export const trophiesApi = {
  list: (userId: string) => fetchClient<TrophyListDto>(`/trophies/${userId}`),
};

export const pointsApi = {
  week: (weekKey?: string) =>
    fetchClient<PointsWeekDto>(`/points/week${weekKey ? `?weekKey=${weekKey}` : ''}`),
};

export const leagueApi = {
  current: () => fetchClient<LeagueCurrentDto>('/league/current'),
  friends: (weekKey?: string) =>
    fetchClient<{ entries: LeagueFriendRowDto[] }>(
      `/league/friends${weekKey ? `?weekKey=${weekKey}` : ''}`,
    ),
  history: () => fetchClient<{ entries: LeagueHistoryEntryDto[] }>('/league/history'),
  markResultSeen: (weekKey: string) =>
    fetchClient(`/league/results/${encodeURIComponent(weekKey)}/seen`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

export const adminLeagueApi = {
  settings: () => fetchClient<LeagueSettingsDto>('/admin/settings/leagues'),
  updateSettings: (data: UpdateLeagueSettingsDto) =>
    fetchClient<LeagueSettingsDto>('/admin/settings/leagues', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  preview: () => fetchClient<AdminLeaguePreviewDto>('/admin/leagues/preview'),
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

export const raidsApi = {
  current: () => fetchClient<RaidListDto>('/raids/current'),
  bosses: () => fetchClient<RaidBossDto[]>('/raids/bosses'),
  detail: (raidId: string) => fetchClient<RaidDetailDto>(`/raids/${raidId}`),
  feed: (raidId: string, cursor?: string | null) =>
    fetchClient<RaidFeedDto>(`/raids/${raidId}/feed${cursor ? `?cursor=${cursor}` : ''}`),
  markSeen: (raidId: string) =>
    fetchClient(`/raids/${raidId}/seen`, { method: 'POST', body: '{}' }),
};

export const squadsApi = {
  list: () => fetchClient<SquadListDto>('/squads'),
  create: (name: string) =>
    fetchClient('/squads', { method: 'POST', body: JSON.stringify({ name }) }),
  invite: (squadId: string, userId: string) =>
    fetchClient(`/squads/${squadId}/invites`, { method: 'POST', body: JSON.stringify({ userId }) }),
  acceptInvite: (squadId: string) =>
    fetchClient(`/squads/${squadId}/invites/accept`, { method: 'POST', body: '{}' }),
  declineInvite: (squadId: string) =>
    fetchClient(`/squads/${squadId}/invites/decline`, { method: 'POST', body: '{}' }),
  leave: (squadId: string) =>
    fetchClient(`/squads/${squadId}/leave`, { method: 'POST', body: '{}' }),
  kick: (squadId: string, userId: string) =>
    fetchClient(`/squads/${squadId}/members/${userId}`, { method: 'DELETE' }),
  rename: (squadId: string, name: string) =>
    fetchClient(`/squads/${squadId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  remove: (squadId: string) => fetchClient(`/squads/${squadId}`, { method: 'DELETE' }),
  startRaid: (squadId: string, bossSlug: string, difficulty: RaidDifficulty) =>
    fetchClient(`/squads/${squadId}/raids`, {
      method: 'POST',
      body: JSON.stringify({ bossSlug, difficulty }),
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
