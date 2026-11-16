import { isLoopback } from './dev-switch.controller.js';

describe('Dev account switcher', () => {
  it('answers only a caller on this machine', () => {
    for (const address of ['127.0.0.1', '127.8.9.10', '::1', '::ffff:127.0.0.1'])
      expect(isLoopback(address), address).toBe(true);
    for (const address of [
      undefined,
      '',
      '192.168.1.20',
      '10.0.0.1',
      '::ffff:192.168.1.20',
      'fe80::1',
      '128.0.0.1',
    ])
      expect(isLoopback(address), String(address)).toBe(false);
  });
});
