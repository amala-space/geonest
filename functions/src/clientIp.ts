const DEFAULT_TRUSTED_PROXY_DEPTH = 1;

export type RawRequestLike = {
	headers: Record<string, unknown>;
	ip?: string;
	socket?: { remoteAddress?: string };
};

/**
 * How many right-most `X-Forwarded-For` entries are written by infrastructure
 * this deployment trusts.
 *
 * Google's front end *appends* the originating client IP to whatever the caller
 * already sent, so the left-most entry is attacker-controlled and must never be
 * used for rate limiting — a spoofed header would mint a fresh quota bucket per
 * request. One trusted hop (the default) means the last entry is the real
 * client. Raise this by one for every additional trusted proxy in front of the
 * callable, such as an external HTTPS load balancer or a Firebase Hosting
 * rewrite, because each hop appends another entry.
 */
export function resolveTrustedProxyDepth(
	configuredDepth = process.env.FEEDBACK_TRUSTED_PROXY_DEPTH
): number {
	if (!configuredDepth?.trim()) return DEFAULT_TRUSTED_PROXY_DEPTH;

	const depth = Number(configuredDepth);
	if (!Number.isInteger(depth) || depth < 1) {
		throw new Error(`Invalid FEEDBACK_TRUSTED_PROXY_DEPTH: ${configuredDepth}`);
	}

	return depth;
}

/**
 * Resolve the client IP used for rate limiting. Falls back to the socket
 * address only when no forwarding header is present (e.g. the local emulator).
 */
export function resolveClientIp(req: RawRequestLike, depth = resolveTrustedProxyDepth()): string {
	const forwarded = req.headers['x-forwarded-for'];
	// Duplicate headers must be joined, not sampled: taking one array element
	// would reintroduce the caller-supplied prefix as the resolved address.
	const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;

	if (typeof header === 'string') {
		const entries = header
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
		// Clamp so a header shorter than the configured depth degrades to the
		// left-most entry rather than falling through to the proxy address.
		const trusted = entries[Math.max(entries.length - depth, 0)];
		if (trusted) return trusted;
	}

	return req.ip || req.socket?.remoteAddress || 'unknown';
}
