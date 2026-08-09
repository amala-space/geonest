# Onboarding Screen & Netflix-Style Profile Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the sparse empty-state on the home screen with a full onboarding flow, and redesign the surveyor profile selector to look like Netflix/HBO Max with round colored avatars.

**Architecture:** Two self-contained UI changes. Task 1 modifies only `src/routes/+page.svelte` — when no projects exist, render a full-screen onboarding view instead of the current empty block. Task 2 fully replaces `src/routes/projects/[id]/profiles/+page.svelte` with a dark-background grid of round avatars. No new routes, no new data layer changes — `color` field already exists on `SurveyorProfile` and `createSurveyorProfile` already accepts it.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, CSS custom properties from `src/app.css`.

---

## Task 1: First-launch onboarding screen

**Files:**
- Modify: `src/routes/+page.svelte`

When `projects.length === 0` after loading, replace the existing empty-state `<div class="empty">` block with a dedicated full-screen onboarding section. The rest of the page (header, project list, join section) stays intact and only renders when projects exist.

### Step 1: Replace the empty-state block

Find the `{:else if projects.length === 0}` branch in the template and replace it entirely with:

```svelte
{:else if projects.length === 0}
	<div class="onboarding">
		<svg class="onboarding-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" fill="currentColor"/>
		</svg>
		<h2 class="onboarding-heading">Welcome to GeoTracker</h2>
		<p class="onboarding-sub">Start by creating a project or joining one with a link from your admin.</p>
		<div class="onboarding-actions">
			<button class="btn-new" onclick={() => goto('/projects/new')}>+ New Project</button>
			<button class="btn-join-toggle" onclick={() => joinOpen = !joinOpen}>
				🔗 Join Project
			</button>
		</div>
		{#if joinOpen}
			<div class="join-inline">
				<input
					class="join-input"
					type="text"
					placeholder="Paste project link or token"
					bind:value={joinToken}
					onkeydown={(e) => e.key === 'Enter' && handleJoin()}
					autofocus
				/>
				<button class="btn-join" onclick={handleJoin} disabled={!joinToken.trim()}>Join</button>
			</div>
		{/if}
	</div>
```

Also add `let joinOpen = $state(false);` to the script block alongside the other state variables.

Remove the existing `join-section` div at the bottom of the template (the one with `class="join-section"`) — it only matters when there are no projects, and that case is now handled above. When projects exist the join action isn't needed on the home screen (users join via a direct link).

### Step 2: Add styles

Add to the `<style>` block (remove the old `.empty`, `.empty-icon`, `.empty-heading`, `.empty-sub` rules and the `.join-section`, `.join-label`, `.join-row`, `.join-input`, `.btn-join` rules, replace with):

```css
.onboarding {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	padding: 4rem 1.5rem 2rem;
	gap: 1rem;
}

.onboarding-icon {
	width: 3.5rem;
	height: 3.5rem;
	color: var(--color-primary);
	margin-bottom: 0.25rem;
}

.onboarding-heading {
	font-size: 1.3rem;
	font-weight: 800;
	color: var(--color-text);
}

.onboarding-sub {
	font-size: 0.9rem;
	color: var(--color-muted);
	max-width: 280px;
	line-height: 1.5;
}

.onboarding-actions {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	width: 100%;
	max-width: 280px;
	margin-top: 0.5rem;
}

.btn-join-toggle {
	background: transparent;
	color: var(--color-primary-dark);
	border: 1.5px solid var(--color-primary-dark);
	border-radius: var(--radius-pill);
	padding: 0.6rem 1.25rem;
	font-size: 0.9rem;
	font-weight: 700;
	cursor: pointer;
	white-space: nowrap;
}

.btn-join-toggle:active {
	background: var(--color-primary-dark);
	color: #fff;
}

.join-inline {
	display: flex;
	gap: 0.5rem;
	width: 100%;
	max-width: 320px;
}

.join-input {
	flex: 1;
	border: 1.5px solid var(--color-border);
	border-radius: var(--radius-pill);
	padding: 0.55rem 1rem;
	font-size: 0.88rem;
	background: var(--color-surface);
	color: var(--color-text);
	outline: none;
	min-width: 0;
}

.join-input:focus {
	border-color: var(--color-primary);
}

.btn-join {
	background: var(--color-primary-dark);
	color: #fff;
	border: none;
	border-radius: var(--radius-pill);
	padding: 0.55rem 1.1rem;
	font-size: 0.88rem;
	font-weight: 700;
	cursor: pointer;
	white-space: nowrap;
	flex-shrink: 0;
}

.btn-join:disabled {
	opacity: 0.45;
	cursor: default;
}

.btn-join:not(:disabled):active {
	opacity: 0.85;
}
```

### Step 3: Type-check

```bash
cd <repository root> && npm run check
```

Expected: 0 errors, 0 warnings.

### Step 4: Commit

```bash
git add src/routes/+page.svelte
git commit -m "feat: replace empty state with first-launch onboarding screen"
```

---

## Task 2: Netflix-style profile selector

**Files:**
- Modify: `src/routes/projects/[id]/profiles/+page.svelte`

Full replacement of the template and styles. Script logic stays largely the same — only the color-generation helper is added and passed to `createSurveyorProfile`.

### Step 1: Add avatar color helper at top of script

After the imports, add:

```typescript
const AVATAR_COLORS = [
	'#2d6a4f', '#40916c', '#52b788',
	'#e76f51', '#f4a261', '#e9c46a',
	'#264653', '#457b9d', '#6b4226',
	'#9b2226', '#6a4c93', '#1982c4',
];

function randomAvatarColor(): string {
	return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function avatarStyle(color?: string): string {
	const bg = color ?? '#2d6a4f';
	return `background: ${bg};`;
}
```

### Step 2: Pass color when creating profile

In the `addProfile` function, update the `createSurveyorProfile` call:

```typescript
const profile = await createSurveyorProfile({
	projectId: safeProjectId,
	name,
	color: randomAvatarColor(),
});
```

### Step 3: Add inline add-profile state

Replace the `newProfileName` and `saving` state with a slightly expanded version — add a boolean to control whether the inline add form is open:

```typescript
let addOpen = $state(false);
```

### Step 4: Replace the template

Replace the entire template (`<div class="screen">` … closing `</div>`) with:

```svelte
<div class="screen">
	<div class="profile-page">
		<h1 class="who-heading">Who's surveying?</h1>
		<p class="who-sub">{project?.name ?? ''}</p>

		{#if loading}
			<p class="loading-text">Loading...</p>
		{:else}
			<div class="avatar-grid">
				{#each profiles as profile}
					<button
						class="avatar-slot"
						class:selected={activeProfileId === profile.id}
						onclick={() => void selectProfile(profile)}
						disabled={selectingProfileId !== null}
					>
						<span class="avatar-circle" style={avatarStyle(profile.color)}>
							{profile.name.slice(0, 1).toUpperCase()}
						</span>
						<span class="avatar-name">{profile.name}</span>
					</button>
				{/each}

				{#if !addOpen}
					<button class="avatar-slot" onclick={() => { addOpen = true; }}>
						<span class="avatar-circle avatar-add">+</span>
						<span class="avatar-name">Add new</span>
					</button>
				{:else}
					<div class="add-inline">
						<form onsubmit={(e) => void addProfile(e)}>
							<input
								type="text"
								bind:value={newProfileName}
								placeholder="Name"
								autocomplete="name"
								autofocus
							/>
							<div class="add-inline-actions">
								<button type="submit" class="btn-confirm" disabled={saving}>
									{saving ? '…' : '✓'}
								</button>
								<button type="button" class="btn-cancel" onclick={() => { addOpen = false; newProfileName = ''; error = ''; }}>✕</button>
							</div>
							{#if error}<p class="add-error">{error}</p>{/if}
						</form>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
```

### Step 5: Replace the styles

Replace the entire `<style>` block with:

```css
.screen {
	min-height: 100dvh;
	background: #141414;
	display: flex;
	align-items: center;
	justify-content: center;
}

.profile-page {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	padding: 2rem 1rem 3rem;
	width: 100%;
	max-width: 540px;
}

.who-heading {
	font-size: 1.75rem;
	font-weight: 800;
	color: #fff;
	margin-bottom: 0.25rem;
}

.who-sub {
	font-size: 0.85rem;
	color: #aaa;
	margin-bottom: 1.5rem;
}

.loading-text {
	color: #aaa;
	font-size: 0.9rem;
}

.avatar-grid {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 1.5rem 2rem;
	width: 100%;
}

.avatar-slot {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6rem;
	background: transparent;
	border: none;
	padding: 0;
	cursor: pointer;
}

.avatar-slot:disabled {
	opacity: 0.6;
	cursor: default;
}

.avatar-circle {
	width: 80px;
	height: 80px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2rem;
	font-weight: 800;
	color: #fff;
	transition: transform 0.12s ease, box-shadow 0.12s ease;
	border: 3px solid transparent;
	flex-shrink: 0;
}

.avatar-slot:not(:disabled):hover .avatar-circle,
.avatar-slot:not(:disabled):focus-visible .avatar-circle {
	transform: scale(1.07);
}

.avatar-slot.selected .avatar-circle {
	border-color: #fff;
	box-shadow: 0 0 0 3px rgba(255,255,255,0.35);
}

.avatar-add {
	background: transparent;
	border: 2.5px dashed #555;
	color: #888;
	font-size: 1.75rem;
}

.avatar-name {
	font-size: 0.82rem;
	color: #ccc;
	font-weight: 500;
	max-width: 90px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.avatar-slot.selected .avatar-name {
	color: #fff;
	font-weight: 700;
}

/* Inline add form */
.add-inline {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.add-inline form {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.add-inline input {
	width: 130px;
	padding: 0.55rem 0.75rem;
	border: 1.5px solid #555;
	border-radius: 8px;
	background: #222;
	color: #fff;
	font-size: 0.88rem;
	text-align: center;
	outline: none;
}

.add-inline input:focus {
	border-color: #fff;
}

.add-inline-actions {
	display: flex;
	gap: 0.4rem;
}

.btn-confirm {
	background: #2d6a4f;
	color: #fff;
	border: none;
	border-radius: 50%;
	width: 2rem;
	height: 2rem;
	font-size: 0.85rem;
	font-weight: 700;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-confirm:disabled {
	opacity: 0.5;
	cursor: default;
}

.btn-cancel {
	background: #333;
	color: #ccc;
	border: none;
	border-radius: 50%;
	width: 2rem;
	height: 2rem;
	font-size: 0.85rem;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.add-error {
	color: #f87171;
	font-size: 0.78rem;
}
```

### Step 6: Type-check

```bash
cd <repository root> && npm run check
```

Expected: 0 errors, 0 warnings.

### Step 7: Commit

```bash
git add src/routes/projects/\[id\]/profiles/+page.svelte
git commit -m "feat: redesign profile selector with Netflix-style round avatars"
```

---

## Verification

```bash
npm run check
npm run build
```

Manual test checklist:
- [ ] Open app with no projects → see onboarding screen (not blank empty state)
- [ ] Tap "Join Project" → input expands inline
- [ ] Tap "+ New Project" → navigates to `/projects/new`
- [ ] Create a project, open it → redirect to profiles page
- [ ] Profiles page: dark background, round avatars, centered grid
- [ ] Tap "+ Add new" → inline input appears in grid
- [ ] Add profile → avatar appears with random color
- [ ] Tap avatar → navigates to project map
- [ ] Selected avatar shows white ring
