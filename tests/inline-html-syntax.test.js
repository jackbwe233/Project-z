import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = readdirSync(root).filter(name => name.endsWith('.html'));

describe('Inline JavaScript syntax in all Project Z HTML pages', () => {
  for (const page of pages) {
    it(page + ' contains no unparseable inline JavaScript', () => {
      const html = readFileSync(join(root, page), 'utf8');
      const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)]
        .map(match => match[1].trim()).filter(Boolean);
      for (let i = 0; i < scripts.length; i++) {
        expect(() => new Function(scripts[i]), page + ': inline script ' + (i + 1)).not.toThrow();
      }
    });
  }
});
