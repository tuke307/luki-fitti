import { docsSearch } from '@/lib/docs/source';

/** Static Orama search index — fetched once by the search dialog, no /api usage. */
export const GET = docsSearch.staticGET;
export const dynamic = 'force-static';
