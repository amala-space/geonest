<script lang="ts">
	type Props = {
		label?: string;
		onclick: () => void | Promise<void>;
	};

	let { label = 'Back', onclick }: Props = $props();

	function handleClick() {
		void Promise.resolve(onclick()).catch((error) => {
			console.error('Back button navigation failed:', error);
		});
	}
</script>

<button data-tour="project-back-home" type="button" class="back-btn" onclick={handleClick}>
	<svg viewBox="0 -960 960 960" aria-hidden="true">
		<path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z"/>
	</svg>
	<span>{label}</span>
</button>

<style>
	.back-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 2.35rem;
		background: rgba(255,255,255,0.72);
		color: #24332e;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: 0 1px 2px rgba(15,23,42,0.05);
		padding: 0.35rem 0.65rem;
		font-size: 0.85rem;
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease;
	}

	.back-btn:hover {
		background: #fff;
		border-color: var(--color-border-strong);
	}

	.back-btn:active {
		transform: translateY(1px);
	}

	.back-btn:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	.back-btn svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: currentColor;
	}

	@media (max-width: 640px) {
		.back-btn {
			padding-inline: 0.55rem;
		}

		.back-btn span {
			font-size: 0;
		}
	}
</style>
