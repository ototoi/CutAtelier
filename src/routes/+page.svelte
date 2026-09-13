<script lang="ts">
	import { resolve } from '$app/paths';

	let { data, form } = $props();
	const selectedShot = $derived(data.selectedShot);
	let activeTakeId = $state('');
	let video = $state<HTMLVideoElement>();
	let startFrame = $state(0);
	let endFrame = $state(0);
	let drawing = $state(false);
	let origin = $state({ x: 0, y: 0 });
	let rectangle = $state({ x: 0, y: 0, width: 0, height: 0 });
	let frameShotId = $state('');

	$effect(() => {
		if (selectedShot && !selectedShot.takes.some((take) => take.id === activeTakeId)) {
			activeTakeId = selectedShot.acceptedTakeId ?? selectedShot.takes[0]?.id ?? '';
		}
		if (selectedShot && selectedShot.id !== frameShotId) {
			frameShotId = selectedShot.id;
			startFrame = 0;
			endFrame = 0;
			rectangle = { x: 0, y: 0, width: 0, height: 0 };
		}
	});

	const activeTake = $derived(selectedShot?.takes.find((take) => take.id === activeTakeId));
	const fps = $derived(
		data.workspace
			? data.workspace.project.fpsNumerator / data.workspace.project.fpsDenominator
			: 24
	);

	function frameTime(frame: number) {
		const seconds = frame / fps;
		return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
	}

	function currentFrame() {
		return Math.max(
			0,
			Math.min((selectedShot?.durationFrames ?? 1) - 1, Math.round((video?.currentTime ?? 0) * fps))
		);
	}

	function captureStart() {
		startFrame = currentFrame();
		endFrame = Math.max(endFrame, startFrame);
	}

	function captureEnd() {
		endFrame = currentFrame();
		if (endFrame < startFrame) startFrame = endFrame;
	}

	function point(event: PointerEvent) {
		const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
			y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
		};
	}

	function beginRectangle(event: PointerEvent) {
		origin = point(event);
		rectangle = { ...origin, width: 0, height: 0 };
		drawing = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function resizeRectangle(event: PointerEvent) {
		if (!drawing) return;
		const next = point(event);
		rectangle = {
			x: Math.min(origin.x, next.x),
			y: Math.min(origin.y, next.y),
			width: Math.abs(next.x - origin.x),
			height: Math.abs(next.y - origin.y)
		};
	}
</script>

<svelte:head><title>Cut Atelier — MV Review Workspace</title></svelte:head>

<header class="topbar">
	<div class="brand">
		<span class="brand-mark">CA</span>
		<div><strong>Cut Atelier</strong><small>REVIEW WORKSPACE</small></div>
	</div>
	{#if data.workspace}
		<div class="project-title">
			<span class="eyebrow">PROJECT</span><strong>{data.workspace.project.name}</strong>
		</div>
		<div class="save-state"><span></span> 保存済み · v{data.workspace.project.version}</div>
	{/if}
</header>

{#if form?.message}<div class="notice error">{form.message}</div>{/if}

{#if !data.workspace}
	<main class="welcome">
		<div class="welcome-card">
			<p class="eyebrow">FIRST PROJECT</p>
			<h1>映像を、言葉にする前に<br />指し示す。</h1>
			<p>最初のプロジェクトを作成すると、カット管理とレビューを始められます。</p>
			<form method="POST" action="?/createProject" class="stack-form">
				<label>プロジェクト名<input name="name" placeholder="例: 20秒パイロット" required /></label>
				<div class="form-row">
					<label>FPS<input name="fpsNumerator" type="number" min="1" value="24" required /></label
					><label
						>分母<input name="fpsDenominator" type="number" min="1" value="1" required /></label
					>
				</div>
				<button class="primary">プロジェクトを作成</button>
			</form>
		</div>
	</main>
{:else}
	<main class="workspace">
		<aside class="rail">
			<div class="panel-heading">
				<div>
					<span class="eyebrow">CUTS</span><strong>{data.workspace.shots.length} shots</strong>
				</div>
				<button class="icon-button" popovertarget="add-shot" title="カットを追加">＋</button>
			</div>
			<nav class="shot-list" aria-label="カット一覧">
				{#each data.workspace.shots as shot, index (shot.id)}
					<a
						href={resolve(`/?project=${data.workspace.project.id}&shot=${shot.id}`)}
						class:active={shot.id === selectedShot?.id}
					>
						<span class="shot-index">{String(index + 1).padStart(2, '0')}</span><span
							class="thumbnail"><i class:ready={Boolean(shot.acceptedTakeId)}></i></span
						>
						<span class="shot-copy"
							><strong>{shot.code} · {shot.title}</strong><small
								>{frameTime(shot.startFrame)} — {frameTime(
									shot.startFrame + shot.durationFrames
								)}</small
							></span
						>
						<span class={`status ${shot.status}`}>{shot.status}</span>
					</a>
				{/each}
			</nav>
			{#if !data.workspace.shots.length}<p class="empty">まだカットがありません。</p>{/if}
		</aside>

		<section class="stage">
			{#if selectedShot}
				<div class="stage-header">
					<div>
						<p class="eyebrow">{selectedShot.code} · {selectedShot.status}</p>
						<h1>{selectedShot.title}</h1>
					</div>
					<div class="stage-actions">
						<form method="POST" action="?/moveShot">
							<input type="hidden" name="projectId" value={data.workspace.project.id} /><input
								type="hidden"
								name="shotId"
								value={selectedShot.id}
							/><button name="direction" value="up" class="ghost">← 前へ</button><button
								name="direction"
								value="down"
								class="ghost">後へ →</button
							>
						</form>
						<button class="ghost" popovertarget="edit-shot">設定</button>
					</div>
				</div>

				<div class="viewer">
					{#if activeTake}
						{#if activeTake.mediaType.startsWith('image/')}<img
								src={`/media/${activeTake.id}`}
								alt={activeTake.label}
							/>{:else}<!-- svelte-ignore a11y_media_has_caption --><video
								bind:this={video}
								src={`/media/${activeTake.id}`}
								controls
								playsinline
							></video>{/if}
						<div
							class="draw-layer"
							role="presentation"
							onpointerdown={beginRectangle}
							onpointermove={resizeRectangle}
							onpointerup={() => (drawing = false)}
						>
							{#if rectangle.width > 0.005 && rectangle.height > 0.005}<div
									class="drawn-rectangle"
									style={`left:${rectangle.x * 100}%;top:${rectangle.y * 100}%;width:${rectangle.width * 100}%;height:${rectangle.height * 100}%`}
								></div>{/if}
						</div>
						<div class="viewer-label"><span>{activeTake.status}</span>{activeTake.label}</div>
					{:else}<div class="viewer-empty">
							<span>NO TAKE</span>
							<p>右側の「素材を登録」から、既存の動画または画像を追加してください。</p>
						</div>{/if}
				</div>

				<div class="transport">
					<span>{frameTime(selectedShot.startFrame)}</span>
					<div class="timeline-track">
						{#each selectedShot.annotations as annotation (annotation.id)}<i
								class:keep={annotation.kind === 'keep'}
								style={`left:${(annotation.startFrame / selectedShot.durationFrames) * 100}%`}
								title={annotation.note || annotation.category}
							></i>{/each}
					</div>
					<span>{frameTime(selectedShot.startFrame + selectedShot.durationFrames)}</span>
				</div>

				<div class="take-strip">
					<span class="eyebrow">TAKES</span>{#each selectedShot.takes as take (take.id)}<button
							class:active={take.id === activeTakeId}
							onclick={() => (activeTakeId = take.id)}
							>{take.label}<small>{take.status}</small></button
						>{/each}
				</div>
			{:else}<div class="blank-stage"><h1>最初のカットを追加してください。</h1></div>{/if}
		</section>

		<aside class="inspector">
			{#if selectedShot}
				<section class="inspector-section">
					<div class="panel-heading compact">
						<div><span class="eyebrow">ANNOTATE</span><strong>画面で囲んで指摘</strong></div>
						<button
							class="text-button"
							onclick={() => (rectangle = { x: 0, y: 0, width: 0, height: 0 })}>枠を消す</button
						>
					</div>
					<form method="POST" action="?/addAnnotation" class="stack-form dense">
						<input type="hidden" name="projectId" value={data.workspace.project.id} /><input
							type="hidden"
							name="shotId"
							value={selectedShot.id}
						/><input type="hidden" name="takeId" value={activeTakeId} /><input
							type="hidden"
							name="geometry"
							value={rectangle.width > 0 ? JSON.stringify(rectangle) : ''}
						/>
						<div class="segmented">
							<label
								><input type="radio" name="kind" value="issue" checked /><span>直してほしい</span
								></label
							><label><input type="radio" name="kind" value="keep" /><span>維持したい</span></label>
						</div>
						<label
							>分類<select name="category"
								><option value="unnatural">不自然</option><option value="direction">向き</option
								><option value="layout">位置・大きさ</option><option value="motion">動き</option
								><option value="continuity">繋がり</option><option value="mouth">口元</option
								><option value="other">その他</option></select
							></label
						>
						<div class="frame-range">
							<label
								>開始<input
									name="startFrame"
									type="number"
									min="0"
									max={selectedShot.durationFrames - 1}
									bind:value={startFrame}
								/></label
							><button type="button" class="capture" onclick={captureStart}>現在</button><label
								>終了<input
									name="endFrame"
									type="number"
									min="0"
									max={selectedShot.durationFrames - 1}
									bind:value={endFrame}
								/></label
							><button type="button" class="capture" onclick={captureEnd}>現在</button>
						</div>
						<label
							>短いメモ<textarea
								name="note"
								rows="3"
								placeholder="言葉にしにくければ空欄でも保存できます"></textarea></label
						><button class="primary">指摘を保存</button>
					</form>
				</section>
				<section class="inspector-section">
					<div class="panel-heading compact">
						<div>
							<span class="eyebrow">OPEN NOTES</span><strong
								>{selectedShot.annotations.filter((item) => item.status === 'open')
									.length}件</strong
							>
						</div>
					</div>
					<div class="note-list">
						{#each selectedShot.annotations as annotation (annotation.id)}<article
								class:keep={annotation.kind === 'keep'}
							>
								<span>{annotation.kind === 'keep' ? '維持' : annotation.category}</span><strong
									>F{annotation.startFrame}–{annotation.endFrame}</strong
								>
								<p>{annotation.note || '描画による指摘'}</p>
							</article>{/each}
						{#if !selectedShot.annotations.length}<p class="empty">指摘はまだありません。</p>{/if}
					</div>
				</section>
				<section class="inspector-section actions-section">
					<button class="secondary" popovertarget="revision-request">修正依頼を作成</button><button
						class="secondary"
						popovertarget="register-take">素材を登録</button
					>
					{#if activeTake && activeTake.id !== selectedShot.acceptedTakeId}<form
							method="POST"
							action="?/acceptTake"
						>
							<input type="hidden" name="projectId" value={data.workspace.project.id} /><input
								type="hidden"
								name="shotId"
								value={selectedShot.id}
							/><input type="hidden" name="takeId" value={activeTake.id} /><input
								type="hidden"
								name="expectedShotVersion"
								value={selectedShot.version}
							/><input type="hidden" name="reason" value="レビュー画面で採用" /><button
								class="primary">表示中のテイクを採用</button
							>
						</form>{/if}
				</section>
			{/if}
		</aside>
	</main>
	<div class="project-timeline">
		<span>{data.workspace.project.name}</span>
		<div class="timeline-cuts">
			{#each data.workspace.shots as shot (shot.id)}<a
					href={resolve(`/?project=${data.workspace.project.id}&shot=${shot.id}`)}
					class:active={shot.id === selectedShot?.id}
					style={`flex-grow:${shot.durationFrames}`}>{shot.code}</a
				>{/each}
		</div>
	</div>
{/if}

<div id="add-shot" popover class="dialog">
	<form method="POST" action="?/addShot" class="stack-form">
		<input type="hidden" name="projectId" value={data.workspace?.project.id ?? ''} />
		<div class="dialog-title">
			<div>
				<span class="eyebrow">NEW CUT</span>
				<h2>カットを追加</h2>
			</div>
			<button type="button" popovertarget="add-shot" popovertargetaction="hide">×</button>
		</div>
		<div class="form-row">
			<label>番号<input name="code" placeholder="S01" required /></label><label
				>尺（frame）<input name="durationFrames" type="number" min="1" value="48" required /></label
			>
		</div>
		<label>カット名<input name="title" placeholder="屋上・信号を見上げる" required /></label><label
			>演出メモ<textarea name="direction" rows="4"></textarea></label
		><button class="primary">追加する</button>
	</form>
</div>

{#if selectedShot && data.workspace}
	<div id="edit-shot" popover class="dialog">
		<form method="POST" action="?/updateShot" class="stack-form">
			<input type="hidden" name="projectId" value={data.workspace.project.id} /><input
				type="hidden"
				name="shotId"
				value={selectedShot.id}
			/><input type="hidden" name="expectedVersion" value={selectedShot.version} />
			<div class="dialog-title">
				<div>
					<span class="eyebrow">CUT SETTINGS</span>
					<h2>{selectedShot.code}</h2>
				</div>
				<button type="button" popovertarget="edit-shot" popovertargetaction="hide">×</button>
			</div>
			<label>カット名<input name="title" value={selectedShot.title} required /></label>
			<div class="form-row">
				<label
					>尺（frame）<input
						name="durationFrames"
						type="number"
						min="1"
						value={selectedShot.durationFrames}
					/></label
				><label
					>状態<select name="status" value={selectedShot.status}
						><option value="planning">planning</option><option value="generating">generating</option
						><option value="review">review</option><option value="approved">approved</option><option
							value="blocked">blocked</option
						></select
					></label
				>
			</div>
			<label>演出メモ<textarea name="direction" rows="5">{selectedShot.direction}</textarea></label
			><button class="primary">更新する</button>
		</form>
	</div>
	<div id="register-take" popover class="dialog wide">
		<form method="POST" action="?/registerTake" class="stack-form">
			<input type="hidden" name="projectId" value={data.workspace.project.id} /><input
				type="hidden"
				name="shotId"
				value={selectedShot.id}
			/>
			<div class="dialog-title">
				<div>
					<span class="eyebrow">REGISTER TAKE</span>
					<h2>ローカル素材を登録</h2>
				</div>
				<button type="button" popovertarget="register-take" popovertargetaction="hide">×</button>
			</div>
			<label>テイク名<input name="label" placeholder="v01 · FL2VA" required /></label><label
				>サーバー上の絶対パス<input
					name="assetPath"
					placeholder="/mnt/hdd1/.../shot01.mp4"
					required
				/></label
			>
			<div class="form-row">
				<label
					>メディア種別<select name="mediaType"
						><option value="">拡張子から判定</option><option value="video/mp4">MP4</option><option
							value="video/webm">WebM</option
						><option value="video/quicktime">MOV</option><option value="image/png">PNG</option
						><option value="image/jpeg">JPEG</option></select
					></label
				><label>実尺（frame、任意）<input name="durationFrames" type="number" min="1" /></label>
			</div>
			<p class="help">ファイルはコピーせず、登録したID経由でのみ配信します。</p>
			<button class="primary">素材を登録</button>
		</form>
	</div>
	<div id="revision-request" popover class="dialog">
		<form method="POST" action="?/createRequest" class="stack-form">
			<input type="hidden" name="projectId" value={data.workspace.project.id} /><input
				type="hidden"
				name="shotId"
				value={selectedShot.id}
			/><input type="hidden" name="takeId" value={activeTakeId} />
			<div class="dialog-title">
				<div>
					<span class="eyebrow">REVISION</span>
					<h2>修正依頼を固定</h2>
				</div>
				<button type="button" popovertarget="revision-request" popovertargetaction="hide">×</button>
			</div>
			<label>依頼名<input name="title" placeholder="視線と背景配置を修正" required /></label><label
				>補足<textarea
					name="note"
					rows="5"
					placeholder="現在の未解決指摘とカット情報は自動でスナップショットされます"
				></textarea></label
			><button class="primary">下書きを作成</button>
		</form>
	</div>
{/if}
