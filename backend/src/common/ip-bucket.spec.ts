import { ipBucket } from './ip-bucket.js';

describe('ipBucket', () => {
  it('section 22.4: an IPv6 /64 counts as one client, however the address is written', () => {
    const bucket = '2001:db8:aa:1::/64';
    for (const ip of [
      '2001:db8:aa:1::1',
      '2001:0db8:00aa:0001:ffff:ffff:ffff:ffff',
      '2001:DB8:AA:1:1234::9',
      '2001:db8:aa:1:0:0:0:0',
    ])
      expect(ipBucket(ip), ip).toBe(bucket);
    expect(ipBucket('2001:db8:aa:2::1')).not.toBe(bucket);
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('fe80::1%en0')).toBe('fe80:0:0:0::/64');
  });

  it('keeps IPv4 apart, including IPv4 written as IPv6', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('203.0.113.8')).not.toBe(ipBucket('203.0.113.7'));
  });

  it('never fails on a missing or odd value', () => {
    expect(ipBucket(undefined)).toBe('unknown');
    expect(ipBucket('')).toBe('unknown');
    expect(ipBucket('not-an-ip')).toBe('not-an-ip');
  });
});
