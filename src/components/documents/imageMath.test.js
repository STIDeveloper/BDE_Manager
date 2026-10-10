import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitWithin, dataUrlBytes, formatBytes, compressionPlan, hasTransparency, whiteToAlpha,
  strokesBounds, smoothPath, MAX_DATAURL_LENGTH,
} from './imageMath.js';

test('redimensionnement : jamais agrandi, proportions conservées', () => {
  assert.deepEqual(fitWithin(1200, 600, 600), { width: 600, height: 300 });
  assert.deepEqual(fitWithin(300, 900, 600), { width: 200, height: 600 });
  assert.deepEqual(fitWithin(100, 50, 600), { width: 100, height: 50 });
  assert.deepEqual(fitWithin(0, 0, 600), { width: 1, height: 1 });
});

test('poids d\'une data URL', () => {
  assert.equal(dataUrlBytes('data:image/png;base64,AAAA'), 3);
  assert.equal(dataUrlBytes('data:image/png;base64,AA=='), 1);
  assert.equal(formatBytes(2048), '2 Ko');
  assert.equal(formatBytes(1536 * 1024), '1,5 Mo');
  assert.ok(MAX_DATAURL_LENGTH < 400 * 1024);
});

test('plan de compression : qualité puis taille décroissantes', () => {
  const jpeg = compressionPlan(600, false);
  assert.deepEqual(jpeg[0], { max: 600, quality: 0.85 });
  assert.ok(jpeg.every((s, i) => i === 0 || s.max <= jpeg[i - 1].max));
  const png = compressionPlan(600, true);
  assert.ok(png.every(s => s.quality === 1));
  assert.equal(png.at(-1).max, 216);
});

test('transparence et fond blanc → alpha', () => {
  assert.equal(hasTransparency(new Uint8ClampedArray([0, 0, 0, 255, 1, 1, 1, 255])), false);
  assert.equal(hasTransparency(new Uint8ClampedArray([0, 0, 0, 255, 1, 1, 1, 10])), true);
  const px = new Uint8ClampedArray([255, 255, 255, 255, 20, 20, 60, 255, 222, 222, 222, 255]);
  whiteToAlpha(px);
  assert.equal(px[3], 0);       // blanc → transparent
  assert.equal(px[7], 255);     // encre conservée
  assert.ok(px[11] > 0 && px[11] < 255); // gris clair → semi-transparent
});

test('boîte englobante des traits (avec épaisseur et marge)', () => {
  assert.equal(strokesBounds([]), null);
  const b = strokesBounds([{ width: 4, points: [{ x: 10, y: 20 }, { x: 50, y: 30 }] }], 6);
  assert.deepEqual(b, { x: 2, y: 12, width: 56, height: 26 });
});

test('lissage : point isolé, segment, courbes par milieux', () => {
  assert.equal(smoothPath([{ x: 1, y: 1 }]).type, 'dot');
  assert.equal(smoothPath([{ x: 0, y: 0 }, { x: 2, y: 2 }]).curves.length, 1);
  const p = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }]);
  assert.equal(p.curves.length, 3);
  assert.deepEqual(p.curves[0], { cx: 10, cy: 0, x: 10, y: 5 });
  assert.deepEqual(p.curves.at(-1), { cx: 20, cy: 10, x: 20, y: 10 });
});
