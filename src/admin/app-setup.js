// The Vue integration's app entrypoint (astro.config.mjs). Only the admin uses Vue.
// A page shared to the admin becomes an address the router understands, so this comes first
import './share-target.js';
import { router } from './router.js';

export default (app) => {
  app.use(router);
};
