// Site-wide identity used by page metadata, structured data, the feed and the about page.

export const SITE = {
  url: 'https://keithvassallo.com',
  name: 'Keith Vassallo',
  description: 'Keith Vassallo - Educator, Developer & Geek',
  lang: 'en-GB',
  locale: 'en_GB',
};

export const AUTHOR = {
  name: 'Keith Vassallo',
  jobTitle: 'Head of Technology',
  employer: { name: 'ICE Campus', url: 'https://icecampus.com' },
  location: 'Carlisle, UK',
  profilePath: '/about',
  photo: '/assets/images/keith_pic.png',
  bio: 'I build things, break things, and teach others to do the same. Passionate about code, teaching, and open-source. Always with a laugh.',
};

export const SOCIAL_LINKS = [
  { name: 'GitHub', url: 'https://github.com/keithvassallomt', icon: 'simple-icons:github' },
  { name: 'LinkedIn', url: 'https://mt.linkedin.com/in/keithvassallo', icon: 'simple-icons:linkedin' },
  { name: 'Threads', url: 'https://www.threads.net/@keithvassallo86', icon: 'simple-icons:threads' },
  { name: 'Fediverse', url: 'https://mastodon.social/@keithvassallo86@threads.net', icon: 'simple-icons:mastodon' },
  { name: 'Instagram', url: 'https://www.instagram.com/keithvassallo86/', icon: 'simple-icons:instagram' },
  { name: 'Facebook', url: 'https://fb.me/keithv', icon: 'simple-icons:facebook' },
];

export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).href;
}
