# VISUAL_PARITY.md

Comparison of every screen migrated in Phase 1 against its original Vite implementation. All colors, radii, shadows, spacing and typography values below were taken directly from `src/index.css` and the relevant Vite component files, and re-implemented as Tailwind utilities backed by the design tokens in `next-app/src/app/globals.css` (see `next-app/README.md` for the token list).

Verification method: `npm run build && npm run start` in `next-app/`, then `curl` against each route to confirm HTTP 200 + correct `<title>`, plus manual re-reading of the original Vite source line-by-line against the new component for every color/spacing/radius value used. No automated screenshot diffing tool was available in this environment — see "How to compare" in `next-app/README.md` for the manual side-by-side procedure.

**Expected result: no meaningful visual difference.** Two systemic items apply to every screen (documented once here, not repeated per-route below):

1. **Typography — this migration corrects a latent bug, not a design change.** The original `src/index.html` never loads the Inter font file (no `<link>` to Google Fonts, no `@font-face`). `index.css` only *references* `'Inter'` in its `font-family` stack, so the original Vite app has always silently fallen back to the OS system font (`system-ui`/`-apple-system`) on every machine that doesn't happen to have Inter installed locally. The Next.js app loads Inter properly via `next/font/google`. This means the new app's text may look subtly different from what the original *actually renders* today, even though it is the **correct** implementation of the approved design system ("Inter typography" per the audit brief). This is flagged here rather than silently fixed without disclosure.
2. **Interactive affordances.** The original components style buttons/links with static inline `style={{}}` objects and define no `:hover`/`:focus-visible` rules (only the sidebar/nav, which isn't in scope this phase, and one unused `transition: background 0.2s` declaration). The migrated components add `hover:` and `focus-visible:ring-2` states (see `button-variants.ts`) so keyboard users get a visible focus indicator, per Step 3's explicit requirement to "preserve keyboard focus states." At rest (no hover/focus), colors are pixel-identical to the original. This is an additive accessibility fix, not a redesign.

---

## `/` — Landing Page

- **Original:** `src/pages/LandingPage.jsx`
- **New route:** `next-app/src/app/page.tsx`
- **Components reused:** `PublicNav`, `PublicFooter`, `LinkButton`
- **Responsive behavior:** Original has no explicit breakpoints on this screen — it relies on `flex-wrap` and `minmax()` grid tracks (`repeat(auto-fit, minmax(300px, 1fr))`) to reflow. Reproduced with Tailwind's `flex-wrap` + a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` feature grid, which reflows at equivalent widths.
- **Known visual differences:**
  - Hero button row: original always renders 2 buttons side by side (no stacking rule); Tailwind's `flex-wrap` will stack them below ~420px viewport width where the original would compress instead of wrap. At the design's actual target widths (mobile ≥360px with two buttons ~180px each) this only triggers on very narrow devices and is a net readability improvement, not a regression.
  - CTA buttons link to `/dashboard` and `/review/sec_tok_brand_identity_99`, which are **not migrated in Phase 1** and currently resolve to the Next.js `not-found` page. This preserves the original's exact click target and copy; the destination screens are simply out of scope for this phase (see `MIGRATION_STATUS.md`).
- **Reason:** Both differences are consequences of the phase boundary (dashboard/workspace screens deferred), not a rendering discrepancy.

---

## `/login` — Sign In

- **Original:** `src/pages/AuthScreens.jsx` (`mode="login"`)
- **New route:** `next-app/src/app/login/page.tsx` → `AuthForm`
- **Components reused:** `AuthForm`, `Button`, `Toast`
- **Responsive behavior:** Identical — a single centered card (`max-width: 440px`) on a full-height navy background at all viewport widths, matching the original's non-responsive fixed-width card.
- **Known visual differences:**
  - **Submission behavior (intentional, required by the brief).** The original's `handleSubmit` calls `showToast('Logged in as Arjun Raj (Creator)', 'success')` and then **navigates to `/dashboard`**, i.e. it simulates a successful login. Per Step 4 of this phase's instructions ("Do not create fake authentication logic"), the migrated form instead calls `event.preventDefault()` and shows a toast reading *"Demo only — authentication is not implemented in this phase."* with type `info`, and never navigates. This is a deliberate, brief-mandated behavioral divergence, not a bug — the visual layout of the form itself is unchanged.
  - Password field starts empty in the new form; the original pre-fills it with a literal `••••••••` placeholder string as its initial `value`. The new version uses the `placeholder` attribute for the dots instead of pre-filled `value`, so the field reads as empty (better semantics — a placeholder shouldn't be indistinguishable from a real value) but is visually equivalent once a user clicks in.
- **Reason:** Both are required by the "no fake auth" boundary and a minor, disclosed correctness fix.

---

## `/register` — Create Account

- **Original:** `src/pages/AuthScreens.jsx` (`mode="register"`)
- **New route:** `next-app/src/app/register/page.tsx` → `AuthForm`
- **Components reused:** Same as `/login`.
- **Responsive behavior:** Identical to `/login`.
- **Known visual differences:** Same submission-behavior note as `/login` above (demo toast instead of simulated account creation + navigation).
- **Reason:** Same as `/login`.

---

## `/forgot-password` — Reset Password

- **Original:** `src/pages/AuthScreens.jsx` (`mode="forgot"`)
- **New route:** `next-app/src/app/forgot-password/page.tsx` → `AuthForm`
- **Components reused:** Same as `/login`, minus the password field (matches original, which omits it for this mode).
- **Responsive behavior:** Identical to `/login`.
- **Known visual differences:** Same submission-behavior note (demo toast instead of "reset link sent" + navigate to `/login`).
- **Reason:** Same as `/login`.

---

## `/link-expired` — Secure Link Expired

- **Original:** `AppContent.jsx` route `/link-expired` → `SystemStatePage` (`src/pages/AdminAndSystemPages.jsx`) with `code="EXPIRED"`, `icon={AlertOctagon}`
- **New route:** `next-app/src/app/link-expired/page.tsx` → `SystemStateLayout`
- **Components reused:** `SystemStateLayout`, `LinkButton`
- **Responsive behavior:** Identical — single centered card, `max-width: 480px`, no breakpoints in either version.
- **Known visual differences:** None beyond the two systemic items noted at the top of this document.
- **Reason:** n/a

---

## `/link-revoked` — Link Revoked by Creator

- **Original:** `AppContent.jsx` route `/link-revoked` → `SystemStatePage` with `code="REVOKED"`, `icon={Lock}`
- **New route:** `next-app/src/app/link-revoked/page.tsx` → `SystemStateLayout`
- **Components reused:** Same as `/link-expired`.
- **Responsive behavior:** Identical.
- **Known visual differences:** None beyond the systemic items.
- **Reason:** n/a

---

## `/permission-denied` — Permission Denied (403)

- **Original:** `AppContent.jsx` route `/permission-denied` → `SystemStatePage` with `code="403"`, `icon={ShieldAlert}`
- **New route:** `next-app/src/app/permission-denied/page.tsx` → `SystemStateLayout`
- **Components reused:** Same as `/link-expired`.
- **Responsive behavior:** Identical.
- **Known visual differences:** None beyond the systemic items.
- **Reason:** n/a

---

## `/server-error` — Server Error (500)

- **Original:** `AppContent.jsx` route `/server-error` → `SystemStatePage` with `code="500"`, `icon={WifiOff}`
- **New route:** `next-app/src/app/server-error/page.tsx` → `SystemStateLayout`
- **Components reused:** Same as `/link-expired`.
- **Responsive behavior:** Identical.
- **Known visual differences:** None beyond the systemic items.
- **Reason:** n/a

---

# Phase 2 — Creator Application Shell & Read-Only Screens

Verification method: `npm run build && npm run start` in `next-app/`, manual side-by-side comparison against the Vite app (`npm run dev` at the repository root, port 5173) at 1440px/768px/390px, plus the Playwright visual-regression suite (`npm run test:visual`, 15/15 passing — see `MIGRATION_STATUS.md` → "Visual-test status" for what it covers and its determinism safeguards).

**Two systemic items apply to every Phase 2 screen** (documented once here):

1. **Creator shell chrome (sidebar/header/mobile nav) is shared across all five screens** — see `CREATOR_COMPONENT_MAP.md`. Desktop: 240px fixed sidebar (`CreatorSidebar`) + 64px sticky header (`CreatorHeader`), matching the original's `--sidebar-width: 240px` and 64px header exactly. Mobile (≤768px): compact header + fixed 60px bottom nav (`CreatorMobileNav`), matching the original's `.mobile-bottom-nav` height exactly.
2. **Breakpoint correction:** the original CreatorLayout.jsx switches to the mobile layout at `max-width: 768px` and to desktop at `min-width: 769px`. Tailwind's stock `md:` breakpoint is `768px` (min-width), which would have shown the *desktop* sidebar at exactly 768px — one pixel off from the approved design. Fixed by overriding `--breakpoint-md` to `769px` in `globals.css`, so the mobile/desktop switch happens at exactly the same width as the original.

## `/dashboard` — Creator Dashboard

- **Original source:** `src/pages/CreatorDashboard.jsx`
- **New route:** `next-app/src/app/(creator)/dashboard/page.tsx`
- **Desktop parity:** Welcome banner, metric cards, "Recent Workspaces" table, and per-workspace Manage/Portal links match the original's structure and spacing (card padding, radii, table row structure). Two new sections were added — "Recent Activity" and "Payment Overview" — because this phase's brief explicitly requires both on the dashboard; the original had neither (activity only existed per-workspace, not as a unified feed). Both reuse the same card/list visual language as the rest of the page, so they read as native to the design rather than bolted on.
- **Tablet parity (768px):** Metric cards reflow from 5-across to a 2–3 column grid via `sm:`/`lg:`/`xl:` breakpoints (the original had only 3 metric cards and no defined tablet grid to compare against — this is a reasonable extrapolation of the same `repeat(auto-fit, minmax(...))` pattern the original used elsewhere). Mobile shell (drawer + bottom nav) applies at this width, matching the corrected breakpoint above.
- **Mobile parity (390px):** Metric cards and workspace list stack to a single column; the desktop table (`WorkspaceTable`) is hidden and replaced by `WorkspaceCard`s, matching the original `WorkspacesList.jsx` card pattern (the original `CreatorDashboard` itself had no defined mobile treatment for its table — this borrows the approved card component from the Workspaces screen rather than inventing a new one).
- **Known differences:** Dashboard now shows 5 metric cards (Outstanding, Received, Awaiting Review, Changes Requested, Payment Pending) instead of the original's 3 (Total Earnings, Pending Payment Locks, Active Workspaces), because this phase's brief explicitly lists 5 required metrics. All values are computed from `WORKSPACES` via `src/lib/dashboard-metrics.ts`, never hardcoded.
- **Accessibility improvements:** Proper `<table>`/`<th scope="col">` structure with a `sr-only` caption (original used styled `<div>`s in some spots, a real `<table>` elsewhere but without a caption); icons are `aria-hidden`; heading hierarchy is `h1` → `h2` throughout.
- **Deferred interactions:** "New Workspace Flow" and workspace row "Manage"/"Portal" links point at deferred routes (`/workspaces/new`, `/workspaces/[id]`, `/review/[token]`) and currently resolve through `not-found.tsx` — same pattern as Phase 1's landing-page CTAs.

## `/workspaces` — Workspaces Directory

- **Original source:** `src/pages/WorkspacesList.jsx` (the `WorkspacesList` export; `NewWorkspaceWizard` is deferred)
- **New route:** `next-app/src/app/(creator)/workspaces/page.tsx` → `WorkspaceExplorer`
- **Desktop parity:** Heading + "New Workspace" button, search bar, status filter, and card grid all match the original's layout, spacing, and card content (status badge, version badge, title, category, client, amount, action buttons). A "Client" filter and a desktop `WorkspaceTable` were added alongside the original's card grid — the brief explicitly asks for both a "Client filter where present" and a "Desktop table layout," and the original had neither at desktop width (cards only, no table, no client filter) — see `MIGRATION_STATUS.md` "Known differences."
- **Tablet parity (768px):** Falls into the mobile card layout per the corrected breakpoint (matches the original, which only ever showed cards — never a table — at any width).
- **Mobile parity (390px):** Single-column cards, matching the original's `WorkspaceCard` content and spacing exactly, with two additions — a derived "Progress" percentage and "Last activity" date, both explicitly required by this phase's brief and both absent from the original card.
- **Known differences:** A "Progress" percentage (derived from status, see `src/lib/workspace-progress.ts`) and a desktop table view are new — see `MIGRATION_STATUS.md`. Filtering/search/empty-state text (e.g. "No workspaces match your search") is new copy, not present in the original (which had no empty-state handling at all — an empty `filtered` array simply rendered an empty grid).
- **Accessibility improvements:** `EmptyState` uses `role="status"` so screen readers announce zero-result searches; the search input has an explicit `aria-label` (the original had no visible or programmatic label, relying on placeholder text alone).
- **Deferred interactions:** "New Workspace" → `/workspaces/new`; "Manage"/"Portal" per row → `/workspaces/[id]`, `/review/[token]`. All deferred routes, same pattern as Phase 1.

## `/clients` — Clients Directory

- **Original source:** `src/pages/CreatorPages.jsx` (`ClientsManagement`)
- **New route:** `next-app/src/app/(creator)/clients/page.tsx` → `ClientExplorer`
- **Desktop parity:** Heading, "Add New Client" button, and card grid match the original. A desktop `ClientTable` was added — the original only ever rendered cards, even at desktop width; this phase's brief explicitly requires a "Client table or mobile cards" pairing consistent with the other screens.
- **Tablet parity (768px):** Mobile card layout applies (matches original, cards-only at every width).
- **Mobile parity (390px):** Single-column cards matching the original's field set (name, company, email, active workspaces, status badge) plus one addition — a derived "Outstanding" amount (see `MIGRATION_STATUS.md`) and Edit/Delete buttons, which the original never had (no client actions existed at all).
- **Known differences:** Edit/Delete actions are new (visually required by the brief) and are wired to an "available in a later phase" toast rather than any mutation. "Total Spent," shown in the original, isn't rendered in this phase (see `MIGRATION_STATUS.md`) — the brief's field list for this screen didn't include it, but the data is preserved on the `Client` type for a future phase.
- **Accessibility improvements:** Edit/Delete are real `<button type="button">` elements (not clickable `<div>`s); each announces which client it targets via its accessible name context (visually via the row/card, programmatically via the toast message it produces).
- **Deferred interactions:** Add/Edit/Delete client — all show a toast, never a fake success or persisted change.

## `/payments` — Payments & Revenue Ledger

- **Original source:** `src/pages/CreatorPages.jsx` (`PaymentsDashboard`)
- **New route:** `next-app/src/app/(creator)/payments/page.tsx` → `PaymentExplorer`
- **Desktop parity:** Heading and transactions table match the original's column set and row content almost exactly (Transaction ID, Workspace, Client, Gross Amount, Net Payout, Status), with a "Date" column and a "Receipt" action column added, both explicitly required by the brief and absent from the original table.
- **Tablet parity (768px):** Mobile card layout applies. The original had no defined mobile treatment for this screen at all (table only, `overflowX: 'auto'` as its only responsive behavior) — `PaymentCard` is new, built to match the visual language of the table it stands in for.
- **Mobile parity (390px):** Single-column cards; same content as the desktop table row, minus the transaction ID (kept off the card to avoid crowding, consistent with how `WorkspaceCard` also drops less-essential desktop-table-only columns).
- **Known differences:** Three metric cards (Total Received, Outstanding Amount, Platform Fees) and a status + date-range filter bar are new — the original `PaymentsDashboard` had no summary cards or filters at all, just the raw table. All explicitly required by this phase's brief; all values computed from `PAYMENTS` via `src/lib/payment-metrics.ts`.
- **Accessibility improvements:** The Receipt button is properly `disabled` (with a `title` explaining why) for payments that haven't settled, rather than being clickable-but-inert.
- **Deferred interactions:** Receipt action shows a toast for completed payments; is disabled for pending ones. No receipts are generated, no payment orders are created.

## `/notifications` — Notifications Feed

- **Original source:** `src/pages/CreatorPages.jsx` (`NotificationsPage`)
- **New route:** `next-app/src/app/(creator)/notifications/page.tsx` → `NotificationsList`
- **Desktop parity:** Heading, max-width container, and notification row layout (title, text, timestamp, unread highlight) match the original closely — same `max-width: 720px` constraint, same highlighted-background treatment for unread rows.
- **Tablet/mobile parity:** The original notification list was already a single-column, non-tabular layout with no distinct desktop/mobile treatment — this carries over unchanged at every width tested.
- **Known differences:** Clicking a row still toggles read/unread (matching the original's core interaction), but this is now explicitly local-only component state with a disclosure line above the list ("Read status shown below is local to this browser tab for preview purposes only — it is not saved") — the original persisted this via `AppContext`, which is out of scope this phase. Three additional notification examples (types `changes_requested`, `download`, `preview_failed`) appear that weren't in the original's 4-item mock set — see `MIGRATION_STATUS.md`.
- **Accessibility improvements:** Unread/read state is exposed as real text via a visually-hidden `sr-only` span ("Unread"/"Read"), not color alone; each row is a real `<button>` inside a `<li>` (the original row was a clickable `<div>` with an `onClick` handler and no keyboard/role semantics at all).
- **Deferred interactions:** Read/unread toggle is local-only (see above). No "Mark all as read" control exists — the original never had one either (verified against source), so none was added.

---

## Next.js-only additions (no original equivalent)

These have no Vite counterpart to compare against — they exist only because Next.js's routing conventions require them — but reuse the same `SystemStateLayout` shell so they stay visually consistent with the four system-state screens above:

- **`not-found.tsx`** — renders for any URL that doesn't match a route (`code="404"`). The old app had no real 404 handling (unmatched routes silently fell through to the creator dashboard).
- **`error.tsx`** — client-side route error boundary (`code="500"`), reusing the same visual shell as `/server-error` but with a "Try Again" button that calls Next's `reset()` instead of a static link, since a caught render error is recoverable in place.

---

# Phase 3 — Authentication and Database-Backed Data

No approved visual was changed in this phase — every creator screen renders pixel-identical content to Phase 2, now sourced from Postgres instead of mock arrays. This section documents what *did* change: the auth-gating in front of those screens, and the new visual states added specifically because they didn't exist before real auth/data did.

## Auth-gating changes what's screenshotted, not how it looks

Phase 2's 15 visual baselines (dashboard/workspaces/clients/payments/notifications × 3 viewports) were **regenerated**, not newly created — `/dashboard` etc. are now protected routes, so a screenshot taken without a session would silently capture the `/login` redirect instead of the intended screen. A `setup` Playwright project (`e2e/visual/auth.setup.ts`) logs in as the seeded demo creator once and shares that session across the three viewport projects. The actual pixels of those 15 screenshots are unchanged from Phase 2's intent (same layout, same design tokens) — only the underlying data source changed (real seeded Postgres rows instead of `src/data/mock/*`), and the seed data was authored to match the mock data's values exactly for Arjun Raj, so the content itself is visually identical too.

## `/login`, `/register` — real forms, same visual shell

- **Original Vite source:** `src/pages/AuthScreens.jsx` (unchanged reference — same as Phase 1's comparison).
- **What changed since Phase 1:** submitting now performs a real registration/login instead of showing a "demo only" toast. Phase 1's single `AuthForm` (mode-switched between login/register/forgot) was split into dedicated `LoginForm`/`RegisterForm`/`ForgotPasswordNotice` components in this phase, each now backed by a real Server Action — but the rendered markup and styling are unchanged from Phase 1's approved shell (same `AuthCard` chrome, same field layout). The one new visual state is the validation-error banner (see below), which reuses the exact same red/danger token styling (`bg-danger-bg`/`text-danger`) established in the Phase 1 design system — no new color was introduced.
- **New visual baseline: login validation-error state** (`login-validation.spec.ts`) — submits a wrong password and captures the resulting error banner above the form fields. Uses a deliberately logged-out browser context (`storageState: { cookies: [], origins: [] }`), since every other visual spec in this phase runs authenticated by default.

## `/forgot-password` — content change, same shell

- **Known difference (disclosed, required by the brief):** the original AuthScreens "forgot" mode had a working-looking form ("Send Reset Link" button, simulated success toast). This phase replaces it with a plain notice stating password recovery isn't enabled yet — per the explicit instruction not to fake sending an email. The `AuthCard` shell (logo, heading, white card on navy background) is unchanged; only the body content differs (an info banner instead of a form).

## New visual baseline: mobile navigation drawer, open state

`mobile-drawer.spec.ts` — opens the hamburger menu on `/dashboard` and screenshots the resulting slide-in panel (nav links, close button, "Signed in as Arjun Raj" footer). Skipped on the `desktop-1440` project (no hamburger/drawer exists at that viewport — the persistent sidebar renders instead), so this produces 2 baselines (tablet-768, mobile-390), not 3. The drawer itself is a Phase 2 addition (see that phase's "known differences" — the original design never had one); Phase 3 simply adds the missing open-state screenshot for it now that the shell reads real authenticated data.

## New visual baseline: workspaces empty/no-results state

`workspaces-empty.spec.ts` — navigates to `/workspaces?q=zzz-no-such-workspace-zzz`, a search term guaranteed to match none of Arjun's seeded workspaces, and screenshots the resulting `EmptyState` (icon, "No workspaces match your search," description). This is the "no results" flavor of empty state (not "zero workspaces ever created") — reaching a true zero-workspace account wasn't worth seeding a third demo creator for, since the empty-state *component* (`EmptyState`, `src/components/ui/empty-state.tsx`) is the same one either way and was already visually verified in Phase 2's component-level tests.
