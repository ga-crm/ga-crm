import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form'
import { z } from 'zod'
import { hasRole } from '../auth/access'
import { useMe } from '../auth/useMe'
import { t } from '../i18n'
import { api, ApiError, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { AGE_BANDS, CLIENT_TIERS, GENDERS, MARITAL_STATUSES, PREMIUM_FREQUENCIES, PRODUCT_ROLES } from '../lib/types'
import type { ClientDetail, ClientPolicy, PolicyRole } from '../lib/types'
import { optionalBirthDate, optionalDate, optionalText, requiredText } from '../lib/validation'
import { ProductPicker } from './ProductPicker'
import { Button, Field, FormError, IconButton, Input, MODAL_FOOTER, Select, WIDE_FORM_GRID } from './ui'
import { pickerLabel, pickerRows } from '../lib/agentTree'

const money = z.string().trim().regex(/^\d*$/, t('validation.money'))
// POL-2: exactly 9 digits, kept as a string so leading zeros stay
const policyNo = z.string().trim().regex(/^\d{9}$/, t('errors.invalid_policy_no'))
const POLICY_ROLES = ['PO', 'LI', 'BEN'] as const satisfies readonly PolicyRole[]
const yesNoUnknown = z.enum(['', 'yes', 'no'])

const productSchema = z.object({
  insuredName: optionalText(200),
  insuredDob: optionalBirthDate,
  insuredGender: z.string(),
  // TENANT-5: a product of the shared catalogue, by its code
  productCode: z.string().min(1, t('validation.required')),
  sumAssuredVnd: money,
  termYears: z.string().trim().regex(/^(\d{1,2}|1[01]\d|120)?$/, t('validation.termYears')),
  status: optionalText(100),
  annualPremiumVnd: money,
  productRole: z.string(),
  startDate: optionalDate,
})

// POL-2 [25/11/2026]: every field but the number may come later, or from Success
const policySchema = z.object({
  policyNo: z.string().trim(),
  status: optionalText(100),
  effectiveDate: optionalDate,
  maturityDate: optionalDate,
  premiumFrequency: z.string(),
  basePremiumVnd: money,
  premiumDueDate: optionalDate,
  plannedPremiumVnd: money,
  unpaidPremiumVnd: money,
  aplDebtVnd: money,
  hasBeneficiary: yesNoUnknown,
  contactAddress: optionalText(300),
  sumAssuredVnd: money,
  graceEndDate: optionalDate,
  advancePremiumVnd: money,
  totalPaidPremiumVnd: money,
  basicPremiumVnd: money,
  topUpPremiumVnd: money,
  insuredName: optionalText(200),
  products: z.array(productSchema).max(20),
})
type PolicyValues = z.infer<typeof policySchema>

const clientSchema = z.object({
  name: requiredText(200),
  phone: optionalText(30),
  tier: z.string(),
  dob: optionalBirthDate,
  ageBand: z.string(),
  gender: z.string(),
  maritalStatus: z.string(),
  loyaltyPoints: money,
  usesDconnect: yesNoUnknown,
  ekycRegistered: yesNoUnknown,
  idUpdated: yesNoUnknown,
})
type ClientValues = z.infer<typeof clientSchema>

// MAN-1 [25/11/2026]: a client is added on a policy, by its number and the role they hold there
const createSchema = clientSchema.extend({
  policyNo,
  role: z.string().min(1, t('validation.required')),
  agentCode: z.string(),
})
type CreateValues = z.infer<typeof createSchema>

const emptyProduct = (): PolicyValues['products'][number] => ({
  insuredName: '',
  insuredDob: '',
  insuredGender: '',
  productCode: '',
  sumAssuredVnd: '',
  termYears: '',
  status: '',
  annualPremiumVnd: '',
  productRole: '',
  startDate: '',
})
const emptyPolicy = (): PolicyValues => ({
  policyNo: '',
  status: '',
  effectiveDate: '',
  maturityDate: '',
  premiumFrequency: '',
  basePremiumVnd: '',
  premiumDueDate: '',
  plannedPremiumVnd: '',
  unpaidPremiumVnd: '',
  aplDebtVnd: '',
  hasBeneficiary: '',
  contactAddress: '',
  sumAssuredVnd: '',
  graceEndDate: '',
  advancePremiumVnd: '',
  totalPaidPremiumVnd: '',
  basicPremiumVnd: '',
  topUpPremiumVnd: '',
  insuredName: '',
  products: [],
})
const emptyClient = (): ClientValues => ({
  name: '',
  phone: '',
  tier: '',
  dob: '',
  ageBand: '',
  gender: '',
  maritalStatus: '',
  loyaltyPoints: '',
  usesDconnect: '',
  ekycRegistered: '',
  idUpdated: '',
})

const num = (value: string) => (value === '' ? undefined : Number(value))
const bool = (value: string) => (value === '' ? undefined : value === 'yes')
const text = (value: string) => value.trim() || undefined
const choice = (value: boolean | null) => (value === null ? '' : value ? 'yes' : 'no')

/** POL-2 + PRD-1: the body the API takes for a policy; a blank field is left out. */
function policyBody(values: PolicyValues) {
  return {
    status: text(values.status),
    effectiveDate: text(values.effectiveDate),
    maturityDate: text(values.maturityDate),
    premiumFrequency: text(values.premiumFrequency),
    basePremiumVnd: num(values.basePremiumVnd),
    premiumDueDate: text(values.premiumDueDate),
    plannedPremiumVnd: num(values.plannedPremiumVnd),
    unpaidPremiumVnd: num(values.unpaidPremiumVnd),
    aplDebtVnd: num(values.aplDebtVnd),
    hasBeneficiary: bool(values.hasBeneficiary),
    // A blank address keeps the stored one, which the form never receives
    contactAddress: text(values.contactAddress),
    sumAssuredVnd: num(values.sumAssuredVnd),
    graceEndDate: text(values.graceEndDate),
    advancePremiumVnd: num(values.advancePremiumVnd),
    totalPaidPremiumVnd: num(values.totalPaidPremiumVnd),
    basicPremiumVnd: num(values.basicPremiumVnd),
    topUpPremiumVnd: num(values.topUpPremiumVnd),
    insuredName: text(values.insuredName),
    products: values.products.map((line) => ({
      insuredName: text(line.insuredName),
      insuredDob: text(line.insuredDob),
      insuredGender: text(line.insuredGender),
      productCode: line.productCode,
      sumAssuredVnd: num(line.sumAssuredVnd),
      termYears: num(line.termYears),
      status: text(line.status),
      annualPremiumVnd: num(line.annualPremiumVnd),
      productRole: text(line.productRole),
      startDate: text(line.startDate),
    })),
  }
}

function YesNoSelect({ id, label, register }: { id: string; label: string; register: ReturnType<UseFormRegister<Record<string, string>>> }) {
  return (
    <Select id={id} aria-label={label} {...register}>
      <option value="">{t('clients.unknown')}</option>
      <option value="yes">{t('common.yes')}</option>
      <option value="no">{t('common.no')}</option>
    </Select>
  )
}

/** MAN-2: the client fields, in the order of section 16.6. */
function ClientFields({ register, errors, prefix = 'client' }: { register: UseFormRegister<ClientValues>; errors: FieldErrors<ClientValues>; prefix?: string }) {
  const reg = register as unknown as UseFormRegister<Record<string, string>>
  return (
    <div className={WIDE_FORM_GRID}>
      <Field label={t('clients.name')} htmlFor={`${prefix}-name`} required error={errors.name?.message}>
        <Input id={`${prefix}-name`} placeholder={t('placeholder.name')} aria-invalid={!!errors.name} {...register('name')} />
      </Field>
      <Field label={t('clients.phone')} htmlFor={`${prefix}-phone`} error={errors.phone?.message} hint={t('clients.phoneKept')}>
        <Input id={`${prefix}-phone`} placeholder={t('agents.phonePlaceholder')} inputMode="tel" aria-invalid={!!errors.phone} {...register('phone')} />
      </Field>
      <Field label={t('clients.tier')} htmlFor={`${prefix}-tier`}>
        <Select id={`${prefix}-tier`} {...register('tier')}>
          <option value="">{t('clients.none')}</option>
          {CLIENT_TIERS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('clients.dob')} htmlFor={`${prefix}-dob`} error={errors.dob?.message}>
        <Input id={`${prefix}-dob`} type="date" aria-invalid={!!errors.dob} {...register('dob')} />
      </Field>
      <Field label={t('clients.ageBand')} htmlFor={`${prefix}-age`} hint={t('clients.ageBandHint')}>
        <Select id={`${prefix}-age`} {...register('ageBand')}>
          <option value="">{t('clients.ageBandAuto')}</option>
          {AGE_BANDS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('clients.gender')} htmlFor={`${prefix}-gender`}>
        <Select id={`${prefix}-gender`} {...register('gender')}>
          <option value="">{t('clients.none')}</option>
          {GENDERS.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('clients.marital')} htmlFor={`${prefix}-marital`}>
        <Select id={`${prefix}-marital`} {...register('maritalStatus')}>
          <option value="">{t('clients.none')}</option>
          {MARITAL_STATUSES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </Select>
      </Field>
      {SHOW_SUCCESS_FLAGS && (
        <Field label={t('clients.loyalty')} htmlFor={`${prefix}-loyalty`} error={errors.loyaltyPoints?.message}>
          <Input id={`${prefix}-loyalty`} inputMode="numeric" placeholder="0" aria-invalid={!!errors.loyaltyPoints} {...register('loyaltyPoints')} />
        </Field>
      )}
      {SHOW_SUCCESS_FLAGS && (
        <Field label={t('clients.dconnect')} htmlFor={`${prefix}-dconnect`}>
          <YesNoSelect id={`${prefix}-dconnect`} label={t('clients.dconnect')} register={reg('usesDconnect')} />
        </Field>
      )}
      <Field label={t('clients.ekyc')} htmlFor={`${prefix}-ekyc`}>
        <YesNoSelect id={`${prefix}-ekyc`} label={t('clients.ekyc')} register={reg('ekycRegistered')} />
      </Field>
      {/* PDP-1: only whether it was updated */}
      {SHOW_SUCCESS_FLAGS && (
        <Field label={t('clients.idUpdated')} htmlFor={`${prefix}-id`} hint={t('clients.idUpdatedHint')}>
          <YesNoSelect id={`${prefix}-id`} label={t('clients.idUpdated')} register={reg('idUpdated')} />
        </Field>
      )}
    </div>
  )
}

/**
 * POL-2 + PRD-1: one policy and its product lines. `name` is where the policy sits in the form (`` at
 * the root). `kept` names the products the policy already carries, so a line keeps one the catalogue
 * now hides or lacks (TENANT-5).
 */
function PolicyFields({ control, register, errors, name, showNumber, editableLines = true, kept, addressKept = false }: { control: Control<never>; register: UseFormRegister<never>; errors?: FieldErrors<PolicyValues>; name: string; showNumber: boolean; editableLines?: boolean; kept?: ReadonlyMap<string, string>; addressKept?: boolean }) {
  const path = (field: string) => (name ? `${name}.${field}` : field) as never
  const reg = (field: string) => (register as unknown as UseFormRegister<Record<string, string>>)(path(field) as string)
  const lines = useFieldArray({ control, name: path('products') as never })
  const id = (field: string) => `${name || 'policy'}-${field}`.replace(/\./g, '-')
  const err = (field: keyof PolicyValues) => (errors?.[field] as { message?: string } | undefined)?.message
  return (
    <>
      <div className={WIDE_FORM_GRID}>
        {showNumber && (
          <Field label={t('clients.policyNoLabel')} htmlFor={id('no')} required error={err('policyNo')}>
            <Input id={id('no')} inputMode="numeric" placeholder={t('placeholder.policyNo')} aria-invalid={!!err('policyNo')} {...reg('policyNo')} />
          </Field>
        )}
        <Field label={t('clients.policyStatus')} htmlFor={id('status')} error={err('status')}>
          <Input id={id('status')} placeholder={t('placeholder.policyStatus')} {...reg('status')} />
        </Field>
        <Field label={t('clients.frequency')} htmlFor={id('frequency')}>
          <Select id={id('frequency')} {...reg('premiumFrequency')}>
            <option value="">{t('clients.none')}</option>
            {PREMIUM_FREQUENCIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('clients.effective')} htmlFor={id('effective')} error={err('effectiveDate')}>
          <Input id={id('effective')} type="date" {...reg('effectiveDate')} />
        </Field>
        <Field label={t('clients.maturity')} htmlFor={id('maturity')} error={err('maturityDate')}>
          <Input id={id('maturity')} type="date" {...reg('maturityDate')} />
        </Field>
        <Field label={t('clients.dueDate')} htmlFor={id('due')} error={err('premiumDueDate')}>
          <Input id={id('due')} type="date" {...reg('premiumDueDate')} />
        </Field>
        <Field label={t('clients.premium')} htmlFor={id('premium')} error={err('basePremiumVnd')}>
          <Input id={id('premium')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('basePremiumVnd')} />
        </Field>
        <Field label={t('clients.plannedPremium')} htmlFor={id('planned')} error={err('plannedPremiumVnd')}>
          <Input id={id('planned')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('plannedPremiumVnd')} />
        </Field>
        <Field label={t('clients.unpaid')} htmlFor={id('unpaid')} error={err('unpaidPremiumVnd')}>
          <Input id={id('unpaid')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('unpaidPremiumVnd')} />
        </Field>
        <Field label={t('clients.apl')} htmlFor={id('apl')} error={err('aplDebtVnd')}>
          <Input id={id('apl')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('aplDebtVnd')} />
        </Field>
        <Field label={t('clients.beneficiary')} htmlFor={id('beneficiary')}>
          <YesNoSelect id={id('beneficiary')} label={t('clients.beneficiary')} register={reg('hasBeneficiary')} />
        </Field>
        <Field label={t('clients.graceEnd')} htmlFor={id('grace')} error={err('graceEndDate')}>
          <Input id={id('grace')} type="date" {...reg('graceEndDate')} />
        </Field>
        <Field label={t('clients.sumAssuredPolicy')} htmlFor={id('sum')} hint={t('clients.sumAssuredHint')} error={err('sumAssuredVnd')}>
          <Input id={id('sum')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('sumAssuredVnd')} />
        </Field>
        <Field label={t('clients.advancePremium')} htmlFor={id('advance')} error={err('advancePremiumVnd')}>
          <Input id={id('advance')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('advancePremiumVnd')} />
        </Field>
        <Field label={t('clients.totalPaid')} htmlFor={id('paid')} error={err('totalPaidPremiumVnd')}>
          <Input id={id('paid')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('totalPaidPremiumVnd')} />
        </Field>
        <Field label={t('clients.basicPremium')} htmlFor={id('basic')} error={err('basicPremiumVnd')}>
          <Input id={id('basic')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('basicPremiumVnd')} />
        </Field>
        <Field label={t('clients.topUp')} htmlFor={id('topup')} error={err('topUpPremiumVnd')}>
          <Input id={id('topup')} inputMode="numeric" placeholder={t('placeholder.money')} {...reg('topUpPremiumVnd')} />
        </Field>
        <Field label={t('clients.contactAddress')} htmlFor={id('address')} error={err('contactAddress')}>
          <Input id={id('address')} autoComplete="off" placeholder={t(addressKept ? 'placeholder.addressKept' : 'placeholder.contactAddress')} {...reg('contactAddress')} />
        </Field>
        <Field label={t('clients.insuredName')} htmlFor={id('insured')} hint={t('clients.insuredHint')} error={err('insuredName')}>
          <Input id={id('insured')} placeholder={t('placeholder.insuredSame')} {...reg('insuredName')} />
        </Field>
      </div>
      <h4 className="mt-2 mb-1 text-caption font-medium text-ink">{t('clients.products')}</h4>
      <p className="mb-2 text-caption text-ink-meta">{editableLines ? t('clients.productsHint') : t('clients.productsFromSuccess')}</p>
      {editableLines && (
        <>
          {lines.fields.map((field, index) => {
            const line = (key: string) => `products.${index}.${key}`
            const lineErrors = errors?.products?.[index]
            return (
              <div key={field.id} className="mb-2 grid items-start gap-x-2 rounded-md bg-chrome p-3 sm:grid-cols-2 lg:grid-cols-5">
                {/* PRD-2 + TENANT-5: chosen from the shared product catalogue, never typed */}
                <div className="sm:col-span-2 lg:col-span-5">
                  <Field label={t('clients.product')} htmlFor={id(line('product'))} required error={lineErrors?.productCode?.message}>
                    <Controller
                      control={control}
                      name={path(line('productCode'))}
                      render={({ field: product, fieldState }) => (
                        <ProductPicker
                          ref={product.ref}
                          id={id(line('product'))}
                          label={t('clients.product')}
                          value={(product.value as string | undefined) ?? ''}
                          onChange={product.onChange}
                          onBlur={product.onBlur}
                          invalid={fieldState.invalid}
                          kept={kept?.has(product.value) ? { code: product.value, name: kept.get(product.value) ?? product.value } : null}
                        />
                      )}
                    />
                  </Field>
                </div>
                <Field label={t('clients.productInsured')} htmlFor={id(`${line('name')}`)}>
                  <Input id={id(`${line('name')}`)} placeholder={t('placeholder.insuredSame')} {...reg(line('insuredName'))} />
                </Field>
                <Field label={t('clients.dob')} htmlFor={id(line('dob'))} error={lineErrors?.insuredDob?.message}>
                  <Input id={id(line('dob'))} type="date" {...reg(line('insuredDob'))} />
                </Field>
                <Field label={t('clients.gender')} htmlFor={id(line('gender'))}>
                  <Select id={id(line('gender'))} {...reg(line('insuredGender'))}>
                    <option value="">{t('clients.none')}</option>
                    {GENDERS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('clients.sumAssured')} htmlFor={id(line('sum'))} error={lineErrors?.sumAssuredVnd?.message}>
                  <Input id={id(line('sum'))} inputMode="numeric" placeholder={t('placeholder.money')} {...reg(line('sumAssuredVnd'))} />
                </Field>
                <Field label={t('clients.termYears')} htmlFor={id(line('term'))} error={lineErrors?.termYears?.message}>
                  <Input id={id(line('term'))} inputMode="numeric" placeholder={t('placeholder.termYears')} {...reg(line('termYears'))} />
                </Field>
                <Field label={t('clients.productStatus')} htmlFor={id(line('status'))}>
                  <Input id={id(line('status'))} placeholder={t('placeholder.policyStatus')} {...reg(line('status'))} />
                </Field>
                <Field label={t('clients.annualPremium')} htmlFor={id(line('premium'))} error={lineErrors?.annualPremiumVnd?.message}>
                  <Input id={id(line('premium'))} inputMode="numeric" placeholder={t('placeholder.money')} {...reg(line('annualPremiumVnd'))} />
                </Field>
                <Field label={t('clients.productRole')} htmlFor={id(line('role'))}>
                  <Select id={id(line('role'))} {...reg(line('productRole'))}>
                    <option value="">{t('clients.roleFromCatalogue')}</option>
                    {PRODUCT_ROLES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('clients.startDate')} htmlFor={id(line('start'))}>
                  <div className="flex gap-2">
                    <Input id={id(line('start'))} type="date" {...reg(line('startDate'))} />
                    <IconButton label={t('clients.removeLine')} onClick={() => lines.remove(index)}>
                      <Trash2 size={16} aria-hidden />
                    </IconButton>
                  </div>
                </Field>
              </div>
            )
          })}
          <Button variant="secondary" disabled={lines.fields.length >= 20} onClick={() => lines.append(emptyProduct() as never)}>
            <Plus size={16} aria-hidden />
            {t('clients.addLine')}
          </Button>
        </>
      )}
    </>
  )
}

/** Places API errors that name a field (issues paths, or known codes) on that field. */
function placeError(error: unknown, setError: (name: never, value: { message: string }) => void, codes: Record<string, string>, prefix = ''): boolean {
  if (!(error instanceof ApiError)) return false
  const message = errorMessage(error)
  if (error.issues?.length) {
    for (const issue of error.issues) setError(`${prefix}${issue.path}` as never, { message })
    return true
  }
  const field = codes[error.code]
  if (field) setError(field as never, { message })
  return !!field
}

// MAN-1: API errors shown on the field they are about
const CLIENT_ERRORS = {
  invalid_policy_no: 'policyNo',
  policy_not_yours: 'policyNo',
  policy_exists: 'policyNo',
  holder_exists: 'role',
  person_on_policy: 'name',
  invalid_phone: 'phone',
  agent_required: 'agentCode',
  agent_not_found: 'agentCode',
}

/** MAN-1 to MAN-5 + section 16.6: "Thêm khách hàng", on a policy given by its number; the policy's details come later. */
export function CreateClientForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  // MAN-3: managers and GAD pick the agent from the tree (AGT-9); a FC's client is theirs
  // Changed 27/11/2026: only the GA director gives a new client to another agent
  const picksAgent = hasRole(me, 'GAD')
  const tree = useQuery({ ...queries.agentTree(), enabled: picksAgent })
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    mode: 'onTouched',
    defaultValues: { ...emptyClient(), policyNo: '', role: '', agentCode: me?.user.agentCode ?? '' },
  })
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: (values: CreateValues) =>
      api.post<{ id: string }>('/clients', {
        policyNo: values.policyNo,
        role: values.role as PolicyRole,
        ...clientBody(values, false),
        agentCode: text(values.agentCode),
      }),
    onSuccess: async ({ id }, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients })
      toast.success(t('toast.clientCreated', { name: values.name }))
      onCreated(id)
    },
    onError: (error) => placeError(error, form.setError as never, CLIENT_ERRORS),
  })
  const formError = save.isError && !(save.error instanceof ApiError && (save.error.issues?.length || CLIENT_ERRORS[save.error.code as keyof typeof CLIENT_ERRORS])) ? errorMessage(save.error) : undefined

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <p className="mb-3 text-caption text-ink-meta">{t('clients.policyNoHint')}</p>
      <div className={WIDE_FORM_GRID}>
        <Field label={t('clients.policyNoLabel')} htmlFor="client-policy-no" required error={errors.policyNo?.message}>
          <Input id="client-policy-no" inputMode="numeric" maxLength={9} placeholder={t('placeholder.policyNo')} aria-invalid={!!errors.policyNo} {...form.register('policyNo')} />
        </Field>
        <Field label={t('clients.policyRole')} htmlFor="client-role" required error={errors.role?.message}>
          <Select id="client-role" aria-invalid={!!errors.role} {...form.register('role')}>
            <option value="">{t('clients.chooseRole')}</option>
            {POLICY_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`clients.roleName${role}`)}
              </option>
            ))}
          </Select>
        </Field>
        {picksAgent && (
          <Field label={t('clients.belongsTo')} htmlFor="client-agent" required={!me?.user.agentCode} error={errors.agentCode?.message}>
            <Select id="client-agent" aria-invalid={!!errors.agentCode} {...form.register('agentCode')}>
              <option value="">{me?.user.agentCode ? t('clients.belongsToMe') : t('clients.chooseAgent')}</option>
              {pickerRows(tree.data?.items ?? []).map((row) => (
                <option key={row.agent.agentCode} value={row.agent.agentCode}>
                  {pickerLabel(row)}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <ClientFields register={form.register as never} errors={errors as never} />
      <FormError message={formError} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('clients.saveClient')}
        </Button>
      </div>
    </form>
  )
}

/**
 * Hidden for now at the project owner's request (26/11/2026): loyalty points, D-Connect and "ID card
 * updated" are not typed by hand. Success imports still fill them and the client page still shows
 * them. Set to true to bring the fields back.
 */
const SHOW_SUCCESS_FLAGS: boolean = false

/** The client fields as the API takes them. On edit an emptied field is sent as null (MAN-6). */
function clientBody(values: ClientValues, editing: boolean) {
  const clear = (value: unknown) => (value === undefined && editing ? null : value)
  return {
    name: values.name.trim(),
    phone: clear(text(values.phone)),
    tier: clear(text(values.tier)),
    dob: clear(text(values.dob)),
    // MAN-2: blank lets the server work it out from the birth date
    ageBand: editing ? (text(values.ageBand) ?? (values.dob ? undefined : null)) : text(values.ageBand),
    gender: clear(text(values.gender)),
    maritalStatus: clear(text(values.maritalStatus)),
    ekycRegistered: clear(bool(values.ekycRegistered)),
    // Hidden fields are left out, so an edit keeps what Success sent
    ...(SHOW_SUCCESS_FLAGS && {
      loyaltyPoints: clear(num(values.loyaltyPoints)),
      usesDconnect: clear(bool(values.usesDconnect)),
      idUpdated: clear(bool(values.idUpdated)),
    }),
  }
}

/** MAN-6: "Sửa thông tin". */
export function EditClientForm({ detail, onClose }: { detail: ClientDetail; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { client } = detail
  const form = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    mode: 'onTouched',
    defaultValues: {
      name: client.name,
      phone: client.phone ?? '',
      tier: client.tier ?? '',
      dob: client.dob ?? '',
      ageBand: client.ageBand ?? '',
      gender: client.gender ?? '',
      maritalStatus: client.maritalStatus ?? '',
      loyaltyPoints: client.loyaltyPoints === null ? '' : String(client.loyaltyPoints),
      usesDconnect: choice(client.usesDconnect),
      ekycRegistered: choice(client.ekycRegistered),
      idUpdated: choice(client.idUpdated),
    },
  })
  const save = useMutation({
    mutationFn: (values: ClientValues) => api.patch(`/clients/${client.id}`, clientBody(values, true)),
    onSuccess: async (_, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients })
      toast.success(t('toast.clientUpdated', { name: values.name }))
      onClose()
    },
    onError: (error) => placeError(error, form.setError as never, { invalid_phone: 'phone' }),
  })
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <p className="mb-3 text-caption text-ink-meta">{t('clients.editHint')}</p>
      <ClientFields register={form.register} errors={form.formState.errors} prefix="edit-client" />
      <FormError message={save.isError && !(save.error instanceof ApiError && save.error.code === 'invalid_phone') ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

const numText = (value: number | null) => (value === null ? '' : String(value))

/** POL-1 + POL-4: "Thêm hợp đồng" (with a number) or "Sửa hợp đồng" (lines replaced as a whole). */
export function PolicyForm({ clientId, policy, onClose }: { clientId: string; policy?: ClientPolicy; onClose: () => void }) {
  const queryClient = useQueryClient()
  const editing = !!policy
  // Lines from a Success file are left as they are: POL-4 replaces only lines entered by hand
  const editableLines = !policy || policy.manual
  // TENANT-5: a line keeps its product even if the catalogue hides it now, under the name it had
  const kept = new Map((policy?.products ?? []).map((product) => [product.productCode, product.catalogueName ?? product.productName ?? product.productCode]))
  const form = useForm<PolicyValues>({
    resolver: zodResolver(editing ? policySchema : policySchema.extend({ policyNo })),
    mode: 'onTouched',
    defaultValues: policy
      ? {
          policyNo: policy.policyNo,
          status: policy.status ?? '',
          effectiveDate: policy.effectiveDate ?? '',
          maturityDate: policy.maturityDate ?? '',
          premiumFrequency: policy.premiumFrequency ?? '',
          basePremiumVnd: numText(policy.basePremiumVnd),
          premiumDueDate: policy.premiumDueDate ?? '',
          plannedPremiumVnd: numText(policy.plannedPremiumVnd),
          unpaidPremiumVnd: numText(policy.unpaidPremiumVnd),
          aplDebtVnd: numText(policy.aplDebtVnd),
          hasBeneficiary: choice(policy.hasBeneficiary),
          contactAddress: '',
          sumAssuredVnd: numText(policy.sumAssuredVnd),
          graceEndDate: policy.graceEndDate ?? '',
          advancePremiumVnd: numText(policy.advancePremiumVnd),
          totalPaidPremiumVnd: numText(policy.totalPaidPremiumVnd),
          basicPremiumVnd: numText(policy.basicPremiumVnd),
          topUpPremiumVnd: numText(policy.topUpPremiumVnd),
          // POL-2: blank when the holder is also the main insured
          insuredName: policy.insuredClientId && policy.insuredClientId === policy.holderClientId ? '' : (policy.insuredName ?? ''),
          products: policy.products.map((product) => ({
            ...emptyProduct(),
            insuredName: product.insuredName === policy.insuredName ? '' : (product.insuredName ?? ''),
            productCode: product.productCode,
            sumAssuredVnd: numText(product.sumAssuredVnd),
            termYears: product.termYears === null ? '' : String(product.termYears),
            status: product.status ?? '',
            annualPremiumVnd: numText(product.annualPremiumVnd),
            productRole: product.productRole,
            startDate: product.startDate ?? '',
          })),
        }
      : emptyPolicy(),
  })
  const save = useMutation({
    mutationFn: (values: PolicyValues) => {
      const body = policyBody(values)
      if (editing) {
        // Lines from Success stay as they are, so they are not sent (POL-4 replaces only what is sent)
        const fields = { ...body, products: undefined }
        return api.patch(`/clients/${clientId}/policies/${policy.policyNo}`, editableLines ? body : fields)
      }
      return api.post(`/clients/${clientId}/policies`, { policyNo: values.policyNo, ...body })
    },
    onSuccess: async (_, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients })
      toast.success(t(editing ? 'toast.policyUpdated' : 'toast.policyAdded', { no: values.policyNo }), editing ? t('toast.policyUpdatedDetail') : undefined)
      onClose()
    },
    onError: (error) => placeError(error, form.setError as never, { policy_exists: 'policyNo', invalid_policy_no: 'policyNo' }),
  })
  const shownOnField = save.error instanceof ApiError && (save.error.issues?.length || ['policy_exists', 'invalid_policy_no'].includes(save.error.code))
  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      {editing && <p className="mb-3 text-caption text-ink-meta">{t('clients.policyEditHint')}</p>}
      <PolicyFields control={form.control as never} register={form.register as never} errors={form.formState.errors} name="" showNumber={!editing} editableLines={editableLines} kept={kept} addressKept={!!policy?.hasContactAddress} />
      <FormError message={save.isError && !shownOnField ? errorMessage(save.error) : undefined} />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {editing ? t('common.save') : t('clients.addPolicy')}
        </Button>
      </div>
    </form>
  )
}
