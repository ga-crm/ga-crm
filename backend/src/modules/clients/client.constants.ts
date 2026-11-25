/** Section 18.9 and 19.3-19.5: the lists a Success file must match (IMP-7). */

/** CUS-2 */
export const CLIENT_TIERS = ['Thân thiết', 'Bạc', 'Vàng', 'Kim Cương'] as const;
/** CUS-2 */
export const MARITAL_STATUSES = ['Độc thân', 'Đã kết hôn', 'Ly hôn'] as const;
/** CUS-2 */
export const AGE_BANDS = [
  '<18',
  '18-29',
  '30-39',
  '40-49',
  '50-59',
  '60+',
] as const;
/** MAN-2 */
export const GENDERS = ['Nam', 'Nữ'] as const;
/** CUS-10 */
export const PREMIUM_FREQUENCIES = ['Năm', 'Nửa năm', 'Quý', 'Tháng'] as const;
/**
 * Personal data kept on a policy (decided 25/11/2026): the change history records that it
 * changed, never its value, and the API returns it only through an audited reveal.
 */
export const HIDDEN_FIELDS: ReadonlySet<string> = new Set(['contactAddress']);
/**
 * Decided 26/11/2026: what a GA records about caring for a client. A claim says when and where,
 * never why (PDP-1); a seminar or health check is one the client attended; a gift or visit is care
 * after the sale; cash and gifts on signing are kept apart.
 */
export const CARE_RECORD_KINDS = [
  'CLAIM',
  'SEMINAR',
  'HEALTH_CHECK',
  'GIFT',
  'VISIT',
  'SIGNING_CASH',
  'SIGNING_GIFT',
] as const;
export type CareRecordKind = (typeof CARE_RECORD_KINDS)[number];
/** How a referred person relates to the client who referred them. */
export const REFERRAL_RELATIONS = [
  'FAMILY',
  'FRIEND',
  'COLLEAGUE',
  'NEIGHBOR',
  'OTHER',
] as const;
export type ReferralRelation = (typeof REFERRAL_RELATIONS)[number];
export const REFERRAL_RESULTS = ['PENDING', 'SUCCESS', 'FAILED'] as const;
export type ReferralResult = (typeof REFERRAL_RESULTS)[number];
/** PRD-6 */
export const PRODUCT_ROLES = ['Chính', 'Bổ trợ'] as const;
/** CUS-13 */
export const APPLICATION_STATUSES = [
  'Đã phát hành hợp đồng',
  'Đã hủy Hồ sơ YCBH',
  'Đang chờ phát hành hợp đồng',
  'Đang chờ NB hủy hồ sơ YCBH',
  'Đang chờ NB xử lý',
  'Đang chờ Thư thỏa thuận/Bổ sung thông tin',
] as const;

/** CUS-4 */
export const LINK_SOURCES = [
  'POLICY_HOLDER',
  'POLICY_INSURED',
  'APPLICATION',
  'CLIENTS_SHEET',
  'CLIENTS_SHEET_SCOPE',
  'MANUAL',
  'LEAD_LINK',
] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];
/** CUS-4: the one source that shows a client without making it the agent's own. */
export const SEE_ONLY_SOURCES: readonly LinkSource[] = ['CLIENTS_SHEET_SCOPE'];
/** Links worked out from policies, applications and linked leads, as opposed to stored ones. */
export const DERIVED_SOURCES: readonly LinkSource[] = [
  'POLICY_HOLDER',
  'POLICY_INSURED',
  'APPLICATION',
  'LEAD_LINK',
];

/** IMP-6 */
export const CLIENT_CODE = /^\d{10}$/;
export const POLICY_NO = /^\d{9}$/;
export const APPLICATION_KEY = /^[A-Za-z0-9]{4,20}$/;
export const PRODUCT_KEY = /^[A-Za-z0-9._-]{1,30}$/;
