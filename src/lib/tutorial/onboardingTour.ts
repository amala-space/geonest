import { driver, type Driver, type Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import { m } from '$lib/paraglide/messages.js';

// Moves close button inside the title element so they share a flex row.
// CSS alone can't win against driver.js's per-element inline display styles.
function tourDriver(config: Config): Driver {
	return driver({
		...config,
		popoverClass: 'geotracker-tour',
		onHighlightStarted: (element) => {
			const active = document.activeElement as HTMLElement | null;
			const leavingInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
			const arrivingAtInput = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
			if (leavingInput && !arrivingAtInput) active.blur();
		},
		onPopoverRender: (popover) => {
			if (popover.title && popover.closeButton) {
				popover.title.appendChild(popover.closeButton);
			}
		}
	});
}

type OnboardingStage =
	| 'idle'
	| 'await_new_project_click'
	| 'await_project_create_submit'
	| 'await_project_page'
	| 'await_profile_setup'
	| 'await_project_point_training'
	| 'await_route_tutorial'
	| 'await_post_route_editing'
	| 'await_home_export_admin'
	| 'await_export_page'
	| 'await_project_home_back_after_export'
	| 'await_home_admin_btn'
	| 'await_admin_finish'
	| 'await_home_final'
	| 'completed'
	| 'skipped';

export type TutorialPreset =
	| 'full'
	| 'create-project'
	| 'project-basics'
	| 'route-recording'
	| 'geometry-editing'
	| 'export-admin';

const STORAGE_KEY = 'geotracker:onboarding:v1';
const LAUNCH_KEY = 'geotracker:onboarding:launch';
const STEP_KEY = 'geotracker:onboarding:step';

let activeDriver: Driver | null = null;

function getStage(): OnboardingStage {
	if (typeof localStorage === 'undefined') return 'idle';
	return (localStorage.getItem(STORAGE_KEY) as OnboardingStage | null) ?? 'idle';
}

function setStage(stage: OnboardingStage): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, stage);
}

function getStepIndex(): number {
	if (typeof localStorage === 'undefined') return 0;
	const v = localStorage.getItem(STEP_KEY);
	return v !== null ? parseInt(v, 10) || 0 : 0;
}

function setStepIndex(index: number): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STEP_KEY, String(index));
}

function clearStepIndex(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(STEP_KEY);
}

function teardownDriver() {
	if (!activeDriver) return;
	activeDriver.destroy();
	activeDriver = null;
}

export function resetOnboardingTour(): void {
	teardownDriver();
	clearStepIndex();
	setStage('idle');
}

function queueOnboardingLaunch(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(LAUNCH_KEY, '1');
}

export function prepareTutorialPreset(preset: TutorialPreset): void {
	teardownDriver();
	clearStepIndex();
	if (typeof localStorage === 'undefined') return;
	if (preset === 'full' || preset === 'create-project') {
		setStage('idle');
		queueOnboardingLaunch();
		return;
	}
	if (preset === 'project-basics') {
		setStage('await_project_page');
		return;
	}
	if (preset === 'route-recording') {
		setStage('await_route_tutorial');
		return;
	}
	if (preset === 'geometry-editing') {
		setStage('await_post_route_editing');
		return;
	}
	setStage('await_home_export_admin');
}

export function markOnboardingReadyForPointTraining(): void {
	if (getStage() !== 'await_profile_setup') return;
	setStage('await_project_point_training');
	// After profile setup, continue with capture-mode introduction.
	setStepIndex(1);
}

function consumeOnboardingLaunch(): boolean {
	if (typeof localStorage === 'undefined') return false;
	const queued = localStorage.getItem(LAUNCH_KEY) === '1';
	if (queued) {
		localStorage.removeItem(LAUNCH_KEY);
	}
	return queued;
}

export function maybeStartHomeOnboardingTour(): void {
	if (consumeOnboardingLaunch()) {
		setStage('idle');
	}

	const stage = getStage();
	if (stage === 'completed' || stage === 'skipped') return;
	if (stage !== 'idle' && stage !== 'await_new_project_click') return;

	const target = document.querySelector<HTMLElement>('[data-tour="home-new-project"]');
	if (!target) return;
	const hasExistingProjects = document.querySelector('[data-tour="home-project-menu"]') !== null;

	setStage('await_new_project_click');

	const onCreateClick = () => {
		setStage('await_project_create_submit');
		teardownDriver();
		target.removeEventListener('click', onCreateClick);
	};
	target.addEventListener('click', onCreateClick);

	activeDriver = tourDriver({
		allowClose: false,
		popoverClass: 'geotracker-tour',
		showProgress: false,
		onDestroyed: () => {
			target.removeEventListener('click', onCreateClick);
			if (getStage() === 'await_new_project_click') {
				setStage('skipped');
			}
		},
		steps: [
			{
				element: '[data-tour="home-new-project"]',
				popover: {
						title: hasExistingProjects ? m.tour_new_project_create_title() : m.tour_home_create_first_project_title(),
						description: m.tour_home_create_first_project_desc(),
						side: 'top',
						align: 'center',
						showButtons: ['close']
					}
				}
		]
	});

	activeDriver.drive();
}

export function maybeStartNewProjectOnboardingTour(): void {
	if (getStage() !== 'await_project_create_submit') return;

	const form = document.querySelector<HTMLFormElement>('[data-tour="new-project-form"]');
	if (!form) return;

	const onSubmit = () => {
		setStage('await_project_page');
		teardownDriver();
		form.removeEventListener('submit', onSubmit);
	};
	form.addEventListener('submit', onSubmit);

	activeDriver = tourDriver({
		allowClose: true,
		popoverClass: 'geotracker-tour',
		showProgress: true,
		progressText: '1 / 2',
		doneBtnText: 'Next',
		onDestroyed: () => {
			form.removeEventListener('submit', onSubmit);
			if (getStage() === 'await_project_create_submit') {
				setStage('skipped');
			}
		},
		steps: [
			{
				element: '[data-tour="new-project-name"]',
				popover: {
					title: m.tour_new_project_name_title(),
					description: m.tour_new_project_name_desc(),
					side: 'bottom',
					align: 'start',
					showButtons: ['next', 'close'],
					onNextClick: (_element, _step, options) => {
						setTimeout(() => options.driver.moveNext(), 160);
					}
				}
			},
			{
				element: '[data-tour="new-project-submit"]',
				popover: {
					title: m.tour_new_project_create_title(),
					description: m.tour_new_project_create_desc(),
					side: 'top',
					align: 'center',
					showButtons: ['previous', 'close']
				}
			}
		]
	});

	activeDriver.drive();
}

export function maybeStartProjectPageOnboardingTour(): void {
	const stage = getStage();
	if (stage !== 'await_project_page' && stage !== 'await_project_point_training') return;

	type ProjectStep = {
		element: string;
		title: string;
		description: string;
		side: 'top' | 'right' | 'bottom' | 'left';
		align: 'start' | 'center' | 'end';
		requireTargetClick?: boolean;
		profilePrerequisite?: boolean;
		routeHandoff?: boolean;
		showButtons?: ('next' | 'previous' | 'close')[];
		sideEffectOnNext?: () => void;
	};

	const steps: ProjectStep[] = [
		{
			element: '[data-tour="project-profile-menu"]',
			title: m.tour_project_profile_required_title(),
			description: m.tour_project_profile_required_desc(),
			side: 'left',
			align: 'center',
			profilePrerequisite: true
		},
		{
			element: '[data-tour="project-capture-mode"]',
			title: m.tour_project_capture_modes_title(),
			description: m.tour_project_capture_modes_desc(),
			side: 'bottom',
			align: 'start'
		},
		{
			element: '[data-tour="project-mode-click"]',
			title: m.tour_project_switch_click_title(),
			description: m.tour_project_switch_click_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="action-point-click"]',
			title: m.tour_project_click_point_title(),
			description: m.tour_project_click_point_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '.maplibregl-canvas',
			title: m.tour_project_place_point_title(),
			description: m.tour_project_place_point_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="feature-save-name"]',
			title: m.tour_project_point_name_title(),
			description: m.tour_project_point_name_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="feature-save-notes"]',
			title: m.tour_project_point_desc_title(),
			description: m.tour_project_point_desc_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="feature-save-coords"]',
			title: m.tour_project_point_coords_title(),
			description: m.tour_project_point_coords_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="feature-save-submit"]',
			title: m.tour_project_save_point_title(),
			description: m.tour_project_save_point_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="action-area-click"]',
			title: m.tour_project_click_area_title(),
			description: m.tour_project_click_area_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '.maplibregl-canvas',
			title: m.tour_project_area_corners_title(),
			description: m.tour_project_area_corners_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="action-area-finish"]',
			title: m.tour_project_area_finish_title(),
			description: m.tour_project_area_finish_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="feature-save-name"]',
			title: m.tour_project_area_name_title(),
			description: m.tour_project_area_name_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="feature-save-notes"]',
			title: m.tour_project_area_desc_title(),
			description: m.tour_project_area_desc_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="feature-save-submit"]',
			title: m.tour_project_save_area_title(),
			description: m.tour_project_save_area_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="project-capture-mode"]',
			title: m.tour_project_gps_vs_click_title(),
			description: m.tour_project_gps_vs_click_desc(),
			side: 'bottom',
			align: 'start',
			showButtons: ['previous', 'next', 'close'],
			sideEffectOnNext: () => {
				document.querySelector<HTMLElement>('[data-tour="project-mode-gps"]')?.click();
			}
		},
		{
			element: '[data-tour="action-route-gps"]',
			title: m.tour_project_gps_route_title(),
			description: m.tour_project_gps_route_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true,
			routeHandoff: true
		},
		{
			element: '[data-tour="project-features-toggle"]',
			title: m.tour_project_features_title(),
			description: m.tour_project_features_desc(),
			side: 'bottom',
			align: 'end',
			requireTargetClick: true
		},
		{
			element: '[data-tour="action-point-gps"]',
			title: m.tour_project_gps_point_area_title(),
			description: m.tour_project_gps_point_area_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: false
		}
	];

	const waitForElement = async (selector: string, retries = 20, delayMs = 120): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	const runProfilePrerequisiteFlow = async (): Promise<void> => {
		const profileBtn = await waitForElement('[data-tour="project-profile-menu"]');
		if (!profileBtn) {
			setStage('skipped');
			return;
		}

		let handled = false;
		let transitioningToProfilesMenu = false;
		const onProfileBtnClick = () => {
			if (handled) return;
			handled = true;
			transitioningToProfilesMenu = true;
			profileBtn.removeEventListener('click', onProfileBtnClick);
			teardownDriver();
			void (async () => {
				const goProfilesBtn = await waitForElement('[data-tour="project-go-profiles"]');
				if (!goProfilesBtn) {
					transitioningToProfilesMenu = false;
					setStage('skipped');
					return;
				}
				const onGoProfilesClick = () => {
					setStage('await_profile_setup');
					teardownDriver();
					goProfilesBtn.removeEventListener('click', onGoProfilesClick);
				};
				goProfilesBtn.addEventListener('click', onGoProfilesClick);
				activeDriver = tourDriver({
					allowClose: true,
					popoverClass: 'geotracker-tour',
					showProgress: false,
					steps: [
						{
							element: '[data-tour="project-go-profiles"]',
							popover: {
								title: m.tour_profile_open_profiles_title(),
								description: m.tour_profile_open_profiles_desc(),
								side: 'left',
								align: 'center',
								showButtons: ['close']
							}
						}
					],
					onDestroyed: () => {
						goProfilesBtn.removeEventListener('click', onGoProfilesClick);
						if (getStage() !== 'await_profile_setup') {
							setStage('skipped');
						}
					}
				});
				activeDriver.drive();
			})();
		};
		profileBtn.addEventListener('click', onProfileBtnClick);

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: false,
			steps: [
				{
					element: '[data-tour="project-profile-menu"]',
					popover: {
						title: m.tour_profile_open_menu_title(),
						description: m.tour_profile_open_menu_desc(),
						side: 'left',
						align: 'center',
						showButtons: ['close']
					}
				}
			],
			onDestroyed: () => {
				profileBtn.removeEventListener('click', onProfileBtnClick);
				if (transitioningToProfilesMenu) return;
				if (getStage() !== 'await_profile_setup') {
					setStage('skipped');
				}
			}
		});
		activeDriver.drive();
	};

	const runStep = async (index: number) => {
		if (index >= steps.length) {
			clearStepIndex();
			setStage('completed');
			return;
		}

		// Profile setup -> project page is a route round-trip, so capture state resets.
		// In point training, skip explicit point-tool tutorial click and go to practical task.
		if (stage === 'await_project_point_training' && index === 3) {
			await runStep(index + 1);
			return;
		}
		if (stage === 'await_project_point_training' && index === 4) {
			document.querySelector<HTMLElement>('[data-tour="action-point-click"]')?.click();
		}

		setStepIndex(index);

		const current = steps[index];
		const target = await waitForElement(current.element);
		if (!target) {
			// Skip unavailable UI step and continue instead of ending the full tutorial early.
			await runStep(index + 1);
			return;
		}
		if (current.profilePrerequisite) {
			const hasProfile = target.getAttribute('data-has-profile') === '1';
			if (!hasProfile) {
				setStepIndex(index + 1);
				await runProfilePrerequisiteFlow();
				return;
			}
			await runStep(index + 1);
			return;
		}

		let handled = false;
		const finishAsSkipped = () => {
			if (!handled) {
				clearStepIndex();
				setStage('skipped');
			}
		};
		const finishAndAdvance = () => {
			if (handled) return;
			handled = true;
			target.removeEventListener('click', onTargetClick);
			teardownDriver();
			if (current.routeHandoff) {
				clearStepIndex();
				setStage('await_route_tutorial');
				return;
			}
			void runStep(index + 1);
		};
		const onTargetClick = () => {
			finishAndAdvance();
		};

		if (current.requireTargetClick) {
			target.addEventListener('click', onTargetClick, { once: true });
		}

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: true,
			progressText: `${index + 1} / ${steps.length}`,
			doneBtnText: 'Next',
			onDestroyed: () => {
				target.removeEventListener('click', onTargetClick);
				finishAsSkipped();
			},
			steps: [
				{
					element: current.element,
					popover: {
						title: current.title,
						description: current.description,
						side: current.side,
						align: current.align,
						showButtons: current.requireTargetClick ? ['previous', 'close'] : (current.showButtons ?? ['previous', 'next', 'close']),
						onNextClick: (_element, _step, options) => {
							if (current.requireTargetClick) return;
							handled = true;
							current.sideEffectOnNext?.();
							options.driver.destroy();
							if (current.routeHandoff) {
								clearStepIndex();
								setStage('await_route_tutorial');
								return;
							}
							void runStep(index + 1);
						},
						onCloseClick: (_element, _step, options) => {
							clearStepIndex();
							setStage('skipped');
							handled = true;
							options.driver.destroy();
						}
					}
				}
			]
		});

		activeDriver.drive();
	};

	void runStep(getStepIndex());
}

export function maybeStartProfilesOnboardingTour(): void {
	if (getStage() !== 'await_profile_setup') return;

	const waitForElement = async (selector: string, retries = 20, delayMs = 120): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	void (async () => {
		const addNewBtn = await waitForElement('[data-tour="profiles-add-new"]');
		if (!addNewBtn) {
			return;
		}

		let transitioningToProfileDetails = false;
		const onAddClick = () => {
			transitioningToProfileDetails = true;
			addNewBtn.removeEventListener('click', onAddClick);
			teardownDriver();
			void (async () => {
				const nameInput = await waitForElement('[data-tour="profiles-name-input"]');
				const saveBtn = await waitForElement('[data-tour="profiles-save-new"]');
				if (!nameInput || !saveBtn) {
					transitioningToProfileDetails = false;
					return;
				}

				let handledSave = false;
				const onSaveClick = () => {
					handledSave = true;
					setStage('await_project_point_training');
					teardownDriver();
					saveBtn.removeEventListener('click', onSaveClick);
				};
				saveBtn.addEventListener('click', onSaveClick);

				activeDriver = tourDriver({
					allowClose: true,
					popoverClass: 'geotracker-tour',
					showProgress: false,
					steps: [
						{
							element: '[data-tour="profiles-name-input"]',
							popover: {
								title: m.tour_profiles_create_name_title(),
								description: m.tour_profiles_create_name_desc(),
								side: 'bottom',
								align: 'center',
								showButtons: ['next', 'close'],
								onNextClick: (_element, _step, options) => {
									setTimeout(() => options.driver.moveNext(), 160);
								}
							}
						},
						{
							element: '[data-tour="profiles-save-new"]',
							popover: {
								title: m.tour_profiles_save_title(),
								description: m.tour_profiles_save_desc(),
								side: 'top',
								align: 'center',
								showButtons: ['previous', 'close']
							}
						}
					],
					onDestroyed: () => {
						saveBtn.removeEventListener('click', onSaveClick);
						if (!handledSave && getStage() === 'await_profile_setup') {
							setStage('skipped');
						}
					}
				});
				activeDriver.drive();
			})();
		};

		addNewBtn.addEventListener('click', onAddClick);
		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: false,
			steps: [
				{
					element: '[data-tour="profiles-add-new"]',
					popover: {
						title: m.tour_profiles_add_title(),
						description: m.tour_profiles_add_desc(),
						side: 'top',
						align: 'center',
						showButtons: ['close']
					}
				}
			],
			onDestroyed: () => {
				addNewBtn.removeEventListener('click', onAddClick);
				if (transitioningToProfileDetails) return;
				if (getStage() === 'await_profile_setup') {
					setStage('skipped');
				}
			}
		});
		activeDriver.drive();
	})();
}

export function maybeStartTrackRouteOnboardingTour(): void {
	if (getStage() !== 'await_route_tutorial') return;

	const waitForElement = async (selector: string, retries = 30, delayMs = 150): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	void (async () => {
		const startBtn = await waitForElement('[data-tour="track-start"]');
		if (!startBtn) return;

		let handledStart = false;
		const onStartClick = () => {
			handledStart = true;
			startBtn.removeEventListener('click', onStartClick);
			teardownDriver();
			void (async () => {
				const finishBtn = await waitForElement('[data-tour="track-finish"]');
				const cancelBtn = await waitForElement('[data-tour="project-back-home"]');
				if (!finishBtn || !cancelBtn) {
					setStage('completed');
					return;
				}

				const onCancelClick = () => {
					cancelBtn.removeEventListener('click', onCancelClick);
					teardownDriver();
				};
				cancelBtn.addEventListener('click', onCancelClick);

				activeDriver = tourDriver({
					allowClose: true,
					popoverClass: 'geotracker-tour',
					showProgress: false,
					steps: [
						{
							element: '[data-tour="track-stats"]',
							popover: {
								title: m.tour_track_record_path_title(),
								description: m.tour_track_record_path_desc(),
								side: 'top',
								align: 'center',
								showButtons: ['next', 'close'],
								onNextClick: (_element, _step, options) => options.driver.moveNext()
							}
						},
						{
							element: '[data-tour="track-finish"]',
							popover: {
								title: m.tour_track_finish_title(),
								description: m.tour_track_finish_desc(),
								side: 'top',
								align: 'center',
								showButtons: ['previous', 'next', 'close'],
								onNextClick: (_element, _step, options) => options.driver.moveNext()
							}
						},
						{
							element: '[data-tour="project-back-home"]',
							popover: {
								title: m.tour_track_cancel_title(),
								description: m.tour_track_cancel_desc(),
								side: 'top',
								align: 'center',
								showButtons: ['previous', 'next', 'close'],
								onNextClick: (_element, _step, options) => options.driver.moveNext()
							}
						},
						{
							popover: {
								title: m.tour_track_save_result_title(),
								description: m.tour_track_save_result_desc(),
								showButtons: ['previous', 'close']
							}
						}
					],
					onDestroyed: () => {
						cancelBtn.removeEventListener('click', onCancelClick);
						if (getStage() === 'await_route_tutorial') {
							setStage('await_post_route_editing');
						}
					}
				});
				activeDriver.drive();
			})();
		};
		startBtn.addEventListener('click', onStartClick);

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: false,
			steps: [
				{
					element: '[data-tour="track-start"]',
					popover: {
						title: m.tour_track_start_title(),
						description: m.tour_track_start_desc(),
						side: 'top',
						align: 'center',
						showButtons: ['close']
					}
				}
			],
			onDestroyed: () => {
				startBtn.removeEventListener('click', onStartClick);
				if (!handledStart && getStage() === 'await_route_tutorial') {
					setStage('skipped');
				}
			}
		});
		activeDriver.drive();
	})();
}

export function maybeStartPostRouteEditingTour(): void {
	if (getStage() !== 'await_post_route_editing') return;

	type EditStep = {
		element?: string;
		title: string;
		description: string;
		side: 'top' | 'right' | 'bottom' | 'left';
		align: 'start' | 'center' | 'end';
		requireTargetClick?: boolean;
	};

	const steps: EditStep[] = [
		{
			element: '[data-tour="gps-pill"]',
			title: m.tour_edit_satellite_pill_title(),
			description: m.tour_edit_satellite_pill_desc(),
			side: 'right',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="project-features-toggle"]',
			title: m.tour_edit_open_saved_title(),
			description: m.tour_edit_open_saved_desc(),
			side: 'bottom',
			align: 'start',
			requireTargetClick: true
		},
		{
			element: '[data-tour="feature-more-actions"]',
			title: m.tour_edit_geometry_actions_title(),
			description: m.tour_edit_geometry_actions_desc(),
			side: 'left',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="feature-edit-geometry"]',
			title: m.tour_edit_enter_mode_title(),
			description: m.tour_edit_enter_mode_desc(),
			side: 'left',
			align: 'center',
			requireTargetClick: true
		},
		{
			title: m.tour_edit_alt_entry_title(),
			description: m.tour_edit_alt_entry_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '.maplibregl-canvas',
			title: m.tour_edit_reposition_vertex_title(),
			description: m.tour_edit_reposition_vertex_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '.maplibregl-canvas',
			title: m.tour_edit_split_edge_title(),
			description: m.tour_edit_split_edge_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '.maplibregl-canvas',
			title: m.tour_edit_delete_vertex_title(),
			description: m.tour_edit_delete_vertex_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: false
		},
		{
			element: '[data-tour="edit-done"]',
			title: m.tour_edit_finish_title(),
			description: m.tour_edit_finish_desc(),
			side: 'top',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="project-back-home"]',
			title: m.tour_edit_next_export_admin_title(),
			description: m.tour_edit_next_export_admin_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: true
		}
	];

	const waitForElement = async (selector: string, retries = 30, delayMs = 150): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	const runStep = async (index: number): Promise<void> => {
		if (index >= steps.length) {
			setStage('completed');
			return;
		}
		const current = steps[index];

		// Floating step (no element)
		if (!current.element) {
			let handled = false;
			activeDriver = tourDriver({
				allowClose: true,
				popoverClass: 'geotracker-tour',
				showProgress: true,
				progressText: `${index + 1} / ${steps.length}`,
				doneBtnText: 'Next',
				steps: [
					{
						popover: {
							title: current.title,
							description: current.description,
							showButtons: index > 0 ? ['previous', 'next', 'close'] : ['next', 'close'],
							onNextClick: (_element, _step, options) => {
								handled = true;
								options.driver.destroy();
								void runStep(index + 1);
							},
							onCloseClick: (_element, _step, options) => {
								setStage('skipped');
								handled = true;
								options.driver.destroy();
							}
						}
					}
				],
				onDestroyed: () => {
					if (!handled && getStage() === 'await_post_route_editing') {
						setStage('skipped');
					}
				}
			});
			activeDriver.drive();
			return;
		}

		const target = await waitForElement(current.element);
		if (!target) {
			await runStep(index + 1);
			return;
		}

		let handled = false;
		const onTargetClick = () => {
			if (!current.requireTargetClick || handled) return;
			handled = true;
			target.removeEventListener('click', onTargetClick);
			teardownDriver();
			if (current.element === '[data-tour="project-back-home"]') {
				setStage('await_home_export_admin');
				return;
			}
			void runStep(index + 1);
		};
		if (current.requireTargetClick) {
			target.addEventListener('click', onTargetClick, { once: true });
		}

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: true,
			progressText: `${index + 1} / ${steps.length}`,
			doneBtnText: 'Next',
			steps: [
				{
					element: current.element,
					popover: {
						title: current.title,
						description: current.description,
						side: current.side,
						align: current.align,
							showButtons: current.requireTargetClick
								? (index > 0 ? ['previous', 'close'] : ['close'])
								: (index > 0 ? ['previous', 'next', 'close'] : ['next', 'close']),
						onNextClick: (_element, _step, options) => {
							if (current.requireTargetClick) return;
							handled = true;
							options.driver.destroy();
							if (current.element === '[data-tour="project-back-home"]') {
								setStage('await_home_export_admin');
								return;
							}
							void runStep(index + 1);
						},
						onCloseClick: (_element, _step, options) => {
							setStage('skipped');
							handled = true;
							options.driver.destroy();
						}
					}
				}
			],
			onDestroyed: () => {
				target.removeEventListener('click', onTargetClick);
				if (!handled && getStage() === 'await_post_route_editing') {
					setStage('skipped');
				}
			}
		});

		activeDriver.drive();
	};

	void runStep(0);
}

export function maybeStartHomeExportAdminTour(): void {
	const stage = getStage();
	if (stage !== 'await_home_export_admin' && stage !== 'await_home_admin_btn') return;

	type WrapStep = {
		element: string;
		title: string;
		description: string;
		side: 'top' | 'right' | 'bottom' | 'left';
		align: 'start' | 'center' | 'end';
		requireTargetClick?: boolean;
	};

	const steps: WrapStep[] = [
		{
			element: '[data-tour="home-project-menu"]',
			title: m.tour_wrap_project_actions_title(),
			description: m.tour_wrap_project_actions_desc(),
			side: 'left',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="home-project-export"]',
			title: m.tour_wrap_export_title(),
			description: m.tour_wrap_export_desc(),
			side: 'left',
			align: 'center',
			requireTargetClick: true
		},
		{
			element: '[data-tour="home-account-admin"]',
			title: m.tour_wrap_manage_account_title(),
			description: m.tour_wrap_manage_account_desc(),
			side: 'bottom',
			align: 'center',
			requireTargetClick: true
		}
	];

	const waitForElement = async (selector: string, retries = 30, delayMs = 150): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	const runStep = async (index: number): Promise<void> => {
		if (index >= steps.length) {
			setStage('completed');
			return;
		}
		const current = steps[index];
		const target = await waitForElement(current.element);
		if (!target) {
			await runStep(index + 1);
			return;
		}

		let handled = false;
		const onTargetClick = () => {
			if (!current.requireTargetClick || handled) return;
			handled = true;
			target.removeEventListener('click', onTargetClick);
			teardownDriver();
			if (current.element === '[data-tour="home-account-admin"]') {
				setStage('await_admin_finish');
				return;
			}
			if (current.element === '[data-tour="home-project-export"]') {
				setStage('await_export_page');
				return;
			}
			void runStep(index + 1);
		};
		if (current.requireTargetClick) {
			target.addEventListener('click', onTargetClick, { once: true });
		}

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: true,
			progressText: `${index + 1} / ${steps.length}`,
			doneBtnText: 'Next',
			steps: [
				{
					element: current.element,
					popover: {
						title: current.title,
						description: current.description,
						side: current.side,
						align: current.align,
							showButtons: current.requireTargetClick
								? (index > 0 ? ['previous', 'close'] : ['close'])
								: (index > 0 ? ['previous', 'next', 'close'] : ['next', 'close']),
						onNextClick: (_element, _step, options) => {
							if (current.requireTargetClick) return;
							handled = true;
							options.driver.destroy();
							void runStep(index + 1);
						},
						onCloseClick: (_element, _step, options) => {
							setStage('skipped');
							handled = true;
							options.driver.destroy();
						}
					}
				}
			],
			onDestroyed: () => {
				target.removeEventListener('click', onTargetClick);
				// Do not auto-skip on incidental destroy (route transitions/re-renders).
				// Explicit close already sets `skipped` via onCloseClick.
			}
		});

		activeDriver.drive();
	};

	void runStep(stage === 'await_home_admin_btn' ? 2 : 0);
}

export function maybeStartExportPageTour(): void {
	if (getStage() !== 'await_export_page') return;

	const waitForElement = async (selector: string, retries = 20, delayMs = 120): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	void (async () => {
		const target = await waitForElement('[data-tour="export-format-list"]');
		if (!target) {
			setStage('await_home_admin_btn');
			return;
		}

		const backButton = await waitForElement('[data-tour="project-back-home"]');
		if (!backButton) {
			setStage('await_home_admin_btn');
			return;
		}

		let handledBack = false;
		const onBackClick = () => {
			handledBack = true;
			setStage('await_project_home_back_after_export');
			teardownDriver();
			backButton.removeEventListener('click', onBackClick);
		};
		backButton.addEventListener('click', onBackClick);

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: true,
			progressText: '1 / 2',
			steps: [
				{
					element: '[data-tour="export-format-list"]',
					popover: {
						title: m.tour_export_formats_title(),
						description: m.tour_export_formats_desc(),
						side: 'top',
						align: 'center',
						showButtons: ['next', 'close'],
						onNextClick: (_element, _step, options) => options.driver.moveNext()
					}
				},
				{
					element: '[data-tour="project-back-home"]',
					popover: {
						title: m.tour_edit_next_export_admin_title(),
						description: m.tour_edit_next_export_admin_desc(),
						side: 'bottom',
						align: 'start',
						showButtons: ['close']
					}
				}
			],
			onDestroyed: () => {
				backButton.removeEventListener('click', onBackClick);
				if (!handledBack && getStage() === 'await_export_page') {
					setStage('await_project_home_back_after_export');
				}
			}
		});

		activeDriver.drive();
	})();
}

export function maybeStartProjectHomeBackAfterExportTour(): void {
	if (getStage() !== 'await_project_home_back_after_export') return;

	const waitForElement = async (selector: string, retries = 20, delayMs = 120): Promise<HTMLElement | null> => {
		for (let i = 0; i <= retries; i++) {
			const el = document.querySelector<HTMLElement>(selector);
			if (el) return el;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		return null;
	};

	void (async () => {
		const backButton = await waitForElement('[data-tour="project-back-home"]');
		if (!backButton) {
			setStage('await_home_admin_btn');
			return;
		}

		let handledBack = false;
		const onBackClick = () => {
			handledBack = true;
			setStage('await_home_admin_btn');
			teardownDriver();
			backButton.removeEventListener('click', onBackClick);
		};
		backButton.addEventListener('click', onBackClick);

		activeDriver = tourDriver({
			allowClose: true,
			popoverClass: 'geotracker-tour',
			showProgress: false,
			steps: [
				{
					element: '[data-tour="project-back-home"]',
					popover: {
						title: m.tour_project_back_home_again_title(),
						description: m.tour_project_back_home_again_desc(),
						side: 'bottom',
						align: 'start',
						showButtons: ['close']
					}
				}
			],
			onDestroyed: () => {
				backButton.removeEventListener('click', onBackClick);
				if (!handledBack && getStage() === 'await_project_home_back_after_export') {
					setStage('await_home_admin_btn');
				}
			}
		});

		activeDriver.drive();
	})();
}

export function maybeStartAdminFinishTour(): void {
	if (getStage() !== 'await_admin_finish') return;

	let handledNext = false;
	activeDriver = tourDriver({
		allowClose: true,
		popoverClass: 'geotracker-tour',
		showProgress: false,
		doneBtnText: 'Next',
		steps: [
			{
				element: '[data-tour="admin-header-actions"]',
					popover: {
						title: m.tour_admin_complete_title(),
						description: m.tour_admin_complete_desc(),
						side: 'bottom',
						align: 'end',
						showButtons: ['next', 'close'],
						onNextClick: (_element, _step, options) => {
							handledNext = true;
							setStage('await_home_final');
							options.driver.destroy();
							document.querySelector<HTMLElement>('[data-tour="project-back-home"]')?.click();
						}
					}
				}
			],
		onDestroyed: () => {
			if (!handledNext && getStage() === 'await_admin_finish') {
				setStage('await_home_final');
			}
		}
	});

	activeDriver.drive();
}

export function maybeStartHomeFinalTour(): void {
	if (getStage() !== 'await_home_final') return;

	activeDriver = tourDriver({
		allowClose: true,
		popoverClass: 'geotracker-tour',
		showProgress: false,
		steps: [
			{
				popover: {
					title: m.tour_home_final_title(),
					description: m.tour_home_final_desc(),
						showButtons: ['close']
				}
			}
		],
		onDestroyed: () => {
			if (getStage() === 'await_home_final') {
				setStage('completed');
			}
		}
	});

	activeDriver.drive();
}
