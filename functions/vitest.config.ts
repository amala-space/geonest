import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	// Keep Vite's tsconfig lookup inside the Functions package. CI runs this
	// package independently, before SvelteKit generates the web root tsconfig.
	root: fileURLToPath(new URL('.', import.meta.url)),
	test: {
		environment: 'node',
		// Only run the TypeScript sources; the compiled lib/*.test.js copies
		// would otherwise be picked up and run as duplicates.
		include: ['src/**/*.test.ts']
	}
});
