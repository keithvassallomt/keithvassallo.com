// The admin's screens. Hash addresses (/admin#/weekly) keep every screen on the one static
// page, so CloudFront needs no rewrite rule and a link in an email opens the right screen.
import { createRouter, createWebHashHistory } from 'vue-router';
import PostsView from './views/PostsView.vue';
import ComingView from './views/ComingView.vue';
import OpenView from './views/OpenView.vue';
import MoreView from './views/MoreView.vue';
import SettingsView from './views/SettingsView.vue';
import SpendView from './views/SpendView.vue';
import WeeklyView from './views/WeeklyView.vue';

const coming = (path, title, stage, summary) => ({ path, component: ComingView, props: { title, stage, summary } });

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: PostsView },
    // Loaded when first opened: CodeMirror is most of the admin's weight
    { path: '/posts/:id', component: () => import('./views/EditorView.vue'), props: true, meta: { full: true } },
    { path: '/open/:slug', component: OpenView, props: true },
    { path: '/weekly', component: WeeklyView },
    coming('/ideas', 'Ideas', 7, 'A quick place to drop ideas from your phone. The weekly run and Generate both read them.'),
    coming('/lessons', 'Style lessons', 7, 'The lessons revisions have learned about your voice, to read, edit and delete.'),
    { path: '/spend', component: SpendView },
    { path: '/settings', component: SettingsView },
    { path: '/more', component: MoreView },
    { path: '/:rest(.*)', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
