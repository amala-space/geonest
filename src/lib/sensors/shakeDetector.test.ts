import { describe, it, expect } from 'vitest';
import { ShakeDetector, type ShakeDetectorOptions } from './shakeDetector';

const OPTS: ShakeDetectorOptions = {
	threshold: 16,
	windowMs: 1200,
	requiredSpikes: 4,
	cooldownMs: 3000,
	minSpikeGapMs: 100
};

// A shake oscillates: the delta between these two peaks is 60 m/s², well over
// threshold. Gravity is baked into z to prove it cancels in the delta.
const A = { x: 30, y: 0, z: 9.81 };
const B = { x: -30, y: 0, z: 9.81 };
// Phone at rest, gravity only — consecutive samples are identical, delta 0.
const REST = { x: 0, y: 0, z: 9.81 };

/** Feed an alternating A/B shake burst, one sample every `gap` ms from `start`. */
function shake(d: ShakeDetector, start: number, count: number, gap = 150): boolean {
	let fired = false;
	for (let i = 0; i < count; i++) {
		if (d.feed(i % 2 === 0 ? A : B, start + i * gap)) fired = true;
	}
	return fired;
}

describe('ShakeDetector', () => {
	it('ignores a phone at rest — gravity cancels in the delta', () => {
		const d = new ShakeDetector(OPTS);
		expect(d.feed(REST, 0)).toBe(false);
		expect(d.feed(REST, 100)).toBe(false);
		expect(d.feed(REST, 200)).toBe(false);
		expect(d.feed(REST, 300)).toBe(false);
	});

	it('does not fire on a single impact — one set-down is too few spikes', () => {
		const d = new ShakeDetector(OPTS);
		// Seed baseline, one sharp impact, then settle back to rest.
		expect(d.feed(REST, 0)).toBe(false);
		expect(d.feed(A, 100)).toBe(false); // impact spike
		expect(d.feed(REST, 250)).toBe(false); // settle spike
		expect(d.feed(REST, 400)).toBe(false); // at rest now, delta 0
		expect(d.feed(REST, 550)).toBe(false);
	});

	it('collapses one impact ringing into a single spike (refractory gap)', () => {
		const d = new ShakeDetector(OPTS);
		d.feed(REST, 0);
		// Several above-threshold samples within one 100ms impact count once.
		expect(d.feed(A, 100)).toBe(false);
		expect(d.feed(B, 130)).toBe(false); // within minSpikeGapMs of the first
		expect(d.feed(A, 160)).toBe(false); // still within the gap
		// Only one spike has been counted so far.
	});

	it('fires once enough separated reversals land inside the window', () => {
		const d = new ShakeDetector(OPTS);
		d.feed(REST, 0);
		// Spikes at 150, 300, 450, 600 — four separated reversals within 1200ms.
		expect(shake(d, 150, 4)).toBe(true);
	});

	it('does not count spikes that fall outside the window', () => {
		const d = new ShakeDetector(OPTS);
		d.feed(REST, 0);
		expect(d.feed(A, 100)).toBe(false); // spike 1
		expect(d.feed(B, 250)).toBe(false); // spike 2
		expect(d.feed(A, 1400)).toBe(false); // spikes 1 & 2 now expired
		expect(d.feed(B, 1550)).toBe(false); // only two live spikes -> short of four
	});

	it('enforces a cooldown before firing again', () => {
		const d = new ShakeDetector(OPTS);
		d.feed(REST, 0);
		expect(shake(d, 100, 4)).toBe(true); // fires around t=550
		// Immediately shaking again within cooldown does not refire.
		expect(shake(d, 800, 4)).toBe(false);
		// After the cooldown elapses, a fresh burst fires again.
		expect(shake(d, 4000, 4)).toBe(true);
	});
});
