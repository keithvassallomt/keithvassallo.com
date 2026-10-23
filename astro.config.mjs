// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { readBlogFrontmatter } from './src/lib/blog-frontmatter.mjs';
import { callouts, codeBlockChrome, figures, scrollableTables } from './src/lib/markdown.mjs';

const site = 'https://keithvassallo.com';

// Blog frontmatter drives sitemap dates, draft exclusion and redirects from old post URLs
const posts = readBlogFrontmatter();
const draftUrls = new Set(posts.filter((post) => post.draft).map((post) => `${site}/blog/${post.slug}`));
const lastModified = new Map(
  posts.filter((post) => post.pubDate).map((post) => [`${site}/blog/${post.slug}`, post.updatedDate ?? post.pubDate]),
);
const redirects = Object.fromEntries(
  posts.filter((post) => !post.draft).flatMap((post) => post.redirectFrom.map((from) => [from, `/blog/${post.slug}`])),
);

// https://astro.build/config
export default defineConfig({
  integrations: [
    icon(),
    sitemap({
      filter: (page) => !draftUrls.has(page.replace(/\/$/, '')),
      serialize(item) {
        const date = lastModified.get(item.url.replace(/\/$/, ''));
        if (date) item.lastmod = date.toISOString();
        return item;
      },
    }),
  ],
  site,
  output: 'static',
  trailingSlash: 'never',
  redirects,
  // Responsive srcsets for images, including those in Markdown posts. Styling stays in our own CSS.
  image: {
    layout: 'constrained',
    breakpoints: [360, 540, 720, 1080, 1440, 1800],
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      transformers: [codeBlockChrome],
    },
    processor: satteri({ hastPlugins: [scrollableTables, figures, callouts] }),
  },
  build: {
    // Content-hashed assets for aggressive caching
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // Ensure all assets are content-hashed
          assetFileNames: '_astro/[name].[hash][extname]',
          chunkFileNames: '_astro/[name].[hash].js',
          entryFileNames: '_astro/[name].[hash].js',
        },
      },
    },
  },
});
