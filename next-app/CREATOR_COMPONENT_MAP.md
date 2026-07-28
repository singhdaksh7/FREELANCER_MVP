# CREATOR_COMPONENT_MAP.md

Component-by-component map of everything migrated in Phase 2 (creator application shell + read-only creator screens). "Source" is the original Vite file/section this was migrated or adapted from.

## Shell

| Component | Source (Vite) | Location | Type | Data source | Reused children |
|---|---|---|---|---|---|
| `CreatorShell` | `CreatorLayout.jsx` (outer wrapper) | `src/components/creator/creator-shell.tsx` | Server | `CREATOR`, unread count (props) | `CreatorSidebar`, `CreatorHeader`, `CreatorMobileHeader`, `CreatorMobileNav` |
| `CreatorSidebar` | `CreatorLayout.jsx` `<aside>` | `src/components/creator/creator-sidebar.tsx` | Server | `CREATOR` (prop) | `LinkButton`, `CreatorNavigation`, `CreatorProfile` |
| `CreatorNavigation` | `CreatorLayout.jsx` `navItems.map(...)` | `src/components/creator/creator-navigation.tsx` | **Client** (`usePathname` for active state) | `CREATOR_NAV_ITEMS` (constant) | — |
| `CreatorHeader` | `CreatorLayout.jsx` `<header>` (desktop) | `src/components/creator/creator-header.tsx` | Server | unread count (prop) | `NotificationTrigger` |
| `CreatorMobileHeader` | *No original equivalent* — original had no mobile drawer | `src/components/creator/creator-mobile-header.tsx` | **Client** (open/close state, Escape handling) | `CREATOR` (prop) | `CreatorNavigation`, `NotificationTrigger` |
| `CreatorMobileNav` | `CreatorLayout.jsx` `.mobile-bottom-nav` | `src/components/creator/creator-mobile-nav.tsx` | **Client** (`usePathname` for active state) | `CREATOR_MOBILE_PRIMARY_NAV_ITEMS` (constant) | — |
| `CreatorProfile` | `CreatorLayout.jsx` sidebar footer avatar block | `src/components/creator/creator-profile.tsx` | Server | `CREATOR` (prop) | — |
| `NotificationTrigger` | `CreatorLayout.jsx` header bell button | `src/components/creator/notification-trigger.tsx` | Server | unread count (prop) | — |
| `nav-items.ts` | `CreatorLayout.jsx` `navItems`/`adminItems` arrays | `src/components/creator/nav-items.ts` | n/a (config, not a component) | — | — |

Note on naming: the brief's suggested `profile-menu.tsx` was built as `creator-profile.tsx` instead — the original design has no dropdown menu on the profile block (just an avatar, name/role, and a logout icon-button that navigates to `/`), so a dropdown wasn't built to avoid inventing a UI pattern the approved design doesn't have.

## Shared UI primitives (extend Phase 1's `@/components/ui`)

| Component | Location | Type | Notes |
|---|---|---|---|
| `MetricCard` | `src/components/ui/metric-card.tsx` | Server | Used on Dashboard + Payments |
| `SectionHeader` | `src/components/ui/section-header.tsx` | Server | Page heading + description + action slot |
| `EmptyState` | `src/components/ui/empty-state.tsx` | Server | Empty/no-results placeholder, used by all 3 explorers |
| `SearchField` | `src/components/ui/search-field.tsx` | Server (rendered inside Client parents) | Controlled, `aria-label` required |
| `FilterSelect` | `src/components/ui/filter-select.tsx` | Server (rendered inside Client parents) | Controlled, `aria-label` required |

`StatusBadge`, `Toast`, `Button`, `LinkButton`, `PageContainer` are reused unchanged from Phase 1.

## Workspaces (`/workspaces`, and reused on `/dashboard`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `WorkspaceExplorer` | `WorkspacesList.jsx` (search/filter state) | `src/components/creator/workspace-explorer.tsx` | **Client** | `WORKSPACES` (prop) |
| `WorkspaceTable` | `CreatorDashboard.jsx` table + `WorkspacesList.jsx` cards, merged into one shared desktop table | `src/components/creator/workspace-table.tsx` | Server (no handlers — safe from both Server and Client parents) | `workspaces` (prop) |
| `WorkspaceCard` | `WorkspacesList.jsx` card | `src/components/creator/workspace-card.tsx` | Server (same as above) | `workspace` (prop) |

## Clients (`/clients`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `ClientExplorer` | `CreatorPages.jsx` `ClientsManagement` | `src/components/creator/client-explorer.tsx` | **Client** | `CLIENTS`, `WORKSPACES` (props) |
| `ClientTable` | *New — original had no table, only cards* | `src/components/creator/client-table.tsx` | Client-only (Edit/Delete handlers) | props |
| `ClientCard` | `CreatorPages.jsx` `ClientsManagement` card | `src/components/creator/client-card.tsx` | Client-only (Edit/Delete handlers) | props |

## Payments (`/payments`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `PaymentExplorer` | `CreatorPages.jsx` `PaymentsDashboard` | `src/components/creator/payment-explorer.tsx` | **Client** | `PAYMENTS` (prop) |
| `PaymentTable` | `CreatorPages.jsx` `PaymentsDashboard` table | `src/components/creator/payment-table.tsx` | Client-only (Receipt handler) | props |
| `PaymentCard` | *New — original had no mobile card, table only* | `src/components/creator/payment-card.tsx` | Client-only (Receipt handler) | props |

## Notifications (`/notifications`)

| Component | Source (Vite) | Location | Type | Data source |
|---|---|---|---|---|
| `NotificationsList` | `CreatorPages.jsx` `NotificationsPage` | `src/components/creator/notifications-list.tsx` | **Client** (local read/unread toggle) | `NOTIFICATIONS` (prop) |
| `NotificationItem` | `CreatorPages.jsx` `NotificationsPage` row | `src/components/creator/notification-item.tsx` | Server (handler passed in, safe inside the Client parent above) | `notification` (prop) |

## Dashboard-only

| Component | Source (Vite) | Location | Type |
|---|---|---|---|
| `ActivityItem` | *New — no unified activity feed existed in the original; each workspace only had its own per-workspace activity log* | `src/components/creator/activity-item.tsx` | Server |

## Routes

| Route | File | Metadata title |
|---|---|---|
| `/dashboard` | `src/app/(creator)/dashboard/page.tsx` | Dashboard |
| `/workspaces` | `src/app/(creator)/workspaces/page.tsx` | Workspaces |
| `/clients` | `src/app/(creator)/clients/page.tsx` | Clients |
| `/payments` | `src/app/(creator)/payments/page.tsx` | Payments |
| `/notifications` | `src/app/(creator)/notifications/page.tsx` | Notifications |
| *(shared layout)* | `src/app/(creator)/layout.tsx` | — |

The `(creator)` segment is a Next.js **route group** — it organizes these five routes under one shared layout file without adding a `/creator` URL prefix; all five routes resolve exactly where the brief requires.

## Data & lib layer (not components, referenced above)

- `src/types/*` — `Creator`, `Workspace`, `Client`, `Payment`, `Notification` and their sub-types.
- `src/data/mock/*` — `CREATOR`, `CLIENTS`, `WORKSPACES`, `PAYMENTS`, `NOTIFICATIONS`, `DASHBOARD_SUMMARY`, `RECENT_ACTIVITY`.
- `src/lib/format-currency.ts`, `format-date.ts`, `format-relative-time.ts`, `search.ts`, `workspace-progress.ts`, `dashboard-metrics.ts`, `client-metrics.ts`, `payment-metrics.ts`, `demo-clock.ts` — pure formatting/derivation helpers, unit tested independently of any component.
