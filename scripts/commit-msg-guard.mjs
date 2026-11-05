#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('commit-msg-guard: missing commit message file argument');
  process.exit(1);
}

const rules = [
  {
    pattern:
      /^co-authored-by:.*(claude|anthropic|devin|copilot|cursor|codex|openai|chatgpt|gemini|\[bot\]|noreply@anthropic\.com|devin-ai-integration)/i,
    reason: 'AI/bot Co-Authored-By trailer',
  },
  {
    pattern: /generated (with|by) .*?(claude|devin|copilot|cursor|codex|chatgpt|gemini)/i,
    reason: 'AI attribution line',
  },
  { pattern: /🤖/u, reason: 'AI attribution emoji' },
];

const violations = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter((line) => !line.startsWith('#'))
  .flatMap((line) =>
    rules.filter(({ pattern }) => pattern.test(line)).map(({ reason }) => `  ${reason}: ${line}`),
  );

if (violations.length > 0) {
  console.error('✖ Commit message rejected by commit-msg-guard:');
  console.error(violations.join('\n'));
  console.error(
    'Commits must be authored by the human contributor without AI co-author or attribution lines.',
  );
  process.exit(1);
}
