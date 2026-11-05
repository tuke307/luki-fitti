import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiSkillName } from '@luki-fitti/common/enums';
import type { AiModelsDto, AiSkillModelsDto } from '@luki-fitti/common/schemas';
import { filterModels, nextModelChoices } from './ai-models';

const skill = (name: AiSkillName, selectedModel: string | null): AiSkillModelsDto => ({
  skill: name,
  defaultModel: 'x/default',
  selectedModel,
  effectiveModel: selectedModel ?? 'x/default',
  effectiveModelInfo: null,
  restricted: false,
  models: [],
});

const data: AiModelsDto = {
  catalogAvailable: true,
  keySource: null,
  skills: [
    skill(AiSkillName.WORKOUT_BUILDER, 'a/one'),
    skill(AiSkillName.MEAL_ANALYZER, null),
    skill(AiSkillName.MEAL_TEXT_ANALYZER, 'b/two'),
  ],
};

describe('nextModelChoices', () => {
  it('keeps other skills and sets the new choice', () => {
    assert.deepEqual(nextModelChoices(data, AiSkillName.MEAL_ANALYZER, 'c/three'), {
      'workout-builder': 'a/one',
      'meal-analyzer': 'c/three',
      'meal-text-analyzer': 'b/two',
    });
  });

  it('clears the skill for "use default"', () => {
    assert.deepEqual(nextModelChoices(data, AiSkillName.WORKOUT_BUILDER, null), {
      'meal-text-analyzer': 'b/two',
    });
  });
});

describe('filterModels', () => {
  const models = [
    { id: 'openai/gpt-x', name: 'OpenAI: GPT X' },
    { id: 'google/gemini-y', name: 'Google: Gemini Y' },
  ];
  it('matches id or name, case-insensitively', () => {
    assert.deepEqual(
      filterModels(models, 'GEMINI').map((m) => m.id),
      ['google/gemini-y'],
    );
    assert.deepEqual(
      filterModels(models, 'openai/').map((m) => m.id),
      ['openai/gpt-x'],
    );
    assert.equal(filterModels(models, '  ').length, 2);
  });
});
