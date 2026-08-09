<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { submitFeedback, type FeedbackType } from '$lib/data/feedback';

	type Props = {
		open: boolean;
		/** Screenshot captured at shake time; auto-attached unless the user opts out. */
		screenshot?: Blob | null;
		projectId?: string | null;
		onClose: () => void;
		onDisableShake: () => void;
	};

	let { open, screenshot = null, projectId = null, onClose, onDisableShake }: Props = $props();

	let type = $state<FeedbackType>('bug');
	let message = $state('');
	let email = $state('');
	let attachScreenshot = $state(true);
	let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let errorText = $state('');
	let attachmentWarning = $state(false);

	$effect(() => {
		if (open) {
			type = 'bug';
			message = '';
			email = '';
			attachScreenshot = true;
			status = 'idle';
			errorText = '';
			attachmentWarning = false;
		}
	});

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
			const result = await submitFeedback({
				type,
				message,
				email,
				projectId,
				screenshot: attachScreenshot ? screenshot : null
			});
			attachmentWarning = result.attachment === 'failed';
			status = 'sent';
		} catch {
			status = 'error';
			errorText = m.feedback_error();
		}
	}

	function onBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose();
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

{#if open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="feedback-dialog-title"
		tabindex="-1"
		onclick={onBackdrop}
		onkeydown={onKey}
	>
		<div class="dialog" role="document">
			{#if status === 'sent'}
				<h2 id="feedback-dialog-title">{m.feedback_success()}</h2>
				{#if attachmentWarning}
					<p class="attachment-warning">{m.feedback_screenshot_warning()}</p>
				{/if}
				<div class="actions">
					<button type="button" class="btn btn-primary" onclick={onClose}>{m.common_done()}</button>
				</div>
			{:else}
				<form onsubmit={onSubmit}>
					<h2 id="feedback-dialog-title">{m.feedback_shake_title()}</h2>
					<p class="intro">{m.feedback_shake_intro()}</p>

					<div class="pill-toggle type-toggle">
						<label class="pill-btn" class:active={type === 'bug'}>
							<input type="radio" name="ftype" value="bug" bind:group={type} />
							{m.feedback_type_bug()}
						</label>
						<label class="pill-btn" class:active={type === 'suggestion'}>
							<input type="radio" name="ftype" value="suggestion" bind:group={type} />
							{m.feedback_type_suggestion()}
						</label>
						<label class="pill-btn" class:active={type === 'other'}>
							<input type="radio" name="ftype" value="other" bind:group={type} />
							{m.feedback_type_other()}
						</label>
					</div>

					<label class="field">
						<span>{m.feedback_message_label()}</span>
						<textarea
							bind:value={message}
							rows="4"
							maxlength="4000"
							placeholder={m.feedback_message_placeholder()}
							required
						></textarea>
					</label>

					<label class="field">
						<span>{m.feedback_email_label()}</span>
						<input type="email" bind:value={email} placeholder={m.feedback_email_placeholder()} autocomplete="email" />
					</label>

					{#if screenshot}
						<label class="checkbox-row">
							<input type="checkbox" bind:checked={attachScreenshot} />
							<span>{m.feedback_attach_screenshot()}</span>
						</label>
					{/if}

					{#if status === 'error'}
						<p class="error" role="alert">{errorText}</p>
					{/if}

					<div class="actions">
						<button type="button" class="btn btn-ghost btn-disable" onclick={onDisableShake}>
							{m.feedback_disable_shake()}
						</button>
						<span class="actions-spacer"></span>
						<button type="button" class="btn btn-ghost" onclick={onClose}>{m.common_cancel()}</button>
						<button type="submit" class="btn btn-primary" disabled={status === 'sending'}>
							{status === 'sending' ? m.feedback_sending() : m.feedback_submit()}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		top: var(--visual-viewport-offset-top, 0px);
		left: 0;
		right: 0;
		height: var(--visual-viewport-height, 100dvh);
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		pointer-events: auto;
	}
	.dialog {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
		width: 100%;
		max-width: 420px;
		max-height: calc(var(--visual-viewport-height, 90dvh) * 0.9);
		overflow-y: auto;
		padding: 1.25rem;
		color: var(--color-text);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	h2 {
		font-size: 1.05rem;
		font-weight: 700;
	}
	.intro {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-muted);
		line-height: 1.45;
	}
	.type-toggle {
		flex-wrap: wrap;
	}
	.type-toggle .pill-btn {
		min-height: 2.5rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.type-toggle input[type='radio'] {
		width: auto;
		padding: 0;
		margin: 0;
		accent-color: var(--color-primary-dark);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.field input,
	.field textarea {
		font: inherit;
		font-weight: 400;
		padding: 0.55rem 0.7rem;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius);
		background: #fff;
		color: var(--color-text);
		width: 100%;
		box-sizing: border-box;
	}
	.field textarea {
		resize: vertical;
		min-height: 3.5rem;
	}
	.field input:focus,
	.field textarea:focus {
		outline: none;
		border-color: var(--color-primary-dark);
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	.checkbox-row input {
		width: auto;
		accent-color: var(--color-primary-dark);
	}
	.attachment-warning {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--color-warning);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}
	.actions-spacer {
		flex: 1;
	}
	.btn {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
	}
	.btn-disable {
		font-size: 0.78rem;
		padding: 0.4rem 0.6rem;
	}
</style>
