import * as esbuild from 'esbuild';
import { spawn } from 'child_process';
import process from 'process';

const args = process.argv.slice(2);
const isDev = args.includes('--dev');
const isCheck = args.includes('--check');

const buildOptions = {
  entryPoints: {
    app: 'client/main.js',
    admin: 'client/admin.js',
  },
  outdir: 'public/dist',
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  sourcemap: true,
  minify: !isDev && !isCheck,
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
  loader: {
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.svg': 'text',
  },
};

if (isCheck) {
  try {
    await esbuild.build({
      ...buildOptions,
      write: false,
    });
    console.log('[check] Client build check passed');
    process.exit(0);
  } catch (err) {
    console.error('[check] Client build check failed:', err);
    process.exit(1);
  }
} else if (isDev) {
  console.log('[build] Starting esbuild in watch mode...');
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[build] esbuild watching client/ files...');
  console.log('[server] Starting server.js...');
  await import('./server.js');
} else {
  console.log('[build] Building production bundles...');
  await esbuild.build(buildOptions);
  console.log('[build] Production bundles created successfully in public/dist/');
}
