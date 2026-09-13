import { describe, expect, it } from 'vitest';
import { LocalAccessAuth } from './auth';

describe('LocalAccessAuth', () => {
	it('allows local mode when no token is configured', () => {
		const auth = new LocalAccessAuth(undefined);
		expect(auth.isEnabled()).toBe(false);
		expect(auth.verifySession(undefined)).toBe(true);
	});

	it('exchanges the configured token for a non-plaintext session value', () => {
		const auth = new LocalAccessAuth('atelier-secret');
		expect(auth.verifyCredential('wrong')).toBe(false);
		expect(auth.verifyCredential('atelier-secret')).toBe(true);
		expect(auth.createSession()).not.toBe('atelier-secret');
		expect(auth.verifySession(auth.createSession())).toBe(true);
	});
});
