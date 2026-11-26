import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException, ErrorCode } from '../../common/errors.js';
import { normalizeName } from '../../common/normalize.js';
import { VN_PROVINCES, VN_WARDS } from './vn-units.data.js';

export interface Place {
  code: string;
  /** Without "Tỉnh", "Thành phố", "Phường", "Xã" or "Đặc khu": what people write. */
  name: string;
  fullName: string;
}

const UNIT_PREFIX = /^(thành phố|tỉnh|phường|xã|đặc khu)\s+/iu;
export const shortPlaceName = (fullName: string): string =>
  fullName.replace(UNIT_PREFIX, '');

/** A province as written in a file or a form: no marks, any case, with or without "TP." / "Tỉnh". */
export const provinceKey = (text: string): string =>
  normalizeName(text.replace(/[.,]/g, ' '))
    .replace(/^(THANH PHO|TINH|TP)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Common ways of writing a province that its name alone does not cover. */
const PROVINCE_ALIASES: Record<string, string> = {
  HCM: '79',
  TPHCM: '79',
  'TP HCM': '79',
  'SAI GON': '79',
  HN: '01',
};

/**
 * Decided 26/11/2026: Vietnam's provinces and their communes / wards after the reform of
 * 1 July 2025 (two levels, no district), shared by every GA. The list is fixed reference data,
 * so it is served from memory; the `provinces` and `wards` tables hold the same rows so leads can
 * point at them.
 */
@Injectable()
export class GeoService {
  private readonly provinces: Place[] = VN_PROVINCES.map(([code, fullName]) => ({
    code,
    name: shortPlaceName(fullName),
    fullName,
  })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  private readonly provinceByCode = new Map(
    this.provinces.map((province) => [province.code, province]),
  );
  private readonly wardsByProvince = new Map<string, Place[]>();
  private readonly wardByCode = new Map<
    string,
    Place & { provinceCode: string }
  >();
  private readonly provinceByKey = new Map<string, string>();

  constructor() {
    for (const [code, provinceCode, fullName] of VN_WARDS) {
      const ward = { code, name: shortPlaceName(fullName), fullName };
      this.wardByCode.set(code, { ...ward, provinceCode });
      const list = this.wardsByProvince.get(provinceCode) ?? [];
      list.push(ward);
      this.wardsByProvince.set(provinceCode, list);
    }
    for (const list of this.wardsByProvince.values())
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    for (const province of this.provinces)
      this.provinceByKey.set(provinceKey(province.name), province.code);
    for (const [alias, code] of Object.entries(PROVINCE_ALIASES))
      this.provinceByKey.set(alias, code);
  }

  listProvinces(): Place[] {
    return this.provinces;
  }

  /** Null for an unknown province. */
  listWards(provinceCode: string): Place[] | null {
    if (!this.provinceByCode.has(provinceCode)) return null;
    return this.wardsByProvince.get(provinceCode) ?? [];
  }

  province(code: string | null | undefined): Place | null {
    return code ? (this.provinceByCode.get(code) ?? null) : null;
  }

  ward(code: string | null | undefined): Place | null {
    return code ? (this.wardByCode.get(code) ?? null) : null;
  }

  /** The province a text names (current names only), or null. */
  matchProvince(text: string | null | undefined): string | null {
    if (!text?.trim()) return null;
    const key = provinceKey(text);
    return (
      this.provinceByKey.get(key) ??
      this.provinceByKey.get(key.replace(/\s+/g, '')) ??
      null
    );
  }

  /**
   * A province and one of its communes, or `400 unknown_place` naming the field at fault. A ward
   * needs its province; either may be null.
   */
  place(
    provinceCode: string | null,
    wardCode: string | null,
  ): { province: Place | null; ward: Place | null } {
    const fail = (path: string) =>
      new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.UnknownPlace, {
        issues: [{ path, message: ErrorCode.UnknownPlace }],
      });
    const province = this.province(provinceCode);
    if (provinceCode && !province) throw fail('provinceCode');
    if (!wardCode) return { province, ward: null };
    const ward = this.wardByCode.get(wardCode);
    if (!ward || !province || ward.provinceCode !== province.code)
      throw fail('wardCode');
    return {
      province,
      ward: { code: ward.code, name: ward.name, fullName: ward.fullName },
    };
  }
}
