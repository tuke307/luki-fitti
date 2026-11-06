import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiSkillName } from '@luki-fitti/common/enums';
import { AI_PROMPT_FILES } from '@luki-fitti/common/schemas';

/**
 * System prompts live as Markdown files next to this loader (copied to dist as assets) so the
 * prompt shown to users from GitHub `main` is exactly what the API sends.
 */
const promptsDir = path.dirname(fileURLToPath(import.meta.url));

function load(skill: AiSkillName): string {
  const file = path.join(promptsDir, path.basename(AI_PROMPT_FILES[skill]));
  // Fails fast at startup when a prompt file is missing from the build output.
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
}

const PROMPTS: Record<AiSkillName, string> = Object.fromEntries(
  Object.values(AiSkillName).map((skill) => [skill, load(skill)]),
) as Record<AiSkillName, string>;

/** Renders `{{name}}` placeholders; unknown placeholders are an error (catches typos). */
export function renderPrompt(skill: AiSkillName, vars: Record<string, string>): string {
  return PROMPTS[skill].replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined)
      throw new Error(`Prompt ${skill} uses unknown placeholder {{${name}}}`);
    return value;
  });
}

export const promptLanguage = (locale: string) => (locale === 'de' ? 'German' : 'English');
