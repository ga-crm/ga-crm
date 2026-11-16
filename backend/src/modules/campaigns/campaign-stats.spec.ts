import { campaignCosts, countBy, datesInOrder } from './campaign-stats.js';

describe('campaign figures (CMP-1, CMP-3)', () => {
  it('CMP-3: cost per lead and per issued case, unknown without budget or count', () => {
    expect(campaignCosts(10_000_000, 3, 1)).toEqual({
      perLeadVnd: 3_333_333,
      perIssuedVnd: 10_000_000,
    });
    expect(campaignCosts(10_000_000, 0, 0)).toEqual({
      perLeadVnd: null,
      perIssuedVnd: null,
    });
    expect(campaignCosts(null, 5, 2)).toEqual({
      perLeadVnd: null,
      perIssuedVnd: null,
    });
    expect(campaignCosts(0, 5, 0)).toEqual({
      perLeadVnd: 0,
      perIssuedVnd: null,
    });
  });

  it('CMP-1: a campaign cannot end before it starts; one missing date is fine', () => {
    expect(datesInOrder('2026-12-01', '2026-12-31')).toBe(true);
    expect(datesInOrder('2026-12-01', '2026-12-01')).toBe(true);
    expect(datesInOrder('2026-12-02', '2026-12-01')).toBe(false);
    expect(datesInOrder(null, '2026-12-01')).toBe(true);
  });

  it('counts leads without a value as NONE', () => {
    expect(
      countBy([
        { _id: 'LIFE', count: 2 },
        { _id: null, count: 3 },
      ]),
    ).toEqual({ LIFE: 2, NONE: 3 });
  });
});
