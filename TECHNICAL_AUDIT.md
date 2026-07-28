# TECHNICAL_AUDIT.md — Project Vault UI V1.0

Audit date: 2026-07-28
Scope: full repository at `c:\Users\daksh\OneDrive\Desktop\freelnancer MVP`
Audit type: read-only technical inspection. No source files were modified as part of this audit.

---

## 1. Executive Summary

Project Vault is currently a **visual/interaction prototype only** — a single-page React app that simulates the entire payment-gated file-delivery workflow (creator workspace creation → client review → approval → simulated payment → simulated file unlock) using in-memory mock state. There is **no backend, no persistence, no real authentication, no real file storage, and no real payment processing**. Every "secure" mechanic in the UI (secure tokens, locked files, watermarking, payment gating) is a purely cosmetic simulation held in a single React Context (`AppContext.jsx`) that resets on every page reload.

The codebase is small (17 source files, ~75 graph nodes), builds cleanly with Vite, and has no build errors. `npm run lint` (oxlint) reports **43 warnings, 0 errors** — entirely unused-import / unused-variable noise, no correctness issues. There are no automated tests anywhere in the repo.

Two documents referenced in the audit brief — `implementation_plan.md` and `walkthrough.md` — **do not exist in this repository** and could not be reviewed (see §22).

The most important finding for migration planning: **routing, state, and "security" are all fused together in one Context and one big if/else router**, with no server boundary anywhere. This is expected and fine for a Stitch-generated prototype, but it means essentially the entire data layer (not just a few components) must be rebuilt for production — the migration is a rewrite of the data/logic layer with a UI-preserving skin on top, not an incremental upgrade.

---

## 2. Current Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | ^19.2.7 |
| Build tool | Vite | ^8.1.1 |
| React plugin | @vitejs/plugin-react (Oxc-based) | ^6.0.3 |
| Icons | lucide-react | ^1.27.0 |
| Linter | oxlint | ^1.71.0 |
| Types | @types/react, @types/react-dom (dev-only, project is plain JS/JSX, not TS) | ^19.2.17 / ^19.2.3 |
| Routing | **None** — custom string-based route matching in `AppContent.jsx` | n/a |
| State management | React Context + `useState` only (`AppContext.jsx`) | n/a |
| Styling | Inline `style={{}}` objects + CSS custom properties in `index.css`; no CSS-in-JS library, no Tailwind | n/a |
| Backend | **None** | n/a |
| Database | **None** | n/a |
| Auth | **None** (cosmetic login form only) | n/a |
| Payments | **None** (simulated button) | n/a |
| Tests | **None found** (`tests_for` query against the graph returns nothing; no `*.test.*`/`*.spec.*` files) | n/a |

npm scripts (`package.json`): `dev` (vite), `build` (vite build), `lint` (oxlint), `preview` (vite preview). No `test` script exists.

---

## 3. Complete Project Structure

```
freelnancer MVP/
├── index.html                          # Vite entry HTML
├── package.json / package-lock.json
├── vite.config.js                      # Minimal, just @vitejs/plugin-react
├── .oxlintrc.json                      # react + oxc plugin rules
├── README.md                           # Default Vite template README (not project-specific)
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── dist/                               # Build output (checked into working tree, see §11)
├── .code-review-graph/                 # Knowledge-graph tool DB, not app-related
└── src/
    ├── main.jsx                        # ReactDOM root, wraps <App/> in StrictMode
    ├── App.jsx                         # Wraps AppContent in <AppProvider>
    ├── AppContent.jsx                  # THE router — string-matches currentRoute
    ├── App.css                         # Dead file — default Vite template CSS, never imported
    ├── index.css                       # Real design-token stylesheet (colors, radii, shadows)
    ├── assets/
    │   ├── hero.png                    # Unused (dead asset)
    │   ├── react.svg                   # Unused (dead asset, Vite template leftover)
    │   └── vite.svg                    # Unused (dead asset, Vite template leftover)
    ├── context/
    │   └── AppContext.jsx              # Single global store: users, clients, workspaces, notifications, payments, route, toast
    ├── data/
    │   └── mockData.js                 # All seed/mock data (users, clients, workspaces, files, comments, notifications, payments, admin data)
    ├── components/
    │   ├── common/
    │   │   └── UIComponents.jsx        # StatusBadge, Toast
    │   └── layouts/
    │       ├── CreatorLayout.jsx       # Sidebar + sticky header + mobile bottom nav (creator app shell)
    │       └── ClientReviewLayout.jsx  # Client portal shell (dark theme, header/footer)
    └── pages/
        ├── LandingPage.jsx
        ├── AuthScreens.jsx             # login / register / forgot-password (one component, `mode` prop)
        ├── CreatorDashboard.jsx
        ├── WorkspacesList.jsx          # exports WorkspacesList + NewWorkspaceWizard (5-step)
        ├── WorkspaceDetails.jsx
        ├── CreatorPages.jsx            # exports ClientsManagement, PaymentsDashboard, NotificationsPage, SettingsPage
        ├── ClientPortalPortal.jsx      # the secure client review/approve/pay portal
        └── AdminAndSystemPages.jsx     # exports AdminUsersPage, SystemStatePage
```

17 source files parsed by the code graph → 75 nodes, 442 edges, 14 detected execution flows, 4 communities (`pages`, `context`, `layouts`, `common`). The architecture tool flags **high coupling (24 edges) between `context-app` and `pages-handle`** — i.e. nearly every page reaches directly into `AppContext` rather than through any intermediate service/hook layer.

---

## 4. Route Inventory

Routing is **not** implemented with a router library. `AppContent.jsx` reads `currentRoute` (a plain string in Context state) and does sequential `if`/`else if` string matching. `setCurrentRoute('/some/path')` is the only navigation primitive — there is no `<a href>` navigation, no browser history integration, no back/forward button support, and no deep-linking (reloading the page or pasting a URL always resets to the default route because `currentRoute` is not derived from `window.location`).

| Route pattern | Component | Notes |
|---|---|---|
| `/` | `LandingPage` | Public marketing page |
| `/login` | `AuthScreens mode="login"` | |
| `/register` | `AuthScreens mode="register"` | |
| `/forgot-password` | `AuthScreens mode="forgot"` | |
| `/review/:token` (prefix match `startsWith('/review/')`) | `ClientPortalPortal token={token}` | Secure client portal; token parsed via `.replace()`, no validation |
| `/link-expired` | `SystemStatePage code="EXPIRED"` | Static, not driven by real link state |
| `/link-revoked` | `SystemStatePage code="REVOKED"` | Static |
| `/permission-denied` | `SystemStatePage code="403"` | Static |
| `/server-error` | `SystemStatePage code="500"` | Static |
| `/dashboard` | `CreatorDashboard` (wrapped in `CreatorLayout`) | Default fallback route too (any unmatched route renders `CreatorDashboard`) |
| `/workspaces` | `WorkspacesList` | |
| `/workspaces/new` | `NewWorkspaceWizard` | |
| `/workspaces/:id` (prefix match `startsWith('/workspaces/')`) | `WorkspaceDetails workspaceId={id}` | Must be checked **after** the `/workspaces/new` and `/workspaces` exact matches, which it is — order-dependent, fragile |
| `/clients` | `ClientsManagement` | |
| `/payments` | `PaymentsDashboard` | |
| `/notifications` | `NotificationsPage` | |
| `/settings` | `SettingsPage` | |
| `/admin*` (prefix match `startsWith('/admin')`) | `AdminUsersPage` | Sub-nav buttons target `/admin/workspaces` and `/admin/storage`, both of which fall through to the same `AdminUsersPage` — those two screens don't actually exist |

**Total distinct route handlers: 17** (13 exact-match + 4 prefix/fallback-match paths).

---

## 5. Screen Inventory

1. Landing / marketing page
2. Login
3. Register
4. Forgot password
5. Creator dashboard (metrics + active workspaces table)
6. Workspaces directory (search/filter/list)
7. New Workspace Wizard (5 steps: client, details, upload, watermark, payment gate)
8. Workspace details (tabs: files, comments, payment, activity log)
9. Clients directory
10. Payments/revenue ledger
11. Notifications feed
12. Settings (payout UPI + watermark defaults)
13. Admin user management
14. Client secure review portal (tabs: overview, comments, request changes, checkout, success)
15. System state — link expired
16. System state — link revoked
17. System state — permission denied (403)
18. System state — server error (500)

---

## 6. Component Inventory

**Reusable/shared components (2):**
- `StatusBadge` (`components/common/UIComponents.jsx`) — color-coded status pill, switches on a hardcoded string enum
- `Toast` (`components/common/UIComponents.jsx`) — fixed-position notification, auto-dismiss via `setTimeout` in `AppContext`

**Layout components (2):**
- `CreatorLayout` — desktop 240px sidebar + sticky header + mobile bottom nav (media-query driven via an inline `<style>` tag)
- `ClientReviewLayout` — dark-theme client portal shell with header/footer

**Page-level components (12, across 8 files):**
`LandingPage`, `AuthScreens`, `CreatorDashboard`, `WorkspacesList`, `NewWorkspaceWizard`, `WorkspaceDetails`, `ClientsManagement`, `PaymentsDashboard`, `NotificationsPage`, `SettingsPage`, `AdminUsersPage`, `SystemStatePage`, `ClientPortalPortal`

No design-system primitives exist beyond `StatusBadge`/`Toast` — there is **no shared Button, Input, Card, Modal, or BottomSheet component**. Every page hand-rolls its own buttons/cards/inputs via inline styles, meaning the "consistent design system" is consistent by convention/copy-paste, not by shared code. This matters for migration: componentizing these will be useful but is optional, not required, to preserve the frozen UI.

**Total reusable components (excluding one-off page bodies): 4** — `StatusBadge`, `Toast`, `CreatorLayout`, `ClientReviewLayout`.

---

## 7. State-Management Analysis

Everything lives in one `AppContext` (`src/context/AppContext.jsx`), created with `createContext()` (no default value) and consumed via a `useApp()` hook (`useContext(AppContext)`, no null-check — if ever used outside `AppProvider` it silently returns `undefined` and crashes on destructure).

State held:
- `currentUser` (never mutated — `useState(CURRENT_USER)` with no setter destructured)
- `clients` / `setClients` (setter exposed but never called anywhere)
- `workspaces` / mutated only via the action functions below
- `notifications` / mutated only via `markNotificationRead`
- `payments` (never mutated — no setter exposed)
- `currentRoute` / `setCurrentRoute` — doubles as the router state
- `toastMessage` / `showToast`

Action functions (all just `setWorkspaces(prev => prev.map(...))` style reducers plus a `showToast` side effect): `addWorkspace`, `addComment`, `resolveComment`, `requestChanges`, `uploadNewVersion`, `approveWorkspace`, `simulatePaymentSuccess`, `markNotificationRead`.

Key observations:
- **No `useEffect`, `useMemo`, or `useCallback` anywhere in the codebase.** All derived values (filtered lists, counts) are recomputed inline on every render — fine at this scale, but confirms there is zero data-fetching/side-effect logic to "port" — it must all be written from scratch for the real backend.
- All state is **in-memory only**; a full page refresh resets everything to the seed data in `mockData.js`.
- `simulatePaymentSuccess` directly flips `isLocked`/`watermarked` to `false` and swaps in a public dummy PDF URL — this is the exact client-side trust assumption that must never exist in production (see §14).
- `addComment` hardcodes the comment author as `'Rohit Sharma (Client)'` regardless of which client/token is actually viewing — there is no real per-viewer identity.

---

## 8. Mock-Data Inventory (`src/data/mockData.js`)

| Export | Shape | Used by |
|---|---|---|
| `CURRENT_USER` | Single hardcoded creator (Arjun Raj) with earnings figures | Dashboard, layout footer |
| `INITIAL_CLIENTS` | 4 hardcoded clients | Clients page, workspace wizard step 1 |
| `INITIAL_WORKSPACES` | 3 full workspace objects — each embeds its `client` object inline (denormalized), `files[]` (with `previewUrl`/`originalUrl`/`isLocked`/`watermarked`/`versions`), `comments[]` (with nested `replies[]`), `activityLog[]` | Nearly every page |
| `MOCK_NOTIFICATIONS` | 4 notifications | Notifications page, layout badge count |
| `MOCK_PAYMENTS` | 3 payment ledger rows | Payments dashboard |
| `MOCK_ADMIN_DATA` | Users, webhooks, storage stats | **Defined but never imported/used anywhere** — `AdminUsersPage` re-declares its own inline `users` array instead of using this export (duplicated data, see §12) |

All "file" preview/original URLs point to public Unsplash images or a public W3C sample PDF (`https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`) — i.e. **no real file storage exists anywhere**, and the "original" unlock is just swapping in the same public dummy URL.

---

## 9. Frontend Interaction Inventory (all client-side simulations)

- **Login/Register/Forgot password** — any input "succeeds"; no validation against real credentials, no session created
- **Workspace creation wizard** — 5-step form; "Simulate Upload" just sets a hardcoded filename string, no real file I/O
- **Copy client link** — no real clipboard write validated in code beyond `setCopiedLink`/toast (no `navigator.clipboard` call visible — clicking "Copy" does not actually copy anything, see §11 broken-functionality note)
- **"Open Client Portal View"** button in the creator header **hardcodes** the token `sec_tok_brand_identity_99` (see §13) rather than using the currently-viewed workspace
- **Simulate Upload V2 Revision** — bumps `currentVersion`, pushes a version string, no new file content
- **Post comment** — hardcodes author as the client from workspace `ws_brand_identity` regardless of actual token/session
- **Resolve comment** — flips a status flag
- **Request changes** — flips workspace status + pushes an activity log row
- **Approve & proceed to pay** — flips workspace status to `Approved`
- **Simulate payment** (`Pay ₹X & Release Original Files`) — instantly flips `status: 'Paid'` and unlocks all files client-side, with **no server round-trip, no payment gateway call, no webhook** of any kind
- **Download unlocked files** — `<a href={file.originalUrl}>` pointing at a public sample PDF
- **Mark notification read** — local flag flip
- **"Back to Creator View"** button inside the client portal navigates straight back to `/dashboard` — i.e. **the client-facing surface contains a live link into the creator's private app**, a security-relevant UI assumption (see §14)

---

## 10. Build and Lint Results

**`npm install`**: succeeded — `up to date, audited 26 packages`, 0 vulnerabilities.

**`npm run build`** (`vite build`): **succeeded**, no errors, no warnings.
```
dist/index.html                   0.46 kB │ gzip:  0.30 kB
dist/assets/index-BYXjgahx.css    1.93 kB │ gzip:  0.88 kB
dist/assets/index-5DITTfrf.js   287.32 kB │ gzip: 79.64 kB
✓ built in 489ms
```

**`npm run lint`** (`oxlint`): **43 warnings, 0 errors.** All are `no-unused-vars` (unused lucide-react icon imports, unused destructured state/params) except one `react/only-export-components` warning on `AppContext.jsx:191` (exporting the `useApp` hook alongside the `AppProvider` component breaks Fast Refresh isolation — cosmetic, not a bug). Full list captured in §11.

No commands were skipped; nothing was modified to force these commands to pass.

---

## 11. Technical-Debt Findings

1. **`dist/` is present in the working tree** (build output committed/left alongside source) — should be gitignored if not already (confirm against `.gitignore`) and not treated as source of truth.
2. **43 unused-import/unused-variable lint warnings** spread across nearly every page file — harmless but indicates copy-paste page scaffolding (icons imported "just in case").
3. **`App.css` is dead code** — never imported by any component (`main.jsx` only imports `index.css`); it's leftover default Vite-template CSS (`.hero`, `#next-steps`, `.ticks` selectors that reference no markup in this app).
4. **Three dead assets**: `src/assets/hero.png`, `react.svg`, `vite.svg` — none are referenced anywhere in `src/` (confirmed via full-text search).
5. **`MOCK_ADMIN_DATA` is defined but unused** — `AdminUsersPage` duplicates its own inline `users` array instead (see §12).
6. **"Copy Client Link" button doesn't actually copy anything** — `handleCopyLink` in `WorkspaceDetails.jsx` only sets local UI state and fires a toast; there is no `navigator.clipboard.writeText(...)` call. This will read as a functional bug once a user actually tries to paste the link somewhere, even though it's visually indistinguishable from working.
7. **No tests of any kind** exist in the repo (confirmed via code-graph `tests_for` query and file search).
8. **Route matching is order-dependent string prefixing** (`startsWith('/workspaces/')` etc.) rather than a proper matcher — brittle if new routes are added carelessly (e.g., a future `/workspaces-archive` route would incorrectly match nothing today but any route literally starting with `/workspaces/` would collide).
9. **No `useApp()` null-guard** — using the hook outside `<AppProvider>` throws an unhelpful runtime error (`Cannot destructure property of 'undefined'`) rather than a clear message.
10. **`useContext` created without a default value** compounds finding #9.
11. **Every page reimplements the same visual patterns (cards, tables, form inputs, status rows) via inline `style={{}}` objects** rather than shared primitives — large amount of literal duplication (not detected as "duplicate files" by the graph, but is duplicate *code*). This is a size/maintainability concern for migration effort estimation, not a bug.
12. **README.md is the unedited default Vite template README** — does not describe Project Vault at all.

---

## 12. Duplicated Components / Duplicated Data

- **Admin user data duplicated**: `MOCK_ADMIN_DATA.users` in `mockData.js` vs. the inline `users` array hardcoded inside `AdminUsersPage` (`AdminAndSystemPages.jsx`) — two different shapes, two different sources of truth, only one is actually rendered.
- **Client name "Rohit Sharma" is hardcoded in three unrelated places**: `AppContext.addComment` (as the fixed comment author), `CreatorLayout`'s "Open Client Portal View" button (hardcoded token), and implicitly via `ClientPortalPortal`'s fallback `workspaces[0]`.
- No literal duplicate *files* were found by the graph (17 files parsed, 17 distinct purposes) — the duplication is at the data/pattern level, not file level.

---

## 13. Hardcoded Values

- Payment amount **₹25,000** is hardcoded in `simulatePaymentSuccess`'s toast message (`AppContext.jsx:156`) even though each workspace has its own `amount` field (25000/45000/30000) — the toast will show the wrong amount for the two workspaces that aren't ₹25,000.
- Hardcoded secure token `sec_tok_brand_identity_99` in `CreatorLayout.jsx` ("Open Client Portal View") and `LandingPage.jsx` ("Try Live Client Review Demo").
- Hardcoded fallback client name `'Rohit Sharma (Client)'` in every posted comment (`AppContext.addComment`), regardless of actual reviewer.
- Hardcoded fallback workspace `workspaces[0]` whenever a token or ID doesn't match (`ClientPortalPortal`, `WorkspaceDetails`) — in production this must be a hard 403/404, not a silent fallback to someone else's data.
- Hardcoded UPI payout ID `arjunraj@okicici` and watermark default text as `defaultValue` on uncontrolled inputs in `SettingsPage` (changes are never persisted — the "Save Preferences" button has no `onClick`).
- Hardcoded creator name "Arjun Raj" embedded directly into user-facing copy in `AppContent.jsx` (`/link-revoked` message) rather than derived from data.
- Dummy file URLs (Unsplash stock photos, W3C sample PDF) hardcoded as if they were the actual asset pipeline.

---

## 14. Security-Sensitive UI Assumptions

These are not "bugs" in the prototype — they are correct simplifications for a frontend-only mock — but each one represents a real security control that **must be added, not just "connected," in production**:

1. **Payment success is entirely client-controlled.** `simulatePaymentSuccess` is a plain state setter triggered by a button click. There is no server verification anywhere in the call path. Any user with browser devtools can call this without paying.
2. **File "locking" is a boolean UI flag (`isLocked`), not an access-control boundary.** The original file URL (`originalUrl`) is present in the client-side data for every file from the moment the page loads, whether or not `isLocked` is true — it's simply not rendered/linked yet. Opening devtools reveals unlocked-file URLs before payment.
3. **Secure tokens are not actually secure.** `secureToken` is a predictable, non-expiring string embedded in mock data and never validated against any expiry, revocation list, or ownership check; `/link-expired`, `/link-revoked`, `/permission-denied` are static unreachable pages, not real states derived from token validation.
4. **No session/auth boundary exists between the creator app and the client portal.** The "Back to Creator View" button in the client-facing portal navigates straight into `/dashboard`, and the creator layout's own "Open Client Portal View" button jumps into the client view — both directions assume a single trusted browser session, which won't hold once creator and client are genuinely different authenticated (or anonymous-token) parties.
5. **No input validation/sanitization** on comment text, workspace title/description, or watermark text — all rendered as plain text via JSX (React auto-escapes, so no active XSS today), but there's no length/content validation that a real API would need.
6. **No rate limiting, no audit logging, no webhook signature verification** — none of these concepts exist yet even as stubs, since there's no server.
7. **Client identity is not derived from the token at all** — the comment author is hardcoded rather than looked up from a client record tied to the `secureToken`, so multiple different clients opening different tokens would all appear to comment as "Rohit Sharma."

---

## 15. Backend Integration Points

Every one of these UI actions currently mutates local React state and will need a real API/server action:

| UI action | Current behavior | Required backend capability |
|---|---|---|
| Login / Register / Forgot password | Toast + route change | Auth.js session creation, credential verification, password-reset email (Resend) |
| Create workspace (5-step wizard) | Pushes object into local array | Workspace record insert (Prisma/Postgres), ownership tied to authenticated creator |
| Upload files (wizard step 3, "Simulate Upload") | Sets a filename string | Real multipart upload to private object storage, preview-generation pipeline, watermark rendering job |
| Copy client link / Open client portal | Reads `secureToken` from mock object | Signed, expiring, revocable token generation and lookup endpoint |
| Post comment | Local array push, hardcoded author | Comment insert scoped to (workspace, authenticated client session or token) |
| Resolve comment | Local flag flip | Authorized mutation (creator-only) |
| Request changes | Local status flip | Status transition with notification (email via Resend) to creator |
| Simulate Upload V2 Revision | Local version bump | Real file upload creates new Version record, regenerates preview/watermark |
| Approve work | Local status flip | Authorized client-only mutation, triggers payment-intent creation |
| Pay ₹X & Release Original Files | Local status/file flip | Real Razorpay checkout → server-verified webhook (`payment.captured`) → atomic unlock in DB, **never client-triggered** |
| Download original files | Static `<a href>` to public dummy PDF | Time-limited signed download URL from private storage, download logging/limits |
| Mark notification read | Local flag flip | Authenticated mutation scoped to the creator |
| Admin console (users/workspaces/storage tabs) | Two of three tabs render nothing real | Full admin API + role-gated access |

`MOCK_ADMIN_DATA.webhooks` already sketches the intended webhook shape (`payment.captured`, `workspace.unlocked` hitting `api.projectvault.app/webhooks/...`) — useful as a naming reference for the real Razorpay webhook handler, even though it's currently inert.

---

## 16. Vite → Next.js Migration Risks

- **Routing rewrite is total, not incremental.** The custom `currentRoute` string-matcher in `AppContent.jsx` has no relationship to Next.js App Router file conventions; every route in §4 must be manually re-created as a route segment, and every `setCurrentRoute(...)` call site (dozens, spread across nearly all page/layout files) must become a `<Link>` or `router.push`. This is the single largest mechanical migration cost.
- **No SSR/CSR boundary exists today** — every component freely reads from Context, uses inline event handlers, and assumes a fully client-rendered tree. Deciding Server vs. Client Components (§ migration architecture below) requires re-auditing every file, since none were written with that split in mind.
- **`AppContext` cannot survive as-is.** It currently mixes (a) legitimate client-only UI state (toast, active tab, mobile menu) with (b) what should become server-fetched/mutated data (workspaces, clients, payments, notifications). These must be split: server data fetched via Server Components/route handlers + mutated via Server Actions, vs. genuine client UI state kept in small local `useState`/lightweight client contexts.
- **`useApp()` is called in effectively every page and layout component** — 24 edges of coupling between the `context` and `pages` communities per the graph's own architecture warning. Removing/replacing `AppContext` therefore touches nearly the entire codebase, not an isolated subset.
- **Inline `style={{}}` objects using CSS custom properties** (`var(--color-vault-blue)`, etc., defined in `index.css`) are framework-agnostic and **port cleanly** to Next.js as-is (global CSS import still works in App Router) — this is a low-risk, reusable part of the codebase.
- **lucide-react** is already a Next.js/RSC-friendly icon library — low migration risk.
- **No TypeScript today** — introducing TS strict mode is a from-scratch typing effort across all 75 graph nodes, not a config flip; expect every prop, every mock-data shape, and every context value to need explicit interfaces.
- **File upload / preview / watermark UI currently has zero real I/O** — there is nothing to "migrate" for the upload pipeline itself; it must be built new against object storage + a preview/watermark processing step, only the *shape* of the existing UI (drag-and-drop zone, file cards) is reusable.
- **Payment UI ("Simulate Payment" button) must be structurally replaced**, not migrated — real Razorpay integration requires a Checkout redirect/embed plus a server-side webhook handler; the current single-button-click UX pattern cannot be preserved for the actual charge (though the surrounding checkout panel UI can stay pixel-identical).

---

## 17. Recommended Production Architecture

- **Next.js App Router**, with route segments mirroring §4 (`/dashboard`, `/workspaces`, `/workspaces/[id]`, `/workspaces/new`, `/clients`, `/payments`, `/notifications`, `/settings`, `/admin/...`, `/review/[token]`, `/login`, `/register`, `/forgot-password`, plus static state pages).
- **Server Components by default** for all data-bearing "list/detail" pages (`WorkspacesList`, `WorkspaceDetails`, `ClientsManagement`, `PaymentsDashboard`, `NotificationsPage`, `AdminUsersPage`) — these currently just map over arrays and render; that pattern maps directly onto RSC data fetching.
- **Client Components** required wherever there is interactivity/local state today: `NewWorkspaceWizard` (multi-step form state), `ClientPortalPortal` (tab state, comment/approve/pay forms), `CreatorLayout`/`ClientReviewLayout` (mobile menu, active-route highlighting), `Toast`, `StatusBadge` can stay a simple presentational component usable from either.
- **PostgreSQL + Prisma** models derived directly from the current mock shapes: `User` (creator), `Client`, `Workspace`, `File`, `FileVersion`, `Comment`, `CommentReply`, `ActivityLogEntry`, `Notification`, `Payment` — the existing `mockData.js` object graph is effectively a ready-made ER-diagram sketch.
- **Auth.js** for creator login/session; the client portal (`/review/[token]`) should remain **token-based, not full-account auth**, matching the current UX (no client login screen exists today, by design).
- **Private object storage** (e.g., S3-compatible) for original files; a separate, regenerable preview/watermark artifact per file/version, never the same object as the original.
- **Signed, expiring URLs** for both previews and (post-payment) original downloads — replacing the current always-present `originalUrl` field.
- **Razorpay** Checkout for the payment step, with a **server-side webhook handler** (`payment.captured`) as the *only* thing allowed to flip a workspace to `Paid`/unlocked — matching the shape already hinted at in `MOCK_ADMIN_DATA.webhooks`.
- **Resend** for transactional email: password reset, "changes requested," "work approved," "payment received," "client viewed link" notifications — all of which already have a UI representation in `NotificationsPage`/`MOCK_NOTIFICATIONS` today.
- **Server Actions** for all mutations that don't need a dedicated webhook: create workspace, post comment, resolve comment, request changes, upload new version, approve work, mark notification read.
- **Route Handlers** for anything needing to be called by an external system: Razorpay webhook, signed download-URL issuance, file upload completion callback.

---

## 18. Detailed Phased Migration Plan

**Phase 0 — Foundation (lowest risk, do first)**
- Scaffold Next.js App Router project with TypeScript strict mode.
- Port `index.css` design tokens verbatim (framework-agnostic, zero visual risk).
- Recreate the static/presentational pieces first: `StatusBadge`, `Toast`, the four `SystemStatePage` variants, `LandingPage` — none of these touch real data or auth, so they're safe first wins and validate the visual-freeze requirement early.

**Phase 1 — Data model & auth skeleton**
- Define Prisma schema from `mockData.js` shapes (§17).
- Stand up Auth.js for creator login only; keep client-portal token auth separate.
- Seed the database with the exact same mock records currently in `mockData.js`, so pages render identically before any real business logic exists.

**Phase 2 — Read-only creator pages (Server Components)**
- `CreatorDashboard`, `WorkspacesList`, `ClientsManagement`, `PaymentsDashboard`, `NotificationsPage`, `AdminUsersPage` — pure data-fetch-and-render, lowest behavioral risk, biggest visual-parity payoff.

**Phase 3 — Creator mutations (Server Actions)**
- `NewWorkspaceWizard` → real workspace creation (file upload can still be mocked/stubbed at this stage if storage isn't ready — mark clearly as temporarily mocked per the brief's instruction).
- `WorkspaceDetails` tabs → resolve comment, upload new version (stub OK), copy-link (make the clipboard call actually work this time).

**Phase 4 — Object storage & preview/watermark pipeline**
- Real file upload to private storage.
- Preview generation + dynamic watermark rendering job, replacing the static Unsplash placeholder previews.
- Signed, expiring preview URLs replace the always-public `previewUrl`.

**Phase 5 — Client portal & token security**
- `/review/[token]` rebuilt as a Server Component that performs a real token lookup with expiry/revocation checks (populating the now-real `/link-expired`, `/link-revoked`, `/permission-denied` states instead of leaving them unreachable).
- Comment posting tied to the actual token-resolved client identity (fixing the hardcoded-author issue in §7/§13).

**Phase 6 — Payments (highest risk, do last, most scrutiny)**
- Razorpay Checkout integration on the "Approve & Pay" step.
- Server-side webhook handler with signature verification and idempotency key handling.
- File unlock and download-grant issuance driven **only** by the verified webhook — remove `simulatePaymentSuccess`'s client-triggered unlock entirely.
- Download limits/logging, audit log persistence.

**Phase 7 — Notifications & email**
- Resend integration for the events already modeled in `MOCK_NOTIFICATIONS`.

**Phase 8 — Admin console completion**
- Build the two currently-missing admin sub-tabs (`/admin/workspaces`, `/admin/storage`) against real data, replacing `AdminUsersPage`'s duplicated inline mock array.

**Phase 9 — Hardening**
- Rate limiting, full audit logging, removal of any remaining hardcoded tokens/names, accessibility and responsive fixes from §12–13 of the findings below.

This order is chosen specifically so that **payments — the highest-risk, hardest-to-reverse integration — comes last**, after auth, data model, storage, and token security are already real; and so that visually-frozen, low-logic pages ship first to validate that the UI-freeze constraint is being honored throughout.

---

## 19. Files That Can Be Reused (largely as-is)

- `src/index.css` — design tokens, near-zero change needed (global import works in Next.js too).
- `public/favicon.svg`, `public/icons.svg`.
- `src/components/common/UIComponents.jsx` (`StatusBadge`, `Toast`) — pure presentational, portable directly into Client Components.
- Visual/JSX structure (not the data-wiring) of every page — the inline-style markup can be copy-pasted into new Server/Client Components; only the data source and event handlers change.
- `mockData.js` — reusable as **database seed data**, not as runtime state.

## 20. Files Requiring Modification

- `src/context/AppContext.jsx` — must be split apart (server data fetching vs. genuine client UI state); cannot be ported wholesale.
- `src/AppContent.jsx` — logic (route→component mapping) is a reference for the App Router file structure but the mechanism itself is replaced.
- `src/components/layouts/CreatorLayout.jsx` / `ClientReviewLayout.jsx` — navigation must move from `setCurrentRoute()` calls to `<Link>`/`useRouter`; otherwise structurally reusable.
- Every page file that calls `useApp()` — needs its data access rewired to props/server fetch, and mutation handlers rewired to Server Actions.
- `src/pages/AdminAndSystemPages.jsx` — de-duplicate against `MOCK_ADMIN_DATA` instead of the inline array; build out the two missing sub-tabs.
- `WorkspaceDetails.jsx` — fix the non-functional "Copy Client Link" clipboard call while migrating.

## 21. Files Likely to Be Replaced

- `src/data/mockData.js` as a **runtime** dependency (retained only as seed data, see §19).
- `App.css` — dead file, drop entirely.
- `src/assets/hero.png`, `react.svg`, `vite.svg` — dead assets, drop entirely.
- `README.md` — currently the unedited Vite template; should be rewritten to describe Project Vault once real setup steps exist.

---

## 22. Questions / Unresolved Assumptions

1. **`implementation_plan.md` and `walkthrough.md` do not exist anywhere in this repository** (confirmed via recursive glob from the repo root). The audit brief assumes these are present and complete — please confirm whether they exist elsewhere (a different branch, a separate design repo, not yet committed) and should be supplied, or whether the brief's references to them can be dropped.
2. `dist/` appears to be present in the working tree — please confirm whether this is intentionally committed (e.g., for a specific deploy mechanism) or should be gitignored.
3. The two admin sub-tabs (`/admin/workspaces`, `/admin/storage`) are non-functional placeholders today (both silently render `AdminUsersPage`) — confirm whether these are in scope for the "visually frozen" constraint (i.e., do real screens for them need to be designed first, since none currently exist even as static UI)?
4. `MOCK_ADMIN_DATA` (webhooks, storage stats) is defined but never rendered anywhere — confirm whether this was intended to back a screen that hasn't been wired up yet, or is safe to treat purely as a schema hint for Phase 6/8.
5. The "Copy Client Link" button currently does not copy anything to the clipboard — confirm whether this should be silently fixed as part of migration (behavioral bug fix, not a redesign) or left as-is pending explicit sign-off, given the "no code changes" constraint of this audit task.

---

## Audit Completion Report

- **Files inspected:** all 17 files under `src/`, plus `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `.oxlintrc.json`, `README.md`, `public/` contents. `implementation_plan.md` and `walkthrough.md` were searched for repo-wide and confirmed absent.
- **Commands executed:** `npm install`, `npm run build`, `npm run lint`. No files were modified to make any of these pass; none needed modification.
- **Build status:** ✅ Success, 0 errors, 0 warnings (`vite build`, 489ms, 287.32 kB JS / 1.93 kB CSS output).
- **Lint status:** ⚠️ 43 warnings, 0 errors (`oxlint`) — entirely unused-import/unused-variable + one Fast-Refresh export-shape warning; no correctness issues.
- **Routes found:** 17 distinct route handlers (13 exact-match, 4 prefix/fallback-match).
- **Reusable components found:** 4 (`StatusBadge`, `Toast`, `CreatorLayout`, `ClientReviewLayout`), plus 12 page-level components across 8 page files.
- **Major risks:**
  1. Payment/unlock logic is 100% client-controlled today and must be completely rebuilt server-side (§14, §16) — this is the highest-risk migration item.
  2. `AppContext` is the single most coupled module in the codebase (24 cross-community edges) — its removal/replacement touches nearly every file.
  3. Routing has no relationship to Next.js App Router conventions — full manual re-implementation required, high mechanical effort though low conceptual risk.
  4. No tests exist anywhere, so regressions during migration will only be caught by manual/visual verification.
- **Recommended first implementation phase:** Phase 0 (Foundation) — scaffold Next.js + TypeScript strict, port `index.css` verbatim, and rebuild the purely-presentational, data-free screens (`StatusBadge`, `Toast`, `SystemStatePage` variants, `LandingPage`) first, to validate the visual-freeze constraint before any data/auth/payment risk is introduced.
