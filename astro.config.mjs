import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
// SITE and BASE_PATH are set by the GitHub Pages workflow; local development keeps serving from "/".
export default defineConfig({
  integrations: [react()],
  outDir: './build',
  devToolbar: { enabled: false },
  site: process.env.SITE || undefined,
  base: process.env.BASE_PATH || '/',
});
