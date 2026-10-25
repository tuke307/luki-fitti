// Client-safe utility exports - These utilities can be safely imported in Next.js client components

// Date and time utilities (client-safe)
export * from './time.util';
export * from './date.utils';

// Zod utilities (client-safe)
export * from './zod-utils';

// Progressive overload & ML suggestion utilities (client-safe)
export * from './progression.util';

// Folder accent palette (client-safe)
export * from './folder-color.util';

// Note: Pipes and decorators are NOT exported here as they contain NestJS server-side code
// Server-side utilities can still be imported via '@luki-fitti/common/utils' for server components and API routes
