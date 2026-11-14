import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiQuery,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { PublicApiErrorSchema } from '@luki-fitti/common/schemas';

/** JSON Schema for the shared v1 error body. */
export const PUBLIC_API_ERROR_JSON_SCHEMA = z.toJSONSchema(PublicApiErrorSchema, {
  target: 'draft-7',
}) as Record<string, unknown>;

/** JSON Schema for a `{ data, nextCursor }` list response. */
export const listJsonSchema = (itemSchema: Record<string, unknown>) => ({
  type: 'object',
  required: ['data', 'nextCursor'],
  properties: {
    data: { type: 'array', items: itemSchema },
    nextCursor: { type: ['string', 'null'] },
  },
});

/** JSON Schema for a zod response schema (v4 `z.toJSONSchema`, draft-7 for Swagger). */
export const jsonSchemaOf = (schema: z.ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;

const LIST_QUERIES = [
  ApiQuery({ name: 'limit', required: false, type: Number, description: '1–200, default 50' }),
  ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Opaque `nextCursor` from the previous page',
  }),
  ApiQuery({
    name: 'updatedSince',
    required: false,
    type: String,
    description: 'ISO datetime; only rows updated after this instant',
  }),
];

/** Documents the shared list query params (`limit`, `cursor`, `updatedSince`). */
export const ApiListQueries = () => applyDecorators(...LIST_QUERIES);

/** Documents `from`/`to` on top of the list queries (UTC-day rule included). */
export const ApiRangeQueries = () =>
  applyDecorators(
    ...LIST_QUERIES,
    ApiQuery({
      name: 'from',
      required: false,
      type: String,
      description: 'ISO date or datetime. A date-only value is a whole UTC day (00:00Z).',
    }),
    ApiQuery({
      name: 'to',
      required: false,
      type: String,
      description:
        'ISO date or datetime. A date-only value includes that whole UTC day (until 23:59:59.999Z).',
    }),
  );

/** Documents the shared 401/403/429 error responses once per controller. */
export const ApiPublicErrors = () =>
  applyDecorators(
    ApiUnauthorizedResponse({
      description: 'Missing, invalid, revoked or expired API key',
      schema: PUBLIC_API_ERROR_JSON_SCHEMA,
    }),
    ApiForbiddenResponse({
      description: 'Scope missing (`insufficient_scope`) or feature off (`api_keys_disabled`)',
      schema: PUBLIC_API_ERROR_JSON_SCHEMA,
    }),
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded; `Retry-After` header gives the window reset',
      schema: PUBLIC_API_ERROR_JSON_SCHEMA,
    }),
  );
