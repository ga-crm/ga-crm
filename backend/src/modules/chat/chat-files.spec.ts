import { describe, expect, it } from 'vitest';
import { cleanFileName, contentDisposition, sniffFile, utf8FileName } from './chat-files.js';

const bytes = (...values: (number | string)[]) =>
  Buffer.concat(values.map((value) => (typeof value === 'string' ? Buffer.from(value, 'latin1') : Buffer.from([value]))));

describe('Chat files (K8)', () => {
  it('recognises images and documents by their first bytes', () => {
    expect(sniffFile(bytes(0xff, 0xd8, 0xff, 0xe0), 'a.png')).toEqual({ kind: 'IMAGE', contentType: 'image/jpeg' });
    expect(sniffFile(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a), 'x')?.contentType).toBe('image/png');
    expect(sniffFile(bytes('RIFF', 0, 0, 0, 0, 'WEBP'), 'x')?.contentType).toBe('image/webp');
    expect(sniffFile(bytes('%PDF-1.7'), 'hop-dong.pdf')).toEqual({ kind: 'FILE', contentType: 'application/pdf' });
    expect(sniffFile(bytes('PK', 3, 4), 'bao-gia.xlsx')?.contentType).toContain('spreadsheetml');
    expect(sniffFile(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 'cu.doc')?.contentType).toBe('application/msword');
  });

  it('refuses anything else, whatever its name says', () => {
    expect(sniffFile(Buffer.from('<svg onload="alert(1)">'), 'logo.svg')).toBeNull();
    expect(sniffFile(Buffer.from('<html><script>'), 'trang.pdf')).toBeNull();
    expect(sniffFile(bytes('PK', 3, 4), 'goi.zip')).toBeNull();
    expect(sniffFile(Buffer.from('MZ'), 'setup.exe')).toBeNull();
  });

  it('keeps only the base name, without control characters or quotes', () => {
    expect(cleanFileName('C:\\Users\\a\\Hợp đồng "mới".pdf')).toBe('Hợp đồng mới.pdf');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('\u0000')).toBe('tep-dinh-kem');
  });

  it('reads back UTF-8 names that arrived as Latin-1, and leaves real Latin-1 alone', () => {
    expect(utf8FileName(Buffer.from('Hợp đồng.pdf', 'utf8').toString('latin1'))).toBe('Hợp đồng.pdf');
    expect(utf8FileName('plain.pdf')).toBe('plain.pdf');
    expect(utf8FileName('caf\u00e9.pdf')).toBe('caf\u00e9.pdf');
  });

  it('sends Vietnamese names in downloads with an ASCII fallback', () => {
    expect(contentDisposition('Hợp đồng.pdf', false)).toBe(
      `attachment; filename="Hop dong.pdf"; filename*=UTF-8''H%E1%BB%A3p%20%C4%91%E1%BB%93ng.pdf`,
    );
  });
});
