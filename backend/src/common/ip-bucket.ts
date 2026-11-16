import { isIPv4, isIPv6 } from 'node:net';

/**
 * The address that sign-in limits count against (section 22.4). An IPv6 user usually holds a
 * whole /64, so counting each address apart would let one machine rotate past every per-IP limit;
 * the throttler groups IPv6 the same way. IPv4 written as IPv6 (`::ffff:1.2.3.4`) is plain IPv4.
 */
export function ipBucket(ip: string | undefined | null): string {
  if (!ip) return 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (isIPv4(ip)) return ip;
  // Drop a zone index (fe80::1%en0) before checking the address
  const address = ip.split('%')[0];
  if (!isIPv6(address)) return ip;
  const [head, tail] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail !== '' ? tail.split(':') : [];
  // Only the first four groups matter, so an embedded IPv4 tail (64:ff9b::1.2.3.4) needs no care
  const groups = [
    ...left,
    ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'),
    ...right,
  ];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}
