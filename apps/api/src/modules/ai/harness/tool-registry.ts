import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ChatToolDefinition } from '../openrouter.client';
import type { AiTool, ToolContext } from './types';

/** Holds every tool by name; skills pick the subset they are allowed to use. */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AiTool>();

  register(...tools: AiTool[]): void {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) throw new Error(`Duplicate AI tool: ${tool.name}`);
      this.tools.set(tool.name, tool);
    }
  }

  definitions(names: string[]): ChatToolDefinition[] {
    return names.map((name) => {
      const tool = this.tools.get(name);
      if (!tool) throw new Error(`Unknown AI tool: ${name}`);
      const parameters = z.toJSONSchema(tool.input, { target: 'draft-7', unrepresentable: 'any' }) as Record<
        string,
        unknown
      >;
      delete parameters.$schema;
      return { type: 'function', function: { name, description: tool.description, parameters } };
    });
  }

  async execute(ctx: ToolContext, name: string, rawArguments: string): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown AI tool: ${name}`);
    let raw: unknown;
    try {
      raw = JSON.parse(rawArguments || '{}');
    } catch {
      raw = {};
    }
    const input = tool.input.parse(raw);
    return tool.execute(ctx, input);
  }
}
