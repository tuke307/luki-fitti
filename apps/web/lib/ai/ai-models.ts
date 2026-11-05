import type { AiSkillName } from '@luki-fitti/common/enums';
import type { AiModelChoicesDto, AiModelInfoDto, AiModelsDto } from '@luki-fitti/common/schemas';

/** Choices map to PATCH after picking `modelId` (null = use the default) for `skill`. */
export function nextModelChoices(
  data: AiModelsDto,
  skill: AiSkillName,
  modelId: string | null,
): AiModelChoicesDto {
  const next: AiModelChoicesDto = Object.fromEntries(
    data.skills.flatMap((s) => (s.selectedModel ? [[s.skill, s.selectedModel]] : [])),
  );
  if (modelId) next[skill] = modelId;
  else delete next[skill];
  return next;
}

/** Case-insensitive search over model id and name. */
export function filterModels<T extends Pick<AiModelInfoDto, 'id' | 'name'>>(
  models: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return q ? models.filter((m) => m.id.includes(q) || m.name.toLowerCase().includes(q)) : models;
}
