import type { Post } from './blog';

export type SharePlatform = 'linkedin' | 'x' | 'bluesky' | 'mastodon' | 'facebook';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const characters = (text: string) => [...segmenter.segment(text)].length;

// X and Mastodon count every link as 23 characters; Bluesky and LinkedIn count it as written.
const LINK_LENGTH = 23;

/**
 * Suggested share text for each network: the post's `share` blurb, else its description,
 * else its title when the description is too long for that network. A blurb set in
 * frontmatter that does not fit fails the build instead of being silently swapped.
 */
export function shareTexts(post: Post, url: string): Record<SharePlatform, string> {
  const { share, description, title } = post.data;

  const rules: Record<SharePlatform, { limit: number; length: (text: string) => number }> = {
    x: { limit: 280, length: (text) => characters(text) + 1 + LINK_LENGTH },
    bluesky: { limit: 300, length: (text) => characters(`${text}\n\n${url}`) },
    mastodon: { limit: 500, length: (text) => characters(text) + 2 + LINK_LENGTH },
    linkedin: { limit: 3000, length: (text) => characters(`${text}\n\n${url}`) },
    facebook: { limit: 5000, length: characters },
  };

  const texts = {} as Record<SharePlatform, string>;
  for (const [platform, rule] of Object.entries(rules) as [SharePlatform, (typeof rules)[SharePlatform]][]) {
    const custom = share[platform];
    const text = custom ?? description;
    const length = rule.length(text);
    if (length <= rule.limit) {
      texts[platform] = text;
    } else if (custom) {
      throw new Error(
        `share.${platform} in blog post "${post.id}" is too long: ${length} characters including the link, limit ${rule.limit}`,
      );
    } else {
      texts[platform] = title;
    }
  }
  return texts;
}
