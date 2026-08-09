import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Only run the TypeScript sources; the compiled lib/*.test.js copies
		// would otherwise be picked up and run as duplicates.
		include: ['src/**/*.test.ts']
	}
});
