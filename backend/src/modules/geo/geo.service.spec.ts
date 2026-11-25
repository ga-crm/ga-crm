import { GeoService, shortPlaceName } from './geo.service.js';

describe('GeoService', () => {
  const geo = new GeoService();

  it('has the 34 provinces and 3,321 communes of 1/7/2025, each commune under one province', () => {
    expect(geo.listProvinces()).toHaveLength(34);
    const wards = geo
      .listProvinces()
      .flatMap((province) => geo.listWards(province.code) ?? []);
    expect(wards).toHaveLength(3321);
  });

  it('names a place without its unit word', () => {
    expect(shortPlaceName('Thành phố Hồ Chí Minh')).toBe('Hồ Chí Minh');
    expect(shortPlaceName('Tỉnh Gia Lai')).toBe('Gia Lai');
    expect(shortPlaceName('Đặc khu Côn Đảo')).toBe('Côn Đảo');
    expect(shortPlaceName('xã Mẫu')).toBe('Mẫu');
  });

  it('matches a written province: any case, no marks, with or without "TP." or "Tỉnh"', () => {
    for (const text of [
      'Hà Nội',
      'ha noi',
      'TP. Hà Nội',
      'Thành phố Hà Nội',
      'HN',
    ])
      expect(geo.matchProvince(text)).toBe('01');
    for (const text of ['TP HCM', 'tp.hcm', 'Sài Gòn', 'Hồ Chí Minh'])
      expect(geo.matchProvince(text)).toBe('79');
    expect(geo.matchProvince('Tỉnh Gia Lai')).toBe('52');
    // A province merged away in 2025 is not guessed
    expect(geo.matchProvince('Bình Dương')).toBeNull();
    expect(geo.matchProvince('')).toBeNull();
  });
});
