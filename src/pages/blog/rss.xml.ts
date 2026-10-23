import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCategoryMap, getPublishedPosts, postUrl } from '../../lib/blog';
import { SITE, absoluteUrl } from '../../lib/site';

export const GET: APIRoute = async () => {
  const [posts, categories] = await Promise.all([getPublishedPosts(), getCategoryMap()]);

  return rss({
    title: `${SITE.name}: Notes from the workbench`,
    description: 'Write-ups on the things I build, break and teach.',
    site: SITE.url,
    trailingSlash: false,
    xmlns: { atom: 'http://www.w3.org/2005/Atom', dc: 'http://purl.org/dc/elements/1.1/' },
    customData: [
      '<language>en-gb</language>',
      `<atom:link href="${absoluteUrl('/blog/rss.xml')}" rel="self" type="application/rss+xml" />`,
    ].join(''),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: absoluteUrl(postUrl(post)),
      categories: [...new Set([categories.get(post.data.category.id)!.data.name, ...post.data.tags])],
      // RSS <author> must be an email address, so name the author with Dublin Core instead
      customData: `<dc:creator>${SITE.name}</dc:creator>`,
    })),
  });
};
