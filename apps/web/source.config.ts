import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
  type DocsCollection,
} from 'fumadocs-mdx/config';

// Explicit annotation: the inferred type references nested `fumadocs-mdx` zod
// internals, which declaration emit cannot name (TS2883).
export const docs: DocsCollection<typeof frontmatterSchema, typeof metaSchema> = defineDocs({
  dir: 'content',
  docs: {
    // llms-full.txt renders each page's processed markdown.
    postprocess: { includeProcessedMarkdown: true },
  },
});
export default defineConfig();
