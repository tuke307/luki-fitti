import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterModelsService, parseOpenRouterModels } from './openrouter-models.service';

const upstream = (overrides: Record<string, unknown> = {}) => ({
  id: 'openai/gpt-test',
  name: 'OpenAI: GPT Test',
  context_length: 128000,
  pricing: { prompt: '0.0000025', completion: '0.00001', image: '0.003613' },
  supported_parameters: ['tools', 'tool_choice', 'temperature'],
  architecture: { input_modalities: ['text', 'image'] },
  ...overrides,
});

describe('parseOpenRouterModels', () => {
  it('maps prices per 1M tokens and capability flags', () => {
    const [model] = parseOpenRouterModels({ data: [upstream()] });
    assert.deepEqual(model, {
      id: 'openai/gpt-test',
      name: 'OpenAI: GPT Test',
      contextLength: 128000,
      pricing: { promptPerMTokUsd: 2.5, completionPerMTokUsd: 10, imageUsd: 0.003613 },
      supportsTools: true,
      supportsImages: true,
    });
  });

  it('derives missing capabilities and optional fields', () => {
    const [model] = parseOpenRouterModels({
      data: [
        upstream({
          name: undefined,
          context_length: null,
          pricing: { prompt: '0', completion: '0' },
          supported_parameters: ['temperature'],
          architecture: { input_modalities: ['text'] },
        }),
      ],
    });
    assert.equal(model!.name, 'openai/gpt-test');
    assert.equal(model!.contextLength, null);
    assert.equal(model!.pricing.imageUsd, null);
    assert.equal(model!.supportsTools, false);
    assert.equal(model!.supportsImages, false);
  });

  it('drops malformed entries and duplicates', () => {
    const models = parseOpenRouterModels({
      data: [
        upstream({ id: 'good/one' }),
        upstream({ id: 'good/one' }),
        'not an object',
        upstream({ id: 'no-slash' }),
        upstream({ id: 'Bad/Upper' }),
        upstream({ id: `long/${'x'.repeat(120)}` }),
        upstream({ id: 'neg/price', pricing: { prompt: '-1', completion: '-1' } }),
        upstream({ id: 'nan/price', pricing: { prompt: 'abc', completion: '0' } }),
        upstream({ id: 'no/pricing', pricing: undefined }),
        { id: 42 },
        upstream({ id: 'good/two:free' }),
        upstream({ id: '~good/three-latest' }),
        upstream({ id: 'bad~/tilde' }),
        upstream({ id: '~~bad/double' }),
      ],
    });
    assert.deepEqual(
      models.map((m) => m.id),
      ['good/one', 'good/two:free', '~good/three-latest'],
    );
  });

  it('rejects a response without a data array', () => {
    assert.throws(() => parseOpenRouterModels({ models: [] }));
  });
});

class FakeModelsService extends OpenRouterModelsService {
  calls = 0;
  constructor(private readonly responses: Array<unknown | Error>) {
    super();
  }
  protected override async fetchJson(): Promise<unknown> {
    this.calls += 1;
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }
}

describe('OpenRouterModelsService', () => {
  it('caches the catalog', async () => {
    const service = new FakeModelsService([{ data: [upstream()] }]);
    assert.equal((await service.catalog()).models.length, 1);
    assert.equal((await service.catalog()).models.length, 1);
    assert.equal(service.calls, 1);
    assert.equal((await service.find('openai/gpt-test'))?.name, 'OpenAI: GPT Test');
  });

  it('reports an unavailable catalog when the first load fails', async () => {
    const service = new FakeModelsService([new Error('offline')]);
    assert.deepEqual(await service.catalog(), { available: false, models: [] });
  });
});
