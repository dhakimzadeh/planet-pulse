import { defineConfig } from 'vite';

// In dev there's no Vercel function, so proxy /api/flights straight to adsb.lol.
export default defineConfig({
  server: {
    proxy: {
      '/api/flights': {
        target: 'https://api.adsb.lol',
        changeOrigin: true,
        rewrite: (path) => {
          const q = new URL(path, 'http://x').searchParams;
          return `/v2/point/${q.get('lat')}/${q.get('lon')}/${q.get('r') ?? 250}`;
        },
      },
    },
  },
});
