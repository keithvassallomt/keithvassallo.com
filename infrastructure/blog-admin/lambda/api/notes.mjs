// Ideas and style lessons (docs/blog-admin-plan.md, stage 7): the two files in blog-private
// that the admin edits, notes/ideas.md and instructions/keith-feedback.md. Their format is in
// src/lib/private-notes.mjs. They're read and saved on GitHub with the token in Settings, so
// every change is a commit there and git keeps the history.
import {
  IDEAS_FILE,
  LESSONS_FILE,
  RepoFileError,
  addIdea as addToIdeas,
  changeIdea,
  changeLesson,
  cleanIdea,
  editRepoFile,
  keithLessons,
  lessonList,
  parseIdeas,
  readRepoFile,
} from '../../../../src/lib/private-notes.mjs';
import { token } from './github.mjs';
import { allPosts, createPost } from './posts.mjs';
import { HttpError, busy } from './store.mjs';

const { PRIVATE_REPO } = process.env;
const ukDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

async function auth() {
  const value = await token();
  if (!value) throw new HttpError(409, 'The admin has no GitHub token yet. Add one in Settings, then try again.');
  return value;
}

function githubFailure(error, file) {
  if (!(error instanceof RepoFileError)) return error;
  if (error.status === 401) return new HttpError(503, 'GitHub turned the token down. It may have expired: add a new one in Settings.');
  if (error.status === 403) return new HttpError(503, `The GitHub token can't save ${file} in blog-private. Check it has Contents read and write there.`);
  console.error(error);
  return new HttpError(503, `GitHub didn't answer for ${file}. Try again in a moment.`);
}

async function read(file) {
  try {
    return (await readRepoFile({ repo: PRIVATE_REPO, path: file, token: await auth() })).text;
  } catch (error) {
    throw githubFailure(error, file);
  }
}

/** Saves a change to a file. `change` returns null when what it should change isn't there. */
async function edit(file, message, change, missing) {
  let found = true;
  try {
    const { text } = await editRepoFile({
      repo: PRIVATE_REPO,
      path: file,
      token: await auth(),
      message,
      change: (current) => {
        const next = change(current);
        found = next !== null;
        return next;
      },
    });
    if (!found) throw new HttpError(409, missing);
    return text;
  } catch (error) {
    throw githubFailure(error, file);
  }
}

// ---- ideas ---------------------------------------------------------------------------------

const IDEA_GONE = 'That idea has changed or gone since the page loaded. The list is up to date now.';

/** The ideas, each with the draft it led to, if any. */
async function ideasWithDrafts(text) {
  const { ideas } = parseIdeas(text);
  const posts = ideas.some((idea) => idea.post) ? new Map((await allPosts(['id', 'title', 'status', 'job'])).map((post) => [post.id, post])) : new Map();
  return {
    ideas: ideas.map((idea) => {
      const post = idea.post ? posts.get(idea.post) : null;
      return { ...idea, draft: post ? { id: post.id, title: post.title, status: post.status, drafting: busy(post) && post.job.kind === 'generate' } : null };
    }),
    file: `https://github.com/${PRIVATE_REPO}/blob/main/${IDEAS_FILE}`,
  };
}

function validIdea(input = {}) {
  try {
    return cleanIdea({ title: input.title, details: input.details });
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

export const getIdeas = async () => ideasWithDrafts(await read(IDEAS_FILE));

export async function addIdea(input) {
  const idea = validIdea(input);
  return ideasWithDrafts(await edit(IDEAS_FILE, 'Added an idea from the blog admin', (text) => addToIdeas(text, idea, ukDay()).text));
}

export async function saveIdea(id, input) {
  const idea = validIdea(input);
  return ideasWithDrafts(await edit(IDEAS_FILE, 'Edited an idea in the blog admin', (text) => changeIdea(text, id, (current) => ({ ...current, ...idea })), IDEA_GONE));
}

export async function deleteIdea(id) {
  return ideasWithDrafts(await edit(IDEAS_FILE, 'Deleted an idea in the blog admin', (text) => changeIdea(text, id, () => null), IDEA_GONE));
}

/** A new post with the idea as its notes for the AI, and the idea marked with it. */
export async function draftIdea(id) {
  const idea = parseIdeas(await read(IDEAS_FILE)).ideas.find((item) => item.id === id);
  if (!idea) throw new HttpError(409, IDEA_GONE);
  const post = await createPost({ notes: [idea.title, idea.details].filter(Boolean).join('\n\n') });
  await edit(IDEAS_FILE, 'Started a draft from an idea in the blog admin', (text) => changeIdea(text, id, (current) => ({ ...current, used: ukDay(), post: post.id })), IDEA_GONE);
  return { id: post.id };
}

// ---- style lessons -------------------------------------------------------------------------

const LESSON_GONE = 'That lesson has changed or gone since the page loaded. The list is up to date now.';

const lessons = (text) => ({ sections: lessonList(text), history: `https://github.com/${PRIVATE_REPO}/commits/main/${LESSONS_FILE}` });

function validLesson(input = {}) {
  const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new HttpError(400, 'Write the lesson first.');
  if (text.length > 1000) throw new HttpError(400, 'Keep a lesson under 1,000 characters.');
  return text;
}

export const getLessons = async () => lessons(await read(LESSONS_FILE));

export async function addLesson(input) {
  const text = validLesson(input);
  return lessons(await edit(LESSONS_FILE, 'Added a style lesson from the blog admin', (current) => keithLessons(current, ukDay(), text)));
}

export async function saveLesson(id, input) {
  const text = validLesson(input);
  return lessons(await edit(LESSONS_FILE, 'Edited a style lesson in the blog admin', (current) => changeLesson(current, id, text), LESSON_GONE));
}

export async function deleteLesson(id) {
  return lessons(await edit(LESSONS_FILE, 'Deleted a style lesson in the blog admin', (current) => changeLesson(current, id, null), LESSON_GONE));
}
