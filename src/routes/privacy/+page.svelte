<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve, asset } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { canonicalUrl, SEO_IMAGE_URL } from '$lib/seo';

	let policyHtml = $state('');
	const canonical = canonicalUrl('/privacy');

	onMount(async () => {
		const res = await fetch(asset('/privacy-policy.html'));
		if (!res.ok) {
			policyHtml = `<p>${m.privacy_load_failed()}</p>`;
			return;
		}
		const docHtml = await res.text();
		const parser = new DOMParser();
		const doc = parser.parseFromString(docHtml, 'text/html');
		const main = doc.querySelector('main');
		policyHtml = main?.innerHTML ?? `<p>${m.privacy_content_unavailable()}</p>`;
	});
</script>

<svelte:head>
	<title>{m.page_title({ page: m.admin_privacy_policy() })}</title>
	<meta name="description" content={m.seo_privacy_description()} />
	<link rel="canonical" href={canonical} />
	<meta property="og:site_name" content={m.app_title()} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={m.page_title({ page: m.admin_privacy_policy() })} />
	<meta property="og:description" content={m.seo_privacy_description()} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={SEO_IMAGE_URL} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={m.page_title({ page: m.admin_privacy_policy() })} />
	<meta name="twitter:description" content={m.seo_privacy_description()} />
	<meta name="twitter:image" content={SEO_IMAGE_URL} />
</svelte:head>

<main class="privacy-screen app-bg-gradient">
	<PageHeader title={m.admin_privacy_policy()} back={() => goto(resolve('/admin'))} />
	<div class="privacy-page">
		<article class="policy-content" aria-live="polite">
			{@html policyHtml}
		</article>
	</div>
</main>

<style>
	.privacy-screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	.privacy-page {
		width: 100%;
		max-width: 920px;
		margin: 0 auto;
		padding: 1.25rem 1rem 3rem;
	}

	.policy-content {
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #d1d5db);
		border-radius: 12px;
		padding: 1.25rem;
		line-height: 1.6;
		color: var(--color-text, #111827);
	}

	/* App-wide reset (* { margin:0 } + Tailwind preflight) strips spacing and
	   list markers, so the injected policy HTML needs its typography restored. */
	.policy-content :global(p) {
		margin: 0 0 0.9rem;
	}

	.policy-content :global(h1) {
		margin: 0 0 1rem;
		font-size: 1.9rem;
		line-height: 1.25;
	}

	.policy-content :global(h2) {
		margin: 2rem 0 0.75rem;
		font-size: 1.3rem;
		line-height: 1.3;
	}

	.policy-content :global(h3) {
		margin: 1.5rem 0 0.5rem;
		font-size: 1.1rem;
		line-height: 1.3;
	}

	.policy-content :global(ul),
	.policy-content :global(ol) {
		margin: 0 0 0.9rem;
		padding-left: 1.5rem;
		list-style: disc;
	}

	.policy-content :global(ol) {
		list-style: decimal;
	}

	.policy-content :global(li) {
		margin: 0.3rem 0;
	}

	.policy-content :global(li)::marker {
		color: var(--color-muted);
	}

	.policy-content :global(a) {
		color: var(--color-map-blue);
		text-decoration: underline;
	}

	.policy-content :global(strong) {
		font-weight: 700;
	}

	.policy-content :global(em) {
		font-style: italic;
	}

	.policy-content :global(p.in-short) {
		margin: 0.75rem 0 1.25rem;
		padding: 0.6rem 0.85rem;
		background: var(--color-surface-subtle, #f8faf9);
		border-left: 3px solid var(--color-primary);
		border-radius: 4px;
		color: var(--color-muted);
	}

	.policy-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 0 0 1rem;
	}

	.policy-content :global(th),
	.policy-content :global(td) {
		border: 1px solid var(--color-border);
		padding: 0.4rem 0.6rem;
		text-align: left;
		vertical-align: top;
	}

	@media (max-width: 640px) {
		.policy-content {
			padding: 1rem;
		}
	}
</style>
