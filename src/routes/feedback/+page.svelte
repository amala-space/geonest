<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { canonicalUrl, SEO_IMAGE_URL } from '$lib/seo';
	import { submitFeedback, type FeedbackType } from '$lib/data/feedback';

	const canonical = canonicalUrl('/feedback');

	let type = $state<FeedbackType>('bug');
	let message = $state('');
	let email = $state('');
	let screenshot = $state<File | null>(null);
	let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let errorText = $state('');
	let attachmentWarning = $state(false);

	function onFile(event: Event) {
		const input = event.target as HTMLInputElement;
		screenshot = input.files?.[0] ?? null;
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!message.trim()) {
			errorText = m.feedback_message_required();
			status = 'error';
			return;
		}
		status = 'sending';
		errorText = '';
		attachmentWarning = false;
		try {
			const result = await submitFeedback({ type, message, email, screenshot });
			attachmentWarning = result.attachment === 'failed';
			status = 'sent';
			message = '';
			email = '';
			screenshot = null;
		} catch {
			status = 'error';
			errorText = m.feedback_error();
		}
	}
</script>

<svelte:head>
	<title>{m.page_title({ page: m.feedback_title() })}</title>
	<meta name="description" content={m.seo_feedback_description()} />
	<link rel="canonical" href={canonical} />
	<meta property="og:site_name" content={m.app_title()} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={m.page_title({ page: m.feedback_title() })} />
	<meta property="og:description" content={m.seo_feedback_description()} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={SEO_IMAGE_URL} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={m.page_title({ page: m.feedback_title() })} />
	<meta name="twitter:description" content={m.seo_feedback_description()} />
	<meta name="twitter:image" content={SEO_IMAGE_URL} />
</svelte:head>

<main class="feedback-screen app-bg-gradient">
	<PageHeader title={m.feedback_title()} back={() => goto(resolve('/'))} />
	<div class="feedback-page">
		{#if status === 'sent'}
			<div class="feedback-card feedback-success" role="status">
				<p>{m.feedback_success()}</p>
				{#if attachmentWarning}
					<p class="attachment-warning">{m.feedback_screenshot_warning()}</p>
				{/if}
				<button type="button" class="btn-ghost" onclick={() => { status = 'idle'; attachmentWarning = false; }}>
					{m.feedback_send_another()}
				</button>
			</div>
		{:else}
			<form class="feedback-card" onsubmit={onSubmit}>
				<p class="feedback-intro">{m.feedback_intro()}</p>

				<fieldset class="feedback-types">
					<legend>{m.feedback_type_label()}</legend>
					<div class="pill-toggle feedback-type-toggle">
						<label class="pill-btn" class:active={type === 'bug'}>
							<input type="radio" name="type" value="bug" bind:group={type} />
							{m.feedback_type_bug()}
						</label>
						<label class="pill-btn" class:active={type === 'suggestion'}>
							<input type="radio" name="type" value="suggestion" bind:group={type} />
							{m.feedback_type_suggestion()}
						</label>
						<label class="pill-btn" class:active={type === 'other'}>
							<input type="radio" name="type" value="other" bind:group={type} />
							{m.feedback_type_other()}
						</label>
					</div>
				</fieldset>

				<label class="field">
					<span class="field-label">{m.feedback_message_label()}</span>
					<textarea
						bind:value={message}
						rows="6"
						maxlength="4000"
						placeholder={m.feedback_message_placeholder()}
						required
					></textarea>
				</label>

				<label class="field">
					<span class="field-label">{m.feedback_email_label()}</span>
					<input
						type="email"
						bind:value={email}
						placeholder={m.feedback_email_placeholder()}
						autocomplete="email"
					/>
				</label>

				<label class="field">
					<span class="field-label">{m.feedback_screenshot_label()}</span>
					<input class="file-input" type="file" accept="image/*" onchange={onFile} />
				</label>

				{#if status === 'error'}
					<p class="error" role="alert">{errorText}</p>
				{/if}

				<button type="submit" class="btn-primary" disabled={status === 'sending'}>
					{status === 'sending' ? m.feedback_sending() : m.feedback_submit()}
				</button>

				<p class="privacy-note">
					{m.feedback_privacy_note()}
					<a href={resolve('/privacy')}>{m.admin_privacy_policy()}</a>
				</p>
			</form>
		{/if}
	</div>
</main>

<style>
	.feedback-screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	.feedback-page {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 1.25rem 1rem 3rem;
	}

	.feedback-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card-lg);
		box-shadow: var(--shadow-card);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		color: var(--color-text);
	}

	.feedback-intro {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--color-muted);
	}

	.feedback-types {
		border: none;
		padding: 0;
		margin: 0;
	}

	.feedback-types legend {
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 0.55rem;
		padding: 0;
	}

	.feedback-type-toggle {
		flex-wrap: wrap;
	}

	.feedback-type-toggle .pill-btn {
		min-height: 2.75rem;
		font-size: 0.88rem;
		cursor: pointer;
	}

	/* The global `input, textarea { width:100% }` reset would stretch the radio
	   dot full-width; keep it intrinsic inside the pill. */
	.feedback-type-toggle input[type='radio'] {
		width: auto;
		padding: 0;
		margin: 0;
		accent-color: var(--color-primary-dark);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field-label {
		font-weight: 600;
		font-size: 0.9rem;
	}

	/* textarea and the email input inherit the global input/textarea styling. */
	.field textarea {
		resize: vertical;
		font-family: inherit;
	}

	.file-input {
		width: 100%;
		min-height: 2.75rem;
		font-size: 0.88rem;
		padding: 0.55rem 0.75rem;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface-subtle);
		box-sizing: border-box;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.feedback-success {
		align-items: flex-start;
		gap: 1rem;
	}

	.feedback-success p {
		margin: 0;
		font-size: 0.95rem;
	}

	.feedback-success .attachment-warning {
		color: var(--color-warning);
	}

	.privacy-note {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--color-muted);
	}

	.privacy-note a {
		color: var(--color-primary-dark);
		text-decoration: underline;
	}
</style>
