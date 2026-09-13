import { createHash, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'cut_atelier_session';

export class LocalAccessAuth {
	private readonly sessionDigest: string | null;

	constructor(private readonly token: string | undefined) {
		this.sessionDigest = token ? digest(token) : null;
	}

	isEnabled(): boolean {
		return this.sessionDigest !== null;
	}

	verifyCredential(candidate: string): boolean {
		return this.token ? safeEqual(candidate, this.token) : true;
	}

	verifySession(candidate: string | undefined): boolean {
		if (!this.sessionDigest) return true;
		return candidate ? safeEqual(candidate, this.sessionDigest) : false;
	}

	createSession(): string {
		if (!this.sessionDigest) throw new Error('認証は無効です。');
		return this.sessionDigest;
	}
}

function digest(value: string): string {
	return createHash('sha256').update(value).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
