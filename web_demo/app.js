import { frameAt, extent, ticks, nearestFrame, buildPath, csvForRun, phaseProject } from './core.js';
import { MATH } from './equations.js';

const $ = (selector, root = document) => root.querySelector(selector);
const NS = 'http://www.w3.org/2000/svg';
const palette = {H: '#263f58', V: '#30958c', K: '#c49142', qoi: '#3c87a1', b1: '#bd8956'};
const labels = {
  domain: {image: 'Grayscale image', cloud: 'Point cloud'},
  quality: {clean: 'Clean', noisy: 'Noisy'},
  visibility: {full: 'Full observation', sequential: 'Sequential scan', static: 'Static patch'}
};
const qois = {
  loss: {label: 'Observed MSE', keys: ['loss'], colors: [palette.qoi]},
  iou: {label: 'Intersection over union', keys: ['iou'], colors: [palette.qoi]},
  topology: {label: 'Components / holes', keys: ['b0', 'b1'], colors: [palette.qoi, palette.b1], step: true},
  momentum: {label: 'Momentum norm', keys: ['momentum'], colors: [palette.qoi]},
  residuals: {label: 'Primal / dual residuals', keys: ['primal', 'dual'], colors: [palette.qoi, palette.b1]}
};
let catalog, family, collection, inputData;
let panels = [], familyVersion = 0, lastTick = null;
const cache = new Map();
const contoursCache = new WeakMap();

async function resource(path) {
  if (!cache.has(path)) cache.set(path, (async () => {
    if (window.IMPLICIT_DEMO_DATA) {
      if (!(path in window.IMPLICIT_DEMO_DATA)) throw new Error(`Missing embedded data: ${path}`);
      return window.IMPLICIT_DEMO_DATA[path];
    }
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return response.json();
  })().catch(error => { cache.delete(path); throw error; }));
  return cache.get(path);
}

function option(select, value, text) {
  const node = document.createElement('option');
  node.value = value; node.textContent = text; select.append(node);
}

function fmt(value, precision = 3) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) < .001 || Math.abs(value) >= 10000) return value.toExponential(2);
  return Number(value.toPrecision(precision)).toString();
}

function svgElement(tag, attributes = {}, text = null) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== null) element.textContent = text;
  return element;
}

function scales(svg, xValues, yValues, xLabel, yLabel, stages = false) {
  svg.replaceChildren();
  const box = {left: 51, right: 407, top: 13, bottom: 154};
  const xd = stages ? [0, 4] : extent(xValues, .04), yd = extent(yValues, .10);
  const sx = x => box.left + (x - xd[0]) / (xd[1] - xd[0]) * (box.right - box.left);
  const sy = y => box.bottom - (y - yd[0]) / (yd[1] - yd[0]) * (box.bottom - box.top);
  for (const y of ticks(...yd, 4)) {
    svg.append(svgElement('line', {x1: box.left, x2: box.right, y1: sy(y), y2: sy(y), stroke: '#e9eff3', 'stroke-width': 1}));
    svg.append(svgElement('text', {x: box.left - 7, y: sy(y) + 3, 'text-anchor': 'end', fill: '#879aa7', 'font-size': 12}, fmt(y)));
  }
  const xticks = stages ? [0, 1, 2, 3, 4] : ticks(...xd, 4);
  for (const x of xticks) {
    if (stages && x > 0 && x < 4) svg.append(svgElement('line', {x1: sx(x), x2: sx(x), y1: box.top, y2: box.bottom, stroke: '#d6e3e9', 'stroke-dasharray': '3 4'}));
    svg.append(svgElement('text', {x: sx(x), y: box.bottom + 15, 'text-anchor': 'middle', fill: '#879aa7', 'font-size': 12}, fmt(x)));
  }
  svg.append(svgElement('line', {x1: box.left, x2: box.right, y1: box.bottom, y2: box.bottom, stroke: '#cfdee6'}));
  svg.append(svgElement('text', {x: (box.left + box.right) / 2, y: 184, 'text-anchor': 'middle', fill: '#899ca8', 'font-size': 11}, xLabel));
  if (yLabel) svg.append(svgElement('text', {x: 4, y: 9, fill: '#7b929f', 'font-size': 10}, yLabel));
  return {sx, sy, box};
}

function traceChart(svg, run, keys, colors, step = false) {
  const scale = scales(svg, run.times, keys.map(key => run.trace[key]), 'Observation-stage progress', '', true);
  keys.forEach((key, i) => {
    const path = svgElement('path', {
      d: buildPath(run.times, run.trace[key], scale.sx, scale.sy, step),
      fill: 'none', stroke: colors[i], 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    });
    path.append(svgElement('title', {}, key)); svg.append(path);
  });
  const cursor = svgElement('line', {y1: scale.box.top, y2: scale.box.bottom, stroke: '#91a9b8', 'stroke-width': 1, 'stroke-dasharray': '3 3'});
  const dots = keys.map((key, i) => svgElement('circle', {r: 3.0, fill: colors[i], stroke: 'white', 'stroke-width': 1}));
  svg.append(cursor, ...dots);
  return index => {
    const x = scale.sx(run.times[index]);
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x);
    dots.forEach((dot, i) => {
      const value = run.trace[keys[i]][index];
      dot.setAttribute('visibility', value == null ? 'hidden' : 'visible');
      if (value != null) { dot.setAttribute('cx', x); dot.setAttribute('cy', scale.sy(value)); }
    });
    svg.dataset.frame = String(index);
  };
}

function phaseChart(svg, run, mode, color) {
  const phase = phaseProject(run, mode);
  const scale = scales(svg, phase.x, phase.y, phase.xLabel, phase.yLabel);
  svg.append(svgElement('path', {d: buildPath(phase.x, phase.y, scale.sx, scale.sy), fill: 'none', stroke: color, 'stroke-width': 1.6, opacity: .65}));
  svg.append(svgElement('circle', {cx: scale.sx(phase.x[0]), cy: scale.sy(phase.y[0]), r: 3, fill: 'white', stroke: color, 'stroke-width': 1.4}));
  const marker = svgElement('circle', {r: 4.2, fill: color, stroke: 'white', 'stroke-width': 1.5});
  svg.append(marker);
  return index => {
    marker.setAttribute('cx', scale.sx(phase.x[index])); marker.setAttribute('cy', scale.sy(phase.y[index]));
    svg.dataset.frame = String(index);
  };
}

function unpackContour(contour) {
  if (contoursCache.has(contour)) return contoursCache.get(contour);
  const bytes = Uint8Array.from(atob(contour.points), c => c.charCodeAt(0));
  const data = new DataView(bytes.buffer);
  let offset = 0;
  const curves = contour.lengths.map(length => Array.from({length}, () => {
    const point = [data.getInt32(offset, true) / 10000, data.getInt32(offset + 4, true) / 10000];
    offset += 8; return point;
  }));
  contoursCache.set(contour, curves);
  return curves;
}

function backgroundCanvas(background, n) {
  if (!background.pixels) return null;
  const canvas = document.createElement('canvas'); canvas.width = n; canvas.height = n;
  const ctx = canvas.getContext('2d'), pixels = atob(background.pixels), known = atob(background.known);
  const image = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const source = (n - y - 1) * n + x, dest = (y * n + x) * 4;
    const seen = known.charCodeAt(source), value = pixels.charCodeAt(source);
    image.data[dest] = seen ? value : 224;
    image.data[dest + 1] = seen ? value : 233;
    image.data[dest + 2] = seen ? value : 238;
    image.data[dest + 3] = 255;
  }
  ctx.putImageData(image, 0, 0); return canvas;
}

function download(text, name, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function metricDescription(run) {
  if (collection.id !== 'fim') return 'This baseline collection uses the identity metric. The FIM controls are in the FIM experiment.';
  if (run.metric === 'none') return 'FIM off uses identity geometry for configuration feedback.';
  if (run.metric === 'isotropic') return 'The isotropic control substitutes the identity for the trace-normalized information. It uses the same weights and observations as FIM off.';
  return 'The measurement Jacobian J and working noise covariance R define the Fisher information F. Its trace-normalized form enters the occupancy feedback metric with weight λ = 1. The AT edge field uses identity feedback. Each query stage holds these operators fixed.';
}

function setEquation(element, key, fallback = '') {
  if (Object.hasOwn(MATH, key)) {
    // Only the versioned module contains trusted, pre-rendered markup.
    element.innerHTML = MATH[key];
  } else {
    element.textContent = fallback;
  }
}

class Panel {
  constructor(preferredRun) {
    this.root = $('#panel-template').content.firstElementChild.cloneNode(true);
    this.progress = 0; this.playing = false; this.speed = .5; this.hold = 0;
    this.index = -1; this.manualFrame = null; this.version = 0; this.run = null; this.runMeta = null;
    this.preferred = preferredRun;
    $('#panels').append(this.root);
    $('.run-select', this.root).addEventListener('change', () => this.load($('.run-select', this.root).value));
    $('.play-button', this.root).addEventListener('click', () => {
      const playing = !this.playing;
      for (const p of linked(this)) p.setPlaying(playing);
    });
    $('.restart-button', this.root).addEventListener('click', () => {
      for (const p of linked(this)) p.seek(0);
    });
    $('.speed-select', this.root).addEventListener('change', event => {
      for (const p of linked(this)) { p.speed = Number(event.target.value); $('.speed-select', p.root).value = String(p.speed); }
    });
    $('.scrubber', this.root).addEventListener('input', event => {
      const index = Number(event.target.value);
      for (const p of linked(this)) {
        p.setPlaying(false);
        if (p.run) p.seekFrame(p === this ? index : nearestFrame(p.run.times, this.run.times[index], index));
      }
    });
    $('.qoi-select', this.root).addEventListener('change', () => { this.buildQoi(); this.draw(true); });
    $('.phase-select', this.root).addEventListener('change', () => { this.buildPhase(); this.draw(true); });
    $('.remove-panel', this.root).addEventListener('click', () => {
      this.version++; this.observer.disconnect(); this.root.remove(); panels = panels.filter(p => p !== this); updatePanelLabels();
    });
    $('.download-csv', this.root).addEventListener('click', () => {
      if (this.run) download(csvForRun(this.run), this.filename() + '.csv', 'text/csv');
    });
    $('.download-svg', this.root).addEventListener('click', () => this.downloadPlots());
    this.observer = new ResizeObserver(() => this.drawScene());
    this.observer.observe($('.scene-wrap', this.root));
  }

  setFamily() {
    this.setPlaying(false); this.progress = 0; this.manualFrame = null; this.hold = 0;
    const select = $('.run-select', this.root), old = select.value || this.preferred;
    select.replaceChildren();
    for (const run of family.runs) option(select, run.id, run.label);
    select.value = family.runs.some(run => run.id === old) ? old : 'neural_ph__none';
    if (!select.value) select.value = family.runs[0].id;
    return this.load(select.value);
  }

  async load(id) {
    const version = ++this.version, activeFamily = family, activeInput = inputData;
    this.setPlaying(false); this.progress = 0; this.manualFrame = null; this.hold = 0;
    this.run = null; this.index = -1;
    this.root.classList.add('busy'); $('.panel-loading', this.root).hidden = false; $('.panel-error', this.root).hidden = true;
    this.toggleControls(false);
    const meta = activeFamily.runs.find(run => run.id === id);
    try {
      const run = await resource(meta.asset);
      if (version !== this.version || family !== activeFamily) return;
      this.run = run; this.runMeta = meta; this.input = activeInput; this.familyId = activeFamily.id;
      this.backgrounds = this.input.backgrounds.map(bg => backgroundCanvas(bg, this.input.n));
      this.color = catalog.methods[meta.method].color;
      $('.method-dot', this.root).style.background = this.color;
      $('.trajectory-key', this.root).style.borderColor = this.color;
      $('.kind-tag', this.root).textContent = meta.metric === 'none' ? {ph: 'Phase-space pH', gradient: 'Gradient flow', iteration: 'Iteration solver'}[catalog.methods[meta.method].kind] : catalog.metricLabels[meta.metric];
      const scrubber = $('.scrubber', this.root); scrubber.max = run.frames.length - 1; scrubber.value = 0;
      const select = $('.qoi-select', this.root), oldQoi = select.value || 'loss'; select.replaceChildren();
      for (const [key, spec] of Object.entries(qois)) {
        if (key !== 'residuals' || run.trace.primal.some(x => x !== null)) option(select, key, spec.label);
      }
      select.value = [...select.options].some(o => o.value === oldQoi) ? oldQoi : 'loss';
      this.energyCursor = traceChart($('.energy-chart', this.root), run, ['H', 'V', 'K'], [palette.H, palette.V, palette.K]);
      this.buildQoi(); this.buildPhase(); this.details();
      this.toggleControls(true);
      const source = $('#linked').checked && panels.find(panel => panel !== this && panel.run && panel.familyId === activeFamily.id);
      if (source) {
        this.speed = source.speed; $('.speed-select', this.root).value = String(this.speed);
        this.progress = source.progress; this.hold = source.hold; this.setPlaying(source.playing);
        if (!source.playing && source.manualFrame !== null) this.manualFrame = nearestFrame(this.run.times, source.run.times[source.index], source.index);
      }
      this.draw(true);
    } catch (error) {
      if (version !== this.version) return;
      const box = $('.panel-error', this.root); box.textContent = error.message; box.hidden = false;
    } finally {
      if (version === this.version) { this.root.classList.remove('busy'); $('.panel-loading', this.root).hidden = true; }
    }
  }

  toggleControls(enabled) {
    for (const selector of ['.play-button', '.restart-button', '.scrubber', '.download-csv', '.download-svg', '.qoi-select', '.phase-select']) $(selector, this.root).disabled = !enabled;
  }

  details() {
    const method = catalog.methods[this.runMeta.method];
    $('.method-description', this.root).textContent = method.description;
    setEquation($('.method-equation', this.root), this.runMeta.method, method.equation);
    $('.metric-description', this.root).textContent = metricDescription(this.runMeta);
    const metricEquation = $('.metric-equation', this.root);
    metricEquation.hidden = method.kind !== 'ph';
    setEquation(metricEquation, collection.id === 'fim' ? 'metric_' + this.runMeta.metric : 'metric_none');
    const settings = collection.settings;
    $('.run-provenance', this.root).textContent = `Grid ${this.input.n} × ${this.input.n}; domain [−${this.input.extent}, ${this.input.extent}]². ` +
      (this.run.clock === 'iteration' ? `${this.run.iterationBudget} Bregman iterations per stage. ` : `Base relaxation step ${settings.eval_dt}; ${this.runMeta.method === 'dirichlet' ? 'backward Euler linear solve' : 'adaptive energy backtracking'}. `) +
      `${this.run.frames.length} saved states. Solver wall time ${fmt(this.runMeta.wallSeconds)} s in the recorded evaluation; browser playback excludes computation. ` +
      (collection.id === 'fim' ? 'Metric variants share frozen parameters within each domain. The phase-trained pure NN has a separate checkpoint from the earlier gradient-trained NN.' : 'These are the original image-baseline checkpoints; the later FIM collection has separate checkpoints.');
    $('.complete-tag', this.root).textContent = this.run.complete ? 'Completed' : `Stopped: ${this.run.status}`;
  }

  buildQoi() {
    if (!this.run) return;
    const spec = qois[$('.qoi-select', this.root).value];
    this.qoiCursor = traceChart($('.qoi-chart', this.root), this.run, spec.keys, spec.colors, spec.step);
  }

  buildPhase() {
    if (this.run) this.phaseCursor = phaseChart($('.phase-chart', this.root), this.run, $('.phase-select', this.root).value, this.color);
  }

  setPlaying(playing) {
    this.playing = Boolean(playing && this.run);
    this.manualFrame = null;
    $('.play-button', this.root).textContent = this.playing ? 'Ⅱ' : '▶︎';
    $('.play-button', this.root).setAttribute('aria-label', this.playing ? 'Pause this trajectory' : 'Play this trajectory');
    this.root.dataset.playing = String(this.playing);
    updatePlayAll();
  }

  seek(progress) {
    this.progress = progress; this.manualFrame = null; this.hold = 0; this.draw(true);
  }

  seekFrame(index) {
    if (!this.run) return;
    this.manualFrame = index;
    this.progress = (this.run.times[index] - this.run.times[0]) / Math.max(this.run.times.at(-1) - this.run.times[0], 1e-12);
    this.hold = 0; this.draw(true);
  }

  advance(delta) {
    if (!this.playing || !this.run) return;
    const seconds = catalog.playbackSeconds || 2, duration = seconds * 1000, active = duration * .9;
    if (this.progress >= 1) {
      this.hold += delta * this.speed;
      if (this.hold >= duration - active) { this.hold = 0; this.progress = 0; }
    } else this.progress = Math.min(1, this.progress + delta * this.speed / active);
    this.draw();
  }

  draw(force = false) {
    if (!this.run) return;
    const index = this.manualFrame === null ? frameAt(this.run.times, this.progress) : this.manualFrame;
    if (!force && index === this.index) return;
    this.index = index;
    this.root.dataset.frame = String(index); this.root.dataset.stage = String(this.run.stage[index] + 1);
    $('.scrubber', this.root).value = index;
    $('.energy-value', this.root).textContent = 'H ' + fmt(this.run.trace.H[index]);
    const qoi = $('.qoi-select', this.root).value;
    $('.qoi-value', this.root).textContent = qois[qoi].keys.map(key => fmt(this.run.trace[key][index])).join(' / ');
    $('.stat-iou', this.root).textContent = fmt(this.run.trace.iou[index]);
    $('.stat-topology', this.root).textContent = `${this.run.trace.b0[index]} / ${this.run.trace.b1[index]}`;
    $('.stat-momentum', this.root).textContent = fmt(this.run.trace.momentum[index]);
    $('.stat-frame', this.root).textContent = `${index + 1} / ${this.run.frames.length}`;
    const solverWork = this.run.work[index];
    $('.clock-readout', this.root).textContent = this.run.clock === 'iteration' ? `Iteration ${fmt(solverWork, 5)}` : `Relaxation ${fmt(solverWork, 4)}`;
    const stage = this.run.stage[index];
    $('.state-tag', this.root).textContent = `Stage ${stage + 1} / 4`;
    $('.coverage-tag', this.root).textContent = this.input.domain === 'image' ? `${Math.round(this.input.backgrounds[stage].coverage * 100)}% pixels received` : `${this.input.backgrounds[stage].points.length} points received`;
    this.energyCursor(index); this.qoiCursor(index); this.phaseCursor(index); this.drawScene();
  }

  drawScene() {
    if (!this.run || this.index < 0) return;
    const canvas = $('.scene', this.root), ctx = canvas.getContext('2d');
    const size = canvas.getBoundingClientRect().width;
    if (!size) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(size * ratio)) { canvas.width = Math.round(size * ratio); canvas.height = canvas.width; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#e9f0f3'; ctx.fillRect(0, 0, size, size);
    const border = 15, width = size - 2 * border, e = this.input.extent;
    const sx = x => border + (x + e) / (2 * e) * width;
    const sy = y => size - border - (y + e) / (2 * e) * width;
    const stage = this.run.stage[this.index], background = this.input.backgrounds[stage];
    if (this.backgrounds[stage]) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.backgrounds[stage], border, border, width, width);
    } else {
      ctx.fillStyle = '#f8fafb'; ctx.fillRect(border, border, width, width);
      ctx.strokeStyle = '#e6edf1'; ctx.lineWidth = .6;
      for (let v = -1; v <= 1; v += .5) {
        ctx.beginPath(); ctx.moveTo(sx(v), border); ctx.lineTo(sx(v), size - border); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(border, sy(v)); ctx.lineTo(size - border, sy(v)); ctx.stroke();
      }
      ctx.fillStyle = '#d5a65b';
      for (const [x, y] of background.points) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 1.25, 0, 2 * Math.PI); ctx.fill(); }
    }
    ctx.save(); ctx.beginPath(); ctx.rect(border, border, width, width); ctx.clip();
    const draw = (contour, color, lineWidth, dashed) => {
      ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash(dashed ? [4, 3] : []);
      for (const curve of unpackContour(contour)) {
        ctx.beginPath(); curve.forEach(([x, y], i) => i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))); ctx.stroke();
      }
    };
    if ($('#reference').checked) draw(this.input.reference, '#c69e55', 1.15, true);
    // A pale under-stroke keeps the numerical contour legible on dark images.
    draw(this.run.frames[this.index], '#ffffffb8', 3.5, false);
    draw(this.run.frames[this.index], this.color, 1.9, false);
    ctx.restore();
    ctx.setLineDash([]); ctx.strokeStyle = '#d5e1e8'; ctx.lineWidth = .7; ctx.strokeRect(border, border, width, width);
    canvas.setAttribute('aria-label', `${family.label}: ${this.runMeta.label}, saved state ${this.index + 1}, observation stage ${stage + 1}`);
    canvas.dataset.frame = String(this.index);
  }

  filename() { return `${family.id}__${this.runMeta.id}`; }

  downloadPlots() {
    if (!this.run) return;
    const svg = svgElement('svg', {xmlns: NS, width: 840, height: 1380, viewBox: '0 0 420 690'});
    svg.append(svgElement('rect', {width: 420, height: 690, fill: 'white'}));
    svg.append(svgElement('text', {x: 15, y: 20, fill: '#233c52', 'font-family': 'sans-serif', 'font-size': 12}, this.runMeta.label));
    svg.append(svgElement('text', {x: 15, y: 37, fill: '#6c7f90', 'font-family': 'sans-serif', 'font-size': 9}, `${family.label} · ${family.domain} · ${family.quality} · ${family.visibility} · seed ${family.seed}`));
    const titles = ['Energy: Hamiltonian H / potential V / kinetic K', qois[$('.qoi-select', this.root).value].label, 'Phase projection: ' + $('.phase-select', this.root).selectedOptions[0].textContent];
    for (const [i, selector] of ['.energy-chart', '.qoi-chart', '.phase-chart'].entries()) {
      svg.append(svgElement('text', {x: 15, y: 59 + i * 207, fill: '#526d7f', 'font-family': 'sans-serif', 'font-size': 10}, titles[i]));
      const group = svgElement('g', {transform: `translate(0,${67 + i * 207})`, 'font-family': 'sans-serif'});
      group.append(...[...$(selector, this.root).childNodes].map(node => node.cloneNode(true))); svg.append(group);
    }
    download(new XMLSerializer().serializeToString(svg), this.filename() + '_plots.svg', 'image/svg+xml');
  }
}

function linked(panel) { return $('#linked').checked ? panels : [panel]; }

function updatePlayAll() {
  $('#play-all').innerHTML = panels.some(p => p.playing) ? '<span aria-hidden="true">Ⅱ</span> Pause all' : '<span aria-hidden="true">▶︎</span> Play all';
}

function updatePanelLabels() {
  $('#panels').classList.toggle('single', panels.length === 1);
  panels.forEach((panel, i) => {
    const letter = String.fromCharCode(65 + i);
    $('.panel-letter', panel.root).textContent = `PANEL ${letter}`;
    panel.root.setAttribute('aria-label', `Comparison panel ${letter}`);
    for (const [selector, text] of [['.run-select', 'Algorithm and metric'], ['.speed-select', 'Playback speed'], ['.scrubber', 'Saved trajectory progress']]) $(selector, panel.root).setAttribute('aria-label', `${text}, panel ${letter}`);
    $('.remove-panel', panel.root).disabled = panels.length === 1;
  });
  $('#add-panel').disabled = panels.length >= 4;
  updatePlayAll();
}

function algorithms() {
  const keys = [...new Set(family.runs.map(run => run.method))];
  const list = $('#algorithm-list'); list.replaceChildren();
  keys.forEach(key => {
    const method = catalog.methods[key], card = document.createElement('article'); card.className = 'algorithm-card';
    const h3 = document.createElement('h3'), dot = document.createElement('i'); dot.style.background = method.color;
    h3.append(dot, document.createTextNode(method.name));
    const p = document.createElement('p'); p.textContent = method.description;
    const equation = document.createElement('div');
    equation.className = 'equation-block';
    setEquation(equation, key, method.equation);
    card.append(h3, p, equation); list.append(card);
  });
}

function setChoices(key, candidates, preferred) {
  const select = $('#' + key), current = preferred ?? select.value;
  const values = [...new Set(candidates.map(f => String(f[key])))];
  select.replaceChildren();
  for (const value of values) option(select, value, key === 'shape' ? catalog.shapes[value] : labels[key]?.[value] || value);
  select.value = values.includes(String(current)) ? current : values[0];
  select.disabled = values.length < 2;
  return candidates.filter(f => String(f[key]) === select.value);
}

async function changeFamily(preferences = {}) {
  const version = ++familyVersion;
  $('#add-panel').disabled = true;
  collection = catalog.collections.find(item => item.id === $('#collection').value);
  let candidates = collection.families;
  for (const key of ['domain', 'quality', 'shape', 'visibility', 'seed']) candidates = setChoices(key, candidates, preferences[key]);
  family = candidates[0];
  $('#global-error').hidden = true;
  for (const panel of panels) {
    panel.setPlaying(false); panel.version++; panel.run = null; panel.index = -1;
    panel.toggleControls(false); panel.root.classList.add('busy'); $('.panel-loading', panel.root).hidden = false;
  }
  $('#context-description').textContent = `${collection.description} ${labels.visibility[family.visibility]}; four update stages, ${collection.settings.grid_size} × ${collection.settings.grid_size} grid.`;
  try {
    const data = await resource(family.input);
    if (version !== familyVersion) return;
    inputData = data;
    await Promise.all(panels.map(panel => panel.setFamily()));
    if (version !== familyVersion) return;
    algorithms();
    updatePanelLabels();
    if (!window.IMPLICIT_DEMO_DATA) {
      const url = new URL(location.href); url.searchParams.set('case', family.id); history.replaceState(null, '', url);
    }
  } catch (error) {
    if (version === familyVersion) { $('#global-error').textContent = error.message; $('#global-error').hidden = false; }
  }
}

async function init() {
  document.querySelectorAll('[data-math]').forEach(element => {
    setEquation(element, element.dataset.math, element.textContent);
  });
  catalog = await resource('catalog.json');
  $('#run-count').textContent = catalog.sourceRuns.toLocaleString();
  $('#method-count').textContent = Object.keys(catalog.methods).length;
  const select = $('#collection');
  catalog.collections.forEach(item => option(select, item.id, item.label));
  const requested = new URL(location.href).searchParams.get('case');
  const requestedFamily = catalog.collections.flatMap(item => item.families).find(item => item.id === requested);
  select.value = requestedFamily?.collection || catalog.collections[0].id;
  panels = [new Panel('neural_ph__none'), new Panel(select.value === 'fim' ? 'neural_ph__fim' : 'dirichlet__none')];
  updatePanelLabels();
  for (const id of ['collection', 'domain', 'quality', 'shape', 'visibility', 'seed']) $('#' + id).addEventListener('change', () => changeFamily());
  $('#reference').addEventListener('change', () => {
    panels.forEach(panel => panel.drawScene());
    document.querySelectorAll('.scene-legend .reference-key').forEach(key => key.parentElement.hidden = !$('#reference').checked);
  });
  $('#play-all').addEventListener('click', () => {
    const play = !panels.some(panel => panel.playing); panels.forEach(panel => panel.setPlaying(play));
  });
  $('#reset-all').addEventListener('click', () => panels.forEach(panel => { panel.setPlaying(false); panel.seek(0); }));
  $('#linked').addEventListener('change', () => {
    if (!$('#linked').checked || !panels.length) return;
    const source = panels[0];
    panels.slice(1).forEach(panel => {
      panel.speed = source.speed; $('.speed-select', panel.root).value = String(source.speed);
      panel.seek(source.progress); panel.setPlaying(source.playing);
      panel.hold = source.hold;
      if (source.run && panel.run && !source.playing && source.manualFrame !== null) panel.seekFrame(nearestFrame(panel.run.times, source.run.times[source.index], source.index));
    });
  });
  $('#add-panel').addEventListener('click', () => {
    if (panels.length >= 4) return;
    const used = new Set(panels.map(p => $('.run-select', p.root).value));
    const meta = family.runs.find(run => !used.has(run.id)) || family.runs[0];
    const panel = new Panel(meta.id); panels.push(panel); updatePanelLabels(); panel.setFamily();
  });
  $('#download-catalog').addEventListener('click', () => download(JSON.stringify(catalog, null, 2), 'experiment_index.json', 'application/json'));
  await changeFamily(requestedFamily || {domain: 'image', quality: 'noisy', shape: 'hollow_square', visibility: 'sequential', seed: '8301'});
  function tick(now) {
    const delta = lastTick == null ? 0 : Math.min(now - lastTick, 100);
    lastTick = now; panels.forEach(panel => panel.advance(delta)); requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => { lastTick = null; });
  requestAnimationFrame(tick);
}

init().catch(error => {
  const box = $('#global-error');
  box.textContent = error.message + (location.protocol === 'file:' && !window.IMPLICIT_DEMO_DATA ? ' Serve this folder over HTTP, or open the supplied standalone HTML.' : '');
  box.hidden = false;
});
