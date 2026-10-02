import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = resolve(repositoryRoot, 'node_modules');

function getGitVersion(): string {
  try {
    return execSync('git describe --tags --always --dirty', {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'development';
  }
}

function getGitRepo(): string {
  try {
    const url = execSync('git config --get remote.origin.url', {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: 'fix-monaco-editor-subpath-exports',
          setup(build) {
            // esbuild applies monaco-editor's "./*" export map pattern to subpath imports
            // like "monaco-editor/esm/vs/editor/editor.api" and incorrectly doubles the
            // prefix → "esm/vs/esm/vs/…". Intercept and resolve to the real file paths.
            build.onResolve({ filter: /^monaco-editor\/esm\// }, args => ({
              path: resolve(nodeModules, args.path + '.js'),
            }));
          },
        },
      ],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(getGitVersion()),
    __APP_REPO__: JSON.stringify(getGitRepo()),
    __COUNTER_API_KEY__: JSON.stringify('ut_DWxb9JFaNXlgVAOGwfCxLt9kPbVgbA6t48HOJ4ts'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Prevent proxy buffering for SSE streams
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
