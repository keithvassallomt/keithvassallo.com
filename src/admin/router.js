// The admin's screens. Hash addresses (/admin#/weekly) keep every screen on the one static
// page, so CloudFront needs no rewrite rule and a link in an email opens the right screen.
import { createRouter, createWebHashHistory } from 'vue-router';
import PostsView from './views/PostsView.vue';
import IdeasView from './views/IdeasView.vue';
import LessonsView from './views/LessonsView.vue';
import OpenView from './views/OpenView.vue';
import MoreView from './views/MoreView.vue';
import SettingsView from './views/SettingsView.vue';
import SpendView from './views/SpendView.vue';
import WeeklyView from './views/WeeklyView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: PostsView },
    // Loaded when first opened: CodeMirror is most of the admin's weight
    { path: '/posts/:id', component: () => import('./views/EditorView.vue'), props: true, meta: { full: true } },
    { path: '/open/:slug', component: OpenView, props: true },
    { path: '/weekly', component: WeeklyView },
    { path: '/ideas', component: IdeasView },
    { path: '/lessons', component: LessonsView },
    { path: '/spend', component: SpendView },
    { path: '/settings', component: SettingsView },
    { path: '/more', component: MoreView },
    { path: '/:rest(.*)', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
