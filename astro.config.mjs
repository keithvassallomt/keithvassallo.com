// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  integrations: [icon()],
  site: 'https://keithvassallo.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    // Content-hashed assets for aggressive caching
    assets: '_astro',
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // Ensure all assets are content-hashed
          assetFileNames: '_astro/[name].[hash][extname]',
          chunkFileNames: '_astro/[name].[hash].js',
          entryFileNames: '_astro/[name].[hash].js',
        },
      },
    },
  },
});
