import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('all application styling comes from the pinned Bootstrap 6 alpha', async () => {
  const root = new URL('../', import.meta.url);
  const [html, main, manifest, sources] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('src/main.js', root), 'utf8'),
    readFile(new URL('package.json', root), 'utf8'),
    readdir(new URL('src/', root), { recursive: true }),
  ]);
  assert.equal(JSON.parse(manifest).dependencies.bootstrap, '6.0.0-alpha.1');
  assert.match(main, /import 'bootstrap\/dist\/css\/bootstrap\.min\.css'/);
  assert.doesNotMatch(html, /<style\b|\sstyle\s*=/i);
  assert.ok(sources.every(name => !/\.(css|scss|sass|less)$/.test(name)), 'No application stylesheet');
  for (const name of sources.filter(name => name.endsWith('.js'))) {
    const js = await readFile(new URL(`src/${name}`, root), 'utf8');
    assert.doesNotMatch(js, /\.style[.\[]|setAttribute\(['"]style['"]|insertRule\(/, name);
  }
});
