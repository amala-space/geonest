import { describe, expect, it } from 'vitest';
import { planFeatureDedupe } from './dedupeRemoteFeatures.js';

describe('planFeatureDedupe', () => {
	it('keeps one identical feature and marks the rest for removal', () => {
		const plan = planFeatureDedupe([
			{
				id: 'b',
				type: 'point',
				name: 'Tree',
				geometryJson: '{"type":"Point","coordinates":[1,2]}',
				properties: {
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
					source: 'manual_point'
				},
				surveyorNameSnapshot: 'A',
				updatedAt: '2026-01-02T00:00:00.000Z'
			},
			{
				id: 'a',
				type: 'point',
				name: 'Tree',
				geometryJson: '{"type":"Point","coordinates":[1,2]}',
				properties: {
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
					source: 'manual_point'
				},
				surveyorNameSnapshot: 'A',
				updatedAt: '2026-01-01T00:00:00.000Z'
			}
		]);

		expect(plan.groupCount).toBe(1);
		expect(plan.removeCount).toBe(1);
		expect(plan.groups[0]?.keep.id).toBe('a');
		expect(plan.groups[0]?.remove.map((feature) => feature.id)).toEqual(['b']);
	});

	it('does not group features whose properties differ', () => {
		const plan = planFeatureDedupe([
			{
				id: 'a',
				type: 'point',
				name: 'Tree',
				geometryJson: '{"type":"Point","coordinates":[1,2]}',
				properties: {
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-01T00:00:00.000Z',
					source: 'manual_point'
				}
			},
			{
				id: 'b',
				type: 'point',
				name: 'Tree',
				geometryJson: '{"type":"Point","coordinates":[1,2]}',
				properties: {
					createdAt: '2026-01-01T00:00:00.000Z',
					updatedAt: '2026-01-03T00:00:00.000Z',
					source: 'manual_point'
				}
			}
		]);

		expect(plan.groupCount).toBe(0);
		expect(plan.removeCount).toBe(0);
	});
});
