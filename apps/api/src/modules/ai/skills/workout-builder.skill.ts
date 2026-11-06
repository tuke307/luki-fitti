import { AiSkillName } from '@luki-fitti/common/enums';
import { WorkoutProposalSchema } from '@luki-fitti/common/schemas';
import type { AiSkill } from '../harness/types';
import { promptLanguage, renderPrompt } from '../prompts/prompt-loader';

export const WORKOUT_BUILDER_SKILL: AiSkill<typeof WorkoutProposalSchema> = {
  name: AiSkillName.WORKOUT_BUILDER,
  answerTool: {
    name: 'submit_workout',
    description: 'Submit the final workout. Call exactly once when you are done researching.',
  },
  output: WorkoutProposalSchema,
  toolNames: [
    'get_user_profile',
    'get_exercise_feedback',
    'get_weak_points',
    'get_training_history',
    'search_exercises',
    'get_exercise_details',
  ],
  model: (s) => ({ primary: s.workoutBuilderModel, fallbacks: s.workoutBuilderFallbacks }),
  temperature: 0.4,
  maxSteps: 8,
  maxTokens: 4000,
  systemPrompt: (ctx) =>
    renderPrompt(AiSkillName.WORKOUT_BUILDER, { language: promptLanguage(ctx.locale) }),
};
