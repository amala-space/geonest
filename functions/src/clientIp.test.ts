import { describe, expect, it } from 'vitest';
import { resolveClientIp, resolveTrustedProxyDepth } from './clientIp.js';

const request = (headers: Record<string, unknown>, ip?: string) => ({
	headers,
	ip,
	socket: { remoteAddress: '10.0.0.1' }
});

describe('resolveTrustedProxyDepth', () => {
	it('trusts a single appended hop by default', () => {
		expect(resolveTrustedProxyDepth(undefined)).toBe(1);
		expect(resolveTrustedProxyDepth('   ')).toBe(1);
	});

	it('accepts a deeper trusted chain', () => {
		expect(resolveTrustedProxyDepth('2')).toBe(2);
	});

	it('rejects values that would silently trust spoofed entries', () => {
		expect(() => resolveTrustedProxyDepth('0')).toThrow(/FEEDBACK_TRUSTED_PROXY_DEPTH/);
		expect(() => resolveTrustedProxyDepth('-1')).toThrow(/FEEDBACK_TRUSTED_PROXY_DEPTH/);
		expect(() => resolveTrustedProxyDepth('1.5')).toThrow(/FEEDBACK_TRUSTED_PROXY_DEPTH/);
		expect(() => resolveTrustedProxyDepth('first')).toThrow(/FEEDBACK_TRUSTED_PROXY_DEPTH/);
	});
});

describe('resolveClientIp', () => {
	it('uses the entry appended by the trusted front end, not the caller prefix', () => {
		const ip = resolveClientIp(request({ 'x-forwarded-for': '203.0.113.9' }));

		expect(ip).toBe('203.0.113.9');
	});

	it('ignores a spoofed prefix supplied by the caller', () => {
		// An attacker sends their own header; Google appends the real address.
		const ip = resolveClientIp(request({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }));

		expect(ip).toBe('203.0.113.9');
	});

	it('does not let a spoofed chain rotate the rate-limit bucket', () => {
		const first = resolveClientIp(request({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }));
		const second = resolveClientIp(request({ 'x-forwarded-for': '2.2.2.2, 203.0.113.9' }));

		expect(first).toBe(second);
	});

	it('skips one extra hop when an additional trusted proxy is configured', () => {
		const ip = resolveClientIp(request({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9, 198.51.100.7' }), 2);

		expect(ip).toBe('203.0.113.9');
	});

	it('joins duplicate headers instead of trusting the first array entry', () => {
		const ip = resolveClientIp(request({ 'x-forwarded-for': ['1.2.3.4', '203.0.113.9'] }));

		expect(ip).toBe('203.0.113.9');
	});

	it('tolerates padding and empty entries', () => {
		const ip = resolveClientIp(request({ 'x-forwarded-for': ' 1.2.3.4 , , 203.0.113.9 ,' }));

		expect(ip).toBe('203.0.113.9');
	});

	it('degrades to the left-most entry when the chain is shorter than the trusted depth', () => {
		const ip = resolveClientIp(request({ 'x-forwarded-for': '203.0.113.9' }), 3);

		expect(ip).toBe('203.0.113.9');
	});

	it('falls back to the socket address without a forwarding header', () => {
		expect(resolveClientIp(request({}))).toBe('10.0.0.1');
		expect(resolveClientIp(request({}, '198.51.100.2'))).toBe('198.51.100.2');
	});

	it('falls back when the header carries no usable entry', () => {
		expect(resolveClientIp(request({ 'x-forwarded-for': ' , ' }))).toBe('10.0.0.1');
	});
});
