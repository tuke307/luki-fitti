import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AiSkillName } from '@luki-fitti/common/enums';
import { WORKOUT_BUILDER_SKILL } from '../skills/workout-builder.skill';
import { MEAL_ANALYZER_SKILL } from '../skills/meal-analyzer.skill';
import { MEAL_TEXT_ANALYZER_SKILL } from '../skills/meal-text-analyzer.skill';
import { renderPrompt } from './prompt-loader';

/** Snapshot of the inline prompts before they moved to Markdown files. */
const legacy = JSON.parse(
  readFileSync(new URL('./__fixtures__/legacy-prompts.json', import.meta.url), 'utf8'),
) as Record<AiSkillName, Record<'en' | 'de', string>>;

const LATERALITY_RULE =
  '- Exercises have a laterality (UNILATERAL = one arm/leg at a time, BILATERAL = both). When the user mentions a stall, plateau or a strength imbalance between sides, consider a UNILATERAL variant of the same movement pattern and say why in the rationale.\n';

describe('prompt files', () => {
  for (const skill of [WORKOUT_BUILDER_SKILL, MEAL_ANALYZER_SKILL, MEAL_TEXT_ANALYZER_SKILL]) {
    for (const locale of ['en', 'de'] as const) {
      it(`${skill.name} (${locale}) renders the previous inline prompt`, () => {
        let rendered = skill.systemPrompt({ userId: 'user-1', locale });
        if (skill.name === AiSkillName.WORKOUT_BUILDER) {
          assert.ok(rendered.includes(LATERALITY_RULE), 'laterality rule missing');
          rendered = rendered.replace(LATERALITY_RULE, '');
        }
        assert.equal(rendered, legacy[skill.name][locale]);
      });
    }
  }

  it('rejects unknown placeholders', () => {
    assert.throws(() => renderPrompt(AiSkillName.MEAL_ANALYZER, {}), /unknown placeholder/);
  });
});
