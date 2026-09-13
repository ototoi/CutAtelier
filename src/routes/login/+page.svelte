<script lang="ts">
	let { form } = $props();
</script>

<svelte:head><title>ログイン — Cut Atelier</title></svelte:head>

<header class="topbar login-bar">
	<div class="brand">
		<span class="brand-mark">CA</span>
		<div><strong>Cut Atelier</strong><small>LOCAL ACCESS</small></div>
	</div>
</header>

<main class="welcome">
	<div class="welcome-card login-card">
		<p class="eyebrow">LAN ACCESS</p>
		<h1>制作室へ入る</h1>
		<p>Cut Atelierを起動したPCに表示された接続トークンを入力してください。</p>
		{#if form?.message}<p class="inline-error">{form.message}</p>{/if}
		<form method="POST" class="stack-form">
			<label
				>接続トークン<input
					name="token"
					type="password"
					autocomplete="current-password"
					required
				/></label
			>
			<button class="primary">接続する</button>
		</form>
	</div>
</main>
