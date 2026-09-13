import { getProjectWorkspace } from '$lib/server/app';
import { error } from '@sveltejs/kit';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, request }) => {
	const asset = getProjectWorkspace().getTakeAsset(params.takeId);
	if (!asset) error(404, 'テイクが見つかりません。');

	let size: number;
	try {
		size = statSync(asset.assetPath).size;
	} catch {
		error(404, '素材ファイルが見つかりません。');
	}
	if (size === 0) error(404, '素材ファイルが空です。');

	const range = request.headers.get('range');
	if (!range) return stream(asset.assetPath, asset.mediaType, 0, size - 1, size, 200);
	const match = /^bytes=(\d*)-(\d*)$/.exec(range);
	if (!match)
		return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
	const start = match[1] ? Number(match[1]) : 0;
	const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		start > end ||
		start >= size
	) {
		return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
	}
	return stream(asset.assetPath, asset.mediaType, start, end, size, 206);
};

function stream(
	path: string,
	contentType: string,
	start: number,
	end: number,
	total: number,
	status: number
): Response {
	const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
	const headers: Record<string, string> = {
		'Accept-Ranges': 'bytes',
		'Content-Type': contentType,
		'Content-Length': String(end - start + 1),
		'Cache-Control': 'private, no-cache'
	};
	if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
	return new Response(body, { status, headers });
}
