import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {frameAt, nearestFrame, extent, buildPath, csvForRun, phaseProject} from '../core.js';

test('playback holds saved samples and selects the post-query boundary state', () => {
  const times = [0, .25, .5, 1, 1, 1.5, 2];
  assert.equal(frameAt(times, .49), 2);
  assert.equal(frameAt(times, .5), 4);
  assert.equal(frameAt(times, 1), 6);
  assert.equal(frameAt(times, -1), 0);
  assert.equal(frameAt([], .5), -1);
  assert.equal(nearestFrame(times, 1), 4);
  assert.equal(nearestFrame(times, 1, 3), 3);
  assert.equal(nearestFrame(times, 1, 5), 4);
});

test('chart paths retain instantaneous observation jumps and missing values', () => {
  assert.equal(buildPath([0, 1, 1, 2], [2, 1, 4, 2], x => x, y => y), 'M0.000,2.000L1.000,1.000L1.000,4.000L2.000,2.000');
  assert.equal(buildPath([0, 1, 2], [2, null, 3], x => x, y => y), 'M0.000,2.000M2.000,3.000');
  assert.match(buildPath([0, 1], [2, 3], x => x, y => y, true), /H1.000V3.000/);
  assert.deepEqual(extent([0, 0]), [-.1, .1]);
  assert.deepEqual(extent([null, NaN]), [0, 1]);
});

test('download preserves solver clock, duplicate times, and scalar sample order', () => {
  const run = {times: [0, 1, 1], stage: [0, 0, 1], work: [0, 100, 100], clock: 'iteration', trace: {H: [2, 1, 3], qMode: [0, .2, .2], pMode: [0, 0, 0], qMean: [.1, .3, .3], pMean: [0, 0, 0]}};
  const csv = csvForRun(run).trim().split('\n');
  assert.equal(csv.length, 4);
  assert.match(csv[2], /^1,1,1,100,iteration,1,/);
  assert.match(csv[3], /^2,1,2,100,iteration,3,/);
  assert.deepEqual(phaseProject(run, 'mode').x, run.trace.qMode);
  assert.deepEqual(phaseProject(run, 'mean').y, run.trace.pMean);
});

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const catalog = read('catalog.json');
const audit = read('export_audit.json');

test('every indexed run has matching source audit, valid contours, and synchronized traces', () => {
  const indexed = catalog.collections.flatMap(c => c.families.flatMap(f => f.runs.map(r => ({family: f, run: r}))));
  assert.equal(indexed.length, catalog.sourceRuns);
  assert.equal(indexed.length, audit.length);
  const families = catalog.collections.flatMap(c => c.families);
  assert.ok(families.length > 0);
  assert.equal(new Set(families.map(f => f.id)).size, families.length);
  const auditMap = new Map(audit.map(a => [a.family + '/' + a.run, a]));
  const checked = new Map();
  for (const {family, run} of indexed) {
    assert.ok(existsSync(fileURLToPath(new URL(run.asset, root))));
    const source = auditMap.get(family.id + '/' + run.id);
    assert.ok(source, family.id + '/' + run.id);
    assert.equal(source.asset, run.asset);
    assert.ok(Math.abs(source.finalIoU - source.recordedIoU) < 1e-10);
    assert.ok(source.energyDecompositionError < 1e-7);
    let data = checked.get(run.asset);
    if (!data) {
      const raw = readFileSync(new URL(run.asset, root));
      assert.ok(run.asset.includes(createHash('sha256').update(raw).digest('hex').slice(0, 20)));
      data = JSON.parse(raw); checked.set(run.asset, data);
      const count = data.frames.length;
      for (const key of ['times', 'stage', 'work']) assert.equal(data[key].length, count);
      for (const values of Object.values(data.trace)) assert.equal(values.length, count);
      for (let i = 0; i < count; i++) {
        assert.equal(Buffer.from(data.frames[i].points, 'base64').length, data.frames[i].lengths.reduce((a, b) => a + b, 0) * 8);
        assert.ok(Math.abs(data.trace.H[i] - data.trace.V[i] - data.trace.K[i]) < 3e-10);
        assert.ok(data.trace.iou[i] >= 0 && data.trace.iou[i] <= 1);
        assert.ok(data.trace.K[i] >= -1e-10);
        assert.ok(data.trace.b0[i] >= 0 && data.trace.b1[i] >= 0);
        if (i) assert.ok(data.times[i] >= data.times[i - 1]);
      }
    }
    assert.ok(Math.abs(data.trace.iou.at(-1) - source.recordedIoU) < 1e-10);
    if (catalog.methods[run.method].kind !== 'ph') assert.ok(data.trace.K.every(value => value === 0));
    assert.equal(data.clock === 'iteration', run.method === 'ms_split_bregman');
  }
});

test('observation masks, encoded geometry, and panel source paths are complete', () => {
  for (const collection of catalog.collections) for (const family of collection.families) {
    const data = read(family.input);
    assert.equal(data.backgrounds.length, 4);
    assert.equal(Buffer.from(data.reference.points, 'base64').length, data.reference.lengths.reduce((a, b) => a + b, 0) * 8);
    for (const background of data.backgrounds) {
      if (family.domain === 'image') {
        assert.equal(Buffer.from(background.pixels, 'base64').length, data.n ** 2);
        const mask = Buffer.from(background.known, 'base64');
        assert.equal(mask.length, data.n ** 2);
        assert.ok(mask.every(value => value === 0 || value === 1));
        assert.ok(Math.abs(mask.reduce((a, b) => a + b, 0) / mask.length - background.coverage) < 1e-10);
      } else assert.ok(background.points.every(p => p.length === 2 && p.every(Number.isFinite)));
    }
    assert.equal(new Set(family.runs.map(r => r.id)).size, family.runs.length);
  }
});
