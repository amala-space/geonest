<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve, asset } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { setLocale, getLocale, locales } from '$lib/paraglide/runtime.js';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EarlyAccessDialog from '$lib/components/EarlyAccessDialog.svelte';
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/data/firebaseClient';
	import { listProjects } from '$lib/data/db';
	import { canonicalUrl, SEO_IMAGE_URL } from '$lib/seo';

	const canonical = canonicalUrl('/welcome');

	const LOCALE_NAMES: Record<(typeof locales)[number], string> = {
		en: 'EN',
		id: 'ID'
	};

	let isSignedIn = $state(false);
	let hasProjects = $state(false);
	// The Play listing is still in closed testing, so the badge opens the
	// self-enrolment steps instead of a store page nobody can install from.
	let earlyAccessOpen = $state(false);

	onMount(() => {
		const unsub = onAuthStateChanged(auth, async (user) => {
			isSignedIn = !!user;
			if (user) {
				const capturedUser = user;
				const projects = await listProjects();
				if (auth.currentUser?.uid === capturedUser.uid) {
					hasProjects = projects.length > 0;
				}
			} else {
				hasProjects = false;
			}
		});
		return unsub;
	});

	const screenshots = [
		{ label: 'Create a project',   slug: 'create-project' },
		{ label: 'Capture on the map', slug: 'capture-on-map' },
		{ label: 'Record a route',     slug: 'record-route' },
		{ label: 'Edit geometry',      slug: 'edit-geometry' },
		{ label: 'Export your data',   slug: 'export-data' },
	];
</script>

<svelte:head>
	<title>{m.page_title({ page: m.welcome_title() })}</title>
	<meta name="description" content={m.seo_welcome_description()} />
	<link rel="canonical" href={canonical} />
	<meta property="og:site_name" content={m.app_title()} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={m.page_title({ page: m.welcome_title() })} />
	<meta property="og:description" content={m.seo_welcome_description()} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={SEO_IMAGE_URL} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={m.page_title({ page: m.welcome_title() })} />
	<meta name="twitter:description" content={m.seo_welcome_description()} />
	<meta name="twitter:image" content={SEO_IMAGE_URL} />
</svelte:head>

<div class="screen">
	<PageHeader variant="brand">
		{#snippet leading()}
			<a class="wordmark" href={resolve('/welcome')} aria-label="Geonest home">
				<img class="wordmark-icon" src={asset('/geonest_logo_nest.png')} alt="" aria-hidden="true" />
				<span class="wordmark-text" aria-hidden="true">
					<span class="wordmark-geo">Geo</span><span class="wordmark-nest">nest</span>
				</span>
			</a>
		{/snippet}
		{#snippet actions()}
			<div class="nav-actions">
				{#if isSignedIn && hasProjects}
					<button class="top-nav-btn btn-projects" onclick={() => goto(resolve('/'))}>
						<svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
						</svg>
						<span class="btn-label">{m.landing_my_projects()}</span>
					</button>
				{/if}
				{#if isSignedIn}
					<button class="top-nav-btn btn-account" onclick={() => goto(resolve('/admin'))}>
						<svg class="btn-icon" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"/></svg>
						<span class="btn-label">{m.home_menu_manage_account()}</span>
					</button>
				{:else}
					<div class="nav-locale-picker">
						<svg class="lang-icon" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="M325-111.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5ZM480-162q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>
						<div class="pill-toggle" role="group" aria-label={m.admin_language_aria()}>
							{#each locales as locale}
								<button
									class="pill-btn"
									class:active={getLocale() === locale}
									onclick={() => setLocale(locale)}
								>{LOCALE_NAMES[locale] ?? locale.toUpperCase()}</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	<section class="hero">
		<div class="hero-geo-bg" aria-hidden="true">
			<div class="geo-scene-shell">
				<svg class="geo-scene" viewBox="0 0 1200 620" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
					<!-- Map graticule — parallels & meridians of a projected coordinate grid -->
					<g class="scene-grid">
						<path class="graticule-parallel" d="M-20 86Q600 112 1220 86" />
						<path class="graticule-parallel" d="M-20 196Q600 222 1220 196" />
						<path class="graticule-parallel graticule-major" d="M-20 306Q600 332 1220 306" />
						<path class="graticule-parallel" d="M-20 416Q600 442 1220 416" />
						<path class="graticule-parallel" d="M-20 526Q600 552 1220 526" />
						<path class="graticule-meridian" d="M142 -20Q80 310 18 640" />
						<path class="graticule-meridian" d="M301 -20Q260 310 219 640" />
						<path class="graticule-meridian" d="M459 -20Q440 310 421 640" />
						<path class="graticule-meridian graticule-major" d="M618 -20Q620 310 622 640" />
						<path class="graticule-meridian" d="M776 -20Q800 310 824 640" />
						<path class="graticule-meridian" d="M934 -20Q980 310 1026 640" />
						<path class="graticule-meridian" d="M1093 -20Q1160 310 1227 640" />
					</g>
					<g class="scene-terrain">
						<path d="M256 192h12M262 186v12" />
						<path d="M620 196h12M626 190v12" />
						<path d="M984 200h12M990 194v12" />
						<path d="M258 302h12M264 296v12" />
						<path d="M620 306h12M626 300v12" />
						<path d="M982 310h12M988 304v12" />
						<path d="M260 412h12M266 406v12" />
						<path d="M620 416h12M626 410v12" />
						<path d="M980 420h12M986 414v12" />
					</g>
					<g class="scene-water">
						<path d="M860 0C940 84 1014 170 1060 274C1102 372 1132 504 1200 620H1200V0Z" />
					</g>

					<!-- Area capture — trace the boundary, close it, flood fill, read the area -->
					<g class="scene-area">
						<polygon class="hero-boundary-fill" points="878,118 984,94 1078,138 1104,228 1052,336 938,384 848,328 830,210" />
						<g class="scene-boundary-edges">
							<path class="hero-boundary-edge" d="M878 118L984 94L1078 138L1104 228L1052 336L938 384L848 328L830 210Z" pathLength="1" />
						</g>
						<g class="area-result">
							<polygon class="hero-area-shape" points="878,118 984,94 1078,138 1104,228 1052,336 938,384 848,328 830,210" />
							<g class="scene-area-outline">
								<circle cx="878" cy="118" r="4.5" />
								<circle cx="984" cy="94" r="4.5" />
								<circle cx="1078" cy="138" r="4.5" />
								<circle cx="1104" cy="228" r="4.5" />
								<circle cx="1052" cy="336" r="4.5" />
								<circle cx="938" cy="384" r="4.5" />
								<circle cx="848" cy="328" r="4.5" />
								<circle cx="830" cy="210" r="4.5" />
							</g>
							<g class="area-chip">
								<text x="964" y="244" text-anchor="middle">1.2 ha</text>
							</g>
						</g>
					</g>
					<!-- GPS "you are here" — accuracy radius tightens as signal locks -->
					<g class="scene-gps">
						<g class="scene-raw-fixes">
							<circle cx="202" cy="152" r="2.6" />
							<circle cx="242" cy="128" r="2.2" />
							<circle cx="220" cy="170" r="2.6" />
							<circle cx="194" cy="134" r="2.2" />
							<circle cx="248" cy="158" r="2.4" />
							<circle cx="226" cy="118" r="2.2" />
							<circle cx="206" cy="178" r="2.4" />
							<circle cx="254" cy="142" r="2.2" />
							<circle cx="184" cy="150" r="2.2" />
						</g>
						<circle class="hero-gps-confidence" cx="220" cy="140" r="60" />
						<circle class="hero-gps-accuracy" cx="220" cy="140" r="60" />
						<circle class="hero-gps-accuracy-border" cx="220" cy="140" r="60" />
						<circle class="hero-gps-lock-ping" cx="220" cy="140" r="60" />
						<circle class="hero-gps-dot" cx="220" cy="140" r="11" />
					</g>
					<!-- Route capture — crosshair clicks drop points that connect into a route -->
					<g class="scene-capture">
						<path class="hero-track-line" d="M200 292L292 346L246 438L376 480L328 572" pathLength="1" />
						<g class="scene-sampled-fixes">
							<circle class="route-point" cx="200" cy="292" r="6" />
							<circle class="route-point" cx="292" cy="346" r="6" />
							<circle class="route-point" cx="246" cy="438" r="6" />
							<circle class="route-point" cx="376" cy="480" r="6" />
							<circle class="route-point" cx="328" cy="572" r="6" />
						</g>
						<g class="scene-click-pulses">
							<circle class="capture-pulse" cx="200" cy="292" r="10" />
							<circle class="capture-pulse" cx="292" cy="346" r="10" />
							<circle class="capture-pulse" cx="246" cy="438" r="10" />
							<circle class="capture-pulse" cx="376" cy="480" r="10" />
							<circle class="capture-pulse" cx="328" cy="572" r="10" />
						</g>
						<g class="hero-map-crosshair">
							<g class="crosshair-outline">
								<path d="M0 -19V-9M0 9V19M-19 0H-9M9 0H19" />
								<circle cx="0" cy="0" r="5" />
							</g>
							<g class="crosshair-arm">
								<path d="M0 -19V-9M0 9V19M-19 0H-9M9 0H19" />
								<circle cx="0" cy="0" r="3.2" />
							</g>
						</g>
					</g>
				</svg>
			</div>
		</div>
		<div class="hero-copy">
			<p class="kicker">{m.home_kicker()}</p>
			<h1 class="headline">
				<span>{m.landing_headline_line1()}</span>
				<span>{m.landing_headline_line2()}</span>
			</h1>
			<p class="sub">{m.landing_sub()}</p>
			<div class="hero-actions">
				<button class="btn-primary" onclick={() => goto(resolve('/projects/new'))}>
					{m.landing_hero_primary_cta()}
				</button>
				<button class="btn-ghost" onclick={() => goto(resolve('/join'))}>
					{m.home_join_toggle()}
				</button>
				<button class="btn-text" onclick={() => goto(resolve('/tutorials'))}>
					{m.landing_hero_tertiary_cta()}
					<svg class="btn-text-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M5 12h14M13 6l6 6-6 6"/>
					</svg>
				</button>
			</div>
			<p class="hero-trust">{m.landing_hero_trust()}</p>
			<button
				type="button"
				class="play-store-badge"
				aria-label={m.early_access_badge_aria()}
				onclick={() => (earlyAccessOpen = true)}
			>
				<svg class="play-store-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/></svg>
				<span class="play-store-text">
					<span class="play-store-line1">{m.early_access_badge_line1()}</span>
					<span class="play-store-line2">{m.early_access_badge_line2()}</span>
				</span>
			</button>
		</div>
		<div class="scroll-hint" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M6 9l6 6 6-6"/>
			</svg>
		</div>
	</section>

	<section class="section features-section">
		<h2 class="section-heading">{m.landing_features_heading()}</h2>
		<div class="features-grid">
			<div class="feature-tile">
				<div class="feature-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 21c-4.418 0-8-4.03-8-9a8 8 0 1116 0c0 4.97-3.582 9-8 9z"/>
						<circle cx="12" cy="12" r="2.5"/>
					</svg>
				</div>
				<h3 class="feature-title">{m.landing_feature_capture_title()}</h3>
				<p class="feature-desc">{m.landing_feature_capture_desc()}</p>
			</div>
			<div class="feature-tile">
				<div class="feature-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="9" cy="7" r="2.5"/>
						<circle cx="17" cy="7" r="2.5"/>
						<circle cx="13" cy="17" r="2.5"/>
						<path d="M9 9.5l4 6m4-6l-4 6"/>
					</svg>
				</div>
				<h3 class="feature-title">{m.landing_feature_collab_title()}</h3>
				<p class="feature-desc">{m.landing_feature_collab_desc()}</p>
			</div>
			<div class="feature-tile">
				<div class="feature-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4"/>
					</svg>
				</div>
				<h3 class="feature-title">{m.landing_feature_export_title()}</h3>
				<p class="feature-desc">{m.landing_feature_export_desc()}</p>
			</div>
		</div>
	</section>

	<section class="screenshots-section">
		<div class="section screenshots-heading-wrap">
			<h2 class="section-heading">{m.landing_screenshots_heading()}</h2>
		</div>
		<div class="screenshots-shell">
			<div class="screenshots-strip">
				{#each screenshots as shot, i}
					<div class="screenshot-frame">
						<span class="step-num" aria-hidden="true">{i + 1}</span>
						<div class="device-frame">
							<div class="device-screen">
								<img
									class="screenshot-img"
									src={asset(`/screenshots/${shot.slug}.webp`)}
									alt={shot.label}
									width="390"
									height="844"
									loading="lazy"
								/>
							</div>
						</div>
						<p class="screenshot-caption">{shot.label}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section class="section usecases-section">
		<h2 class="section-heading">{m.landing_usecases_heading()}</h2>
		<div class="usecases-grid">
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 21v-9"/>
							<path d="M12 13c0-3.3 2.4-5.7 5.7-5.7C17.7 10.6 15.3 13 12 13z"/>
							<path d="M12 15c0-2.9-2.1-5-5-5 0 2.9 2.1 5 5 5z"/>
						</svg>
					</span>
				<h3 class="usecase-title">{m.landing_usecase_agriculture_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_agriculture_desc()}</p>
			</div>
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d="M5 20c9 0 15-5.5 15-14 0 0-1.6-1-4.5-1C9.5 5 6 9 6 14c0 2.5 0 4.5 0 6z"/>
							<path d="M5 20c4.5-4.5 9-6.5 13-7.5"/>
						</svg>
					</span>
				<h3 class="usecase-title">{m.landing_usecase_environment_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_environment_desc()}</p>
			</div>
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3 20h18"/>
							<path d="M5 20v-4.5a7 7 0 0 1 14 0V20"/>
							<path d="M9.5 8.5V6a2.5 2.5 0 0 1 5 0v2.5"/>
						</svg>
					</span>
				<h3 class="usecase-title">{m.landing_usecase_construction_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_construction_desc()}</p>
			</div>
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9 3h6"/>
							<path d="M10 3v6.2L4.8 18.5A1.5 1.5 0 0 0 6.1 21h11.8a1.5 1.5 0 0 0 1.3-2.5L14 9.2V3"/>
							<path d="M7.7 15h8.6"/>
						</svg>
					</span>
				<h3 class="usecase-title">{m.landing_usecase_research_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_research_desc()}</p>
			</div>
		</div>
	</section>

	<section class="section cta-section">
		<h2 class="cta-heading">{m.landing_cta_heading()}</h2>
		<div class="cta-actions">
			<button class="btn-primary" onclick={() => goto(resolve('/projects/new'))}>
				{m.home_new_project()}
			</button>
			<button class="btn-ghost" onclick={() => goto(resolve('/join'))}>
				{m.home_join_toggle()}
			</button>
		</div>
		<button
			type="button"
			class="play-store-badge"
			aria-label={m.early_access_badge_aria()}
			onclick={() => (earlyAccessOpen = true)}
		>
			<svg class="play-store-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/></svg>
			<span class="play-store-text">
				<span class="play-store-line1">{m.early_access_badge_line1()}</span>
				<span class="play-store-line2">{m.early_access_badge_line2()}</span>
			</span>
		</button>
		<p class="cta-note">{m.landing_cta_platform_note()}</p>
	</section>

	<footer class="site-footer">
		<div class="footer-inner">
			<div class="footer-brand">
				<a class="footer-wordmark" href={resolve('/welcome')} aria-label="Geonest home">
					<img class="footer-logo" src={asset('/geonest_logo_nest.png')} alt="" aria-hidden="true" />
					<span class="footer-name" aria-hidden="true">
						<span class="wordmark-geo">Geo</span><span class="wordmark-nest">nest</span>
					</span>
				</a>
				<p class="footer-tagline">{m.landing_footer_tagline()}</p>
			</div>
			<nav class="footer-links" aria-label="Footer">
				<button class="footer-link" onclick={() => goto(resolve('/projects/new'))}>{m.home_new_project()}</button>
				<button class="footer-link" onclick={() => goto(resolve('/join'))}>{m.home_join_toggle()}</button>
				<button class="footer-link" onclick={() => goto(resolve('/tutorials'))}>{m.home_start_tutorial()}</button>
				<button class="footer-link" onclick={() => goto(resolve('/admin'))}>{m.home_signin_btn()}</button>
				<button class="footer-link" onclick={() => goto(resolve('/privacy'))}>{m.admin_privacy_policy()}</button>
				<button class="footer-link" onclick={() => goto(resolve('/feedback'))}>{m.feedback_title()}</button>
			</nav>
		</div>
		<div class="footer-bottom">
			<a class="footer-github" href="https://github.com/amala-space/geonest" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
				<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
			</a>
			<span class="footer-dot" aria-hidden="true">·</span>
			<p class="footer-copyright">{m.landing_footer_rights()}</p>
		</div>
	</footer>
</div>

<EarlyAccessDialog open={earlyAccessOpen} onClose={() => (earlyAccessOpen = false)} />

<style>
	.screen {
		min-height: var(--visual-viewport-height, 100dvh);
		display: flex;
		flex-direction: column;
		position: relative;
		overflow-x: clip;
		background:
			radial-gradient(circle at 14% 10%, rgba(39, 116, 86, 0.16), transparent 24%),
			radial-gradient(circle at 84% 14%, rgba(37, 99, 235, 0.12), transparent 22%),
			radial-gradient(circle at 52% 72%, rgba(111, 143, 72, 0.08), transparent 30%),
			linear-gradient(180deg, #f7faf8 0%, #eef3f0 42%, #e8eeeb 100%);
	}

	/* ─── Wordmark ─── */
	.wordmark {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex: 1;
		min-width: 0;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		padding: 0.2rem 0.15rem;
	}
	.wordmark-icon {
		width: clamp(22px, 5vw, 30px);
		height: auto;
		max-height: 30px;
		object-fit: contain;
		flex-shrink: 0;
	}
	.wordmark-text {
		font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
		font-size: clamp(1.5rem, 3.8vw, 1.75rem);
		line-height: 1;
		letter-spacing: -0.03em;
		font-weight: 500;
		white-space: nowrap;
	}
	.wordmark-geo { color: var(--color-wordmark-geo, #2f3e4d); }
	.wordmark-nest { color: var(--color-wordmark-nest, #6f8f48); }

	/* ─── Nav ─── */
	.nav-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.nav-locale-picker {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.top-nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		background: var(--glass-bg);
		color: var(--color-text-dark, #24332e);
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, border-color 0.12s;
	}
	.top-nav-btn:hover {
		background: var(--glass-bg-hover);
		border-color: var(--color-border-strong);
	}
	.top-nav-btn:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}
	.btn-projects {
		background: var(--color-primary-dark);
		color: #fff;
		border-color: var(--color-primary-dark);
	}
	.btn-projects:hover {
		background: var(--color-primary-hover, #123829);
		border-color: var(--color-primary-hover, #123829);
	}
	.btn-icon {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
	}
	.lang-icon {
		width: 1.2rem;
		height: 1.2rem;
		fill: var(--color-primary-dark, #1a3a2e);
		flex-shrink: 0;
	}

	@media (max-width: 520px) {
		.btn-label { display: none; }
		.top-nav-btn { padding: 0.5rem; }
		.nav-locale-picker {
			gap: 0.35rem;
		}
		.lang-icon {
			width: 1.05rem;
			height: 1.05rem;
		}
	}

	/* ─── Shared section ─── */
	.section {
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
		padding: 3.5rem 1.25rem;
	}
	.section-heading {
		font-size: clamp(1.1rem, 3vw, 1.35rem);
		font-weight: 800;
		color: var(--color-text);
		margin: 0 0 2rem;
		text-align: center;
	}

	/* ─── Hero story background ─── */
	.hero-geo-bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
	}
	.hero-geo-bg::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(circle at 78% 74%, color-mix(in srgb, var(--color-map-blue) 7%, transparent), transparent 18%),
			radial-gradient(circle at 86% 30%, color-mix(in srgb, var(--color-area-accent) 7%, transparent), transparent 20%),
			radial-gradient(circle at 22% 16%, color-mix(in srgb, var(--color-tool-point) 5%, transparent), transparent 16%);
		pointer-events: none;
	}
	.hero-geo-bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at center, rgba(247, 250, 248, 0.94) 0%, rgba(247, 250, 248, 0.88) 22%, rgba(247, 250, 248, 0.4) 42%, transparent 68%);
		pointer-events: none;
	}
	.geo-scene-shell {
		position: absolute;
		inset: -2%;
		opacity: 0.32;
		filter: saturate(0.88);
	}
	.geo-scene {
		width: 100%;
		height: 100%;
		opacity: 1;
	}
	.scene-grid {
		opacity: 0.8;
	}
	.scene-grid path {
		fill: none;
		stroke: color-mix(in srgb, var(--color-map-blue) 40%, var(--color-border));
		stroke-width: 1.2;
		opacity: 0.6;
	}
	.scene-grid .graticule-major {
		stroke: color-mix(in srgb, var(--color-map-blue) 60%, var(--color-border));
		stroke-width: 1.8;
		opacity: 0.85;
	}
	.scene-terrain path {
		fill: none;
		stroke: color-mix(in srgb, var(--color-map-blue) 50%, var(--color-border-strong));
		stroke-width: 1.4;
		stroke-linecap: round;
		opacity: 0.5;
	}
	.scene-water path {
		fill: color-mix(in srgb, var(--color-map-blue) 15%, var(--color-surface));
		opacity: 0.5;
	}
	/* ─── Area capture — trace boundary, close, fill, read area ─── */
	.hero-boundary-fill {
		fill: color-mix(in srgb, var(--color-area-accent) 16%, transparent);
		opacity: 0;
		animation: area-fill-in 36s ease-in-out infinite;
	}
	.hero-boundary-edge {
		fill: none;
		stroke: var(--color-area-accent);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: area-trace 36s cubic-bezier(0.4, 0, 0.3, 1) infinite;
	}
	.area-result {
		opacity: 0;
		animation: area-result-in 36s ease-out infinite;
	}
	.hero-area-shape {
		fill: none;
		stroke: var(--color-area-accent);
		stroke-width: 2.4;
		stroke-linejoin: round;
	}
	.scene-area-outline circle {
		fill: var(--color-area-accent);
		stroke: color-mix(in srgb, var(--color-surface) 94%, transparent);
		stroke-width: 2;
	}
	.area-chip text {
		fill: color-mix(in srgb, var(--color-area-accent) 62%, var(--color-muted));
		font-family: "Avenir Next", "Segoe UI", sans-serif;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: 0.02em;
		opacity: 0.85;
	}

	/* ─── GPS "you are here" — accuracy radius tightens as the fix locks ─── */
	.scene-raw-fixes circle {
		fill: color-mix(in srgb, var(--color-map-blue) 55%, var(--color-muted));
		opacity: 0;
		animation: raw-fix-acquire 36s ease-out infinite;
	}
	.scene-raw-fixes circle:nth-child(1) { animation-delay: 0.1s; }
	.scene-raw-fixes circle:nth-child(2) { animation-delay: 0.3s; }
	.scene-raw-fixes circle:nth-child(3) { animation-delay: 0.5s; }
	.scene-raw-fixes circle:nth-child(4) { animation-delay: 0.7s; }
	.scene-raw-fixes circle:nth-child(5) { animation-delay: 0.9s; }
	.scene-raw-fixes circle:nth-child(6) { animation-delay: 1.1s; }
	.scene-raw-fixes circle:nth-child(7) { animation-delay: 1.3s; }
	.scene-raw-fixes circle:nth-child(8) { animation-delay: 1.5s; }
	.scene-raw-fixes circle:nth-child(9) { animation-delay: 1.7s; }
	.hero-gps-confidence,
	.hero-gps-accuracy {
		fill: var(--color-map-blue);
		transform-box: fill-box;
		transform-origin: center;
		animation: gps-tighten 36s cubic-bezier(0.22, 1, 0.36, 1) infinite;
	}
	.hero-gps-confidence { opacity: 0.05; }
	.hero-gps-accuracy { opacity: 0.1; }
	.hero-gps-accuracy-border {
		fill: none;
		stroke: var(--color-map-blue);
		stroke-width: 1.6;
		opacity: 0.3;
		transform-box: fill-box;
		transform-origin: center;
		animation: gps-tighten-border 36s cubic-bezier(0.22, 1, 0.36, 1) infinite;
	}
	.hero-gps-lock-ping {
		fill: none;
		stroke: var(--color-map-blue);
		stroke-width: 2.4;
		opacity: 0;
		transform-box: fill-box;
		transform-origin: center;
		animation: gps-lock-ping 36s ease-out infinite;
	}
	.hero-gps-dot {
		fill: var(--color-map-blue);
		stroke: color-mix(in srgb, var(--color-surface) 94%, transparent);
		stroke-width: 3;
		transform-box: fill-box;
		transform-origin: center;
		animation: gps-dot-lock 36s cubic-bezier(0.22, 1, 0.36, 1) infinite;
	}

	/* ─── Route capture — crosshair clicks points that connect into a route ─── */
	.hero-track-line {
		fill: none;
		stroke: #f4a261;
		stroke-width: 3.2;
		stroke-linecap: round;
		stroke-linejoin: round;
		opacity: 0;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: capture-route 36s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
	}
	.route-point {
		fill: #f4a261;
		stroke: color-mix(in srgb, var(--color-surface) 94%, transparent);
		stroke-width: 2.4;
		opacity: 0;
		transform-box: fill-box;
		transform-origin: center;
	}
	.route-point:nth-child(1) { animation: route-point-1 36s ease-out infinite; }
	.route-point:nth-child(2) { animation: route-point-2 36s ease-out infinite; }
	.route-point:nth-child(3) { animation: route-point-3 36s ease-out infinite; }
	.route-point:nth-child(4) { animation: route-point-4 36s ease-out infinite; }
	.route-point:nth-child(5) { animation: route-point-5 36s ease-out infinite; }
	.capture-pulse {
		fill: none;
		stroke: #f4a261;
		stroke-width: 2;
		opacity: 0;
		transform-box: fill-box;
		transform-origin: center;
	}
	.capture-pulse:nth-child(1) { animation: capture-pulse-1 36s ease-out infinite; }
	.capture-pulse:nth-child(2) { animation: capture-pulse-2 36s ease-out infinite; }
	.capture-pulse:nth-child(3) { animation: capture-pulse-3 36s ease-out infinite; }
	.capture-pulse:nth-child(4) { animation: capture-pulse-4 36s ease-out infinite; }
	.capture-pulse:nth-child(5) { animation: capture-pulse-5 36s ease-out infinite; }
	.hero-map-crosshair {
		opacity: 0;
		animation:
			capture-crosshair-move 36s cubic-bezier(0.5, 0, 0.18, 1) infinite,
			capture-crosshair-fade 36s ease-in-out infinite;
	}
	.hero-map-crosshair .crosshair-outline path {
		fill: none;
		stroke: color-mix(in srgb, #fff 90%, var(--color-surface));
		stroke-width: 4.5;
		stroke-linecap: round;
	}
	.hero-map-crosshair .crosshair-outline circle {
		fill: color-mix(in srgb, #fff 90%, var(--color-surface));
	}
	.hero-map-crosshair .crosshair-arm path {
		fill: none;
		stroke: #f4a261;
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.hero-map-crosshair .crosshair-arm circle {
		fill: #f4a261;
	}

	/* ── Sequenced hero scenes (36s loop, sections evenly spaced 30% apart) ──
	   GPS    present 0–40%   (fade in 0–4, acquire+lock 4–26, hold 26–36, fade out 36–40)
	   Area   present 30–70%  (fade in 30–34, trace+fill 34–60, hold 60–66, fade out 66–70)
	   Route  present 60–100% (fade in 60–64, click+draw 64–95, fade out 96–100 → loops to GPS)
	   Consecutive sections overlap 10%; the next scene's motion masks the prior scene's hold. */

	/* GPS — dot travels in while accuracy ring tightens, locks ~26%, holds, fades */
	@keyframes raw-fix-acquire {
		0%, 2% { opacity: 0; }
		6%, 18% { opacity: 0.34; }
		24%, 100% { opacity: 0; }
	}
	@keyframes gps-tighten {
		0% { transform: translate(-11px, 7px) scale(1.55); opacity: 0; }
		4% { opacity: 0.04; }
		9% { transform: translate(7px, -5px) scale(1.15); }
		15% { transform: translate(-4px, 3px) scale(0.95); }
		22% { transform: translate(0, 0) scale(0.78); }
		26%, 36% { transform: translate(0, 0) scale(0.55); opacity: 0.12; }
		40%, 100% { transform: translate(0, 0) scale(0.55); opacity: 0; }
	}
	@keyframes gps-tighten-border {
		0% { transform: translate(-11px, 7px) scale(1.55); opacity: 0; }
		4% { opacity: 0.16; }
		9% { transform: translate(7px, -5px) scale(1.15); opacity: 0.24; }
		15% { transform: translate(-4px, 3px) scale(0.95); }
		22% { transform: translate(0, 0) scale(0.78); opacity: 0.34; }
		26%, 36% { transform: translate(0, 0) scale(0.55); opacity: 0.42; }
		40%, 100% { transform: translate(0, 0) scale(0.55); opacity: 0; }
	}
	@keyframes gps-lock-ping {
		0%, 24% { opacity: 0; transform: scale(0.5); }
		27% { opacity: 0.5; transform: scale(0.58); }
		31% { opacity: 0; transform: scale(1.4); }
		100% { opacity: 0; transform: scale(1.4); }
	}
	@keyframes gps-dot-lock {
		0% { transform: translate(-11px, 7px) scale(0.9); opacity: 0; }
		4% { opacity: 0.7; }
		9% { transform: translate(7px, -5px) scale(1); opacity: 1; }
		15% { transform: translate(-4px, 3px) scale(1); }
		22%, 36% { transform: translate(0, 0) scale(1); opacity: 1; }
		40%, 100% { transform: translate(0, 0) scale(1); opacity: 0; }
	}
	/* Area — fade in 30–34, trace draws 34–54, fill/result 50–58, hold 58–66, fade out 66–70 */
	@keyframes area-trace {
		0%, 30% { stroke-dashoffset: 1; opacity: 0; }
		34% { stroke-dashoffset: 1; opacity: 0.5; }
		54% { stroke-dashoffset: 0; opacity: 0.85; }
		66% { stroke-dashoffset: 0; opacity: 0.85; }
		70%, 100% { stroke-dashoffset: 1; opacity: 0; }
	}
	@keyframes area-fill-in {
		0%, 48% { opacity: 0; }
		54%, 66% { opacity: 0.55; }
		70%, 100% { opacity: 0; }
	}
	@keyframes area-result-in {
		0%, 52% { opacity: 0; }
		59%, 66% { opacity: 1; }
		70%, 100% { opacity: 0; }
	}
	/* Route — even 30% start: crosshair fades in 60–64, bridged by area result finishing ~59.
	   Crosshair sits on each point as it clicks; line segment draws only AFTER each click.
	   Clicks 65/72/79/86/93, fade out 96–100 → loops to GPS. */
	@keyframes capture-crosshair-fade {
		0%, 60% { opacity: 0; }
		64%, 94% { opacity: 0.92; }
		98%, 100% { opacity: 0; }
	}
	@keyframes capture-crosshair-move {
		0%, 67% { transform: translate(200px, 292px); }
		71%, 72% { transform: translate(292px, 346px); }
		78%, 79% { transform: translate(246px, 438px); }
		85%, 86% { transform: translate(376px, 480px); }
		92%, 100% { transform: translate(328px, 572px); }
	}
	@keyframes capture-route {
		0%, 64% { stroke-dashoffset: 1; opacity: 0; }
		66% { stroke-dashoffset: 1; opacity: 0.85; }
		72% { stroke-dashoffset: 1; }
		75% { stroke-dashoffset: 0.763; }
		79% { stroke-dashoffset: 0.763; }
		82% { stroke-dashoffset: 0.534; }
		86% { stroke-dashoffset: 0.534; }
		89% { stroke-dashoffset: 0.231; }
		93% { stroke-dashoffset: 0.231; }
		95%, 96% { stroke-dashoffset: 0; opacity: 0.85; }
		99%, 100% { stroke-dashoffset: 1; opacity: 0; }
	}
	@keyframes route-point-1 {
		0%, 63% { opacity: 0; transform: scale(0.4); }
		65% { opacity: 1; transform: scale(1.3); }
		67%, 96% { opacity: 1; transform: scale(1); }
		99%, 100% { opacity: 0; transform: scale(0.9); }
	}
	@keyframes route-point-2 {
		0%, 70% { opacity: 0; transform: scale(0.4); }
		72% { opacity: 1; transform: scale(1.3); }
		74%, 96% { opacity: 1; transform: scale(1); }
		99%, 100% { opacity: 0; transform: scale(0.9); }
	}
	@keyframes route-point-3 {
		0%, 77% { opacity: 0; transform: scale(0.4); }
		79% { opacity: 1; transform: scale(1.3); }
		81%, 96% { opacity: 1; transform: scale(1); }
		99%, 100% { opacity: 0; transform: scale(0.9); }
	}
	@keyframes route-point-4 {
		0%, 84% { opacity: 0; transform: scale(0.4); }
		86% { opacity: 1; transform: scale(1.3); }
		88%, 96% { opacity: 1; transform: scale(1); }
		99%, 100% { opacity: 0; transform: scale(0.9); }
	}
	@keyframes route-point-5 {
		0%, 91% { opacity: 0; transform: scale(0.4); }
		93% { opacity: 1; transform: scale(1.3); }
		95%, 96% { opacity: 1; transform: scale(1); }
		99%, 100% { opacity: 0; transform: scale(0.9); }
	}
	@keyframes capture-pulse-1 {
		0%, 63% { opacity: 0; transform: scale(0.3); }
		65% { opacity: 0.55; }
		69%, 100% { opacity: 0; transform: scale(2.4); }
	}
	@keyframes capture-pulse-2 {
		0%, 70% { opacity: 0; transform: scale(0.3); }
		72% { opacity: 0.55; }
		76%, 100% { opacity: 0; transform: scale(2.4); }
	}
	@keyframes capture-pulse-3 {
		0%, 77% { opacity: 0; transform: scale(0.3); }
		79% { opacity: 0.55; }
		83%, 100% { opacity: 0; transform: scale(2.4); }
	}
	@keyframes capture-pulse-4 {
		0%, 84% { opacity: 0; transform: scale(0.3); }
		86% { opacity: 0.55; }
		90%, 100% { opacity: 0; transform: scale(2.4); }
	}
	@keyframes capture-pulse-5 {
		0%, 91% { opacity: 0; transform: scale(0.3); }
		93% { opacity: 0.55; }
		97%, 100% { opacity: 0; transform: scale(2.4); }
	}
	/* ─── Hero ─── */
	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 4rem 1.25rem max(3.5rem, calc(env(safe-area-inset-bottom) + 2rem), calc(var(--sab, 0px) + 2rem));
		gap: 0.9rem;
		width: 100%;
		max-width: none;
		margin: 0 auto;
		flex: 1 0 auto;
		min-height: calc(var(--visual-viewport-height, 100dvh) - 56px - max(env(safe-area-inset-top), var(--sat, 0px)));
		justify-content: center;
		overflow: hidden;
	}
	.hero-copy,
	.scroll-hint {
		position: relative;
		z-index: 1;
	}
	.hero-copy {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		max-width: min(100%, 46rem);
		padding-inline: 1rem;
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		padding: 0.34rem 0.75rem;
		border-radius: 999px;
		background: rgba(23, 70, 51, 0.08);
		color: var(--color-primary-dark);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0 0 0.7rem;
	}
	.headline {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: clamp(1.7rem, 5.5vw, 3.2rem);
		line-height: 1.1;
		font-weight: 900;
		color: var(--color-text);
		max-width: 20ch;
		margin: 0 0 1rem;
	}
	.headline span {
		display: block;
	}
	.sub {
		font-size: clamp(0.92rem, 2.2vw, 1.05rem);
		color: var(--color-muted);
		max-width: 40rem;
		line-height: 1.55;
		margin: 0 0 1.45rem;
	}
	.hero-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 0;
		margin-bottom: 1rem;
	}
	.hero-trust {
		margin: 0 0 1rem;
	}

	/* Scroll hint — shown on all screens (hero is ~full height, content always below) */
	.scroll-hint {
		display: block;
		position: absolute;
		bottom: max(1.5rem, calc(env(safe-area-inset-bottom) + 0.75rem), calc(var(--sab, 0px) + 0.75rem));
		left: 50%;
		transform: translateX(-50%);
		color: var(--color-muted);
		opacity: 0.6;
		animation: bounce 1.8s ease-in-out infinite;
	}
	.scroll-hint svg {
		width: 1.5rem;
		height: 1.5rem;
	}
	@keyframes bounce {
		0%, 100% { transform: translateX(-50%) translateY(0); }
		50%       { transform: translateX(-50%) translateY(5px); }
	}
	/* ─── Buttons ─── */
	.btn-primary,
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.65rem 1.5rem;
		font-size: 0.9rem;
		font-weight: 700;
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s, transform 0.12s;
		white-space: nowrap;
		min-height: 2.75rem;
	}
	.btn-primary {
		background: var(--color-primary-dark);
		color: #fff;
		border: 1px solid var(--color-primary-dark);
		box-shadow: 0 8px 16px rgba(23, 70, 51, 0.2);
	}
	.btn-primary:hover {
		background: var(--color-primary-hover, #123829);
		border-color: var(--color-primary-hover, #123829);
	}
	.btn-ghost {
		background: var(--glass-bg);
		color: var(--color-text-dark, #24332e);
		border: 1px solid var(--color-border);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
	}
	.btn-ghost:hover {
		background: var(--glass-bg-hover);
		border-color: var(--color-border-strong);
	}
	.btn-primary:active,
	.btn-ghost:active { transform: translateY(1px); }
	.btn-primary:focus-visible,
	.btn-ghost:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}
	.btn-text {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.65rem 0.5rem;
		min-height: 2.75rem;
		background: none;
		border: none;
		color: var(--color-primary-dark);
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition: gap 0.12s, color 0.12s;
	}
	.btn-text-arrow {
		width: 1.05rem;
		height: 1.05rem;
		transition: transform 0.15s ease;
	}
	.btn-text:hover {
		color: var(--color-primary-hover, #123829);
	}
	.btn-text:hover .btn-text-arrow {
		transform: translateX(3px);
	}
	.btn-text:focus-visible {
		outline: none;
		border-radius: var(--radius-pill);
		box-shadow: var(--focus-ring);
	}
	.hero-trust {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		font-weight: 400;
		color: var(--color-muted);
		margin: 0.35rem 0 1.2rem;
		max-width: 30rem;
	}

	/* ─── Features ─── */
	.features-section {
		border-top: 1px solid var(--color-border);
	}
	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}
	.feature-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 1.5rem;
		background: var(--glass-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		backdrop-filter: var(--glass-blur);
		transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
	}
	.feature-tile:hover {
		transform: translateY(-3px);
		border-color: var(--color-border-strong);
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
	}
	.feature-icon {
		width: 2.25rem;
		height: 2.25rem;
		color: var(--color-primary-dark);
	}
	.feature-icon svg { width: 100%; height: 100%; }
	.feature-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}
	.feature-desc {
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-muted) 82%, #000);
		line-height: 1.5;
		margin: 0;
	}

	/* ─── Screenshots ─── */
	.screenshots-section {
		border-top: 1px solid var(--color-border);
		overflow: hidden;
	}
	.screenshots-heading-wrap {
		padding-bottom: 0;
	}
	.screenshots-shell {
		width: 100%;
		padding-inline: clamp(1rem, 3vw, 2rem);
		padding-bottom: max(3.5rem, calc(env(safe-area-inset-bottom) + 2rem), calc(var(--sab, 0px) + 2rem));
	}
	.screenshots-strip {
		display: flex;
		gap: 1.25rem;
		overflow-x: auto;
		padding-bottom: 1rem;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		width: 100%;
		max-width: min(100vw - clamp(2rem, 6vw, 4rem), 112rem);
		margin: 0 auto;
	}
	.screenshots-strip::-webkit-scrollbar { height: 4px; }
	.screenshots-strip::-webkit-scrollbar-track { background: transparent; }
	.screenshots-strip::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 2px;
	}
	.screenshot-frame {
		position: relative;
		flex: 0 0 auto;
		width: clamp(200px, 55vw, 260px);
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
	}
	/* step connector line behind the numbered badges */
	.screenshot-frame:not(:first-child)::before {
		content: '';
		position: absolute;
		top: 0.95rem;
		right: 50%;
		width: calc(100% + 1.25rem);
		height: 2px;
		background: var(--color-border-strong);
		opacity: 0.55;
		z-index: 0;
	}
	.step-num {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 50%;
		background: var(--color-primary-dark);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 800;
		box-shadow: 0 0 0 4px var(--color-surface-subtle, #f8faf9);
	}
	.device-frame {
		position: relative;
		width: 100%;
		padding: 5px;
		background: linear-gradient(160deg, #33433d, #202b27);
		border-radius: 26px;
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
	}
	.device-screen {
		position: relative;
		aspect-ratio: 9 / 19.5;
		border-radius: 22px;
		overflow: hidden;
		background: #000;
	}
	.screenshot-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.screenshot-caption {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text);
		text-align: center;
		margin: 0;
	}
	@media (min-width: 1100px) {
		.geo-scene-shell {
			opacity: 0.4;
		}
		.screenshots-shell {
			padding-inline: clamp(1.5rem, 4vw, 3rem);
		}
		.screenshots-strip {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			align-items: start;
			overflow-x: visible;
			scroll-snap-type: none;
		}
		.screenshot-frame {
			width: 100%;
			min-width: 0;
		}
	}

	/* ─── Use cases ─── */
	.usecases-section {
		border-top: 1px solid var(--color-border);
	}
	.usecases-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}
	.usecase-card {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 1.25rem;
		background: var(--glass-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
	}
	.usecase-card:hover {
		transform: translateY(-3px);
		border-color: var(--color-border-strong);
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
	}
	.usecase-icon {
		display: inline-flex;
		width: 2rem;
		height: 2rem;
		color: var(--color-primary-dark);
	}
	.usecase-icon svg { width: 100%; height: 100%; }
	.usecase-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}
	.usecase-desc {
		font-size: 0.8rem;
		color: color-mix(in srgb, var(--color-muted) 82%, #000);
		line-height: 1.5;
		margin: 0;
	}

	/* ─── CTA footer ─── */
	.cta-section {
		border-top: 1px solid var(--color-border);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		padding-bottom: max(5rem, calc(env(safe-area-inset-bottom) + 3rem), calc(var(--sab, 0px) + 3rem));
	}
	.cta-heading {
		font-size: clamp(1.2rem, 3.5vw, 1.6rem);
		font-weight: 900;
		color: var(--color-text);
		margin: 0;
	}
	.cta-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
	}
	.play-store-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		background: #000;
		color: #fff;
		border-radius: 0.5rem;
		padding: 0.5rem 1rem;
		text-align: left;
		font: inherit;
		text-decoration: none;
		border: 1px solid rgba(255,255,255,0.15);
		transition: opacity 0.15s;
		pointer-events: auto;
		cursor: pointer;
	}
	.play-store-badge:hover {
		opacity: 0.85;
	}
	.play-store-icon {
		width: 1.25rem;
		height: 1.25rem;
		fill: currentColor;
		flex-shrink: 0;
	}
	.play-store-text {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.play-store-line1 {
		font-size: 0.6rem;
		letter-spacing: 0.04em;
	}
	.play-store-line2 {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.cta-note {
		font-size: 0.8rem;
		color: var(--color-muted);
		margin: 0;
	}

	/* ─── Section rhythm: full-bleed tinted bands on alternating sections ─── */
	.features-section,
	.usecases-section {
		position: relative;
		z-index: 0;
	}
	.features-section::before,
	.usecases-section::before {
		content: '';
		position: absolute;
		inset: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100vw;
		background: var(--color-surface-subtle, #f8faf9);
		z-index: -1;
	}

	/* ─── Site footer ─── */
	.site-footer {
		border-top: 1px solid var(--color-border);
		background: var(--color-surface-subtle, #f8faf9);
		padding: 2.5rem 1.25rem;
		padding-bottom: max(2.5rem, calc(env(safe-area-inset-bottom) + 1.5rem), calc(var(--sab, 0px) + 1.5rem));
	}
	.footer-inner {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1.5rem 2rem;
		flex-wrap: wrap;
	}
	.footer-brand {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.footer-wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		text-decoration: none;
		color: inherit;
	}
	.footer-logo {
		width: 24px;
		height: auto;
		max-height: 24px;
		object-fit: contain;
	}
	.footer-name {
		font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
		font-size: 1.25rem;
		font-weight: 500;
		letter-spacing: -0.03em;
		line-height: 1;
	}
	.footer-tagline {
		font-size: 0.8rem;
		color: var(--color-muted);
		line-height: 1.5;
		margin: 0;
	}
	.footer-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.25rem;
		align-content: flex-start;
	}
	.footer-link {
		background: none;
		border: none;
		padding: 0.2rem 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-nav, #33413c);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.12s;
	}
	.footer-link:hover { color: var(--color-primary-dark); }
	.footer-link:focus-visible {
		outline: none;
		border-radius: 4px;
		box-shadow: var(--focus-ring);
	}
	.footer-bottom {
		max-width: 1200px;
		margin: 1.75rem auto 0;
		padding-top: 1.25rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	.footer-dot {
		color: var(--color-muted);
		font-size: 0.75rem;
	}
	.footer-github {
		display: flex;
		align-items: center;
		color: var(--color-muted);
		transition: color 0.12s;
		flex-shrink: 0;
	}
	.footer-github:hover { color: var(--color-text-nav, #33413c); }
	.footer-github svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: currentColor;
	}
	.footer-copyright {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-muted);
		text-align: center;
	}

	/* ─── Responsive ─── */
	@media (max-width: 700px) {
		.features-grid { grid-template-columns: 1fr; }
		.usecases-grid { grid-template-columns: repeat(2, 1fr); }
	}
	/*
	 * Portrait reflow: with `slice`, a narrow/portrait viewport only keeps the
	 * centre vertical band of the wide scene, so the left route and right area
	 * would be cropped off. Pull the three beats into that band instead —
	 * area in the top strip, GPS + route in the bottom strip — clear of the
	 * vertically-centred hero copy. Keyed on portrait so landscape phones keep
	 * the full wide composition.
	 */
	@media (max-width: 700px), (max-width: 1024px) and (orientation: portrait) {
		.geo-scene-shell {
			opacity: 0.5;
		}
		.scene-area,
		.scene-gps,
		.scene-capture {
			transform-box: view-box;
			transform-origin: 0 0;
		}
		.scene-area { transform: translate(20px, -26px) scale(0.6); }
		.scene-gps { transform: translate(380px, 160px) scale(0.5); }
		.scene-capture { transform: translate(390px, 270px) scale(0.5); }
	}
	@media (max-width: 480px) {
		.hero {
			min-height: calc(var(--visual-viewport-height, 100dvh) - 52px - max(env(safe-area-inset-top), var(--sat, 0px)));
		}
		.geo-scene-shell {
			opacity: 0.46;
		}
		.hero-copy {
			max-width: min(100%, 28rem);
		}
		.sub {
			max-width: 30rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.scene-raw-fixes circle,
		.hero-track-line,
		.route-point,
		.capture-pulse,
		.hero-map-crosshair,
		.hero-gps-confidence,
		.hero-gps-accuracy,
		.hero-gps-accuracy-border,
		.hero-gps-lock-ping,
		.hero-gps-dot,
		.hero-boundary-fill,
		.hero-boundary-edge,
		.area-result {
			animation: none !important;
		}
		.hero-track-line,
		.route-point,
		.area-result {
			opacity: 1;
		}
		.hero-boundary-edge {
			opacity: 0.7;
			stroke-dashoffset: 0;
		}
		.hero-boundary-fill {
			opacity: 0.5;
		}
		.hero-map-crosshair {
			opacity: 0.92;
			transform: translate(328px, 572px);
		}
		.capture-pulse,
		.hero-gps-lock-ping,
		.scene-raw-fixes circle {
			opacity: 0;
		}
		.hero-gps-confidence {
			opacity: 0.07;
			transform: scale(0.6);
		}
		.hero-gps-accuracy {
			opacity: 0.12;
			transform: scale(0.6);
		}
		.hero-gps-accuracy-border {
			opacity: 0.4;
			transform: scale(0.6);
		}
		.hero-gps-dot {
			transform: translate(0, 0) scale(1);
		}
		.hero-track-line {
			stroke-dashoffset: 0;
		}
	}
</style>
