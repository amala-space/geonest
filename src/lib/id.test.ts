import { describe, expect, it, vi } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
	it('uses crypto.randomUUID when available', () => {
		const spy = vi.fn(() => 'uuid-from-crypto');
		const original = globalThis.crypto;
		Object.defineProperty(globalThis, 'crypto', {
			value: { randomUUID: spy },
			configurable: true
		});

		expect(generateId()).toBe('uuid-from-crypto');
		expect(spy).toHaveBeenCalledOnce();

		Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
	});

	it('falls back to getRandomValues when crypto.randomUUID is unavailable', () => {
		const original = globalThis.crypto;
		Object.defineProperty(globalThis, 'crypto', {
			value: {
				getRandomValues: (arr: Uint8Array) => {
					for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 3) & 0xff;
					return arr;
				}
			},
			configurable: true
		});

		const id = generateId();
		expect(id.startsWith('id-')).toBe(true);
		expect(id.length).toBe('id-'.length + 32); // 16 bytes hex
		expect(id).toMatch(/^id-[0-9a-f]{32}$/);

		Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
	});

	it('throws when no secure random source is available', () => {
		const original = globalThis.crypto;
		Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });

		expect(() => generateId()).toThrow(/Secure random source/);

		Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
	});
});
