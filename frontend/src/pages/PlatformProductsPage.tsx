import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, Badge, Button, Card, ClearFilters, ConfirmDialog, Dialog, EmptyState, Field, FilterBand, FilterField, FormError, Input, MODAL_FOOTER, PageHeader, Pagination, RowMenu, SearchInput, Select, Spinner, TableScroll, Textarea, WIDE_FORM_GRID } from '../components/ui'
import { t, tDynamic } from '../i18n'
import { api, ApiError, errorMessage } from '../lib/api'
import { batches, PRODUCT_CODE, readProductFile } from '../lib/productFile'
import type { ProductFilePreview } from '../lib/productFile'
import { filterProducts } from '../lib/products'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { PRODUCT_ROLES, RULE_STATUSES } from '../lib/types'
import type { Product, ProductRow } from '../lib/types'
import { useListSearch } from '../lib/useListSearch'
import { useLeaveEmptyPage, useUrlState } from '../lib/useUrlState'
import { optionalText, requiredText } from '../lib/validation'

type SaveResult = { inserted: number; updated: number }

const age = z.string().trim().regex(/^(\d{1,2}|1[01]\d|120)?$/, t('validation.age'))

// Section 19.9: the columns of 11_Products, with the API's limits
const schema = z.object({
  productCode: z.string().trim().regex(PRODUCT_CODE, t('validation.productCode')),
  productName: requiredText(200),
  productRole: z.string().min(1, t('validation.productRole')),
  category: optionalText(100),
  minEntryAge: age,
  maxEntryAge: age,
  maxCoverAge: age,
  gender: optionalText(30),
  waitingPeriod: optionalText(200),
  keyBenefits: optionalText(4000),
  fitRule: optionalText(4000),
  triggerEvent: optionalText(4000),
  ruleStatus: z.enum(RULE_STATUSES),
})
type FormValues = z.infer<typeof schema>

const blank = (value: string) => value.trim() || null
const years = (value: string) => (value.trim() === '' ? null : Number(value))
const numText = (value: number | null) => (value === null ? '' : String(value))

/** The row the API takes; a blank field is sent as null, so an edit can clear it. */
const toRow = (values: FormValues): ProductRow => ({
  productCode: values.productCode.trim(),
  productName: values.productName.trim(),
  productRole: values.productRole,
  category: blank(values.category),
  minEntryAge: years(values.minEntryAge),
  maxEntryAge: years(values.maxEntryAge),
  maxCoverAge: years(values.maxCoverAge),
  gender: blank(values.gender),
  waitingPeriod: blank(values.waitingPeriod),
  keyBenefits: blank(values.keyBenefits),
  fitRule: blank(values.fitRule),
  triggerEvent: blank(values.triggerEvent),
  ruleStatus: values.ruleStatus,
})

/** API issue paths are `rows.0.<field>`; the form has the same field names. */
const issueField = (path: string) => path.replace(/^rows\.\d+\./, '') as keyof FormValues

/** TENANT-5: "Thêm sản phẩm", or editing one (its code cannot change: it is the key). */
function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const queryClient = useQueryClient()
  const editing = !!product
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      productCode: product?.productCode ?? '',
      productName: product?.productName ?? '',
      productRole: product?.productRole ?? '',
      category: product?.category ?? '',
      minEntryAge: numText(product?.minEntryAge ?? null),
      maxEntryAge: numText(product?.maxEntryAge ?? null),
      maxCoverAge: numText(product?.maxCoverAge ?? null),
      gender: product?.gender ?? '',
      waitingPeriod: product?.waitingPeriod ?? '',
      keyBenefits: product?.keyBenefits ?? '',
      fitRule: product?.fitRule ?? '',
      triggerEvent: product?.triggerEvent ?? '',
      ruleStatus: product?.ruleStatus ?? 'DRAFT',
    },
  })
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: (values: FormValues) => api.post<SaveResult>('/platform/products', { rows: [toRow(values)] }),
    onSuccess: async ({ inserted }, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.products })
      toast.success(t(inserted ? 'toast.productAdded' : 'toast.productSaved', { name: values.productName.trim() }))
      onClose()
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return
      for (const issue of error.issues ?? []) {
        const field = issueField(issue.path)
        if (field in schema.shape) form.setError(field, { message: errorMessage(error) })
      }
    },
  })
  const onField = save.error instanceof ApiError && (save.error.issues ?? []).some((issue) => issueField(issue.path) in schema.shape)
  const text = (name: keyof FormValues, label: string, placeholder: string, required = false, hint?: string) => (
    <Field label={label} htmlFor={`product-${name}`} required={required} error={errors[name]?.message} hint={hint}>
      <Input id={`product-${name}`} placeholder={placeholder} aria-invalid={!!errors[name]} {...form.register(name)} />
    </Field>
  )
  const longText = (name: keyof FormValues, label: string, placeholder: string) => (
    <div className="sm:col-span-2 md:col-span-3">
      <Field label={label} htmlFor={`product-${name}`} error={errors[name]?.message}>
        <Textarea id={`product-${name}`} rows={3} placeholder={placeholder} aria-invalid={!!errors[name]} {...form.register(name)} />
      </Field>
    </div>
  )
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className={WIDE_FORM_GRID}>
        <Field label={t('products.code')} htmlFor="product-productCode" required error={errors.productCode?.message} hint={editing ? t('platformProducts.codeLocked') : t('platformProducts.codeHint')}>
          <Input id="product-productCode" readOnly={editing} maxLength={30} placeholder={t('placeholder.productCode')} aria-invalid={!!errors.productCode} {...form.register('productCode')} />
        </Field>
        <div className="sm:col-span-1 md:col-span-2">{text('productName', t('products.name'), t('placeholder.productName'), true)}</div>
        <Field label={t('products.role')} htmlFor="product-productRole" required error={errors.productRole?.message}>
          <Select id="product-productRole" aria-invalid={!!errors.productRole} {...form.register('productRole')}>
            <option value="">{t('placeholder.productRole')}</option>
            {PRODUCT_ROLES.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </Select>
        </Field>
        {text('category', t('products.category'), t('placeholder.category'))}
        {text('gender', t('products.gender'), t('placeholder.productGender'))}
        {text('minEntryAge', t('platformProducts.minEntryAge'), t('placeholder.age'))}
        {text('maxEntryAge', t('platformProducts.maxEntryAge'), t('placeholder.age'))}
        {text('maxCoverAge', t('products.coverAge'), t('placeholder.age'))}
        {text('waitingPeriod', t('products.waitingPeriod'), t('placeholder.waitingPeriod'))}
        <Field label={t('platformProducts.ruleStatus')} htmlFor="product-ruleStatus" hint={t('platformProducts.ruleHint')}>
          <Select id="product-ruleStatus" {...form.register('ruleStatus')}>
            {RULE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`platformProducts.ruleStatus.${status}`)}
              </option>
            ))}
          </Select>
        </Field>
        {longText('keyBenefits', t('products.keyBenefits'), t('placeholder.keyBenefits'))}
        {longText('fitRule', t('platformProducts.fitRule'), t('placeholder.fitRule'))}
        {longText('triggerEvent', t('platformProducts.triggerEvent'), t('placeholder.triggerEvent'))}
      </div>
      <FormError message={save.isError && !onField ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('platformProducts.save')}
        </Button>
      </div>
    </form>
  )
}

/** TENANT-5 + section 17: the 11_Products file, read here and sent 500 valid rows at a time. */
function ProductFileForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const picker = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ProductFilePreview | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [sent, setSent] = useState(0)
  const rows = preview?.rows ?? []

  const upload = useMutation({
    mutationFn: async () => {
      const total = { inserted: 0, updated: 0 }
      setSent(0)
      for (const group of batches(rows)) {
        const saved = await api.post<SaveResult>('/platform/products', { rows: group, fromFile: true })
        total.inserted += saved.inserted
        total.updated += saved.updated
        setSent((done) => done + group.length)
      }
      return total
    },
    onSuccess: ({ inserted, updated }) => {
      const skipped = preview?.problems.length ?? 0
      const message = t('toast.productsImported', { file: file?.name ?? '', inserted, updated })
      if (skipped > 0) toast.warning(message, t('toast.productsSkipped', { count: skipped }))
      else toast.success(message)
      onClose()
    },
    // Batches already saved stay saved, so the list must show them either way
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.products }),
  })

  const choose = async (picked: File) => {
    upload.reset()
    setFile(picked)
    setPreview(null)
    setReadError(null)
    try {
      const read = await readProductFile(picked)
      if (!read) setReadError(t('platformProducts.noSheet'))
      else if (read.missingHeaders.length > 0) setReadError(t('platformProducts.missingHeaders', { sheet: read.sheet, headers: read.missingHeaders.join(', ') }))
      else setPreview(read)
    } catch {
      setReadError(t('platformProducts.readFailed'))
    }
  }

  const failure = upload.isError ? (sent > 0 ? t('platformProducts.partialFailed', { done: sent, total: rows.length, error: errorMessage(upload.error) }) : errorMessage(upload.error)) : undefined
  return (
    <>
      <p className="mb-3 text-caption text-ink-meta">{t('platformProducts.uploadHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={upload.isPending} onClick={() => picker.current?.click()}>
          <FileUp aria-hidden size={16} />
          {t('platformProducts.chooseFile')}
        </Button>
        <input
          ref={picker}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(event) => {
            const picked = event.target.files?.[0]
            event.target.value = ''
            if (picked) void choose(picked)
          }}
        />
        <span className="min-w-0 flex-1 truncate text-caption text-ink-body" title={file?.name}>
          {file ? file.name : t('platformProducts.noFile')}
        </span>
      </div>
      {/* Reserved line, so the dialog keeps its height while a file is read */}
      <p aria-live="polite" className="mt-3 min-h-[42px] text-caption text-ink-body">
        {preview && t('platformProducts.summary', { sheet: preview.sheet, found: preview.found, valid: preview.rows.length, invalid: preview.problems.length })}
        {upload.isPending && <span className="block text-ink-meta">{t('platformProducts.progress', { done: sent, total: rows.length })}</span>}
      </p>
      <h3 className="mb-1 text-caption font-medium text-ink">{t('platformProducts.problemsTitle')}</h3>
      <div className="h-48 overflow-auto rounded-md border border-band">
        {preview && preview.problems.length > 0 ? (
          <table className="data-table min-w-[480px] table-fixed">
            <colgroup>
              <col className="w-[72px]" />
              <col className="w-[150px]" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>{t('platformProducts.row')}</th>
                <th>{t('products.code')}</th>
                <th>{t('platformProducts.reasons')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.problems.map((problem) => (
                <tr key={problem.r}>
                  <td className="tabular-nums">{problem.r}</td>
                  <td className="truncate" title={problem.code ?? undefined}>
                    {problem.code ?? '-'}
                  </td>
                  <td>{problem.reasons.map((reason) => tDynamic(`products.problem.${reason}`, reason)).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-3 text-caption text-ink-meta">-</p>
        )}
      </div>
      <FormError message={readError ?? failure} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" disabled={upload.isPending} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button disabled={rows.length === 0 || upload.isPending} onClick={() => upload.mutate()}>
          {t('platformProducts.submit', { count: rows.length })}
        </Button>
      </div>
    </>
  )
}

const STATUSES = ['shown', 'hidden'] as const

/** TENANT-5: Nền tảng > Sản phẩm bảo hiểm. The Platform Admin keeps the catalogue every GA shares. */
export function PlatformProductsPage() {
  const queryClient = useQueryClient()
  const url = useUrlState()
  const search = useListSearch(url)
  const status = url.oneOf('status', STATUSES)
  const creating = url.get('create') === '1'
  const uploading = url.get('upload') === '1'
  const editCode = url.get('edit')
  // A confirmation for hiding stays out of the URL
  const [hiding, setHiding] = useState<Product | null>(null)

  const products = useQuery(queries.platformProducts())
  const all = products.data?.items ?? []
  const found = filterProducts(all, search.input).filter((product) => !status || product.active === (status === 'shown'))
  const rows = found.slice((url.page - 1) * url.pageSize, url.page * url.pageSize)
  useLeaveEmptyPage(url, products.data ? rows.length : undefined)

  const editing = all.find((product) => product.productCode === editCode)
  // A code that is no longer in the catalogue closes the dialog instead of leaving it stuck
  const staleEdit = !!editCode && !!products.data && !editing
  useEffect(() => {
    if (staleEdit) url.set({ edit: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleEdit])

  const toggle = useMutation({
    mutationFn: (product: Product) => api.patch(`/platform/products/${encodeURIComponent(product.productCode)}`, { active: !product.active }),
    onSuccess: async (_, product) => {
      await queryClient.invalidateQueries({ queryKey: keys.products })
      if (product.active) toast.info(t('toast.productHidden', { name: product.productName }), t('toast.productHiddenDetail'))
      else toast.success(t('toast.productShown', { name: product.productName }))
      setHiding(null)
    },
    onError: (error, product) => {
      // Hiding reports in its confirmation; showing again has nowhere else to say it
      if (!product.active) toast.error(t('toast.productToggleFailed'), errorMessage(error))
    },
  })

  const filtered = !!(search.input || status)
  return (
    <>
      <PageHeader
        title={t('platformProducts.title')}
        subtitle={t('platformProducts.subtitle')}
        action={
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => url.set({ upload: 1 }, { push: true })}>
              <FileUp aria-hidden size={16} />
              {t('platformProducts.upload')}
            </Button>
            <Button onClick={() => url.set({ create: 1 }, { push: true })}>
              <Plus aria-hidden size={16} />
              {t('platformProducts.add')}
            </Button>
          </span>
        }
      />
      <FilterBand className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterField label={t('common.search')} className="sm:w-80 sm:flex-none">
          <SearchInput label={t('common.search')} placeholder={t('products.searchPlaceholder')} value={search.input} onValueChange={search.onChange} />
        </FilterField>
        <FilterField label={t('platformProducts.status')} className="sm:w-48 sm:flex-none">
          <Select value={status} onChange={(event) => url.set({ status: event.target.value, page: null })}>
            <option value="">{t('platformProducts.allStatuses')}</option>
            <option value="shown">{t('platformProducts.shown')}</option>
            <option value="hidden">{t('platformProducts.hiddenStatus')}</option>
          </Select>
        </FilterField>
        <ClearFilters
          active={filtered}
          onClear={() => {
            search.onChange('')
            url.set({ status: null, page: null })
          }}
        />
      </FilterBand>
      <Card>
        {products.isPending && <Spinner />}
        {products.isError && <Alert className="m-4">{errorMessage(products.error)}</Alert>}
        {products.data && found.length === 0 && <EmptyState>{all.length === 0 ? t('platformProducts.empty') : t('platformProducts.noMatch')}</EmptyState>}
        {products.data && found.length > 0 && (
          <>
            <TableScroll>
              <table className="data-table min-w-[920px] table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[210px]" />
                  <col className="w-[96px]" />
                  <col className="w-[150px]" />
                  <col className="w-[110px]" />
                  <col className="w-[112px]" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('products.name')}</th>
                    <th>{t('products.code')}</th>
                    <th>{t('products.role')}</th>
                    <th>{t('products.category')}</th>
                    <th>{t('platformProducts.status')}</th>
                    <th className="col-actions">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.productCode}>
                      <td className="truncate font-medium text-ink" title={product.productName}>
                        {product.productName}
                      </td>
                      <td className="truncate tabular-nums" title={product.productCode}>
                        {product.productCode}
                      </td>
                      <td>{product.productRole}</td>
                      <td className="truncate" title={product.category ?? undefined}>
                        {product.category ?? '-'}
                      </td>
                      <td>{product.active ? <Badge tone="success">{t('platformProducts.shown')}</Badge> : <Badge tone="muted">{t('platformProducts.hiddenStatus')}</Badge>}</td>
                      <td className="col-actions">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Button variant="ghost" onClick={() => url.set({ edit: product.productCode }, { push: true })}>
                            {t('platformProducts.edit')}
                          </Button>
                          <RowMenu
                            label={t('common.more')}
                            items={[
                              product.active
                                ? { label: t('platformProducts.hide'), danger: true, onSelect: () => setHiding(product) }
                                : { label: t('platformProducts.show'), disabled: toggle.isPending, onSelect: () => toggle.mutate(product) },
                            ]}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={url.page} pageSize={url.pageSize} total={found.length} onPage={url.setPage} onPageSize={url.setPageSize} />
          </>
        )}
      </Card>

      <Dialog wide title={t('platformProducts.add')} open={creating} onClose={() => url.set({ create: null })}>
        {creating && <ProductForm onClose={() => url.set({ create: null })} />}
      </Dialog>
      <Dialog wide title={editing ? t('platformProducts.editTitle', { code: editing.productCode }) : ''} open={!!editing} onClose={() => url.set({ edit: null })}>
        {editing && <ProductForm key={editing.productCode} product={editing} onClose={() => url.set({ edit: null })} />}
      </Dialog>
      <Dialog wide title={t('platformProducts.upload')} open={uploading} onClose={() => url.set({ upload: null })}>
        {uploading && <ProductFileForm onClose={() => url.set({ upload: null })} />}
      </Dialog>
      <ConfirmDialog
        message={hiding ? t('platformProducts.confirmHide', { name: hiding.productName }) : null}
        danger
        pending={toggle.isPending}
        error={toggle.isError && hiding ? errorMessage(toggle.error) : undefined}
        onConfirm={() => hiding && toggle.mutate(hiding)}
        onClose={() => {
          setHiding(null)
          toggle.reset()
        }}
      />
    </>
  )
}
