/* Pure functions shared by the viewer, offline bundle, and data checks. */
export function frameAt(times, progress) {
  if (!times.length) return -1;
  const target = times[0] + Math.max(0, Math.min(1, progress)) * (times.at(-1) - times[0]);
  let lo = 0, hi = times.length;
  // Rightmost match selects the newly received observation at a stage boundary.
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] <= target + 1e-12) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

export function nearestFrame(times, target, preferredIndex = null) {
  if (!times.length) return -1;
  if (preferredIndex !== null && Math.abs(times[preferredIndex] - target) < 1e-12) return preferredIndex;
  let best = 0;
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(times[i] - target) <= Math.abs(times[best] - target)) best = i;
  }
  return best;
}

export function extent(values, padding = 0.08) {
  const finite = values.flat(Infinity).filter(x => typeof x === 'number' && Number.isFinite(x));
  if (!finite.length) return [0, 1];
  let low = Math.min(...finite), high = Math.max(...finite);
  const delta = high === low ? Math.max(Math.abs(low) * 0.1, 0.1) : (high - low) * padding;
  return [low - delta, high + delta];
}

export function ticks(low, high, count = 4) {
  return Array.from({length: count}, (_, i) => low + (high - low) * i / (count - 1));
}

export function buildPath(xs, ys, scaleX, scaleY, step = false) {
  let result = '', active = false;
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (xs[i] == null || ys[i] == null || !Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) {
      active = false;
      continue;
    }
    const x = scaleX(xs[i]).toFixed(3), y = scaleY(ys[i]).toFixed(3);
    result += active ? (step ? `H${x}V${y}` : `L${x},${y}`) : `M${x},${y}`;
    active = true;
  }
  return result;
}

export function phaseProject(run, mode) {
  return mode === 'mean'
    ? {x: run.trace.qMean, y: run.trace.pMean, xLabel: 'mean u', yLabel: 'mean pᵤ'}
    : {x: run.trace.qMode, y: run.trace.pMode, xLabel: 'qᵥ = ⟨u−u₀,v⟩', yLabel: 'pᵥ = ⟨pᵤ,v⟩'};
}

export function csvForRun(run) {
  const keys = Object.keys(run.trace);
  const cells = value => value == null ? '' : /[,"\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  const rows = [['frame', 'query_progress', 'stage', 'solver_work', 'solver_clock', ...keys]];
  for (let i = 0; i < run.times.length; i++) {
    rows.push([i, run.times[i], run.stage[i] + 1, run.work[i], run.clock, ...keys.map(key => run.trace[key][i])]);
  }
  return rows.map(row => row.map(cells).join(',')).join('\n') + '\n';
}
