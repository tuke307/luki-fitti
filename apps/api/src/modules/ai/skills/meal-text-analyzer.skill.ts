import { AiSkillName } from '@luki-fitti/common/enums';
import { MealAnalysisSchema } from '@luki-fitti/common/schemas';
import type { AiSkill } from '../harness/types';
import { promptLanguage, renderPrompt } from '../prompts/prompt-loader';

export const MEAL_TEXT_ANALYZER_SKILL: AiSkill<typeof MealAnalysisSchema> = {
  name: AiSkillName.MEAL_TEXT_ANALYZER,
  answerTool: {
    name: 'submit_meal_analysis',
    description: 'Submit the foods from the description with estimated portions and nutrients.',
  },
  output: MealAnalysisSchema,
  toolNames: [],
  model: (s) => ({ primary: s.mealPhotoModel, fallbacks: s.mealPhotoFallbacks }),
  temperature: 0.2,
  // One answer plus one retry if the first answer fails validation.
  maxSteps: 2,
  maxTokens: 3000,
  systemPrompt: (ctx) =>
    renderPrompt(AiSkillName.MEAL_TEXT_ANALYZER, { language: promptLanguage(ctx.locale) }),
};
