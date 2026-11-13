import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const outputDirectory = resolve(projectRoot, 'dist');
export const publishFiles = [
  'index.html',
  'gifts.html',
  'rsvp.html',
  'styles.css',
  'rsvp.css',
  'event.css',
  'gift-list.css',
  'script.js',
  'rsvp.js',
  'event-flow.js',
  'dress-code-sparks.js',
  'gift-config.js',
  'gift-list.js',
  'gift-page.js',
  'robots.txt',
  'assets/black-paper.webp',
  'assets/black-velvet.webp',
  'assets/gold-seal.png',
  'assets/gold-corner.png',
  'assets/gold-crest.png',
  'assets/gold-name.png',
  'assets/gift-pink-mouse.jpg',
  'assets/gift-earbud-charging-case.jpg',
  'assets/gift-light-pink-cover.jpg',
  'assets/gift-robot-vacuum.jpg',
  'assets/gift-hair-curls.jpg',
  'assets/gift-hair-spray.png'
];

export async function buildSite() {
  await rm(outputDirectory, { recursive: true, force: true });
  for (const relativePath of publishFiles) {
    const target = resolve(outputDirectory, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(projectRoot, relativePath), target);
  }
  await writeFile(resolve(outputDirectory, '.nojekyll'), '');
  return publishFiles;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite();
  console.log(`Built ${publishFiles.length} production files in dist/.`);
}
