import { describe, expect, it } from 'vitest';
import { openDatabase } from './db/database';
import { ProjectWorkspace } from './workspace';

describe('ProjectWorkspace', () => {
	it('keeps the review loop and cut ordering behind one interface', () => {
		const workspace = new ProjectWorkspace(openDatabase(':memory:'));
		const projectId = workspace.createProject({ name: 'Pilot', fpsNumerator: 24 });
		const firstId = workspace.addShot({
			projectId,
			code: 'S01',
			title: 'Opening',
			durationFrames: 48
		});
		const secondId = workspace.addShot({
			projectId,
			code: 'S02',
			title: 'Signal',
			durationFrames: 72
		});

		workspace.moveShot(secondId, 'up');
		const takeId = workspace.registerTake({
			shotId: secondId,
			label: 'take 01',
			assetPath: '/tmp/take01.mp4',
			mediaType: 'video/mp4',
			durationFrames: 72
		});
		workspace.addAnnotation({
			shotId: secondId,
			takeId,
			kind: 'issue',
			category: 'continuity',
			startFrame: 4,
			endFrame: 10,
			note: '視線を前カットへ繋ぐ',
			geometry: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 }
		});
		workspace.createRevisionRequest({ shotId: secondId, takeId, title: '視線修正' });
		workspace.acceptTake({
			shotId: secondId,
			takeId,
			expectedShotVersion: 2,
			reason: '前後を確認済み'
		});

		const view = workspace.getWorkspace(projectId);
		expect(view?.shots.map((shot) => shot.id)).toEqual([secondId, firstId]);
		expect(view?.shots[0].startFrame).toBe(0);
		expect(view?.shots[1].startFrame).toBe(72);
		expect(view?.shots[0].acceptedTakeId).toBe(takeId);
		expect(view?.shots[0].status).toBe('approved');
		expect(view?.shots[0].annotations[0].geometry).toEqual({
			x: 0.2,
			y: 0.1,
			width: 0.3,
			height: 0.4
		});
		expect(
			(view?.shots[0].revisionRequests[0].snapshot as { annotations: unknown[] }).annotations
		).toHaveLength(1);
		expect(() =>
			workspace.acceptTake({
				shotId: secondId,
				takeId,
				expectedShotVersion: 2,
				reason: '古い画面から再採用'
			})
		).toThrow('別の画面で採用状態が更新されています');
		workspace.close();
	});

	it('rejects stale shot edits', () => {
		const workspace = new ProjectWorkspace(openDatabase(':memory:'));
		const projectId = workspace.createProject({ name: 'Concurrency' });
		const shotId = workspace.addShot({
			projectId,
			code: 'S01',
			title: 'One',
			durationFrames: 48
		});
		workspace.updateShot({
			shotId,
			expectedVersion: 1,
			title: 'Updated',
			durationFrames: 48,
			status: 'review',
			direction: ''
		});
		expect(() =>
			workspace.updateShot({
				shotId,
				expectedVersion: 1,
				title: 'Stale',
				durationFrames: 48,
				status: 'review',
				direction: ''
			})
		).toThrow('別の画面で更新されています');
		workspace.close();
	});
});
