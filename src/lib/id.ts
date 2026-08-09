export function generateId(): string {
	const cryptoObj = globalThis.crypto;
	const randomUuid = cryptoObj?.randomUUID;
	if (typeof randomUuid === 'function') return randomUuid.call(cryptoObj);

	// Fallback for non-secure contexts / older runtimes. Must stay
	// cryptographically unguessable: project IDs and access tokens double as
	// share secrets, so a predictable fallback would let anyone forge them.
	if (typeof cryptoObj?.getRandomValues === 'function') {
		const bytes = new Uint8Array(16);
		cryptoObj.getRandomValues(bytes);
		return `id-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
	}

	throw new Error('Secure random source unavailable: cannot generate id');
}
