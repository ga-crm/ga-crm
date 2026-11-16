import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { useMe } from '../auth/useMe'
import { t } from '../i18n'
import { api, ApiError, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import { AGE_BANDS, CLIENT_TIERS, GENDERS, MARITAL_STATUSES, PREMIUM_FREQUENCIES, PRODUCT_ROLES } from '../lib/types'
import type { ClientDetail, ClientPolicy } from '../lib/types'
import { optionalBirthDate, optionalDate, optionalText, requiredDate, requiredText } from '../lib/validation'
import { Button, Field, FormError, IconButton, Input, MODAL_FOOTER, Panel, Select, WIDE_FORM_GRID } from './ui'

const money = z.string().trim().regex(/^\d*$/, t('validation.money'))
const requiredMoney = money.min(1, t('validation.required'))
const yesNoUnknown = z.enum(['', 'yes', 'no'])

const productSchema = z.object({
  insuredName: optionalText(200),
  insuredDob: optionalBirthDate,
  insuredGender: z.string(),
  programCode: z.string().min(1, t('validation.required')),
  sumAssuredVnd: money,
  termYears: z.string().trim().regex(/^(\d{1,2}|1[01]\d|120)?$/, t('validation.termYears')),
  status: optionalText(100),
  annualPremiumVnd: money,
  productRole: z.string(),
  startDate: optionalDate,
})

const policySchema = z.object({
  policyNo: z.string().trim(),
  status: requiredText(100),
  effectiveDate: requiredDate,
  maturityDate: requiredDate,
  premiumFrequency: z.string().min(1, t('validation.required')),
  basePremiumVnd: requiredMoney,
  premiumDueDate: optionalDate,
  plannedPremiumVnd: money,
  unpaidPremiumVnd: money,
  aplDebtVnd: money,
  hasBeneficiary: yesNoUnknown,
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

const createSchema = clientSchema.extend({
  // MAN-2 [QĐ 11/2026]: exactly 10 digits, checked here and again by the API
  clientCode: z.string().trim().regex(/^\d{10}$/, t('errors.invalid_client_code')),
  agentCode: z.string(),
  policies: z.array(policySchema.extend({ policyNo: z.string().trim().regex(/^\d{9}$/, t('errors.invalid_policy_no')) })).max(10),
})
type CreateValues = z.infer<typeof createSchema>

const emptyProduct = (): PolicyValues['products'][number] => ({
  insuredName: '',
  insuredDob: '',
  insuredGender: '',
  programCode: '',
  sumAssuredVnd: '',
  termYears: '',
  status: '',
  annualPremiumVnd: '',
  productRole: '',
  startDate: '',
})
const emptyPolicy = (): PolicyValues => ({
  policyNo: '',
  status: 'Đang hiệu lực',
  effectiveDate: '',
  maturityDate: '',
  premiumFrequency: 'Năm',
  basePremiumVnd: '',
  premiumDueDate: '',
  plannedPremiumVnd: '',
  unpaidPremiumVnd: '',
  aplDebtVnd: '',
  hasBeneficiary: '',
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

/** POL-2 + PRD-1: the body the API takes for a policy. */
function policyBody(values: PolicyValues) {
  return {
    status: values.status,
    effectiveDate: values.effectiveDate,
    maturityDate: values.maturityDate,
    premiumFrequency: values.premiumFrequency,
    basePremiumVnd: Number(values.basePremiumVnd),
    premiumDueDate: text(values.premiumDueDate),
    plannedPremiumVnd: num(values.plannedPremiumVnd),
    unpaidPremiumVnd: num(values.unpaidPremiumVnd),
    aplDebtVnd: num(values.aplDebtVnd),
    hasBeneficiary: bool(values.hasBeneficiary),
    insuredName: text(values.insuredName),
    products: values.products.map((line) => ({
      insuredName: text(line.insuredName),
      insuredDob: text(line.insuredDob),
      insuredGender: text(line.insuredGender),
      programCode: line.programCode,
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
      <Field label={t('clients.loyalty')} htmlFor={`${prefix}-loyalty`} error={errors.loyaltyPoints?.message}>
        <Input id={`${prefix}-loyalty`} inputMode="numeric" placeholder="0" aria-invalid={!!errors.loyaltyPoints} {...register('loyaltyPoints')} />
      </Field>
      <Field label={t('clients.dconnect')} htmlFor={`${prefix}-dconnect`}>
        <YesNoSelect id={`${prefix}-dconnect`} label={t('clients.dconnect')} register={reg('usesDconnect')} />
      </Field>
      <Field label={t('clients.ekyc')} htmlFor={`${prefix}-ekyc`}>
        <YesNoSelect id={`${prefix}-ekyc`} label={t('clients.ekyc')} register={reg('ekycRegistered')} />
      </Field>
      {/* PDP-1: only whether it was updated */}
      <Field label={t('clients.idUpdated')} htmlFor={`${prefix}-id`} hint={t('clients.idUpdatedHint')}>
        <YesNoSelect id={`${prefix}-id`} label={t('clients.idUpdated')} register={reg('idUpdated')} />
      </Field>
    </div>
  )
}

/**
 * POL-2 + PRD-1: one policy and its programme lines. `name` is where the policy sits in the form,
 * so the same editor serves the client form (`policies.0`) and the policy dialog (``).
 */
function PolicyFields({ control, register, errors, name, showNumber, editableLines = true }: { control: Control<never>; register: UseFormRegister<never>; errors?: FieldErrors<PolicyValues>; name: string; showNumber: boolean; editableLines?: boolean }) {
  const programs = useQuery(queries.programs())
  const shown = (programs.data?.items ?? []).filter((program) => program.active)
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
        <Field label={t('clients.policyStatus')} htmlFor={id('status')} required error={err('status')}>
          <Input id={id('status')} placeholder={t('placeholder.policyStatus')} {...reg('status')} />
        </Field>
        <Field label={t('clients.frequency')} htmlFor={id('frequency')} required>
          <Select id={id('frequency')} {...reg('premiumFrequency')}>
            {PREMIUM_FREQUENCIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('clients.effective')} htmlFor={id('effective')} required error={err('effectiveDate')}>
          <Input id={id('effective')} type="date" {...reg('effectiveDate')} />
        </Field>
        <Field label={t('clients.maturity')} htmlFor={id('maturity')} required error={err('maturityDate')}>
          <Input id={id('maturity')} type="date" {...reg('maturityDate')} />
        </Field>
        <Field label={t('clients.dueDate')} htmlFor={id('due')} error={err('premiumDueDate')}>
          <Input id={id('due')} type="date" {...reg('premiumDueDate')} />
        </Field>
        <Field label={t('clients.premium')} htmlFor={id('premium')} required error={err('basePremiumVnd')}>
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
                {/* PRD-2: chosen from the GA's catalogue, never typed */}
                <Field label={t('clients.program')} htmlFor={id(line('program'))} required error={lineErrors?.programCode?.message}>
                  <Select id={id(line('program'))} defaultValue="" {...reg(line('programCode'))}>
                    <option value="" disabled>
                      {t('clients.chooseProgram')}
                    </option>
                    {shown.map((program) => (
                      <option key={program.code} value={program.code}>
                        {program.label}
                      </option>
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

const CLIENT_ERRORS = { invalid_client_code: 'clientCode', client_exists: 'clientCode', invalid_phone: 'phone', agent_required: 'agentCode', agent_not_found: 'agentCode' }

/** MAN-1 to MAN-5 + section 16.6: "Thêm khách hàng", with policies saved in the same request. */
export function CreateClientForm({ onClose, onCreated }: { onClose: () => void; onCreated: (code: string) => void }) {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  // MAN-3: managers and GA_HEAD pick the agent from the tree (AGT-9); a FC's client is theirs
  const picksAgent = me?.reach === 'TENANT' || me?.reach === 'DOWNLINE'
  const tree = useQuery({ ...queries.agentTree(), enabled: picksAgent })
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    mode: 'onTouched',
    defaultValues: { ...emptyClient(), clientCode: '', agentCode: me?.user.agentCode ?? '', policies: [] },
  })
  const policies = useFieldArray({ control: form.control, name: 'policies' })
  const { errors } = form.formState
  const save = useMutation({
    mutationFn: (values: CreateValues) =>
      api.post<{ clientCode: string }>('/clients', {
        clientCode: values.clientCode,
        ...clientBody(values, false),
        agentCode: text(values.agentCode),
        policies: values.policies.map((policy) => ({ policyNo: policy.policyNo, ...policyBody(policy) })),
      }),
    onSuccess: async ({ clientCode }, values) => {
      await queryClient.invalidateQueries({ queryKey: keys.clients })
      toast.success(t('toast.clientCreated', { name: values.name }))
      onCreated(clientCode)
    },
    onError: (error) => placeError(error, form.setError as never, CLIENT_ERRORS),
  })
  const seenClient = save.error instanceof ApiError && save.error.code === 'client_exists' ? (save.error.details.clientCode as string | undefined) : undefined
  const formError = save.isError && !(save.error instanceof ApiError && (save.error.issues?.length || CLIENT_ERRORS[save.error.code as keyof typeof CLIENT_ERRORS])) ? errorMessage(save.error) : undefined

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
      <div className={WIDE_FORM_GRID}>
        {/* Two columns, so the hint about matching Success stays readable */}
        <div className="sm:col-span-2">
          <Field label={t('clients.code')} htmlFor="client-code" required error={errors.clientCode?.message} hint={t('clients.codeHint')}>
            <Input id="client-code" inputMode="numeric" maxLength={10} placeholder={t('placeholder.clientCode')} aria-invalid={!!errors.clientCode} {...form.register('clientCode')} />
          </Field>
        </div>
        {picksAgent && (
          <Field label={t('clients.belongsTo')} htmlFor="client-agent" required={!me?.user.agentCode} error={errors.agentCode?.message}>
            <Select id="client-agent" aria-invalid={!!errors.agentCode} {...form.register('agentCode')}>
              <option value="">{me?.user.agentCode ? t('clients.belongsToMe') : t('clients.chooseAgent')}</option>
              {(tree.data?.items ?? []).map((agent) => (
                <option key={agent.agentCode} value={agent.agentCode}>
                  {`${'  '.repeat(agent.depth)}${agent.name} (${agent.agentCode})`}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {seenClient && (
        <p className="mb-2 text-caption">
          <Link to={`/clients/${seenClient}`} className="text-primary hover:underline">
            {t('clients.seeExisting')}
          </Link>
        </p>
      )}
      <ClientFields register={form.register as never} errors={errors as never} />
      <h3 className="mt-2 mb-1 text-subhead text-ink">{t('clients.policiesSection')}</h3>
      {policies.fields.map((field, index) => (
        <Panel key={field.id} className="mb-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-caption font-medium text-ink">{t('clients.policyIndex', { n: index + 1 })}</h4>
            <Button variant="ghost" onClick={() => policies.remove(index)}>
              {t('clients.removePolicy')}
            </Button>
          </div>
          <PolicyFields control={form.control as never} register={form.register as never} errors={errors.policies?.[index] as never} name={`policies.${index}`} showNumber />
        </Panel>
      ))}
      <Button variant="secondary" disabled={policies.fields.length >= 10} onClick={() => policies.append({ ...emptyPolicy(), products: [emptyProduct()] })}>
        <Plus size={16} aria-hidden />
        {t('clients.addPolicy')}
      </Button>
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
    loyaltyPoints: clear(num(values.loyaltyPoints)),
    usesDconnect: clear(bool(values.usesDconnect)),
    ekycRegistered: clear(bool(values.ekycRegistered)),
    idUpdated: clear(bool(values.idUpdated)),
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
    mutationFn: (values: ClientValues) => api.patch(`/clients/${client.clientCode}`, clientBody(values, true)),
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

const singleSchema = policySchema.extend({ policyNo: z.string().trim() })

/** POL-1 + POL-4: "Thêm hợp đồng" (with a number) or "Sửa hợp đồng" (lines replaced as a whole). */
export function PolicyForm({ clientCode, policy, programs, onClose }: { clientCode: string; policy?: ClientPolicy; programs: Map<string, string>; onClose: () => void }) {
  const queryClient = useQueryClient()
  const editing = !!policy
  // Lines from a Success file are not catalogue programmes, so those are left as they are
  const editableLines = !policy || policy.manual
  const form = useForm<PolicyValues>({
    resolver: zodResolver(editing ? singleSchema : singleSchema.extend({ policyNo: z.string().trim().regex(/^\d{9}$/, t('errors.invalid_policy_no')) })),
    mode: 'onTouched',
    defaultValues: policy
      ? {
          policyNo: policy.policyNo,
          status: policy.status,
          effectiveDate: policy.effectiveDate,
          maturityDate: policy.maturityDate,
          premiumFrequency: policy.premiumFrequency,
          basePremiumVnd: String(policy.basePremiumVnd),
          premiumDueDate: policy.premiumDueDate ?? '',
          plannedPremiumVnd: policy.plannedPremiumVnd === null ? '' : String(policy.plannedPremiumVnd),
          unpaidPremiumVnd: policy.unpaidPremiumVnd === null ? '' : String(policy.unpaidPremiumVnd),
          aplDebtVnd: policy.aplDebtVnd === null ? '' : String(policy.aplDebtVnd),
          hasBeneficiary: choice(policy.hasBeneficiary),
          insuredName: policy.insuredClientCode === clientCode ? '' : policy.insuredName,
          products: policy.products.map((product) => ({
            ...emptyProduct(),
            insuredName: product.insuredName === policy.insuredName ? '' : (product.insuredName ?? ''),
            programCode: programs.get(product.productCode) ?? '',
            sumAssuredVnd: product.sumAssuredVnd === null ? '' : String(product.sumAssuredVnd),
            termYears: product.termYears === null ? '' : String(product.termYears),
            status: product.status ?? '',
            annualPremiumVnd: product.annualPremiumVnd === null ? '' : String(product.annualPremiumVnd),
            productRole: product.productRole,
            startDate: product.startDate ?? '',
          })),
        }
      : { ...emptyPolicy(), products: [emptyProduct()] },
  })
  const save = useMutation({
    mutationFn: (values: PolicyValues) => {
      const body = policyBody(values)
      if (editing) {
        // Lines from Success stay as they are, so they are not sent (POL-4 replaces only what is sent)
        const fields = { ...body, products: undefined }
        return api.patch(`/clients/${clientCode}/policies/${policy.policyNo}`, editableLines ? body : fields)
      }
      return api.post(`/clients/${clientCode}/policies`, { policyNo: values.policyNo, ...body })
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
      <PolicyFields control={form.control as never} register={form.register as never} errors={form.formState.errors} name="" showNumber={!editing} editableLines={editableLines} />
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
