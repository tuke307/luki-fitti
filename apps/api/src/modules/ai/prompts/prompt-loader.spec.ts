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

const LEGACY_RANGES_RULE =
  '  compounds first, then isolation. Typical ranges: compounds 3–4 working sets of 5–10 reps,\n' +
  '  isolation 2–4 sets of 8–15 reps, rest 60–180 s (longer for heavy compounds). Add 1–2 warm-up\n' +
  '  sets for the first heavy compound.\n';

const GOAL_RANGES_RULE =
  '  compounds first, then isolation. Add 1–2 warm-up sets for the first heavy compound.\n' +
  '- Match reps and rest to the training goal: the requested goal if one is given, otherwise\n' +
  '  trainingGoal from get_user_profile.\n' +
  '  - STRENGTH: compounds 3–5 working sets of 3–6 reps, isolation 2–3 sets of 6–10 reps,\n' +
  '    rest 150–240 s (180 s default).\n' +
  '  - HYPERTROPHY: compounds 3–4 working sets of 6–10 reps, isolation 2–4 sets of 10–15 reps,\n' +
  '    rest 60–120 s (90 s default).\n' +
  '  - ENDURANCE: compounds 2–3 working sets of 12–20 reps, isolation 2–3 sets of 15–25 reps,\n' +
  '    rest 45–75 s (60 s default).\n' +
  '  - No goal: compounds 3–4 working sets of 5–10 reps, isolation 2–4 sets of 8–15 reps,\n' +
  '    rest 60–180 s (longer for heavy compounds).\n';

describe('prompt files', () => {
  for (const skill of [WORKOUT_BUILDER_SKILL, MEAL_ANALYZER_SKILL, MEAL_TEXT_ANALYZER_SKILL]) {
    for (const locale of ['en', 'de'] as const) {
      it(`${skill.name} (${locale}) renders the previous inline prompt`, () => {
        let rendered = skill.systemPrompt({ userId: 'user-1', locale });
        if (skill.name === AiSkillName.WORKOUT_BUILDER) {
          assert.ok(rendered.includes(LATERALITY_RULE), 'laterality rule missing');
          rendered = rendered.replace(LATERALITY_RULE, '');
          assert.ok(rendered.includes(GOAL_RANGES_RULE), 'training goal rule missing');
          rendered = rendered.replace(GOAL_RANGES_RULE, LEGACY_RANGES_RULE);
        }
        assert.equal(rendered, legacy[skill.name][locale]);
      });
    }
  }

  it('rejects unknown placeholders', () => {
    assert.throws(() => renderPrompt(AiSkillName.MEAL_ANALYZER, {}), /unknown placeholder/);
  });
});
