// Client-safe utility exports - These utilities can be safely imported in Next.js client components

// Date and time utilities (client-safe)
export * from './time.util';
export * from './date.utils';

// Zod utilities (client-safe)
export * from './zod-utils';

// Progressive overload & ML suggestion utilities (client-safe)
export * from './progression.util';

// Per-set template plans and session → template write-back (client-safe)
export * from './template-sets.util';
export * from './active-session.util';
export * from './exercise-alternatives.util';
export * from './exercise-search.util';
export * from './exercise-search.vocab';

// Folder accent palette (client-safe)
export * from './folder-color.util';

// Nutrition math & workout energy estimates (client-safe)
export * from './nutrition.util';
export * from './energy.util';
export * from './body-weight.util';

// Note: Pipes and decorators are NOT exported here as they contain NestJS server-side code
// Server-side utilities can still be imported via '@luki-fitti/common/utils' for server components and API routes
