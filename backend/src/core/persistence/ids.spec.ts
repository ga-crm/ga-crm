import { isId } from '../../common/pagination.js';
import { newId, withoutNulls } from './ids.js';

describe('newId', () => {
  it('makes valid, time-ordered v7 ids', () => {
    const ids = Array.from({ length: 50 }, () => newId());
    for (const id of ids) {
      expect(isId(id)).toBe(true);
      expect(id[14]).toBe('7');
    }
    expect([...ids].sort()).toEqual(ids);
    expect(newId(Date.now() + 1000) > ids[49]).toBe(true);
  });
});

describe('withoutNulls', () => {
  it('drops null fields and keeps falsy values', () => {
    expect(withoutNulls({ a: null, b: 0, c: '', d: false, e: 'x' })).toEqual({
      b: 0,
      c: '',
      d: false,
      e: 'x',
    });
  });
});
