import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import MapTopRightControls from './MapTopRightControls.svelte';

const noop = () => {};

const defaults = {
	isTouchPointer: false,
	basemapMode: 'street' as const,
	bearing: 0,
	onZoomIn: noop,
	onZoomOut: noop,
	onToggleBasemap: noop,
	onResetBearing: noop,
};

describe('MapTopRightControls', () => {
	describe('zoom buttons', () => {
		it('shows zoom in and out when isTouchPointer is false', () => {
			render(MapTopRightControls, { ...defaults, isTouchPointer: false });
			expect(screen.getByLabelText('Zoom in')).toBeTruthy();
			expect(screen.getByLabelText('Zoom out')).toBeTruthy();
		});

		it('hides both zoom buttons when isTouchPointer is true', () => {
			render(MapTopRightControls, { ...defaults, isTouchPointer: true });
			expect(screen.queryByLabelText('Zoom in')).toBeNull();
			expect(screen.queryByLabelText('Zoom out')).toBeNull();
		});

		it('fires onZoomIn when zoom-in button clicked', async () => {
			const onZoomIn = vi.fn();
			render(MapTopRightControls, { ...defaults, onZoomIn });
			await fireEvent.click(screen.getByLabelText('Zoom in'));
			expect(onZoomIn).toHaveBeenCalledOnce();
		});

		it('fires onZoomOut when zoom-out button clicked', async () => {
			const onZoomOut = vi.fn();
			render(MapTopRightControls, { ...defaults, onZoomOut });
			await fireEvent.click(screen.getByLabelText('Zoom out'));
			expect(onZoomOut).toHaveBeenCalledOnce();
		});

		it('zoom buttons absent regardless of other props when isTouchPointer=true', () => {
			render(MapTopRightControls, {
				...defaults,
				isTouchPointer: true,
				bearing: 90,
				basemapMode: 'satellite',
			});
			expect(screen.queryByLabelText('Zoom in')).toBeNull();
			expect(screen.queryByLabelText('Zoom out')).toBeNull();
		});
	});

	describe('basemap toggle', () => {
		it('always present on non-touch', () => {
			render(MapTopRightControls, { ...defaults, isTouchPointer: false });
			expect(screen.getByLabelText('Switch to satellite view')).toBeTruthy();
		});

		it('always present on touch', () => {
			render(MapTopRightControls, { ...defaults, isTouchPointer: true });
			expect(screen.getByLabelText('Switch to satellite view')).toBeTruthy();
		});

		it('shows switch-to-satellite label in street mode', () => {
			render(MapTopRightControls, { ...defaults, basemapMode: 'street' });
			expect(screen.getByLabelText('Switch to satellite view')).toBeTruthy();
		});

		it('shows switch-to-map label in satellite mode', () => {
			render(MapTopRightControls, { ...defaults, basemapMode: 'satellite' });
			expect(screen.getByLabelText('Switch to map view')).toBeTruthy();
		});

		it('fires onToggleBasemap when clicked', async () => {
			const onToggleBasemap = vi.fn();
			render(MapTopRightControls, { ...defaults, onToggleBasemap });
			await fireEvent.click(screen.getByLabelText('Switch to satellite view'));
			expect(onToggleBasemap).toHaveBeenCalledOnce();
		});
	});

	describe('compass button', () => {
		it('hidden when bearing is 0', () => {
			render(MapTopRightControls, { ...defaults, bearing: 0 });
			expect(screen.queryByLabelText('Reset map orientation')).toBeNull();
		});

		it('hidden when bearing is exactly 0.5', () => {
			render(MapTopRightControls, { ...defaults, bearing: 0.5 });
			expect(screen.queryByLabelText('Reset map orientation')).toBeNull();
		});

		it('hidden when bearing is exactly -0.5', () => {
			render(MapTopRightControls, { ...defaults, bearing: -0.5 });
			expect(screen.queryByLabelText('Reset map orientation')).toBeNull();
		});

		it('shown when bearing exceeds 0.5', () => {
			render(MapTopRightControls, { ...defaults, bearing: 0.6 });
			expect(screen.getByLabelText('Reset map orientation')).toBeTruthy();
		});

		it('shown when bearing is below -0.5', () => {
			render(MapTopRightControls, { ...defaults, bearing: -10 });
			expect(screen.getByLabelText('Reset map orientation')).toBeTruthy();
		});

		it('fires onResetBearing when clicked', async () => {
			const onResetBearing = vi.fn();
			render(MapTopRightControls, { ...defaults, bearing: 45, onResetBearing });
			await fireEvent.click(screen.getByLabelText('Reset map orientation'));
			expect(onResetBearing).toHaveBeenCalledOnce();
		});
	});

	describe('mode toggle', () => {
		it('uses touch layout wrapper when touch mode toggle is shown', () => {
			const { container } = render(MapTopRightControls, {
				...defaults,
				isTouchPointer: true,
				showModeToggle: true,
				onSetCaptureMode: vi.fn(),
			});
			const wrapper = container.querySelector('.top-right-controls');
			expect(wrapper).toBeTruthy();
			expect(wrapper?.classList.contains('touch-layout')).toBe(true);
		});

		it('uses desktop layout wrapper when desktop mode toggle is shown', () => {
			const { container } = render(MapTopRightControls, {
				...defaults,
				isTouchPointer: false,
				showModeToggle: true,
				onSetCaptureMode: vi.fn(),
			});
			const wrapper = container.querySelector('.top-right-controls');
			expect(wrapper).toBeTruthy();
			expect(wrapper?.classList.contains('desktop-layout')).toBe(true);
		});

		it('hidden by default (showModeToggle not set)', () => {
			render(MapTopRightControls, { ...defaults });
			expect(screen.queryByRole('group', { name: 'Capture mode' })).toBeNull();
		});

		it('hidden when showModeToggle=false even with onSetCaptureMode', () => {
			render(MapTopRightControls, { ...defaults, showModeToggle: false, onSetCaptureMode: vi.fn() });
			expect(screen.queryByRole('group', { name: 'Capture mode' })).toBeNull();
		});

		it('hidden when showModeToggle=true but onSetCaptureMode not provided', () => {
			render(MapTopRightControls, { ...defaults, showModeToggle: true });
			expect(screen.queryByRole('group', { name: 'Capture mode' })).toBeNull();
		});

		it('shown when showModeToggle=true and onSetCaptureMode provided', () => {
			render(MapTopRightControls, { ...defaults, showModeToggle: true, onSetCaptureMode: vi.fn() });
			expect(screen.getByRole('group', { name: 'Capture mode' })).toBeTruthy();
			expect(screen.getByLabelText('GPS mode')).toBeTruthy();
			expect(screen.getByLabelText('Click mode')).toBeTruthy();
		});

		it('GPS button has active class by default (captureMode defaults to gps)', () => {
			render(MapTopRightControls, { ...defaults, showModeToggle: true, onSetCaptureMode: vi.fn() });
			expect(screen.getByLabelText('GPS mode').classList.contains('active')).toBe(true);
			expect(screen.getByLabelText('Click mode').classList.contains('active')).toBe(false);
		});

		it('click button has active class when captureMode=click', () => {
			render(MapTopRightControls, {
				...defaults,
				showModeToggle: true,
				onSetCaptureMode: vi.fn(),
				captureMode: 'click',
			});
			expect(screen.getByLabelText('Click mode').classList.contains('active')).toBe(true);
			expect(screen.getByLabelText('GPS mode').classList.contains('active')).toBe(false);
		});

		it('fires onSetCaptureMode("gps") when GPS button clicked', async () => {
			const onSetCaptureMode = vi.fn();
			render(MapTopRightControls, {
				...defaults,
				showModeToggle: true,
				onSetCaptureMode,
				captureMode: 'click',
			});
			await fireEvent.click(screen.getByLabelText('GPS mode'));
			expect(onSetCaptureMode).toHaveBeenCalledWith('gps');
		});

		it('fires onSetCaptureMode("click") when click button clicked', async () => {
			const onSetCaptureMode = vi.fn();
			render(MapTopRightControls, {
				...defaults,
				showModeToggle: true,
				onSetCaptureMode,
				captureMode: 'gps',
			});
			await fireEvent.click(screen.getByLabelText('Click mode'));
			expect(onSetCaptureMode).toHaveBeenCalledWith('click');
		});
	});
});
