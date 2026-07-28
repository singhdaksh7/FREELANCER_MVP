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

## Next.js-only additions (no original equivalent)

These have no Vite counterpart to compare against — they exist only because Next.js's routing conventions require them — but reuse the same `SystemStateLayout` shell so they stay visually consistent with the four system-state screens above:

- **`not-found.tsx`** — renders for any URL that doesn't match a route (`code="404"`). The old app had no real 404 handling (unmatched routes silently fell through to the creator dashboard).
- **`error.tsx`** — client-side route error boundary (`code="500"`), reusing the same visual shell as `/server-error` but with a "Try Again" button that calls Next's `reset()` instead of a static link, since a caught render error is recoverable in place.
