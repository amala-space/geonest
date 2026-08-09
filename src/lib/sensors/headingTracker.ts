import type { HeadingSource } from './gpsPositionStore';

type HeadingUpdate = {
	heading: number;
	source: HeadingSource;
};

type HeadingTrackerOptions = {
	onHeading: (update: HeadingUpdate) => void;
	onStatus?: (status: string) => void;
};

export class HeadingTracker {
	private onHeading: (update: HeadingUpdate) => void;
	private onStatus: (status: string) => void;
	private lastGpsHeading: number | null = null;
	private lastDeviceHeading: number | null = null;
	private lastSmoothedHeading: number | null = null;
	private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;

	constructor(options: HeadingTrackerOptions) {
		this.onHeading = options.onHeading;
		this.onStatus = options.onStatus ?? (() => {});
	}

	// Must be called from a user gesture on iOS (WKWebView + Safari).
	// No-op on Android and desktop.
	async requestOrientationPermission(): Promise<boolean> {
		const DOE = DeviceOrientationEvent as unknown as {
			requestPermission?: () => Promise<string>;
		};
		if (typeof DOE.requestPermission !== 'function') return true;
		const result = await DOE.requestPermission();
		if (result !== 'granted') {
			this.onStatus('orientation-permission-denied');
			return false;
		}
		return true;
	}

	startOrientation(): void {
		if (typeof DeviceOrientationEvent === 'undefined') {
			this.onStatus('device-orientation-unavailable');
			return;
		}
		this.orientationHandler = (event: DeviceOrientationEvent) => {
			const heading = this.getCompassHeading(event);
			if (heading !== null) {
				const wasNull = this.lastDeviceHeading === null;
				this.lastDeviceHeading = heading;
				if (wasNull) this.lastSmoothedHeading = null;
				this.emitBestHeading();
			}
		};
		window.addEventListener('deviceorientation', this.orientationHandler, true);
	}

	stopOrientation(): void {
		if (this.orientationHandler) {
			window.removeEventListener('deviceorientation', this.orientationHandler, true);
			this.orientationHandler = null;
		}
		this.lastDeviceHeading = null;
	}

	updateGpsHeading(heading: number | null): void {
		if (!Number.isFinite(heading) || heading === null) return;
		this.lastGpsHeading = heading;
		this.emitBestHeading();
	}

	// Exposed for testing — not called directly in production.
	updateDeviceHeading(heading: number): void {
		const wasNull = this.lastDeviceHeading === null;
		this.lastDeviceHeading = heading;
		// Reset smoothing state when device heading becomes available for the first time
		// so the GPS-smoothed value doesn't bleed into the device heading stream.
		if (wasNull) this.lastSmoothedHeading = null;
		this.emitBestHeading();
	}

	// Exposed for testing.
	getCompassHeading(event: DeviceOrientationEvent): number | null {
		const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
		if (Number.isFinite(e.webkitCompassHeading)) return e.webkitCompassHeading!;
		if (event.absolute === true && Number.isFinite(event.alpha) && event.alpha !== null) {
			return (360 - event.alpha) % 360;
		}
		return null;
	}

	private emitBestHeading(): void {
		const raw = this.lastDeviceHeading ?? this.lastGpsHeading;
		if (raw === null || !Number.isFinite(raw)) return;

		const smoothed = this.smooth(this.lastSmoothedHeading, raw);
		this.lastSmoothedHeading = smoothed;

		this.onHeading({
			heading: smoothed,
			source: this.lastDeviceHeading !== null ? 'device-orientation' : 'gps-movement'
		});
	}

	private smooth(prev: number | null, next: number): number {
		if (prev === null || !Number.isFinite(prev)) return next;
		const diff = ((next - prev + 540) % 360) - 180;
		return (prev + diff * 0.25 + 360) % 360;
	}
}
