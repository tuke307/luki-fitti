import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiSkillName } from '../enums';
import { AI_PROMPT_FILES, aiPromptGithubUrl, aiPromptRawUrl } from './ai-models.schemas';
import { UpdatePreferencesSchema } from './index';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('AI_PROMPT_FILES', () => {
  it('has an existing prompt file for every skill', () => {
    for (const skill of Object.values(AiSkillName)) {
      const file = AI_PROMPT_FILES[skill];
      assert.ok(file, `missing prompt path for ${skill}`);
      assert.ok(existsSync(path.join(repoRoot, file)), `${file} does not exist`);
    }
  });

  it('builds raw and blob URLs on main', () => {
    assert.equal(
      aiPromptRawUrl(AiSkillName.WORKOUT_BUILDER),
      'https://raw.githubusercontent.com/tuke307/luki-fitti/main/apps/api/src/modules/ai/prompts/workout-builder.md',
    );
    assert.equal(
      aiPromptGithubUrl(AiSkillName.MEAL_ANALYZER),
      'https://github.com/tuke307/luki-fitti/blob/main/apps/api/src/modules/ai/prompts/meal-analyzer.md',
    );
  });
});

describe('UpdatePreferencesSchema.aiModels', () => {
  const parse = (aiModels: unknown) => UpdatePreferencesSchema.safeParse({ aiModels });

  it('accepts valid model ids per skill and null', () => {
    assert.ok(parse({ 'workout-builder': 'openai/gpt-6.1-terra' }).success);
    assert.ok(parse({ 'meal-analyzer': 'meta-llama/llama-5-70b:free' }).success);
    assert.ok(parse({ 'workout-builder': '~anthropic/claude-sonnet-latest' }).success);
    assert.ok(parse({}).success);
    assert.ok(parse(null).success);
  });

  it('rejects malformed ids, unknown skills and overlong ids', () => {
    for (const bad of [
      { 'workout-builder': 'gpt-4' },
      { 'workout-builder': 'OpenAI/GPT' },
      { 'workout-builder': 'openai/gpt 4' },
      { 'workout-builder': '../etc/passwd' },
      { 'workout-builder': '~~anthropic/claude-latest' },
      { 'workout-builder': 'anthropic/~claude-latest' },
      { 'workout-builder': 'https://evil.example/x' },
      { 'workout-builder': `a/${'b'.repeat(100)}` },
      { 'workout-builder': 42 },
      { 'unknown-skill': 'openai/gpt-6.1-terra' },
    ]) {
      assert.equal(parse(bad).success, false, JSON.stringify(bad));
    }
  });
});
