<script setup>
// Every post, live or not. Posts on main come from /admin/posts.json, which each site build
// writes; drafts kept in the admin join the list in stage 3.
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';

// The site palette, as in BlogShell.astro's --c-* tokens
const PALETTE = {
  green: '#8cd49c', orange: '#ffa657', cyan: '#56d4dd', purple: '#d2a8ff', blue: '#79c0ff',
  red: '#ff7b72', indigo: '#a5a6ff', yellow: '#f2cc60', pink: '#f2a0d6', lime: '#b9e06f',
};
const STATUS = {
  draft: { label: 'Draft', color: 'var(--secondary)' },
  running: { label: 'AI running', color: 'var(--pink)' },
  scheduled: { label: 'Scheduled', color: 'var(--yellow)' },
  live: { label: 'Live', color: 'var(--green)' },
};
const FILTERS = [
  ['all', 'All'], ['draft', 'Drafts'], ['running', 'AI running'], ['scheduled', 'Scheduled'],
  ['live', 'Live'], ['pinned', 'Pinned'], ['bin', 'Bin'],
];

const posts = ref([]);
const categories = ref([]);
const error = ref('');
const loading = ref(true);
const filter = ref('all');
const category = ref('');
const search = ref('');

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

onMounted(async () => {
  try {
    // no-cache revalidates against CloudFront, so a fresh deploy shows straight away
    const response = await fetch('/admin/posts.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`The post list didn't load (${response.status})`);
    const data = await response.json();
    categories.value = data.categories;
    posts.value = data.posts.map((post) => ({
      ...post,
      key: post.draft ? 'draft' : 'live',
      pinned: false,
      source: 'From the repo',
      sub: post.draft ? 'In the repo, not published' : `Published ${day.format(new Date(post.pubDate))}`,
      date: day.format(new Date(post.updatedDate ?? post.pubDate)),
    }));
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
});

const categoryOf = (id) => {
  const found = categories.value.find((entry) => entry.id === id);
  const color = PALETTE[found?.color] ?? '#a3acb9';
  return { name: found?.name ?? id, style: { color, background: `color-mix(in srgb, ${color} 12%, transparent)` } };
};

const matches = (post, id) => id === 'all' || (id === 'pinned' ? post.pinned : post.key === id);

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
        <RouterLink class="btn btn-go" to="/new"><Icon name="plus" />New post</RouterLink>
      </div>
    </div>

    <div class="card banner">
      <span style="color: var(--pink)"><Icon name="calendar" /></span>
      <span>The weekly run is off while it moves into the admin.</span>
      <RouterLink to="/weekly">Weekly run</RouterLink>
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
        <component
          :is="post.key === 'live' ? 'a' : 'div'"
          v-for="post in shown"
          :key="post.slug"
          class="row post"
          v-bind="post.key === 'live' ? { href: `/blog/${post.slug}`, target: '_blank', rel: 'noopener' } : {}"
        >
          <img v-if="post.cover" :src="post.cover" alt="" class="thumb" loading="lazy" />
          <span v-else class="thumb none"></span>
          <span class="main">
            <span class="hd title">{{ post.title }}</span>
            <span class="muted desc">{{ post.description }}</span>
          </span>
          <span class="state">
            <span class="status" :style="{ color: STATUS[post.key].color }">{{ STATUS[post.key].label }}</span>
            <span class="muted sub">{{ post.sub }}</span>
          </span>
          <span><span class="chip" :style="categoryOf(post.category).style">{{ categoryOf(post.category).name }}</span></span>
          <span class="sec small source">{{ post.source }}</span>
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
}

.sub,
.small {
  font-size: 14px;
}

.sub {
  font-size: 13px;
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
