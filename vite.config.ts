import { defineConfig, type ESBuildOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import legacy from '@vitejs/plugin-legacy';
import process from 'node:process';
import unocss from 'unocss/vite';

export default defineConfig(() => {
  return {
    plugins: [
      unocss({ inspector: false }),
      vue(),
      legacy({ renderLegacyChunks: false, modernPolyfills: true }),
    ],
    resolve: {
      alias: {
        '@': process.cwd() + '/src',
      },
    },
    esbuild: <ESBuildOptions>{
      legalComments: 'none',
    },
    server: {
      port: 8600,
      host: '0.0.0.0',
    },
    build: {
      chunkSizeWarningLimit: Number.MAX_SAFE_INTEGER,
    },
  };
});
