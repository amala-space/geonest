import { writable } from 'svelte/store';

type Toast = { id: number; message: string };

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);
	let nextId = 0;

	function show(message: string, duration = 2200) {
		const id = ++nextId;
		update(ts => [...ts, { id, message }]);
		setTimeout(() => update(ts => ts.filter(t => t.id !== id)), duration);
	}

	return { subscribe, show };
}

export const toast = createToastStore();
