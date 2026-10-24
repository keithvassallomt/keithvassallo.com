// The Vue integration's app entrypoint (astro.config.mjs). Only the admin uses Vue.
import { router } from './router.js';

export default (app) => {
  app.use(router);
};
