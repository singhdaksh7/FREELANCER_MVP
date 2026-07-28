# CREATOR_COMPONENT_MAP.md

Component-by-component map of the creator application shell + creator screens (Phase 2 UI, Phase 3 data/auth). "Source" is the original Vite file/section this was migrated or adapted from. Phase 3 changes are called out inline where a component's data source or type changed; see `MIGRATION_STATUS.md` for the full phase-by-phase narrative.

## Shell

| Component | Source (Vite) | Location | Type | Data source | Reused children |
|---|---|---|---|---|---|
| `CreatorShell` | `CreatorLayout.jsx` (outer wrapper) | `src/components/creator/creator-shell.tsx` | Server | `AuthenticatedCreator`, unread count (props) — **Phase 3:** was the mock `Creator` type | `CreatorSidebar`, `CreatorHeader`, `CreatorMobileHeader`, `CreatorMobileNav` |
| `CreatorSidebar` | `CreatorLayout.jsx` `<aside>` | `src/components/creator/creator-sidebar.tsx` | Server | `AuthenticatedCreator` (prop) | `LinkButton`, `CreatorNavigation`, `CreatorProfile` |
| `CreatorNavigation` | `CreatorLayout.jsx` `navItems.map(...)` | `src/components/creator/creator-navigation.tsx` | **Client** (`usePathname` for active state) | `CREATOR_NAV_ITEMS` (constant) | — |
| `CreatorHeader` | `CreatorLayout.jsx` `<header>` (desktop) | `src/components/creator/creator-header.tsx` | Server | unread count (prop) | `NotificationTrigger` |
| `CreatorMobileHeader` | *No original equivalent* — original had no mobile drawer | `src/components/creator/creator-mobile-header.tsx` | **Client** (open/close state, Escape handling) | `AuthenticatedCreator` (prop) | `CreatorNavigation`, `NotificationTrigger` |
| `CreatorMobileNav` | `CreatorLayout.jsx` `.mobile-bottom-nav` | `src/components/creator/creator-mobile-nav.tsx` | **Client** (`usePathname` for active state) | `CREATOR_MOBILE_PRIMARY_NAV_ITEMS` (constant) | — |
| `CreatorProfile` | `CreatorLayout.jsx` sidebar footer avatar block | `src/components/creator/creator-profile.tsx` | Server | `AuthenticatedCreator` (prop) | — |
| `NotificationTrigger` | `CreatorLayout.jsx` header bell button | `src/components/creator/notification-trigger.tsx` | Server | unread count (prop) | — |
| `nav-items.ts` | `CreatorLayout.jsx` `navItems`/`adminItems` arrays | `src/components/creator/nav-items.ts` | n/a (config, not a component) | — | — |

**Phase 3 change — `CreatorProfile`:** now renders the real authenticated session (name, email, initials-fallback avatar) instead of hardcoded mock data, and its logout control is a real `<form action={logoutAction}>` (a Server Action that ends the Auth.js session) rather than a `<Link>` to `/`. See `src/actions/auth.ts`.

Note on naming: the brief's suggested `profile-menu.tsx` was built as `creator-profile.tsx` instead — the original design has no dropdown menu on the profile block (just an avatar, name/role, and a logout icon-button), so a dropdown wasn't built to avoid inventing a UI pattern the approved design doesn't have.

## Shared UI primitives (extend Phase 1's `@/components/ui`)

| Component | Location | Type | Notes |
|---|---|---|---|
| `MetricCard` | `src/components/ui/metric-card.tsx` | Server | Used on Dashboard + Payments |
| `SectionHeader` | `src/components/ui/section-header.tsx` | Server | Page heading + description + action slot |
| `EmptyState` | `src/components/ui/empty-state.tsx` | Server | Empty/no-results placeholder, used on Workspaces/Clients/Payments/Notifications |
| `SearchField` | `src/components/ui/search-field.tsx` | Server (rendered inside Client parents) | Controlled, `aria-label` required |
| `FilterSelect` | `src/components/ui/filter-select.tsx` | Server (rendered inside Client parents) | Controlled, `aria-label` required |

`StatusBadge`, `Toast`, `Button`, `LinkButton`, `PageContainer` are reused unchanged from Phase 1.

## Auth (new in Phase 3)

| Component | Location | Type | Notes |
|---|---|---|---|
| `AuthCard` | `src/components/auth/auth-card.tsx` | Server | Shared logo/heading/card chrome for all three auth screens (unchanged from the Phase 1 `AuthForm`'s visual shell) |
| `LoginForm` | `src/components/auth/login-form.tsx` | **Client** (`useActionState`) | Real login via `loginAction`; generic error message only |
| `RegisterForm` | `src/components/auth/register-form.tsx` | **Client** (`useActionState`) | Real registration via `registerAction`; per-field Zod errors, never echoes the password back |
| `ForgotPasswordNotice` | `src/components/auth/forgot-password-notice.tsx` | Server | Static notice — no form, no fake email |

These replace Phase 1's single mode-switched `AuthForm` component (deleted), which only ever showed a "demo only" toast.

## Workspaces (`/workspaces`, and reused on `/dashboard`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `WorkspacesFilterBar` | `WorkspacesList.jsx` (search/filter state) | `src/components/creator/workspaces-filter-bar.tsx` | **Client** (`useUrlFilters`) | Writes `q`/`status`/`client`/`sort` URL params — **Phase 3:** replaces `WorkspaceExplorer`, which owned client-side array filtering over mock data; filtering is now database-backed (`src/data-access/workspaces.ts`) and the page itself (`src/app/(creator)/workspaces/page.tsx`) is the Server Component doing the query |
| `WorkspaceTable` | `CreatorDashboard.jsx` table + `WorkspacesList.jsx` cards, merged into one shared desktop table | `src/components/creator/workspace-table.tsx` | Server (no handlers) | `WorkspaceListItem[]` (prop) — **Phase 3:** DB-shaped type from `src/data-access/workspaces.ts`; dropped the `category`/version-badge subtitle (fields not in the Phase 3 schema) and only renders the "Portal" link when `publicToken` is actually set |
| `WorkspaceCard` | `WorkspacesList.jsx` card | `src/components/creator/workspace-card.tsx` | Server (same as above) | `WorkspaceListItem` (prop), same Phase 3 changes as `WorkspaceTable` |

## Clients (`/clients`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `ClientExplorer` | `CreatorPages.jsx` `ClientsManagement` | `src/components/creator/client-explorer.tsx` | **Client** | `ClientListItem[]` (prop) — **Phase 3:** search now writes the `q` URL param (`useUrlFilters`) instead of filtering a full in-memory array; the page (`src/app/(creator)/clients/page.tsx`) does the database query |
| `ClientTable` | *New — original had no table, only cards* | `src/components/creator/client-table.tsx` | Client-only (Edit/Delete handlers) | `ClientListItem[]` (prop) — **Phase 3:** `activeWorkspaceCount`/`outstandingAmount`/`lastActivityAt` are now computed server-side in `src/data-access/clients.ts`, not derived client-side from a separate `workspaces` prop |
| `ClientCard` | `CreatorPages.jsx` `ClientsManagement` card | `src/components/creator/client-card.tsx` | Client-only (Edit/Delete handlers) | `ClientListItem` (prop), same Phase 3 change as `ClientTable` |

## Payments (`/payments`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `PaymentExplorer` | `CreatorPages.jsx` `PaymentsDashboard` | `src/components/creator/payment-explorer.tsx` | **Client** | `PaymentListItem[]` + `PaymentSummary` (props) — **Phase 3:** status/date filters write URL params (`useUrlFilters`) instead of filtering in-memory; `src/data-access/payments.ts` does the database query and the Decimal-safe summary math |
| `PaymentTable` | `CreatorPages.jsx` `PaymentsDashboard` table | `src/components/creator/payment-table.tsx` | Client-only (Receipt handler) | `PaymentListItem[]` (prop) — **Phase 3:** `netAmount` is computed from real `Decimal` `amount`/`feeAmount` columns (`src/lib/decimal.ts`), not a mock field |
| `PaymentCard` | *New — original had no mobile card, table only* | `src/components/creator/payment-card.tsx` | Client-only (Receipt handler) | `PaymentListItem` (prop), same Phase 3 change as `PaymentTable` |

## Notifications (`/notifications`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `NotificationsList` | `CreatorPages.jsx` `NotificationsPage` | `src/components/creator/notifications-list.tsx` | **Client** (local read/unread toggle) | `NotificationListItem[]` (prop) — **Phase 3:** DB-shaped type from `src/data-access/notifications.ts`; read/unread toggle remains local-only prototype state (never persisted), per the read-only scope of this phase too |
| `NotificationItem` | `CreatorPages.jsx` `NotificationsPage` row | `src/components/creator/notification-item.tsx` | Server (handler passed in, safe inside the Client parent above) | `NotificationListItem` (prop) — **Phase 3:** type-icon map keys changed from the mock's lowercase strings (`"comment"`) to the Prisma `NotificationType` enum's values (`"COMMENT"`) |

## Dashboard-only

| Component | Source (Vite) | Location | Type |
|---|---|---|---|
| `ActivityItem` | *New — no unified activity feed existed in the original; each workspace only had its own per-workspace activity log* | `src/components/creator/activity-item.tsx` | Server |

## Client & workspace mutations (new in Phase 4)

| Component | Location | Type | Notes |
|---|---|---|---|
| `ClientForm` | `src/components/creator/client-form.tsx` | **Client** (`useActionState`) | Shared create/edit form; `mode` prop selects `createClientAction`/`updateClientAction` |
| `WorkspaceWizard` | `src/components/creator/workspace-wizard.tsx` | **Client** (`useActionState` + local step state) | Real five-step Create Workspace flow, replacing the deferred placeholder |
| `WorkspaceEditForm` | `src/components/creator/workspace-edit-form.tsx` | **Client** (`useActionState`) | Single-page edit form; locks amount/currency/client once financially locked |
| `WorkspaceDetailTabs` | `src/components/creator/workspace-detail-tabs.tsx` | **Client** (tab state) | Overview/Files/Comments/Payment/Activity |
| `WorkspaceActions` | `src/components/creator/workspace-actions.tsx` | **Client** | Edit/Share(disabled)/Cancel/Delete action row on workspace details |
| `ConfirmDialog` | `src/components/ui/confirm-dialog.tsx` | **Client** (`useActionState`) | Generic confirm-then-submit modal; reused for client delete + workspace cancel/delete |
| `FlashToast` | `src/components/ui/flash-toast.tsx` | **Client** | Reads/strips the `?flash=` query param a redirecting Server Action leaves behind, shows it as a success toast |

`ClientCard`/`ClientTable` (`src/components/creator/client-{card,table}.tsx`) were updated in place: Edit is now a real `<Link>` to `/clients/[id]/edit`, Delete is now a real `ConfirmDialog` bound to `deleteClientAction` — both previously showed a deferred-action toast (Phase 2/3).

## Routes

| Route | File | Metadata title |
|---|---|---|
| `/dashboard` | `src/app/(creator)/dashboard/page.tsx` | Dashboard |
| `/workspaces` | `src/app/(creator)/workspaces/page.tsx` | Workspaces |
| `/workspaces/new` | `src/app/(creator)/workspaces/new/page.tsx` | New Workspace (Phase 4) |
| `/workspaces/[id]` | `src/app/(creator)/workspaces/[id]/page.tsx` | Workspace title (dynamic, Phase 4) |
| `/workspaces/[id]/edit` | `src/app/(creator)/workspaces/[id]/edit/page.tsx` | Edit Workspace (Phase 4) |
| `/clients` | `src/app/(creator)/clients/page.tsx` | Clients |
| `/clients/new` | `src/app/(creator)/clients/new/page.tsx` | Add New Client (Phase 4) |
| `/clients/[id]/edit` | `src/app/(creator)/clients/[id]/edit/page.tsx` | Edit Client (Phase 4) |
| `/payments` | `src/app/(creator)/payments/page.tsx` | Payments |
| `/notifications` | `src/app/(creator)/notifications/page.tsx` | Notifications |
| *(shared layout)* | `src/app/(creator)/layout.tsx` | — |
| *(shared loading state)* | `src/app/(creator)/loading.tsx` | — (Phase 3) |
| *(shared error boundary)* | `src/app/(creator)/error.tsx` | — (Phase 3) |

The `(creator)` segment is a Next.js **route group** — it organizes these routes under one shared layout file without adding a `/creator` URL prefix. All five screens are now protected: `layout.tsx` calls `requireCreatorRole()` (Phase 3) before rendering `CreatorShell`, in addition to `src/proxy.ts`'s optimistic redirect.

## Data-access layer (new in Phase 3 — not components, but what the pages above actually read from)

| Module | Exports | Notes |
|---|---|---|
| `src/data-access/auth.ts` | `getAuthenticatedCreator`, `requireAuthenticatedUser`, `requireCreatorRole` | The definitive (non-optimistic) auth check; re-reads the user from Postgres every time, never trusts the JWT alone |
| `src/data-access/credentials.ts` | `verifyCredentials` | Used by `src/auth.ts`'s `authorize()`; kept separate so it's unit/integration-testable without importing the full `next-auth` package |
| `src/data-access/users.ts` | `createUser`, `DuplicateEmailError`, `isUniqueConstraintError` | Registration's transactional insert + duplicate-email handling |
| `src/data-access/dashboard.ts` | `getDashboardData` | Powers `/dashboard`; delegates the pure summary math to `src/lib/dashboard-summary.ts` |
| `src/data-access/workspaces.ts` | `getWorkspaces`, plus (Phase 4) `getOwnedWorkspaceDetail`, `getOwnedWorkspaceForEdit`, `createWorkspace`, `updateOwnedWorkspace`, `cancelOwnedWorkspace`, `deleteOwnedDraftWorkspace` | Powers `/workspaces`, `/workspaces/[id]`, `/workspaces/new`, `/workspaces/[id]/edit`, and the dashboard's "Recent Workspaces" |
| `src/data-access/clients.ts` | `getClients`, plus (Phase 4) `getClientOptionsForCreator`, `getOwnedClientForEdit`, `createClient`, `updateOwnedClient`, `deleteOwnedUnusedClient` | Powers `/clients`, `/clients/new`, `/clients/[id]/edit`, and the workspace client-select dropdowns |
| `src/data-access/payments.ts` | `getPayments` | Powers `/payments` and the workspace details Payment tab |
| `src/data-access/notifications.ts` | `getNotifications`, `getUnreadNotificationCount` | Powers `/notifications` and the header/nav unread badge |
| `src/data-access/authorization.ts` (Phase 4) | `requireOwnedClient`, `requireOwnedWorkspace`, `requireClientAvailableToCreator`, `OwnershipError` | Centralized ownership checks — see `MUTATION_ARCHITECTURE.md` |
| `src/data-access/activity.ts` (Phase 4) | `recordActivity` | Writes one `ActivityLog` row inside the caller's transaction — see `MUTATION_ARCHITECTURE.md` |
| `src/data-access/scoping.test.ts`, `isolation.integration.test.ts`, `mutations.test.ts`, `mutations.integration.test.ts` | — | Not modules, but worth knowing about here: the unit + integration proof that every module above scopes by the authenticated session, never a parameter, and that mutation restrictions (paid-workspace lock, client-deletion block, status transitions) actually hold |

Every module above starts with `import "server-only"` and is never imported from a Client Component. `src/actions/{clients,workspaces}.ts` (Phase 4, `"use server"`) sit one layer above this — see `MUTATION_ARCHITECTURE.md` for the Server Action structure.

## Data & lib layer (Phase 2, now mostly superseded — see below)

- `src/types/*`, `src/data/mock/*` — **obsolete for production routes as of Phase 3** (see `MIGRATION_STATUS.md`). No page imports them anymore; kept only because some Phase 2-era pure-function tests (`dashboard-metrics.test.ts`) still exercise them directly.
- `src/lib/format-currency.ts`, `format-date.ts` (now also `formatDateTime`), `format-relative-time.ts`, `search.ts`, `workspace-progress.ts`, `dashboard-metrics.ts` (legacy/mock-only), `client-metrics.ts` (legacy/mock-only, fully unreferenced), `payment-metrics.ts` (legacy/mock-only), `demo-clock.ts` (still used — see `src/data-access/payments.ts`'s date-range filter) — pure formatting/derivation helpers.
- **New in Phase 3:** `src/lib/decimal.ts` (Decimal-safe money math), `src/lib/dashboard-summary.ts` (pure, DB-shape-aware dashboard math, testable without a database), `src/lib/status-labels.ts` (humanizes the Prisma enums into the strings `src/lib/status-config.ts` already has styles for), `src/lib/filter-options.ts` (client-safe filter dropdown option lists, importing enums from the browser-safe Prisma entrypoint), `src/lib/search-params.ts` (validates/normalizes URL search params server-side), `src/hooks/use-url-filters.ts` (the one small Client-side hook every filter bar uses to read/write those params).
