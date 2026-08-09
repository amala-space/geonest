import { writable } from 'svelte/store';

export type ConfirmTone = 'neutral' | 'warning' | 'danger';

export type ConfirmOptions = {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: ConfirmTone;
};

type ConfirmState = Required<Pick<ConfirmOptions, 'title' | 'message'>> & {
	confirmLabel: string;
	cancelLabel: string;
	tone: ConfirmTone;
	open: boolean;
};

const initialState: ConfirmState = {
	open: false,
	title: '',
	message: '',
	confirmLabel: 'OK',
	cancelLabel: 'Cancel',
	tone: 'neutral'
};

const { subscribe, set } = writable<ConfirmState>(initialState);

let activeResolve: ((value: boolean) => void) | null = null;

function resetDialog() {
	set(initialState);
	activeResolve = null;
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	if (activeResolve) {
		activeResolve(false);
		resetDialog();
	}

	return new Promise<boolean>((resolve) => {
		activeResolve = resolve;
		set({
			open: true,
			title: options.title,
			message: options.message,
			confirmLabel: options.confirmLabel ?? 'OK',
			cancelLabel: options.cancelLabel ?? 'Cancel',
			tone: options.tone ?? 'neutral'
		});
	});
}

export function acceptConfirmDialog(): void {
	activeResolve?.(true);
	resetDialog();
}

export function cancelConfirmDialog(): void {
	activeResolve?.(false);
	resetDialog();
}

export const confirmState = { subscribe };
