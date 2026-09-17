import {describe, expect, it} from 'vitest';
import {hasShareLink, reportedUrl} from '../src/analytics.ts';

describe('analytics URLs', () => {
  it('detects a layout in the hash', () => {
    expect(hasShareLink('#layout=1,2,gb200:4.3')).toBe(true);
    expect(hasShareLink('layout=3,5,vr200:0.3,@2:0.3')).toBe(true);
    expect(hasShareLink('')).toBe(false);
    expect(hasShareLink('#other=1')).toBe(false);
  });

  it('drops the hash and query from reported page views', () => {
    expect(reportedUrl('https://datahall-eight.vercel.app/?lang=zh#layout=1,2,gb200:4.3', false)).toBe('https://datahall-eight.vercel.app/');
  });

  it('reports share-link visits as /shared, also under a subpath or index.html', () => {
    expect(reportedUrl('https://datahall-eight.vercel.app/#layout=1,2,gb200:4.3', true)).toBe('https://datahall-eight.vercel.app/shared');
    expect(reportedUrl('https://example.com/tools/datahall/index.html?lang=en#layout=1,2', true)).toBe('https://example.com/tools/datahall/shared');
    expect(reportedUrl('https://example.com/tools/datahall', true)).toBe('https://example.com/tools/datahall/shared');
  });
});
