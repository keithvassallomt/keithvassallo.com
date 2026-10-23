import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const categories = defineCollection({
  loader: file('src/data/blog/categories.yaml'),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    // Accent colours from the site palette; see the --c-* tokens in BlogShell.astro
    color: z.enum(['green', 'orange', 'cyan', 'purple', 'blue', 'red']),
  }),
});

// One folder per post: src/content/blog/<slug>/index.md, with its images alongside.
// The folder name is the permanent URL slug (/blog/<slug>). src/lib/blog-frontmatter.mjs
// relies on the same layout, so keep the two in step.
const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '*/index.md',
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        category: reference('categories'),
        tags: z.array(z.string()).default([]),
        cover: image().optional(),
        coverAlt: z.string().optional(),
        // Overrides. Each falls back to the fields above when absent.
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        socialImage: image().optional(),
        socialImageAlt: z.string().optional(),
        canonicalURL: z.url().optional(),
        redirectFrom: z.array(z.string().startsWith('/')).default([]),
        // Suggested post text for each share button. Missing ones fall back to the description.
        // Length limits are checked against each network's rules in src/lib/share.ts.
        share: z
          .object({
            linkedin: z.string().trim().optional(),
            x: z.string().trim().optional(),
            bluesky: z.string().trim().optional(),
            threads: z.string().trim().optional(),
            mastodon: z.string().trim().optional(),
            facebook: z.string().trim().optional(),
          })
          .default({}),
        draft: z.boolean().default(false),
      })
      .refine((data) => !data.cover || data.coverAlt, {
        message: 'coverAlt is required when a cover image is set',
        path: ['coverAlt'],
      }),
});

export const collections = { blog, categories };
