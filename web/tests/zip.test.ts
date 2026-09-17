import {expect, it} from 'vitest';
import {crc32, zipStore} from '../src/zip.ts';

it('crc32 standard check value', () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
});

it('zipStore writes correct header and end-of-directory signatures', async () => {
  const buf = new DataView(await zipStore([{name: 'a.txt', text: 'hello'}]).arrayBuffer());
  expect(buf.getUint32(0, true)).toBe(0x04034b50);
  expect(buf.getUint32(buf.byteLength - 22, true)).toBe(0x06054b50);
  expect(buf.getUint16(buf.byteLength - 22 + 10, true)).toBe(1);
});
