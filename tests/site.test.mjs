import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildSite, outputDirectory, publishFiles } from '../scripts/build-site.mjs';

await buildSite();
const read = file => readFile(resolve(outputDirectory, file), 'utf8');

test('only the explicit production files are deployed', async () => {
  const actual = await readdir(outputDirectory, { recursive: true });
  const expected = new Set([...publishFiles, '.nojekyll', 'assets']);
  assert.deepEqual(new Set(actual), expected);
  assert.ok(actual.every(file => !/supabase|test|concepts|directions|fire-transition|\.sql$/.test(file)));
});

test('all relative page assets exist and work under a GitHub Pages project path', async () => {
  for (const file of publishFiles.filter(name => /\.(html|css)$/.test(name))) {
    const source = await read(file);
    for (const match of source.matchAll(/(?:src|href)="(\.\/[^"#]+)(?:#[^"]*)?"|url\("(\.\/[^"]+)"\)/g)) {
      const target = match[1] || match[2];
      assert.ok(publishFiles.includes(target.slice(2)), `${file}: missing ${target}`);
      const url = new URL(target, `https://example.github.io/black-tie-sparkler/${file}`);
      assert.ok(url.pathname.startsWith('/black-tie-sparkler/'));
    }
  }
});

test('published pages have unique IDs and no demo interfaces', async () => {
  for (const page of ['index.html', 'gifts.html']) {
    const html = await read(page);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${page}: duplicate IDs`);
    assert.doesNotMatch(html, /demo-form|DESIGN PREVIEW|review-tools|Preview Gold dust|Send demo RSVP/);
    assert.match(html, /name="robots" content="noindex,nofollow"/);
  }
});

test('the public gift link is standalone and retains shared claim functionality', async () => {
  const gifts = await read('gifts.html');
  assert.doesNotMatch(gifts, /#agenda|#lookbook|#invitation|index\.html|Kirkland|5043|Happy Lamb|formspree|rsvp-form/i);
  assert.match(gifts, /id="gift-claim-form"/);
  assert.match(gifts, /Your first name will appear/);
  assert.match(gifts, /gift-config\.js/);
  assert.match(gifts, /gift-list\.js/);
  assert.match(gifts, /gift-page\.js/);
  assert.match(gifts, /I'd love a little gift,/);
});

test('the invitation retains the approved event details and links to standalone gifts', async () => {
  const html = await read('index.html');
  assert.match(html, /Birthday Party/);
  assert.match(html, /A little photoshoot\. Some delicious food\./);
  assert.match(html, /All-black outfits\. Pants required\. No dresses\./);
  assert.match(html, /datetime="16:00"/);
  assert.match(html, /datetime="17:30"/);
  assert.match(html, /After the photoshoot/);
  assert.match(html, /href="\.\/gifts\.html"/);
  assert.doesNotMatch(html, /<iframe/);
});

test('classic scripts parse together without duplicate top-level bindings', async () => {
  for (const page of ['index.html', 'gifts.html']) {
    const html = await read(page);
    const files = [...html.matchAll(/<script src="\.\/([^"]+)"/g)].map(match => match[1]);
    new vm.Script((await Promise.all(files.map(read))).join('\n'), { filename: page });
  }
});

test('gift product photos and public browser configuration are complete', async () => {
  const context = {};
  vm.runInNewContext(`${await read('gift-config.js')}\nthis.config = giftConfig;`, context);
  const config = context.config;
  assert.match(config.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(config.publishableKey, /^sb_publishable_/);
  assert.equal(Object.keys(config.productPhotos).length, 6);
  for (const photo of Object.values(config.productPhotos)) {
    assert.ok(publishFiles.includes(photo.src.slice(2)));
    assert.ok(photo.alt.length > 10);
  }
});
