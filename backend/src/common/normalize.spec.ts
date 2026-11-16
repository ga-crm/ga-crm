import { codeFromLabel } from './normalize.js';

describe('codeFromLabel', () => {
  it('DATA-9: no marks, đ as d, upper case, other characters as _, at most 40', () => {
    expect(codeFromLabel('BH Tai Nạn Cao Cấp')).toBe('BH_TAI_NAN_CAO_CAP');
    expect(codeFromLabel('Đã gửi  báo giá (lần 2)')).toBe(
      'DA_GUI_BAO_GIA_LAN_2',
    );
    expect(codeFromLabel('  -- Quan tâm --  ')).toBe('QUAN_TAM');
    expect(codeFromLabel('a'.repeat(50))).toHaveLength(40);
    expect(codeFromLabel('Lương hưu ' + 'x'.repeat(29) + ' y')).not.toMatch(
      /_$/,
    );
    expect(codeFromLabel('!!!')).toBe('');
  });

  it('OPT-4: labels that differ only in case or marks give the same code', () => {
    expect(codeFromLabel('Quan tâm hưu trí')).toBe(
      codeFromLabel('QUAN TAM HUU TRI'),
    );
  });
});
