import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const subpath = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const outDir = subpath ? `build/${subpath.replace(/^\//, '')}` : 'build';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: outDir,
			assets: outDir,
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		paths: {
			base: subpath || ''
		},
		prerender: {
			handleHttpError: 'warn'
		}
	}
};

export default config;
