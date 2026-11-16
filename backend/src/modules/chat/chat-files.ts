/**
 * K8 (decided 14/11/2026): what may be sent in chat. The type is read from the file's first bytes,
 * never from the name or the browser's Content-Type, so a script renamed to .pdf is refused. SVG
 * and HTML are never accepted: served from the API's origin they could run script.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export interface SniffedFile {
  kind: 'IMAGE' | 'FILE';
  contentType: string;
}

const OOXML: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const LEGACY_OFFICE: Record<string, string> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
};

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Buffer, start: number, end: number) => bytes.subarray(start, end).toString('latin1');

const extensionOf = (name: string) => /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase() ?? '';

/** The accepted type of a file, or null. Office formats need both the right bytes and extension. */
export function sniffFile(bytes: Buffer, name: string): SniffedFile | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'IMAGE', contentType: 'image/jpeg' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'IMAGE', contentType: 'image/png' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { kind: 'IMAGE', contentType: 'image/webp' };
  if (ascii(bytes, 4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(ascii(bytes, 8, 12)))
    // Most browsers cannot show HEIC, so it is offered as a download
    return { kind: 'FILE', contentType: 'image/heic' };
  if (ascii(bytes, 0, 5) === '%PDF-') return { kind: 'FILE', contentType: 'application/pdf' };
  const extension = extensionOf(name);
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && OOXML[extension]) return { kind: 'FILE', contentType: OOXML[extension] };
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && LEGACY_OFFICE[extension])
    return { kind: 'FILE', contentType: LEGACY_OFFICE[extension] };
  return null;
}

/**
 * Multipart parsers read file names as Latin-1, while browsers send UTF-8: "Hợp đồng.pdf" arrives as
 * "Há»£p Äá»ng.pdf". Read it back as UTF-8 when that decodes cleanly.
 */
export function utf8FileName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? name : decoded;
}

/** A name safe to store and to put in a header: no path, no control characters, at most 255 characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (cleaned || 'tep-dinh-kem').slice(-255);
}

/** RFC 6266: an ASCII fallback plus the UTF-8 name, so Vietnamese names survive the download. */
export function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
