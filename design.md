# Rithya Creations interface system

This is the locked visual direction for the private order manager.

## Product point of view

Rithya Creations is a maker's workbench, not an ERP dashboard. The interface should help one owner find an R-code, capture an order, and know what needs attention next.

## Direction

- Genre: editorial workshop
- Macrostructure: Workbench
- Theme: warm workshop (2026 refresh)
- Enrichment: restrained depth and entrance motion only
- App chrome: edge-aligned, compact, and text-labelled
- Typography: existing Geist and Geist Mono from app/layout.tsx
- Voice: plain, specific, calm

The visual system uses warm paper, dark ink, moss for primary actions, and a
restrained clay accent. These brand colours do not change.

The refresh permits:

- Layered shadows for depth, and larger radii.
- A blurred, sticky header and tab rail.
- Soft radial washes on the profit banner and the page background only.
- Data charts, because the Dashboard is a data surface.
- Entrance and hover motion under 250 ms, with a reduced-motion fallback.
- A dark theme that follows the operating system.

It still uses no decorative illustrations and no looping animation.

## Shared app rules

- Keep the existing sections and add a Dashboard overview: Dashboard, New R-code, New order, Catalogue, Orders.
- Dashboard is a derived overview from saved records. Orders remain the operational home for editing and filtering.
- Dashboard metrics and charts must use real order data only: collected payments,
  open balances, order statuses, dated monthly totals, and derived profit.
- Profit is derived, never stored. It reads the current catalogue cost by R-code.
  A cost change therefore updates the profit of every order, old and new.
- Courier charges are excluded from profit on both sides. The customer pays them
  and the courier takes them, so they are not margin.
- Keep R-code, customer, payment, status, due date, image, CSV, autosave, backup, and restore behaviour unchanged.
- Use flat surfaces with thin rules. A panel is a work surface, not a card inside another card.
- Use monospace for R-codes, money, dates, and save state.
- Use colour with text labels. Never make payment, status, error, or save state colour-only.
- Use visible focus rings, 44px minimum controls, and reduced-motion fallbacks.
- Keep metadata-first image loading and lazy image URLs. Full image data belongs to full backup/restore only.

## Workbench layout

1. A compact header holds the brand, save state, CSV, backup, and restore actions.
2. A single workspace rail holds the four existing tabs and their record counts.
3. Orders starts with a compact work summary and derived attention queues.
4. The order table uses the full laptop width. It becomes intentional order cards below the table breakpoint.
5. Catalogue uses a visual shelf: the image and R-code are easy to recognise, while edit/delete stay quiet.
6. Forms keep the existing fields but use a clear capture column and review column.

## Tokens

All colour, type, spacing, motion, border, and surface values are exported from tokens.css. Components must reference those variables rather than introduce raw values.

## Responsive rules

- 1440px and above: use the full workbench width without a fixed side rail.
- 1000px to 1439px: keep the order table and compress secondary gaps.
- Below 1000px: use order cards and keep filters reachable.
- Below 760px: stack form fields and allow the tab rail to scroll horizontally.
- At 320px, 375px, 414px, and 768px: no page-level horizontal scroll.

## Interaction states

- Loading: “Connecting”, with normal layout preserved.
- Saved: quiet green text beside the brand.
- Saving: monospace “Saving” text; do not block navigation.
- Save failure: explicit “Save failed” text and the existing notice.
- Offline: explicit “Offline” text and the existing notice. Do not imply a local draft is durable.
- Empty queues: explain what the queue means and offer the existing New order or New R-code action.
- Image viewer: named dialog, Escape close, focus return, and background scroll lock.

## Intentional cuts

No new route, sidebar, inventory, production planning, CRM, notifications, multi-user controls, assistant, decorative animation, or dependency.
