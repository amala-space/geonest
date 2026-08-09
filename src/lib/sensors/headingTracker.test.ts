import { describe, it, expect, beforeEach } from 'vitest';
import { HeadingTracker } from './headingTracker';

type DeviceOrientationEventWithWebkit = DeviceOrientationEvent & {
	webkitCompassHeading?: number;
};

function makeEvent(overrides: Partial<DeviceOrientationEventWithWebkit> = {}): DeviceOrientationEvent {
	return {
		alpha: null,
		beta: null,
		gamma: null,
		absolute: false,
		...overrides
	} as unknown as DeviceOrientationEventWithWebkit;
}

describe('HeadingTracker.getCompassHeading', () => {
	let tracker: HeadingTracker;
	const noop = () => {};

	beforeEach(() => {
		tracker = new HeadingTracker({ onHeading: noop });
	});

	it('prefers webkitCompassHeading (iOS)', () => {
		const event = makeEvent({ webkitCompassHeading: 90 });
		expect(tracker.getCompassHeading(event)).toBe(90);
	});

	it('uses absolute alpha when webkitCompassHeading missing (Android)', () => {
		const event = makeEvent({ absolute: true, alpha: 45 });
		expect(tracker.getCompassHeading(event)).toBeCloseTo((360 - 45) % 360);
	});

	it('returns 0 when alpha is 0 and absolute (edge: north)', () => {
		const event = makeEvent({ absolute: true, alpha: 0 });
		expect(tracker.getCompassHeading(event)).toBe(0);
	});

	it('returns null when not absolute and no webkitCompassHeading', () => {
		const event = makeEvent({ absolute: false, alpha: 100 });
		expect(tracker.getCompassHeading(event)).toBeNull();
	});

	it('returns null when alpha is null', () => {
		const event = makeEvent({ absolute: true, alpha: null });
		expect(tracker.getCompassHeading(event)).toBeNull();
	});
});

describe('HeadingTracker smoothing', () => {
	let tracker: HeadingTracker;
	let emitted: { heading: number; source: string }[];

	beforeEach(() => {
		emitted = [];
		tracker = new HeadingTracker({ onHeading: (u) => emitted.push(u) });
	});

	it('emits GPS heading when no device heading', () => {
		tracker.updateGpsHeading(90);
		expect(emitted).toHaveLength(1);
		expect(emitted[0].heading).toBe(90);
		expect(emitted[0].source).toBe('gps-movement');
	});

	it('emits device heading when available, source = device-orientation', () => {
		tracker.updateDeviceHeading(180);
		expect(emitted[0].source).toBe('device-orientation');
	});

	it('prefers device heading over GPS heading', () => {
		tracker.updateGpsHeading(90);
		tracker.updateDeviceHeading(270);
		const last = emitted[emitted.length - 1];
		expect(last.source).toBe('device-orientation');
		expect(last.heading).toBeCloseTo(270, 0);
	});

	it('handles 359→1 wraparound without jumping to ~180', () => {
		tracker.updateGpsHeading(359);
		tracker.updateGpsHeading(1);
		const headings = emitted.map((e) => e.heading);
		// Should not produce a ~180 degree jump
		const delta = Math.abs(headings[1] - headings[0]);
		const angularDelta = Math.min(delta, 360 - delta);
		expect(angularDelta).toBeLessThan(10);
	});

	it('does not emit when GPS heading is null', () => {
		tracker.updateGpsHeading(null);
		expect(emitted).toHaveLength(0);
	});
});
