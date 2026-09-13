import { env } from '$env/dynamic/private';
import { LocalAccessAuth, SESSION_COOKIE } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies }) => {
	const auth = new LocalAccessAuth(env.CUT_ATELIER_TOKEN);
	if (!auth.isEnabled() || auth.verifySession(cookies.get(SESSION_COOKIE))) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const auth = new LocalAccessAuth(env.CUT_ATELIER_TOKEN);
		const data = await request.formData();
		if (!auth.isEnabled()) redirect(303, '/');
		if (!auth.verifyCredential(String(data.get('token') ?? ''))) {
			return fail(400, { message: '接続トークンが違います。' });
		}
		cookies.set(SESSION_COOKIE, auth.createSession(), {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: false,
			maxAge: 60 * 60 * 24 * 30
		});
		redirect(303, '/');
	}
};
