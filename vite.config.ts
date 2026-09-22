import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * The only non-default concern is bundling. MintSplit pulls in Ant Design (a
 * large component library) plus React, Dexie, BigNumber and dayjs. Shipping that
 * as one chunk means every deploy invalidates the whole file for the browser
 * cache, so vendor code is split into its own long-lived chunks and only the
 * application chunk changes between releases.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    // The vendor chunks below are deliberately large (antd is ~300 KB gzipped);
    // the default 500 KB warning would fire on every build and hide real growth.
    chunkSizeWarningLimit: 900,
    sourcemap: false,
    rollupOptions: {
      output: {
        /**
         * Rolldown (Vite 8's bundler) requires the function form. Vendor code is
         * grouped by concern so a dependency bump invalidates one cache entry
         * instead of the whole bundle.
         *
         * Ant Design is deliberately *not* grouped here: it is the largest
         * dependency, and forcing it into a single chunk would defeat the
         * dynamic imports that keep the modal flows (Form, Upload, DatePicker)
         * out of the first paint.
         */
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react-dom/') || /\/react\//.test(id)) return 'react';
          if (id.includes('/dexie')) return 'storage';
          if (id.includes('bignumber.js')) return 'math';
          if (id.includes('/dayjs/')) return 'dates';
          return undefined;
        },
      },
    },
  },
});
