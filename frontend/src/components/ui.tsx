import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Copy, Ellipsis, Info, Search, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Alert as AlertBox } from '@/components/shadcn/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/shadcn/alert-dialog'
import { Badge as BadgeBase } from '@/components/shadcn/badge'
import { Card as CardBase } from '@/components/shadcn/card'
import { Checkbox as CheckboxBase } from '@/components/shadcn/checkbox'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/shadcn/command'
import { Dialog as DialogRoot, DialogContent, DialogTitle } from '@/components/shadcn/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/shadcn/dropdown-menu'
import { Input as InputBase } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { NativeSelect } from '@/components/shadcn/native-select'
import { RadioGroup as RadioGroupBase, RadioGroupCard, RadioGroupItem } from '@/components/shadcn/radio-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/shadcn/tabs'
import { Textarea as TextareaBase } from '@/components/shadcn/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/shadcn/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip'
import { cn } from '@/lib/utils'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { buttonClass, type ButtonVariant } from './buttonStyles'

export { Toaster } from '@/components/shadcn/sonner'
export { TooltipProvider } from '@/components/shadcn/tooltip'

/*
  The app's component kit, built on shadcn/ui (src/components/shadcn, Radix underneath) and styled by
  the tokens of index.css. Screens import from here, so names and props stay the same everywhere.
*/

/** Horizontal padding of the content pane. The pane uses the full width next to the sidebar. */
export const CONTAINER = 'w-full px-4 md:px-6'

export function Container({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`${CONTAINER} ${className}`}>{children}</div>
}

/** `compact` hides the name from 1024 px up, where the sidebar can collapse; phones always show it. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-md bg-primary text-caption font-bold text-on-primary">
        GA
      </span>
      <span className={`text-nav font-medium text-ink transition-opacity duration-150 motion-reduce:transition-none ${compact ? 'lg:opacity-0' : 'delay-75'}`}>{t('app.name')}</span>
    </span>
  )
}


export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button type={type} data-slot="button" className={buttonClass(variant, className)} {...props} />
}

/** Fields are 44 px on phones and 36 px from 768 px up; the border is the hairline token. */
const FIELD_CLASS =
  'h-auto min-h-11 w-full rounded-md border-input bg-canvas px-3 text-link text-ink-body placeholder:text-ink-meta aria-invalid:border-alert md:min-h-9 md:text-caption'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <InputBase className={cn(FIELD_CLASS, 'read-only:border-band read-only:bg-chrome', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  // Sized by `rows`, as before: shadcn's textarea grows with its content, which would move a dialog
  return <TextareaBase className={cn(FIELD_CLASS, 'min-h-0 py-2 field-sizing-fixed md:min-h-0', className)} {...props} />
}

/** shadcn/ui NativeSelect: a real <select>, so forms register it and phones show their own picker. */
export function Select({ className, ...props }: Omit<ComponentProps<'select'>, 'size'>) {
  return <NativeSelect wrapperClassName={cn('block w-full', className)} className={cn(FIELD_CLASS, 'pr-9')} {...props} />
}

/**
 * shadcn/ui Checkbox (Radix). `onChange` gets the new state, so `() => toggle()` handlers stay as they
 * are. Put it inside a <label> with its text, or give it an `aria-label` in a table. With React Hook
 * Form use a Controller, since there is no native input to register.
 */
export function Checkbox({
  checked,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<typeof CheckboxBase>, 'checked' | 'onCheckedChange' | 'onChange'> & { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <CheckboxBase
      checked={checked}
      onCheckedChange={(next) => onChange(next === true)}
      className={cn('size-5 flex-none cursor-pointer rounded-sm bg-canvas aria-invalid:border-alert md:size-4', className)}
      {...props}
    />
  )
}

/** shadcn/ui RadioGroup: one choice of a few. Each `Radio` sits in a <label> with its text. */
export function RadioGroup<T extends string>({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<typeof RadioGroupBase>, 'value' | 'onValueChange'> & { value: T | undefined; onValueChange: (value: T) => void }) {
  return <RadioGroupBase value={value ?? ''} onValueChange={(next) => onValueChange(next as T)} className={cn('gap-2', className)} {...props} />
}

export function Radio({ className, ...props }: ComponentProps<typeof RadioGroupItem>) {
  return <RadioGroupItem className={cn('size-5 flex-none cursor-pointer bg-canvas md:size-4', className)} {...props} />
}

/** A radio that is a whole card, such as a theme sample or a colour swatch; its border shows the choice. */
export function RadioCard({ className, ...props }: ComponentProps<typeof RadioGroupCard>) {
  return <RadioGroupCard className={cn('cursor-pointer border-band hover:bg-chrome', className)} {...props} />
}

/**
 * shadcn/ui ToggleGroup with one value: a small switch between views or presets (table / board, month /
 * week). `value` may match none of the options, such as a custom date range.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onValueChange,
  onClear,
  className,
}: {
  label: string
  value: T | null
  options: { value: T; label: ReactNode }[]
  onValueChange: (value: T) => void
  /** Given when "none" is a valid state: pressing the active option again clears it. */
  onClear?: () => void
  className?: string
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={label}
      value={value ?? ''}
      // Pressing the active one again keeps it (a view is always chosen), unless it may be cleared
      onValueChange={(next) => (next ? onValueChange(next as T) : onClear?.())}
      className={cn('flex-none', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-auto min-h-11 cursor-pointer border-hairline bg-canvas px-3 text-caption font-normal whitespace-nowrap text-ink-nav hover:bg-chrome hover:text-ink data-[state=on]:bg-band-blue data-[state=on]:font-medium data-[state=on]:text-primary-deep md:min-h-9"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A button that is only an icon: named for screen readers, with a shadcn/ui Tooltip saying the same. */
export function IconButton({
  label,
  tone = 'action',
  className,
  type = 'button',
  children,
  ...props
}: ComponentProps<'button'> & { label: string; /** `action` is blue like a ghost button; `neutral` belongs to the chrome and to tree rows. */ tone?: 'action' | 'neutral' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type={type}
          aria-label={label}
          className={cn(
            'inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50 md:size-9',
            tone === 'action' ? 'text-primary hover:bg-band-blue' : 'text-ink-nav hover:bg-band hover:text-ink',
            className,
          )}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className={TOOLTIP_CLASS}>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The look of every tooltip: dark on light themes, light on dark ones. */
export const TOOLTIP_CLASS = 'bg-ink px-2.5 py-1 text-caption text-canvas [&_svg]:bg-ink [&_svg]:fill-ink'

export interface PickOption {
  value: string
  label: string
  /** Shown after the name: a code, a count. */
  meta?: ReactNode
}

/**
 * shadcn/ui Command as a list to pick one from, with its own search box when `onSearchChange` is given.
 * The caller filters (a tree search, or the server), so the list shows `options` as they are. Arrow
 * keys move, Enter picks. A fixed height keeps the dialog around it from moving.
 */
export function PickList({
  label,
  options,
  value,
  onChange,
  search,
  onSearchChange,
  placeholder,
  loading = false,
  empty,
  note,
  className = 'h-64',
  id,
}: {
  label: string
  options: PickOption[]
  value: string | null
  onChange: (value: string) => void
  search?: string
  onSearchChange?: (search: string) => void
  placeholder?: string
  loading?: boolean
  empty?: string
  /** A line under the options, such as "no agent matches" below a fixed first option. */
  note?: string
  className?: string
  id?: string
}) {
  return (
    <Command shouldFilter={false} label={label} className="h-auto rounded-md border border-band bg-canvas text-ink-body">
      {onSearchChange && <CommandInput value={search} onValueChange={onSearchChange} placeholder={placeholder} aria-label={label} className="h-11 text-link md:h-9 md:text-caption" />}
      <CommandList id={id} aria-label={label} className={cn('max-h-none', className)}>
        {loading && <Spinner />}
        {!loading && empty && <CommandEmpty className="px-3 py-2 text-left text-caption text-ink-meta">{empty}</CommandEmpty>}
        {options.map((option) => {
          const chosen = option.value === value
          return (
            <CommandItem
              key={option.value || 'none'}
              // cmdk needs a unique, non-empty value; the option's own value may be '' (nobody)
              value={option.value || '__none__'}
              aria-current={chosen || undefined}
              onSelect={() => onChange(option.value)}
              className={cn('cursor-pointer gap-2 rounded-none px-3 py-2 text-caption text-ink-list data-[selected=true]:bg-chrome', chosen && 'bg-band-blue font-medium text-primary-deep data-[selected=true]:bg-band-blue')}
            >
              <Check aria-hidden size={14} className={cn('flex-none text-primary-deep', chosen ? 'opacity-100' : 'opacity-0')} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.meta !== undefined && <span className="flex-none text-ink-meta tabular-nums">{option.meta}</span>}
            </CommandItem>
          )
        })}
        {note && <p className="px-3 py-2 text-caption text-ink-meta">{note}</p>}
      </CommandList>
    </Command>
  )
}

/** The error line is always reserved, so a validation message never changes the height of a form. */
export function Field({
  label,
  error,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string
  error?: string
  htmlFor?: string
  required?: boolean
  /** Shown in the error line while there is no error, so the field never changes height. */
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1 block text-caption leading-normal font-medium text-ink-body">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-alert">
            *
          </span>
        )}
      </Label>
      {children}
      <p role={error ? 'alert' : undefined} title={error ?? hint} className={`mt-0.5 min-h-[42px] text-caption md:min-h-[21px] md:truncate ${error ? 'text-alert' : 'text-ink-meta'}`}>
        {error ?? hint}
      </p>
    </div>
  )
}

/** The same idea for errors that belong to the whole form. */
export function FormError({ message }: { message?: string }) {
  return (
    <p role={message ? 'alert' : undefined} className="line-clamp-2 min-h-[42px] text-caption text-alert">
      {message}
    </p>
  )
}

export function SearchInput({
  value,
  onValueChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <div className={cn('relative w-full', className)}>
      <Search aria-hidden size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-meta" />
      <InputBase
        type="text"
        role="searchbox"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(FIELD_CLASS, 'pr-9 pl-9')}
      />
      {value && (
        <button
          type="button"
          aria-label={t('common.clear')}
          onClick={() => onValueChange('')}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-meta hover:text-ink md:size-7"
        >
          <X aria-hidden size={14} />
        </button>
      )}
    </div>
  )
}

/** One control of a FilterBand. The placeholder explains it on screen; the name is for screen readers. */
export function FilterField({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block w-full ${className}`}>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  )
}

/** Shown only while a filter is on, so the way back to the full list is obvious. */
export function ClearFilters({ active, onClear }: { active: boolean; onClear: () => void }) {
  if (!active) return null
  return (
    <Button variant="ghost" className="flex-none whitespace-nowrap" onClick={onClear}>
      {t('common.clearFilters')}
    </Button>
  )
}

export interface TabItem {
  value: string
  label: ReactNode
}

/**
 * shadcn/ui Tabs as the tab row of a screen; the content below follows the URL, not the tabs. `pills`
 * for list views, `line` for the sections of a record. Arrow keys move focus; Enter or Space opens.
 */
export function TabBar({
  label,
  value,
  items,
  onValueChange,
  variant = 'pills',
  className,
}: {
  label: string
  value: string
  items: TabItem[]
  onValueChange: (value: string) => void
  variant?: 'pills' | 'line'
  className?: string
}) {
  const line = variant === 'line'
  const list = useRef<HTMLDivElement>(null)
  // On a phone the bar scrolls sideways: keep the selected tab in view, also when opened from the URL
  useEffect(() => {
    list.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value, items.length])
  return (
    <Tabs value={value} onValueChange={onValueChange} activationMode="manual" className="min-w-0 flex-1 gap-0">
      <TabsList
        ref={list}
        aria-label={label}
        className={cn(
          'flex h-auto w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto',
          line ? 'mb-4 border-b border-band' : 'pb-2',
          className,
        )}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className={cn(
              'h-auto flex-none cursor-pointer text-caption font-normal whitespace-nowrap text-ink-nav after:hidden hover:text-ink data-[state=active]:font-medium data-[state=active]:text-primary-deep',
              line
                ? '-mb-px rounded-none border-0 border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent'
                : 'rounded-md px-3 py-1.5 hover:bg-chrome data-[state=active]:bg-band-blue',
            )}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** A column header that sorts the list. `direction` is null while another order is in use. */
export function SortButton({ label, direction, onToggle }: { label: string; direction: 'asc' | 'desc' | null; onToggle: () => void }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown
  return (
    <button type="button" title={t('common.sort')} onClick={onToggle} className="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-sm px-1 font-medium hover:text-primary">
      {label}
      <Icon aria-hidden size={14} className={direction ? '' : 'text-ink-meta'} />
    </button>
  )
}

/** Scroll area of a list: the header row and the pagination stay in place while rows move. */
export function TableScroll({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <div
      tabIndex={0}
      aria-busy={loading}
      className={`table-scroll min-h-0 overflow-x-auto transition-opacity duration-150 motion-reduce:transition-none md:flex-1 md:overflow-auto ${loading ? 'opacity-60 delay-150' : ''}`}
    >
      {children}
    </div>
  )
}

/**
 * C1: online (filled) or idle (ring) beside a person's name; nothing when offline. A status label,
 * so it may use the success tone; the tooltip and accessible name say it in words.
 */
export function PresenceDot({ status, label: text, className }: { status: 'online' | 'idle' | 'offline'; /** K5: e.g. "Trực tuyến từ 08:15". */ label?: string; className?: string }) {
  if (status === 'offline') return null
  const label = text ?? (status === 'online' ? t('presence.online') : t('presence.idle'))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className={cn('inline-block size-2 flex-none rounded-full', status === 'online' ? 'bg-success' : 'border-[1.5px] border-ink-meta', className)}
        />
      </TooltipTrigger>
      <TooltipContent className={TOOLTIP_CLASS}>{label}</TooltipContent>
    </Tooltip>
  )
}

/** A content section on the canvas. Nothing here is bordered or elevated. */
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`${CONTAINER} flex flex-col md:min-h-64 md:flex-1 ${className}`}>{children}</section>
}

/**
 * shadcn/ui Card as a bordered block inside a page: a group of facts, a settings block, a list entry.
 * `as` picks the element the document needs (section by default).
 */
export function Panel({ as: Tag = 'section', className, children, ...props }: { as?: ElementType; className?: string; children: ReactNode } & Omit<ComponentProps<'section'>, 'children' | 'className'>) {
  return (
    <CardBase asChild className={cn('block gap-0 rounded-lg border-band bg-transparent p-4 text-ink-body sm:p-5', className)}>
      <Tag {...props}>{children}</Tag>
    </CardBase>
  )
}

/** Full-width flat band that holds a page's filters. */
export function FilterBand({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className="flex-none bg-chrome">
      <div className={`${CONTAINER} py-2.5 ${className}`}>{children}</div>
    </div>
  )
}

const BADGE_TONES = {
  info: 'bg-band-blue text-primary-deep',
  muted: 'bg-chrome text-ink-meta',
  success: 'bg-success-band text-success',
  warning: 'bg-warning-band text-warning',
  danger: 'bg-alert-band text-alert',
  notable: 'bg-notable-band text-notable',
}
export type BadgeTone = keyof typeof BADGE_TONES

export function Badge({ tone = 'info', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <BadgeBase className={cn('rounded-sm border-0 px-2 py-0.5 text-caption font-normal', BADGE_TONES[tone])}>{children}</BadgeBase>
}

/** shadcn/ui Alert for an error in place of content (role="alert"). */
export function Alert({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <AlertBox className={cn('rounded-md border-0 bg-alert-band text-caption text-alert', className)}>
      <TriangleAlert aria-hidden />
      <div className="col-start-2">{children}</div>
    </AlertBox>
  )
}

/** The same box for neutral information that needs reading before acting. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <AlertBox role="status" className="rounded-md border-0 bg-band-blue text-caption text-primary-deep">
      <Info aria-hidden />
      <div className="col-start-2">{children}</div>
    </AlertBox>
  )
}

/** A person at the centre of their customers: the ring passes each one in turn. */
export const Spinner = ({ fullPage = false }: { fullPage?: boolean }) => (
  <div role="status" className={`crm-loader flex flex-col items-center justify-center gap-3 p-10 text-caption text-ink-meta ${fullPage ? 'min-h-dvh' : ''}`}>
    <svg aria-hidden viewBox="0 0 64 64" fill="none" className={fullPage ? 'size-20' : 'size-14'}>
      <circle cx="32" cy="32" r="27" strokeWidth="4" className="stroke-band" />
      <circle cx="32" cy="32" r="27" strokeWidth="4" strokeLinecap="round" strokeDasharray="42 128" className="crm-loader-ring stroke-primary" />
      <circle cx="32" cy="5" r="4.5" className="crm-loader-node fill-primary" />
      <circle cx="55.4" cy="45.5" r="4.5" className="crm-loader-node fill-primary" />
      <circle cx="8.6" cy="45.5" r="4.5" className="crm-loader-node fill-primary" />
      <circle cx="32" cy="25" r="6" className="fill-primary-deep" />
      <path d="M21 44a11 11 0 0 1 22 0Z" className="fill-primary-deep" />
    </svg>
    {t('common.loading')}
  </div>
)

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <p className="mt-4 rounded-lg bg-chrome p-10 text-center text-link text-ink-list">{children}</p>
)

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className={`${CONTAINER} flex flex-none flex-wrap items-center justify-between gap-4 pt-2 pb-3`}>
      <div>
        <h1 className="text-page-title text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-caption text-ink-meta">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

const PAGE_SIZES = [10, 25, 50]

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (pageSize: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav aria-label={t('common.pagination')} className="flex flex-none flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline py-2 text-caption text-ink-meta tabular-nums">
      <span>{t('common.showing', { from, to, total })}</span>
      <span className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          {t('common.pageSize')}
          <NativeSelect
            size="sm"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="h-auto min-h-11 border-input bg-canvas pr-8 pl-2 text-caption text-ink-body md:min-h-8"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </label>
        <span className="flex items-center gap-1">
          <IconButton label={t('common.prev')} className="md:size-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft aria-hidden size={16} />
          </IconButton>
          <span className="min-w-20 px-1 text-center whitespace-nowrap">{t('common.page', { page, pages })}</span>
          <IconButton label={t('common.next')} className="md:size-8" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight aria-hidden size={16} />
          </IconButton>
        </span>
      </span>
    </nav>
  )
}

/** Footer of a dialog; it stays visible when a tall form scrolls. */
/** Fields of a wide dialog: three across, so a long form stays short. */
export const WIDE_FORM_GRID = 'grid gap-x-4 sm:grid-cols-2 md:grid-cols-3'

export const MODAL_FOOTER = 'sticky bottom-0 -mx-6 mt-1 flex justify-end gap-2 border-t border-band bg-canvas px-6 py-3'

/**
 * shadcn/ui Dialog (Radix): focus trap, Esc to close and aria-modal (section 21.3). A click outside does
 * not close it, so typed input is never lost by a stray click.
 */
export function Dialog({ title, open, onClose, wide = false, children }: { title: string; open: boolean; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <DialogRoot open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onInteractOutside={(event) => event.preventDefault()}
        className={cn('flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 text-ink-body', wide ? 'max-w-4xl sm:max-w-4xl' : 'max-w-lg sm:max-w-lg')}
      >
        <DialogTitle className="flex-none border-b border-band py-4 pr-12 pl-6 text-subhead font-medium text-ink">{title}</DialogTitle>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4">{children}</div>
      </DialogContent>
    </DialogRoot>
  )
}

/** shadcn/ui AlertDialog: a question that must be answered; Esc or Cancel backs out. */
export function ConfirmDialog({
  message,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  message: string | null
  danger?: boolean
  pending?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  // Kept while the dialog fades out, so its text does not vanish first
  const [shown, setShown] = useState(message)
  if (message !== null && message !== shown) setShown(message)
  return (
    <AlertDialog open={message !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent className="w-[calc(100%-2rem)] gap-0 p-0 text-ink-body sm:max-w-lg">
        <AlertDialogHeader className="border-b border-band px-6 py-4">
          <AlertDialogTitle className="text-subhead font-medium text-ink">{t('common.confirm')}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="px-6 pt-4">
          <AlertDialogDescription className="mb-2 text-link text-ink-body">{shown}</AlertDialogDescription>
          <FormError message={error} />
        </div>
        <AlertDialogFooter className="border-t border-band px-6 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>
            {t('common.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function CopyLink({ url, hint, onClose }: { url: string; hint: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.info(t('toast.linkCopied'))
  }
  return (
    <>
      <p className="mb-4 text-link">{hint}</p>
      <Input readOnly value={url} aria-label={hint} onFocus={(event) => event.target.select()} />
      <div className={`${MODAL_FOOTER} mt-4`}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button onClick={copy}>
          {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
    </>
  )
}

/** shadcn/ui ToggleGroup: multi-select chips, each a toggle button with aria-pressed (section 21.3). */
export function ChipGroup({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string }[]
  value: string[]
  onChange: (value: string[]) => void
  label: string
}) {
  return (
    <ToggleGroup type="multiple" spacing={2} value={value} onValueChange={onChange} aria-label={label} className="flex-wrap">
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          variant="outline"
          className="h-auto min-h-11 cursor-pointer rounded-md border-hairline bg-canvas px-3 text-caption font-normal text-ink-list hover:bg-chrome hover:text-ink-list data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-on-primary md:min-h-8"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export interface RowMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/** Secondary row actions: shadcn/ui DropdownMenu, in a portal so a scrolling table cannot clip it. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label={label}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-primary hover:bg-band-blue data-[state=open]:bg-band-blue md:min-h-8 md:min-w-8"
          >
            <Ellipsis aria-hidden size={18} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent className={TOOLTIP_CLASS}>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-48 border-hairline bg-canvas text-ink-body">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            variant={item.danger ? 'destructive' : 'default'}
            onSelect={item.onSelect}
            className={cn('min-h-11 cursor-pointer rounded-md px-3 text-caption md:min-h-9', item.danger ? 'text-alert' : 'text-ink-list')}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
