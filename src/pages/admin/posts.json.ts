import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { getCollection } from 'astro:content';
import yaml from 'js-yaml';
import projectsYaml from '../../data/projects/projects.yaml?raw';
import pin from '../../data/blog/pin.json';

// Every post on main, drafts included, for the admin's post list, plus what the editor's
// checks need to know about the site. Nothing here is private: it is all in the public
// repository already. Rebuilt with each deploy.
export const GET: APIRoute = async () => {
  const projectIds = (yaml.load(projectsYaml) as { projects: { id: string }[] }).projects.map((project) => project.id);
  const [posts, categories] = await Promise.all([getCollection('blog'), getCollection('categories')]);
  const items = await Promise.all(
    posts.map(async (post) => ({
      slug: post.id,
      title: post.data.title,
      description: post.data.description,
      category: post.data.category.id,
      tags: post.data.tags,
      pubDate: post.data.pubDate.toISOString(),
      updatedDate: post.data.updatedDate?.toISOString() ?? null,
      draft: post.data.draft,
      cover: post.data.cover ? (await getImage({ src: post.data.cover, width: 192, format: 'webp' })).src : null,
    })),
  );
  items.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  return new Response(
    JSON.stringify({
      posts: items,
      categories: categories.map(({ id, data }) => ({ id, name: data.name, color: data.color })),
      projectIds,
      pin,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
};
