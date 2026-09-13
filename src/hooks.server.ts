import { env } from '$env/dynamic/private';
import { LocalAccessAuth, SESSION_COOKIE } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const auth = new LocalAccessAuth(env.CUT_ATELIER_TOKEN);
	if (!auth.isEnabled() || isPublicPath(event.url.pathname)) return resolve(event);

	if (!auth.verifySession(event.cookies.get(SESSION_COOKIE))) {
		if (
			event.request.method === 'GET' &&
			event.request.headers.get('accept')?.includes('text/html')
		) {
			redirect(303, '/login');
		}
		return new Response('認証が必要です。', { status: 401 });
	}
	return resolve(event);
};

function isPublicPath(pathname: string): boolean {
	return pathname === '/login' || pathname === '/robots.txt' || pathname.startsWith('/_app/');
}
