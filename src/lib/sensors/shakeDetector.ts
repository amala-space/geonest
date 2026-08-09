import { Capacitor } from '@capacitor/core';

export type Acceleration = { x: number; y: number; z: number };

export type ShakeDetectorOptions = {
	/**
	 * Change in acceleration between consecutive samples (m/s²) that counts as a
	 * spike. Working on the delta rather than the absolute magnitude cancels the
	 * constant gravity vector, so it behaves the same whether the platform gives
	 * us gravity-excluded or gravity-included acceleration.
	 */
	threshold: number;
	/** Window in which repeated spikes accumulate toward a shake. */
	windowMs: number;
	/** Spikes required within the window to fire — guards against single bumps. */
	requiredSpikes: number;
	/** Quiet period after a shake before another can fire. */
	cooldownMs: number;
	/**
	 * Minimum gap between two counted spikes. One physical impact (a phone set on
	 * a table) rings across several consecutive samples; this refractory period
	 * collapses that burst into a single spike, so only genuinely separate jolts
	 * accumulate toward the required count.
	 */
	minSpikeGapMs: number;
};

// Tuned for a field app: users walk and drive while mapping, and set the phone
// down between readings. A single impact (a set-down) is one spike and must not
// trigger; only a sustained back-and-forth shake produces enough separated
// direction reversals to fire.
export const DEFAULT_SHAKE_OPTIONS: ShakeDetectorOptions = {
	threshold: 16,
	windowMs: 1200,
	requiredSpikes: 4,
	cooldownMs: 3000,
	minSpikeGapMs: 100
};

/**
 * Pure, stateful shake decision. Kept free of the Capacitor plugin so the
 * threshold/window logic is unit-testable by feeding samples directly.
 */
export class ShakeDetector {
	private prev: Acceleration | null = null;
	private spikes: number[] = [];
	// Timestamp of the last counted spike, for the refractory gap.
	private lastSpikeAt = Number.NEGATIVE_INFINITY;
	// Start far in the past so the first shake is not blocked by the cooldown.
	private lastShakeAt = Number.NEGATIVE_INFINITY;

	constructor(private readonly options: ShakeDetectorOptions = DEFAULT_SHAKE_OPTIONS) {}

	/** Feed one acceleration sample; returns true when a shake is recognized. */
	feed(acceleration: Acceleration, now: number): boolean {
		const prev = this.prev;
		this.prev = acceleration;
		// Need two samples to measure a change; the first only seeds the baseline.
		if (!prev) return false;

		const delta = Math.hypot(
			acceleration.x - prev.x,
			acceleration.y - prev.y,
			acceleration.z - prev.z
		);
		if (delta < this.options.threshold) return false;
		// Collapse one physical impact's sample-run into a single spike.
		if (now - this.lastSpikeAt < this.options.minSpikeGapMs) return false;
		this.lastSpikeAt = now;

		this.spikes.push(now);
		this.spikes = this.spikes.filter((t) => now - t <= this.options.windowMs);

		if (
			this.spikes.length >= this.options.requiredSpikes &&
			now - this.lastShakeAt > this.options.cooldownMs
		) {
			this.lastShakeAt = now;
			this.spikes = [];
			return true;
		}
		return false;
	}

	reset(): void {
		this.prev = null;
		this.spikes = [];
		this.lastSpikeAt = Number.NEGATIVE_INFINITY;
	}
}

/**
 * Subscribe to device acceleration and invoke `onShake` when a shake gesture is
 * detected. Native-only (web has no reliable, permissionless motion stream);
 * returns a disposer. Failures are swallowed so feedback never breaks the app.
 */
export async function startShakeDetection(
	onShake: () => void,
	options: ShakeDetectorOptions = DEFAULT_SHAKE_OPTIONS
): Promise<() => void> {
	if (!Capacitor.isNativePlatform()) return () => {};
	try {
		const { Motion } = await import('@capacitor/motion');
		const detector = new ShakeDetector(options);
		const handle = await Motion.addListener('accel', (event) => {
			const a = event.acceleration ?? event.accelerationIncludingGravity;
			if (!a) return;
			if (detector.feed({ x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }, Date.now())) {
				onShake();
			}
		});
		return () => {
			void handle.remove();
		};
	} catch {
		return () => {};
	}
}
