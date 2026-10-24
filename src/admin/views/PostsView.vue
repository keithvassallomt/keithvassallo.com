<script setup>
// Every post, live or not: drafts from the admin's store, and the posts on main from
// /admin/posts.json, which each site build writes.
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api } from '../api.js';
import { PALETTE, siteData } from '../site.js';
import Icon from '../Icon.vue';

const STATUS = {
  draft: { label: 'Draft', color: 'var(--secondary)' },
  running: { label: 'AI running', color: 'var(--pink)' },
  scheduled: { label: 'Scheduled', color: 'var(--yellow)' },
  live: { label: 'Live', color: 'var(--green)' },
  bin: { label: 'In the bin', color: 'var(--red)' },
};
const SOURCES = { 'by-hand': 'By hand', weekly: 'Weekly', 'on-request': 'On request', repo: 'From the repo' };
const JOBS = { publish: 'Publishing', unpublish: 'Unpublishing', delete: 'Deleting', pin: 'Pinning' };
const FILTERS = [
  ['all', 'All'], ['draft', 'Drafts'], ['running', 'AI running'], ['scheduled', 'Scheduled'],
  ['live', 'Live'], ['pinned', 'Pinned'], ['bin', 'Bin'],
];

const router = useRouter();
const posts = ref([]);
const categories = ref([]);
const error = ref('');
const loading = ref(true);
const creating = ref(false);
const filter = ref('all');
const category = ref('');
const search = ref('');
const weekly = ref(null);

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const bin = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

onMounted(async () => {
  try {
    const [site, drafts, settings, week] = await Promise.all([siteData(), api('/posts'), api('/settings').catch(() => ({})), api('/weekly').catch(() => null)]);
    weekly.value = week;
    categories.value = site.categories;
    const pin = settings.pin ?? site.pin ?? {};
    // A post on main that has been opened in the admin shows once, as the admin's copy
    const claimed = new Set(drafts.posts.filter((post) => post.status !== 'bin').flatMap((post) => [post.liveSlug, post.repoSlug]).filter(Boolean));
    const fromRepo = site.posts
      .filter((post) => !claimed.has(post.slug))
      .map((post) => ({
        ...post,
        key: post.draft ? 'draft' : 'live',
        pinned: !post.draft && pin.slug === post.slug,
        source: 'repo',
        sub: post.draft ? 'In the repo, not published' : `Published ${day.format(new Date(post.pubDate))}`,
        date: day.format(new Date(post.updatedDate ?? post.pubDate)),
        to: `/open/${post.slug}`,
      }));
    const fromAdmin = drafts.posts.map((post) => {
      const key = post.status === 'bin' ? 'bin' : post.status === 'scheduled' ? 'scheduled' : post.liveSlug ? 'live' : 'draft';
      const working = ['queued', 'running'].includes(post.job?.status) && Date.now() - Date.parse(post.job.at ?? 0) < 45 * 60 * 1000;
      const sub = working
        ? `${JOBS[post.job.kind] ?? 'Working'}: ${post.job.stage}`
        : {
            bin: () => `Deleted ${bin.format(new Date(post.deletedAt))}, gone after ${bin.format(new Date(Date.parse(post.deletedAt) + 30 * 864e5))}`,
            scheduled: () => `Goes live ${post.scheduledFor?.replace('T', ', ')}`,
            live: () => (post.version > post.publishedVersion ? 'Live, with unpublished changes' : 'Published'),
            draft: () => 'Not published',
          }[key]();
      return {
        ...post,
        key,
        pinned: !!post.liveSlug && pin.slug === post.liveSlug,
        cover: post.coverUrl,
        sub,
        date: day.format(new Date(post.updated)),
        to: `/posts/${post.id}`,
      };
    });
    posts.value = [...fromAdmin, ...fromRepo].sort((a, b) => (b.updated ?? b.pubDate).localeCompare(a.updated ?? a.pubDate));
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
});

async function newPost() {
  creating.value = true;
  try {
    const post = await api('/posts', { method: 'POST', body: {} });
    router.push(`/posts/${post.id}`);
  } catch (cause) {
    error.value = cause.message;
    creating.value = false;
  }
}

async function unbin(post) {
  await api(`/posts/${post.id}/restore`, { method: 'POST' });
  router.push(`/posts/${post.id}`);
}

const categoryOf = (id) => {
  const found = categories.value.find((entry) => entry.id === id);
  const color = PALETTE[found?.color] ?? '#a3acb9';
  return { name: found?.name ?? 'No category', style: { color, background: `color-mix(in srgb, ${color} 12%, transparent)` } };
};

// The bin only shows under its own filter
const matches = (post, id) => (id === 'bin' ? post.key === 'bin' : post.key !== 'bin' && (id === 'all' || (id === 'pinned' ? post.pinned : post.key === id)));

const counts = computed(() => Object.fromEntries(FILTERS.map(([id]) => [id, posts.value.filter((post) => matches(post, id)).length])));

const shown = computed(() => {
  const words = search.value.trim().toLowerCase();
  return posts.value.filter(
    (post) =>
      matches(post, filter.value) &&
      (!category.value || post.category === category.value) &&
      (!words || `${post.title} ${post.description}`.toLowerCase().includes(words)),
  );
});

const linkFor = (post) => {
  if (post.key === 'bin') return { is: 'div' };
  if (post.to) return { is: RouterLink, to: post.to };
  if (post.href) return { is: 'a', href: post.href, target: '_blank', rel: 'noopener' };
  return { is: 'div' };
};
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="page-head">
        <h1 class="hd">Posts</h1>
        <p>Everything on the blog, live or not.</p>
      </div>
      <div class="actions">
        <label class="search">
          <Icon name="search" />
          <input v-model="search" class="inp" type="search" aria-label="Search posts" placeholder="Search titles and descriptions" />
        </label>
        <button type="button" class="btn btn-go" :disabled="creating" @click="newPost"><Icon name="plus" />New post</button>
      </div>
    </div>

    <div v-if="weekly" class="card banner">
      <span style="color: var(--pink)"><Icon name="calendar" /></span>
      <span v-if="weekly.settings.enabled">
        Next weekly draft <strong>{{ new Date(`${weekly.next}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }}, 09:00</strong>
        <span class="muted">· {{ weekly.settings.model ?? weekly.defaultModel }} · {{ weekly.settings.topic ? 'a topic is queued' : 'no topic queued, the AI picks one' }}</span>
      </span>
      <span v-else>The weekly run is off.</span>
      <RouterLink to="/weekly">Weekly settings</RouterLink>
    </div>

    <div class="filters">
      <button
        v-for="[id, label] in FILTERS"
        :key="id"
        type="button"
        class="filter"
        :class="{ on: filter === id }"
        :aria-pressed="filter === id"
        @click="filter = id"
      >
        {{ label }}<span>{{ counts[id] }}</span>
      </button>
      <select v-model="category" class="inp category" aria-label="Category">
        <option value="">All categories</option>
        <option v-for="entry in categories" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
      </select>
    </div>

    <p v-if="error" class="card notice" role="alert">{{ error }}</p>

    <div v-else class="card list">
      <div class="row heading muted" aria-hidden="true">
        <span></span><span>Post</span><span>Status</span><span>Category</span><span>Source</span><span>Updated</span>
      </div>
      <p v-if="loading" class="empty muted">Loading</p>
      <template v-else>
        <component :is="linkFor(post).is" v-for="post in shown" :key="post.id ?? post.slug" class="row post" v-bind="{ ...linkFor(post), is: undefined }">
          <img v-if="post.cover" :src="post.cover" alt="" class="thumb" loading="lazy" />
          <span v-else class="thumb none"></span>
          <span class="main">
            <span class="hd title">{{ post.title || 'Untitled' }}</span>
            <span class="muted desc">{{ post.description || 'No description yet' }}</span>
          </span>
          <span class="state">
            <span class="status" :style="{ color: STATUS[post.key].color }">{{ STATUS[post.key].label }}</span>
            <span class="muted sub"><Icon v-if="post.pinned" name="pin" class="pin" />{{ post.pinned ? 'Pinned. ' : '' }}{{ post.sub }}</span>
            <button v-if="post.key === 'bin'" type="button" class="btn small" @click="unbin(post)"><Icon name="restore" />Restore</button>
          </span>
          <span><span class="chip" :style="categoryOf(post.category).style">{{ categoryOf(post.category).name }}</span></span>
          <span class="sec small source">{{ SOURCES[post.source] ?? post.source }}</span>
          <span class="sec small date">{{ post.date }}</span>
        </component>
        <div v-if="!shown.length" class="empty">
          <template v-if="filter === 'bin'">
            <div class="hd">Nothing in the bin</div>
            <p class="muted">Deleted drafts stay here for 30 days, then go for good.</p>
          </template>
          <p v-else class="muted">No posts match.</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search {
  position: relative;
  width: 280px;
  max-width: 100%;
  color: var(--muted);
}

.search .ic {
  position: absolute;
  left: 12px;
  top: 13px;
}

.search .inp {
  padding-left: 40px;
}

.banner {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
}

.banner a {
  margin-left: auto;
  font-weight: 700;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--body);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}

.filter span {
  opacity: 0.7;
}

.filter.on {
  background: var(--text);
  border-color: var(--text);
  color: var(--ground);
}

.category {
  width: auto;
  min-width: 170px;
  margin-left: auto;
}

.notice {
  margin: 0;
  padding: 16px 18px;
  color: var(--red);
}

.list {
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 200px 140px 120px 100px;
  gap: 16px;
  align-items: center;
  padding: 14px 20px;
  border-top: 1px solid var(--line-soft);
  color: inherit;
  text-decoration: none;
}

.adm a.row {
  color: inherit;
}

.adm a.row:hover {
  background: #151a22;
  color: inherit;
}

.heading {
  border-top: 0;
  padding-top: 12px;
  padding-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.thumb {
  width: 96px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}

.thumb.none {
  border: 1px dashed var(--line-strong);
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title {
  font-size: 17px;
  font-weight: 700;
}

.desc {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.small {
  font-size: 14px;
}

.sub {
  font-size: 13px;
}

.sub .pin {
  width: 13px;
  height: 13px;
  color: var(--green);
  vertical-align: -2px;
  margin-right: 4px;
}

.btn.small {
  min-height: 36px;
  padding: 0 12px;
  margin-top: 4px;
}

.empty {
  padding: 48px 20px;
  text-align: center;
  border-top: 1px solid var(--line-soft);
  margin: 0;
}

.empty p {
  margin: 6px 0 0;
}

@media (max-width: 960px) {
  .heading {
    display: none;
  }

  .row {
    grid-template-columns: 64px minmax(0, 1fr);
    grid-template-areas:
      'thumb main'
      'thumb state'
      'thumb meta';
    gap: 4px 12px;
    align-items: start;
    padding: 12px 14px;
  }

  .thumb {
    grid-area: thumb;
    width: 64px;
    height: 64px;
    border-radius: 10px;
  }

  .main {
    grid-area: main;
  }

  .desc {
    display: none;
  }

  .state {
    grid-area: state;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: center;
  }

  .row > span:nth-child(4) {
    grid-area: meta;
  }

  .source,
  .date {
    display: none;
  }

  .category {
    margin-left: 0;
  }

  .filters {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin: 0 -16px;
    padding: 0 16px 2px;
  }

  .filter {
    flex: none;
  }
}
</style>
