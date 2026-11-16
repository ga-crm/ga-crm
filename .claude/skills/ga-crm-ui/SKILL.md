---
name: ga-crm-ui
description: Visual rules and component kit for the GA CRM frontend. Use whenever adding or changing a screen, form, table, dialog, colour, spacing or text in frontend/ of this repo (giao diện, màn hình, sửa UI, design system, responsive), including small tweaks, so the app stays consistent with its design system.
---

# GA CRM: UI

The design system is `requirement/desigin/desigin.md`; deliberate differences are in `docs/decisions.md`. Tokens are in `frontend/src/index.css`, components in `frontend/src/components/ui.tsx`. Reuse these rather than writing raw values, so a future rebrand only touches tokens.

## shadcn/ui

The kit is built on shadcn/ui: the generated parts live in `frontend/src/components/shadcn/` (Radix underneath), and `ui.tsx` wraps them with the app's sizes and tokens, keeping its own names and props. Screens import from `ui.tsx`; import from `@/components/shadcn/...` only for a part the kit does not wrap (Popover, Sheet, DropdownMenu, Command, as `AccountMenu`, `NotificationBell`, `Sidebar` and `DevAccountSwitcher` do).

| Need | Use |
|---|---|
| Button, link styled as one | `Button`, `buttonClass(variant, className)` (shadcn `buttonVariants`) |
| Button that is only an icon | `IconButton` (`label` names it and shows as a shadcn Tooltip; `tone="neutral"` in the chrome). Not for rows of a long tree: one tooltip per row is too many |
| Text, long text, choice | `Input`, `Textarea` (sized by `rows`), `Select` (shadcn NativeSelect, so `register` works), all inside `Field` |
| Tick box | `Checkbox` (`checked`, `onChange(checked)`), in a `<label>` with its text or with `aria-label` in a table; with React Hook Form through `Controller` |
| One of a few | `RadioGroup` with `Radio` in a `<label>`, or `RadioCard` when the whole card is the choice (theme, colour) |
| Switch between views or presets | `Segmented` (ToggleGroup, one value; `onClear` when none is allowed) |
| Multi-select chips | `ChipGroup` (ToggleGroup) |
| Search and pick one from a list | `PickList` (Command): the caller filters, arrow keys and Enter pick, fixed height |
| Form dialog, confirmation | `Dialog` (shadcn Dialog), `ConfirmDialog` (AlertDialog) |
| Row actions, menus | `RowMenu` (DropdownMenu); `DropdownMenu` directly for other menus |
| Tab row of a screen | `TabBar` (Tabs; `pills` for lists, `line` for record sections), value kept in the URL |
| Bordered block inside a page | `Panel` (shadcn Card; `as` for `li` / `article`) |
| Status, error, notice | `Badge`, `Alert`, `Notice` (shadcn Badge and Alert) |
| Toast | `toast.*` from `lib/toast.ts` (Sonner) |
| Tooltip on something else | shadcn Tooltip with `TOOLTIP_CLASS`, as the collapsed sidebar does |
| Floating panel, drawer | Popover, Sheet |

Do not write a raw `<input type="checkbox">`, `<input type="radio">`, `role="listbox"` list or `aria-pressed` button group in a screen: each has a kit component above. Still hand-written on purpose: data tables (`.data-table` in `index.css`), the mention box of comments, tree rows, the native date and file inputs.

shadcn's colour names (`bg-popover`, `text-muted-foreground`, `border-input`, `bg-accent`...) map onto the tokens in the `@theme inline` block of `index.css`, so they follow every theme and accent; never add colours there. Class names merge with `cn()` from `@/lib/utils`, which knows the app's type ladder (`text-caption` is a size, not a colour).

To add a shadcn component: `cd frontend && npx shadcn@latest add <name> --yes`. The CLI cannot read the alias through the root tsconfig and writes to `frontend/@/components/shadcn/`: move the file into `src/components/shadcn/`, then make it fit the rules: import `cn` from `@/lib/utils`, drop `shadow-*`, `dark:` and `focus-visible:ring-*` classes (themes come from `data-theme`, focus from the global outline), turn `rounded-full` into `rounded-sm`, and put any English text (`Close`...) through `t()`.

## Rules

- Blue acts: `primary` is for buttons, links and the active tab only. Everything else stays neutral. Alert red is only for errors and destructive actions. Badges may also use `success`, `warning` and `notable` tones to label a status; these colours are never for controls.
- Separate sections with spacing or a full-width flat band (`bg-chrome`, `bg-band`, `bg-band-blue`), not with shadows. Bands are square and full-bleed, with content inside `Container`.
- The frame fills the viewport and only the content pane scrolls. Lists keep their header, filters and pagination in view: rows go in `TableScroll`, and `flex-none` marks parts that must not shrink. The page itself must never scroll from 768 px up.
- Density: controls are 36 px from 768 px up and 44 px on phones. Do not set heights by hand; use `Button`, `Input`, `Select`.
- No shadows, no pills, no letter-spacing, no uppercase eyebrows. Radius is `rounded-md` for controls, `rounded-lg` for dialogs and empty states, `rounded-sm` for badges.
- Keep the type ladder: `text-page-title` (page), `text-section-title` (hero), `text-subhead` (section), `text-link` (form text), `text-list` (lists, weight 350), `text-nav` (chrome), `text-caption` (tables, meta). Headings use `text-ink`; content uses the `ink-body`, `ink-list` and `ink-meta` slates; `ink-nav` belongs to the chrome only.

## Themes

Users pick a theme and an accent in Settings (`lib/theme.ts`, `[data-theme]` blocks in `index.css`). Use tokens only, never raw colours, or a screen breaks in other themes.

- Themes override colours only. A new colour token goes in `@theme` and in every `[data-theme]` block, because settings samples nest themes; `frontend/test/theme.test.ts` fails otherwise and also checks WCAG contrast.
- `text-on-primary` goes only on `bg-primary` or `bg-primary-deep`, and `text-on-hero` only on `bg-hero`. For inverted surfaces use `bg-ink text-canvas`.
- `primary-deep` is also text on the canvas, so it is light on dark themes. Do not use it as a large fill; use `bg-hero`.

## Page template

```tsx
<>
  <PageHeader title={t('x.title')} action={<Button>...</Button>} />
  <FilterBand>...</FilterBand>
  <Card>
    {query.isPending && <Spinner />}
    {query.isError && <Alert>{errorMessage(query.error)}</Alert>}
    {empty && <EmptyState>{t('x.empty')}</EmptyState>}
    <TableScroll><table className="data-table">...</table></TableScroll>
    <Pagination ... />
  </Card>
</>
```

`AppShell` provides the header, sidebar and breadcrumb. To add a screen: add its loader to `lib/pages.ts`, a route with `lazy: screen(pages.x, when)` in `router.tsx`, and a `lib/nav.ts` entry with a `group`, which becomes an expandable sidebar group. Add a screen to the sidebar only once it works, and point its permission at it in `PERMISSION_FEATURES`. The breadcrumb (shadcn/ui Breadcrumb, built by `breadcrumbTrail` in `lib/nav.ts`) follows the sidebar: a screen opened only from a button on another screen gets a `NAV_ITEMS` entry with `parent` (kept out of the sidebar, shown under its parent), and a detail screen below a list gets a `CHILD_SCREENS` entry with its own label.

## Forms and modals

A form must not change height when it reports an error, so a modal never jumps.

- Always use `Field`, which reserves a line for its error, and `FormError` for errors of the whole form. Never render an error conditionally as a new block.
- Map API errors that belong to a field with `errorField` and `form.setError`.
- Do not show or hide fields inside a modal based on other input; keep the field and change `required` or the placeholder.
- Every input has a placeholder from `placeholder.*` in the catalogue, and required fields use `required` on `Field`.
- End a modal form with `MODAL_FOOTER`, which stays visible when a tall form scrolls. A list inside a modal gets a fixed height.

## State belongs in the URL

A reload must return the user to the same place, so use `useUrlState` rather than `useState` for page, filters, search, and any form dialog that is open (store the record id; refetch it after a reload, and close the dialog if the id is no longer valid). Push history when opening a dialog or changing page, so Back works. Validate values with `oneOf`, because users can edit URLs.

Keep these out of the URL: passwords, typed form content, links holding a one-time token, and confirmation dialogs for destructive actions.

Keep tables compact: one main action plus `RowMenu` for the rest, in a `col-actions` cell so it stays reachable when the table scrolls sideways. Use `SearchInput` for search and pass `onPageSize` to `Pagination`. Sticky cells use `col-first` or `col-actions`, never a `bg-*` utility, which would break the row hover. Scrollbars are styled globally in `index.css`; do not restyle them per component. `.table-scroll` starts its scrollbar below the 42 px header row, so change both together if the header height changes.

## Behaviour

- Never show internal values to users: permission codes, enum values such as `PERMISSION_CHANGE`, or database ids. Add a label to the catalogue instead; codes users know from work, such as agent code and GA code, are fine.
- All visible text lives in `frontend/src/i18n/vi.json` (UI-1). API errors show through `errorMessage`, which maps codes to Vietnamese (UI-2).
- Confirm every action with a toast (Sonner, through `lib/toast.ts`) that says what happened to what, never a generic "saved": `toast.success(t('toast.leadUpdated', { name }))`. Messages live under `toast.*` in `vi.json`; an optional second argument is a line about what happens next, and it must be true, so check the API.
- Pick the kind by outcome: `success` it worked, `info` neutral (cancelled, copied, signed out), `warning` it worked but needs attention (partial import, account locked), `error` it failed. Errors stay inline inside a form or dialog; a page-level action with nowhere to show one uses `toast.error(t('toast.xFailed'), errorMessage(error))`. Never report the same error both ways.
- `RouteProgress` draws the NProgress bar for screen changes and first loads, so a page needs nothing extra. Keep `Spinner` for the content area.
- Destructive actions go through `ConfirmDialog`.
- Empty states explain the next step (UI-4). Dates use `formatDateTime`, which shows `dd/mm/yyyy HH:mm` in Vietnam time (DATA-2).
- Long forms use `<Dialog wide>` with `WIDE_FORM_GRID`, so they stay short. Reuse the field rules in `lib/validation.ts`, set `mode: 'onTouched'`, and check the same rule again in the DTO (`common/validators.ts` for dates).
- Forms use React Hook Form and Zod, with messages from the catalogue, labels through `Field`, and `aria-invalid` on inputs.
- Touch targets on phones are at least 44 px. Paginated tables use `table-fixed` with a `colgroup` and a `min-w-[...]`, one flexible column, and `truncate` plus `title` on long text, so columns do not jump between pages. Wide tables get `overflow-x-auto`, or stacked rows on phones as `UsersPage` does. The page itself must never scroll sideways.
- React effects use a block body. A browser API that returns a Promise, returned from an effect, once crashed the PoC (`requirement/25`).
- Motion: 200 ms `ease-out`, always with `motion-reduce:transition-none`. Keep elements mounted and fade them rather than adding or removing them mid-animation, so nothing jumps.
- Never use `dangerouslySetInnerHTML`.

Lists filter through `FilterBand` with a `FilterField` per control and `ClearFilters`; filter state lives in the URL. A sortable column holds a `SortButton` in its `th` with `aria-sort`; only a non-default order goes in the URL, and changing it returns to page 1. Check every UI change at 1280 px and 375 px, and in the light and dark themes; see `ga-crm-verify`.
