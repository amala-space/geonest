import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	preview: {
		allowedHosts: process.env.PREVIEW_ALLOWED_HOSTS?.split(',') ?? []
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		{
			name: 'app:build-config',
			config: () => ({
				build: {
					chunkSizeWarningLimit: 1400
				}
			})
		},
		svelteTesting(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		}),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			includeAssets: ['robots.txt'],
			manifest: {
				name: 'Geonest',
				short_name: 'Geonest',
				description: 'Offline-friendly field GPS mapping for points, areas, and tracks.',
				theme_color: '#2e7d32',
				background_color: '#f7faf7',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				icons: [
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json,txt}'],
				navigateFallback: '/index.html'
			},
			devOptions: {
				enabled: true
			}
		})
	],
	test: {
		// scripts/lib holds tracked maintenance-script logic and its tests. Keep it
		// in the test glob so a fresh public checkout verifies that logic too.
		include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/lib/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true
	}
});
