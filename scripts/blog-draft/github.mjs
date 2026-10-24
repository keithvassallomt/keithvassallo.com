// Read-only GitHub tools for the research stage. They reach Keith's *public* repositories
// only, so nothing from a private repository can end up in a post, and they refuse the
// repositories listed in the private excluded-repos.txt.

const API = process.env.GITHUB_API_URL || 'https://api.github.com';
export const OWNER = 'keithvassallomt';

const README_LIMIT = 20_000;
const FILE_LIMIT = 30_000;
const PATCH_LIMIT = 3_000;

class ToolError extends Error {}

export function clip(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated: ${text.length - limit} more characters]`;
}

async function api(path, { raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'keithvassallo.com-blog-draft',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ToolError(`GitHub returned ${res.status} for ${path}`);
  return raw ? res.text() : res.json();
}

const encodePath = (path) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');

export function createGitHubTools(excluded) {
  const repos = new Map();

  async function publicRepo(name) {
    if (!/^[\w.-]+$/.test(name)) throw new ToolError(`"${name}" is not a repository name`);
    if (excluded.has(name.toLowerCase())) throw new ToolError(`${name} is excluded from the blog. Choose another subject.`);
    if (!repos.has(name)) repos.set(name, await api(`/repos/${OWNER}/${name}`));
    const repo = repos.get(name);
    if (!repo || repo.private) throw new ToolError(`There is no public repository named ${name}`);
    return repo;
  }

  const handlers = {
    async list_repositories() {
      const all = [];
      for (let page = 1; ; page++) {
        const batch = await api(`/users/${OWNER}/repos?type=owner&sort=pushed&per_page=100&page=${page}`);
        all.push(...batch);
        if (batch.length < 100) break;
      }
      return all
        .filter((repo) => !repo.private && !excluded.has(repo.name.toLowerCase()))
        .map((repo) => ({
          name: repo.name,
          description: repo.description,
          language: repo.language,
          topics: repo.topics,
          homepage: repo.homepage || null,
          fork: repo.fork,
          archived: repo.archived,
          created: repo.created_at.slice(0, 10),
          last_push: repo.pushed_at.slice(0, 10),
          stars: repo.stargazers_count,
          open_issues: repo.open_issues_count,
        }));
    },

    async get_repository({ repo: name }) {
      const repo = await publicRepo(name);
      const base = `/repos/${OWNER}/${name}`;
      const [readme, languages, root, commits, releases, tags] = await Promise.all([
        api(`${base}/readme`, { raw: true }),
        api(`${base}/languages`),
        api(`${base}/contents/`),
        api(`${base}/commits?per_page=15`),
        api(`${base}/releases?per_page=5`),
        api(`${base}/tags?per_page=5`),
      ]);
      return {
        name: repo.name,
        url: repo.html_url,
        description: repo.description,
        homepage: repo.homepage || null,
        license: repo.license?.spdx_id ?? null,
        fork: repo.fork,
        archived: repo.archived,
        created: repo.created_at.slice(0, 10),
        last_push: repo.pushed_at.slice(0, 10),
        default_branch: repo.default_branch,
        stars: repo.stargazers_count,
        languages: Object.keys(languages ?? {}),
        root: (root ?? []).map((entry) => `${entry.name}${entry.type === 'dir' ? '/' : ''}`),
        recent_commits: (commits ?? []).map(summariseCommit),
        releases: (releases ?? []).map((release) => ({
          tag: release.tag_name,
          name: release.name,
          published: release.published_at?.slice(0, 10) ?? null,
          prerelease: release.prerelease,
          notes: clip(release.body ?? '', 2_000),
        })),
        tags: (tags ?? []).map((tag) => tag.name),
        readme: readme ? clip(readme, README_LIMIT) : null,
      };
    },

    async list_directory({ repo, path }) {
      await publicRepo(repo);
      const entries = await api(`/repos/${OWNER}/${repo}/contents/${encodePath(path)}`);
      if (!Array.isArray(entries)) throw new ToolError(`${path || '/'} is not a directory in ${repo}`);
      return entries.map((entry) => ({ name: entry.name, type: entry.type, size: entry.size }));
    },

    async read_file({ repo, path }) {
      await publicRepo(repo);
      const file = await api(`/repos/${OWNER}/${repo}/contents/${encodePath(path)}`);
      if (!file) throw new ToolError(`${path} does not exist in ${repo}`);
      if (Array.isArray(file)) throw new ToolError(`${path} is a directory; use list_directory`);
      const text = file.content
        ? Buffer.from(file.content, 'base64').toString('utf8')
        : await api(`/repos/${OWNER}/${repo}/contents/${encodePath(path)}`, { raw: true });
      if (text.includes('\u0000')) throw new ToolError(`${path} is a binary file`);
      return clip(text, FILE_LIMIT);
    },

    async list_commits({ repo, path }) {
      await publicRepo(repo);
      const query = path ? `&path=${encodeURIComponent(path)}` : '';
      return ((await api(`/repos/${OWNER}/${repo}/commits?per_page=30${query}`)) ?? []).map(summariseCommit);
    },

    async get_commit({ repo, sha }) {
      await publicRepo(repo);
      const commit = await api(`/repos/${OWNER}/${repo}/commits/${encodeURIComponent(sha)}`);
      if (!commit) throw new ToolError(`No commit ${sha} in ${repo}`);
      let budget = 20_000;
      return {
        sha: commit.sha.slice(0, 10),
        url: commit.html_url,
        date: commit.commit.author?.date?.slice(0, 10) ?? null,
        message: clip(commit.commit.message, 4_000),
        files: commit.files.map((file) => {
          const patch = clip(file.patch ?? '', Math.min(PATCH_LIMIT, Math.max(budget, 0)));
          budget -= patch.length;
          return { file: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, patch };
        }),
      };
    },

    async list_issues({ repo, state }) {
      await publicRepo(repo);
      const issues = (await api(`/repos/${OWNER}/${repo}/issues?state=${state}&per_page=30`)) ?? [];
      return issues.map((issue) => ({
        number: issue.number,
        kind: issue.pull_request ? 'pull request' : 'issue',
        title: issue.title,
        state: issue.state,
        opened: issue.created_at.slice(0, 10),
        closed: issue.closed_at?.slice(0, 10) ?? null,
        comments: issue.comments,
        labels: issue.labels.map((label) => label.name),
        excerpt: clip(issue.body ?? '', 500),
      }));
    },

    async read_issue({ repo, number }) {
      await publicRepo(repo);
      const base = `/repos/${OWNER}/${repo}/issues/${number}`;
      const [issue, comments] = await Promise.all([api(base), api(`${base}/comments?per_page=20`)]);
      if (!issue) throw new ToolError(`No issue or pull request #${number} in ${repo}`);
      return {
        url: issue.html_url,
        title: issue.title,
        state: issue.state,
        author: issue.user.login,
        opened: issue.created_at.slice(0, 10),
        body: clip(issue.body ?? '', 10_000),
        comments: (comments ?? []).map((comment) => ({
          author: comment.user.login,
          date: comment.created_at.slice(0, 10),
          body: clip(comment.body ?? '', 2_000),
        })),
      };
    },
  };

  /** Runs one tool call and returns its result as text, reporting failures to the model. */
  async function run(name, args) {
    const handler = handlers[name];
    if (!handler) return JSON.stringify({ error: `Unknown tool ${name}` });
    try {
      const result = await handler(args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      if (!(error instanceof ToolError)) throw error;
      return JSON.stringify({ error: error.message });
    }
  }

  return { definitions: TOOL_DEFINITIONS, run };
}

function summariseCommit(commit) {
  return {
    sha: commit.sha.slice(0, 10),
    date: commit.commit.author?.date?.slice(0, 10) ?? null,
    message: clip(commit.commit.message.split('\n')[0], 200),
  };
}

const repoParam = { type: 'string', description: `Repository name under ${OWNER}, for example "loft"` };

function tool(name, description, properties = {}) {
  return {
    type: 'function',
    name,
    description,
    strict: true,
    parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
  };
}

const TOOL_DEFINITIONS = [
  tool(
    'list_repositories',
    `Lists ${OWNER}'s public repositories, most recently pushed first, with description, language, dates and whether each is a fork or archived.`,
  ),
  tool(
    'get_repository',
    'Overview of one repository: metadata, languages, top-level files, the 15 latest commits, recent releases and tags, and the README.',
    { repo: repoParam },
  ),
  tool('list_directory', 'Lists the files and folders at a path in a repository. Use "" for the root.', {
    repo: repoParam,
    path: { type: 'string', description: 'Folder path, or "" for the root' },
  }),
  tool('read_file', 'Reads a text file from a repository at its default branch. Long files are truncated.', {
    repo: repoParam,
    path: { type: 'string', description: 'File path, for example "src/main.py"' },
  }),
  tool('list_commits', 'The 30 most recent commits in a repository, optionally only those touching one path.', {
    repo: repoParam,
    path: { type: 'string', description: 'Limit to commits touching this path, or "" for all' },
  }),
  tool('get_commit', 'One commit in full: message, changed files and (truncated) diffs.', {
    repo: repoParam,
    sha: { type: 'string', description: 'Commit SHA, full or abbreviated' },
  }),
  tool('list_issues', 'The 30 most recently updated issues and pull requests in a repository.', {
    repo: repoParam,
    state: { type: 'string', enum: ['open', 'closed', 'all'] },
  }),
  tool('read_issue', 'One issue or pull request with its discussion.', {
    repo: repoParam,
    number: { type: 'integer' },
  }),
];
