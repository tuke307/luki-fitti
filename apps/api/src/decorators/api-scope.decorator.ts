import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '@luki-fitti/common/enums';

export const API_SCOPE_KEY = 'apiScope';

/**
 * Required scope for a public `/api/v1` route, enforced by `ScopesGuard` after
 * `ApiKeyGuard`. Deny by default: a public route without `@ApiScope(...)` is
 * unreachable with a key.
 */
export const ApiScope = (scope: ApiKeyScope) => SetMetadata(API_SCOPE_KEY, scope);
