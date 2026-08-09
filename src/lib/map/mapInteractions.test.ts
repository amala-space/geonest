import { describe, expect, it } from 'vitest';
import { touchQueryBounds } from './mapInteractions';

describe('touchQueryBounds', () => {
	it('expands a tap point into a symmetric hit box', () => {
		expect(touchQueryBounds({ x: 100, y: 200 })).toEqual([
			[82, 182],
			[118, 218]
		]);
	});

	it('allows custom padding', () => {
		expect(touchQueryBounds({ x: 10, y: 20 }, 6)).toEqual([
			[4, 14],
			[16, 26]
		]);
	});
});
