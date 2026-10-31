// The two files in blog-private that the admin edits: Keith's ideas (notes/ideas.md), which
// the research stage reads, and his style lessons (instructions/keith-feedback.md), which every
// writing stage reads. Both stay plain markdown that the model reads and Keith can edit by
// hand. This parses and writes them for the admin's API and the AI jobs, and edits them on
// GitHub: each change reads the file and writes it back against its sha, trying again if
// something else saved in between, so two changes at once never lose either.

export const IDEAS_FILE = 'notes/ideas.md';
export const LESSONS_FILE = 'instructions/keith-feedback.md';

const IDEAS_PREAMBLE = `# Ideas and notes

Topic ideas, things I've tried, opinions and teaching observations (anonymised) that a post could use.`;

const LESSONS_PREAMBLE = `# Keith's corrections

Lessons from Keith's reviews of earlier drafts. They come from him directly, so they override anything the voice guide infers.`;

/** A short, stable id for text with no id of its own (FNV-1a). */
function hash(text) {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36);
}

const randomId = () => Math.random().toString(36).slice(2, 8);
const lines = (text) => (text ?? '').replace(/\r\n/g, '\n').split('\n');
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Splits a file into the text before its first `## ` heading and the sections after it. */
function sections(text) {
  const all = lines(text);
  const first = all.findIndex((line) => line.startsWith('## '));
  const preamble = (first < 0 ? all : all.slice(0, first)).join('\n').trim();
  const found = [];
  if (first >= 0) {
    all.slice(first).forEach((line, index) => {
      if (line.startsWith('## ')) found.push({ heading: line.slice(3).trim(), start: first + index, body: [] });
      else found.at(-1).body.push(line);
    });
  }
  return { preamble, sections: found, all };
}

// ---- ideas ---------------------------------------------------------------------------------

// Each idea is a `## ` heading, a comment with its id and date, and any details:
//
//   ## Why Loft uses one WebView per service
//   <!-- idea id=k3x9q2 added=2026-10-24 -->
//
//   Details, in Keith's words.
//
// The file is a queue, oldest first: the weekly run, and Generate on an empty post, take the
// idea at the top, and an idea leaves the file once a post is made from it. A section written by
// hand, without the comment, gets an id from its title, and the comment the next time the file
// is saved. Older files marked used ideas with `used` and `post`; those count as taken.
const META = /^<!--\s*idea\b(.*?)-->$/;

export function parseIdeas(text) {
  const { preamble, sections: found } = sections(text);
  const seen = new Set();
  const ideas = found.map((section) => {
    const body = [...section.body];
    while (body.length && !body[0].trim()) body.shift();
    const meta = {};
    const match = body.length ? META.exec(body[0].trim()) : null;
    if (match) {
      for (const [, key, value] of match[1].matchAll(/(\w+)=(\S+)/g)) meta[key] = value;
      body.shift();
    }
    let id = meta.id || `h${hash(section.heading)}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    return { id, title: section.heading, details: body.join('\n').trim(), added: meta.added ?? null, used: meta.used ?? null, post: meta.post ?? null };
  });
  return { preamble, ideas };
}

export function serialiseIdeas({ preamble, ideas }) {
  const meta = (idea) => [`id=${idea.id}`, idea.added && `added=${idea.added}`, idea.used && `used=${idea.used}`, idea.post && `post=${idea.post}`].filter(Boolean).join(' ');
  const parts = ideas.map((idea) => `\n## ${idea.title}\n<!-- idea ${meta(idea)} -->\n${idea.details ? `\n${idea.details}\n` : ''}`);
  return `${preamble || IDEAS_PREAMBLE}\n${parts.join('')}`;
}

/** An idea's title and details as they may go in the file. Throws a message for Keith if the title is missing. */
export function cleanIdea({ title, details }) {
  const cleanTitle = oneLine(title).replace(/^#+\s*/, '').slice(0, 200);
  if (!cleanTitle) throw new Error('Give the idea a line of text.');
  // A `## ` line in the details would start a new idea
  const cleanDetails = String(details ?? '').replace(/\r\n/g, '\n').replace(/^## /gm, '### ').trim().slice(0, 4000);
  return { title: cleanTitle, details: cleanDetails };
}

/** Adds an idea at the end of the queue, or at the top with `next`. */
export function addIdea(text, idea, day, { next = false } = {}) {
  const parsed = parseIdeas(text);
  const taken = new Set(parsed.ideas.map((existing) => existing.id));
  let id = randomId();
  while (taken.has(id)) id = randomId();
  const added = { id, ...cleanIdea(idea), added: day, used: null, post: null };
  const ideas = next ? [added, ...parsed.ideas] : [...parsed.ideas, added];
  return { text: serialiseIdeas({ ...parsed, ideas }), idea: added };
}

/** Moves an idea to the top of the queue. Null if there's no such idea. */
export function moveIdeaToTop(text, id) {
  const parsed = parseIdeas(text);
  const idea = parsed.ideas.find((item) => item.id === id);
  if (!idea) return null;
  return serialiseIdeas({ ...parsed, ideas: [idea, ...parsed.ideas.filter((item) => item !== idea)] });
}

/** The idea at the top of the queue, skipping any an older file marked used, or null. */
export const nextIdea = (text) => parseIdeas(text).ideas.find((idea) => !idea.used) ?? null;

/** An idea as notes for the AI: its line, then its details. */
export const ideaNotes = (idea) => [idea.title, idea.details].filter(Boolean).join('\n\n');

/** Applies `change` to the idea with this id; a change that returns null deletes it. */
export function changeIdea(text, id, change) {
  const parsed = parseIdeas(text);
  const index = parsed.ideas.findIndex((idea) => idea.id === id);
  if (index < 0) return null;
  const next = change(parsed.ideas[index]);
  const ideas = [...parsed.ideas];
  if (next) ideas[index] = next;
  else ideas.splice(index, 1);
  return serialiseIdeas({ ...parsed, ideas });
}

// ---- style lessons -------------------------------------------------------------------------

// Lessons are bullets under `## <date>: <where they came from>` headings. Revisions in the
// admin add a section titled with the post and "(blog admin)"; lessons Keith adds himself go
// under "<date>: added by Keith". Edits change only the lines of the lesson concerned, so
// anything else written in the file by hand stays as it was.
const FROM_ADMIN = ' (blog admin)';
const BY_KEITH = 'added by Keith';

export function parseLessons(text) {
  const { preamble, sections: found, all } = sections(text);
  return {
    preamble,
    all,
    sections: found.map((section) => {
      const dated = /^(\d{4}-\d{2}-\d{2}):\s*(.*)$/.exec(section.heading);
      const title = dated ? dated[2] : section.heading;
      const lessons = [];
      section.body.forEach((line, index) => {
        const at = section.start + 1 + index;
        if (line.startsWith('- ')) lessons.push({ text: line.slice(2).trim(), start: at, end: at + 1 });
        // An indented line continues the bullet above it
        else if (lessons.length && /^\s+\S/.test(line) && lessons.at(-1).end === at) {
          lessons.at(-1).text += ` ${line.trim()}`;
          lessons.at(-1).end = at + 1;
        }
      });
      return {
        heading: section.heading,
        start: section.start,
        date: dated?.[1] ?? null,
        title: title.endsWith(FROM_ADMIN) ? title.slice(0, -FROM_ADMIN.length) : title,
        source: title.endsWith(FROM_ADMIN) ? 'revise' : title === BY_KEITH ? 'keith' : null,
        lessons: lessons.map((lesson) => ({ ...lesson, id: hash(`${section.heading}\n${lesson.text}`) })),
      };
    }),
  };
}

/** The lessons for the admin's page, newest section first. */
export function lessonList(text) {
  return parseLessons(text)
    .sections.filter((section) => section.lessons.length)
    .map(({ heading, date, title, source, lessons }) => ({ heading, date, title, source, lessons: lessons.map(({ id, text: lesson }) => ({ id, text: lesson })) }))
    .reverse();
}

const cleanLesson = (lesson) => {
  const text = oneLine(lesson).slice(0, 1000);
  if (!text) throw new Error('Write the lesson first.');
  return text;
};

/** Replaces the lesson with this id, or deletes it when `replacement` is null. Null if there's no such lesson. */
export function changeLesson(text, id, replacement) {
  const parsed = parseLessons(text);
  for (const section of parsed.sections) {
    const lesson = section.lessons.find((item) => item.id === id);
    if (!lesson) continue;
    const all = [...parsed.all];
    if (replacement !== null) {
      all.splice(lesson.start, lesson.end - lesson.start, `- ${cleanLesson(replacement)}`);
    } else if (section.lessons.length === 1) {
      // The section's last lesson: unless it holds other text, the heading goes with it
      const next = parsed.sections[parsed.sections.indexOf(section) + 1];
      const end = next ? next.start : all.length;
      const other = all.slice(section.start + 1, end).some((line, index) => {
        const at = section.start + 1 + index;
        return (at < lesson.start || at >= lesson.end) && line.trim();
      });
      if (other) all.splice(lesson.start, lesson.end - lesson.start);
      else all.splice(section.start, end - section.start);
    } else {
      all.splice(lesson.start, lesson.end - lesson.start);
    }
    return `${all.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
  }
  return null;
}

/** Adds lessons under a dated heading, joining today's section of the same name if it's the last one. */
export function addLessons(text, { day, title, lessons }) {
  const clean = lessons.map(cleanLesson);
  const heading = `${day}: ${title}`;
  const parsed = parseLessons(text ?? '');
  const last = parsed.sections.at(-1);
  const body = (text ?? '').trim() ? (text ?? '').replace(/\r\n/g, '\n').trimEnd() : LESSONS_PREAMBLE;
  const bullets = clean.map((lesson) => `- ${lesson}`).join('\n');
  if (last?.heading === heading) return `${body}\n${bullets}\n`;
  return `${body}\n\n## ${heading}\n\n${bullets}\n`;
}

export const keithLessons = (text, day, lesson) => addLessons(text, { day, title: BY_KEITH, lessons: [lesson] });
export const reviseLessons = (text, day, postTitle, lessons) => addLessons(text, { day, title: `${oneLine(postTitle) || 'Untitled'}${FROM_ADMIN}`, lessons });

// ---- GitHub --------------------------------------------------------------------------------

export class RepoFileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function github(url, token, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'keithvassallo-blog-admin',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
}

/** A file on main, as text with its sha; empty text and no sha when it doesn't exist yet. */
export async function readRepoFile({ repo, path, token }) {
  const response = await github(`https://api.github.com/repos/${repo}/contents/${path}?ref=main`, token);
  if (response.status === 404) return { text: '', sha: null };
  if (!response.ok) throw new RepoFileError(response.status, `GitHub didn't send ${path} (${response.status})`);
  const file = await response.json();
  return { text: Buffer.from(file.content ?? '', 'base64').toString('utf8'), sha: file.sha };
}

/**
 * Changes a file on main: `change` gets the current text and returns the new text, or null to
 * leave it alone. Returns the text as saved (or as found, if unchanged).
 */
export async function editRepoFile({ repo, path, token, message, change }) {
  for (let attempt = 1; ; attempt += 1) {
    const { text, sha } = await readRepoFile({ repo, path, token });
    const next = change(text);
    if (next === null || next === text) return { text, changed: false };
    const response = await github(`https://api.github.com/repos/${repo}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify({ message, content: Buffer.from(next, 'utf8').toString('base64'), branch: 'main', ...(sha ? { sha } : {}) }),
    });
    if (response.ok) return { text: next, changed: true };
    // Something else saved the file since it was read: read it again and redo the change
    if ((response.status === 409 || response.status === 422) && attempt < 4) continue;
    throw new RepoFileError(response.status, `GitHub didn't save ${path} (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}
