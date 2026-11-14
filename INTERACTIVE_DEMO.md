# Interactive implicit-dynamics demo

The static viewer replays saved numerical trajectories and plots their scalar
traces at the same recorded state. The supplied standalone HTML contains all
data and works when opened directly. The `web_demo/` directory is the smaller,
lazy-loaded version for HTTP hosting and GitHub Pages. Both contain the same
960 runs and 120 observation cases.

## Use and publish

1. Open `Implicit_Dynamics_Interactive_Demo.html` for a local review. Alternatively,
   serve the repository with `python3 -m http.server 8000` and open
   `http://localhost:8000/web_demo/`. The prebuilt viewer has no install step.
2. Copy `web_demo/` and `.github/workflows/implicit-demo-pages.yml` to the root
   of the intended GitHub repository. The separate Pages ZIP already has this
   layout. Keep the `assets/data/` directory and the `.nojekyll` file.
3. In the repository, set **Settings → Pages → Build and deployment → Source →
   GitHub Actions**. Push the files to `main`, or run the workflow manually.
   Change the workflow branch if the repository uses a different default branch.
4. The completed deployment exposes the Pages URL through the `github-pages`
   environment. Asset URLs are relative, so the page works under a project
   path such as `/repository-name/` and under a root domain.

The workflow follows the official [GitHub Pages Actions example](https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically).
It checks out the repository, configures Pages, uploads `web_demo/`, and
deploys that static artifact. No repository or live deployment was created
for this delivery because a destination repository was not specified.
The workflow is dedicated to this demo. If the intended repository already
hosts another Pages site, integrate `web_demo/` into that site's build and
publish directory before enabling this workflow.

## Controls

- Choose the experiment, observation, noise quality, shape, information access,
  and evaluation seed. Two panels open by default; up to four can be compared.
- Choose an algorithm and metric independently in each panel. Playback speeds
  are 0.25×, 0.5×, 1×, 2×, and 4×. At 1×, a loop lasts about two seconds,
  including a brief hold of the final state. This speed affects display only.
- Drag a timeline, or use its keyboard arrow keys, to inspect each stored state.
  Both sides of an observation boundary can be inspected even when the two
  states have the same query-progress coordinate.
- **Link timelines** aligns progress and speed; changing a panel's algorithm
  preserves the linked position. Independent QoI and phase-basis choices remain
  available. **Reset** pauses all panels at the shared initial state.
- Download the complete scalar traces as CSV, or the three current plots as
  SVG. The dashed clean scoring contour can be hidden; all IoU values continue
  to use the same evaluation target.

## Included experiments

- **FIM ablation:** 528 runs on noisy images and noisy boundary clouds, with
  sequential and full observations, six shapes, and two seeds. The three pH
  methods have FIM-off, isotropic, and FIM-on variants. The earlier pure NN
  gradient potential and its frozen pH lift are retained as controls. All
  metric comparisons within a method/domain use frozen parameters. No SF or
  global-pose block enters these implicit-field experiments.
- **Image baselines:** 432 runs on clean/noisy grayscale images, with full,
  sequential, and static-patch observations. Methods are Dirichlet, relaxed
  two-phase MS/Split Bregman, fixed AT gradient, fixed AT pH, NN+AT pH, and pure
  NN gradient. The original image-baseline checkpoints are distinct from the
  later FIM checkpoints. Each dataset selector keeps only available cases.

The six shapes are crescent, two components, three components, merger,
circular annulus, and hollow square. The evaluation seeds are 8301 and 8302.
The prebuilt web data includes both result collections. The full benchmark
archive retains the latest FIM raw results; older raw image results can be
regenerated with `scripts/run_image_implicit.sh` or obtained from the earlier
image benchmark bundle.

## Numerical conventions

The occupancy field is `u`; the AT auxiliary edge field is `a`. The stored
configuration is `q = (u,a)`, with conjugate momentum `p`. Pure NN potentials
use `u` alone, with an inert stored edge block. At each observation stage,
the potential is `V(q; observation)` and the Hamiltonian is
`H = V + 0.5 mean(pᵀ M⁻¹ p)`. The grid pairing is the arithmetic grid mean,
consistent with the source solver's gradient convention. The page defines
each potential and update rule in a short paragraph and equation.

`H` is the recorded Hamiltonian. The exporter computes `K` from the saved
momentum and the actual observation-conditioned mass; `V = H − K`. Gradient
and iterative methods have `K = 0`. For neural methods, the exporter also
re-evaluates the potential from the saved field and frozen model weights.
The maximum discrepancy in this export is below `2.4e-9`, consistent with
stored-state roundoff. The exported final IoU agrees with every source CSV
entry. Energies are model-specific; their absolute levels do not define a
common performance ranking across different potentials.

The QoI menu includes observed weighted MSE, clean-target IoU, component and
hole counts, and the occupancy-momentum norm. Split Bregman also has primal
and dual residuals. Component counts use 8-connected foreground; holes use
4-connected padded background. Tiny components remain in both contours and
topology counts. This page adds no new training or simulation results.

Let `u₀` be the shared initial occupancy and `g_final` the final received field.
The default phase basis is
`v = (g_final − u₀) / sqrt(mean((g_final − u₀)²))`, with a numerical floor for
a zero direction. The plotted coordinates are
`q_v = mean((u − u₀)v)` and `p_v = mean(p_u v)`. This common, fixed basis
is for offline display and uses received observations rather than clean
truth. It does not feed a future observation into a solver. The alternative
phase plot shows `mean(u)` and `mean(p_u)`. A two-dimensional projection
cannot describe the complete field phase space.

Every chart cursor, contour, phase marker, and scalar readout uses the same
saved frame index. Playback holds states between samples; it does not
interpolate fields or smooth topology. Each run has 20 saved states. Contour
coordinates are quantized to `1e-4` world units for drawing; scalar traces
retain ten decimal places. The browser never integrates a vector field.
The original GIF timing is represented by this state replay, so playback
controls and charts have one common clock.

The horizontal chart coordinate spans four observation/update stages.
Flow methods use numerical relaxation time; Split Bregman uses 100 iterations
per stage. The separate solver readout preserves that distinction. At a new
query the potential, confidence, and sometimes mass change while the solver
state continues. Duplicate horizontal coordinates preserve the corresponding
energy and observation-loss jumps. On automatic playback, the later state
at a duplicate coordinate is selected; manual seeking exposes both records.
The static-patch and full-observation controls still have four update stages.

## Regenerate and check

From a repository containing both raw result collections:

```bash
python3 -m pip install -r requirements-topology.txt
python3 scripts/export_interactive_demo.py --output web_demo \
  --standalone Implicit_Dynamics_Interactive_Demo.html
node --test web_demo/tests/core.test.js
```

An explicit selection such as `--collections fim` exports only that available
collection. Missing result directories are skipped; a run with no available
collection fails. Regeneration requires the NPZ rollouts, input observations,
evaluation CSVs/settings, and frozen checkpoints. The prebuilt static page
and standalone HTML work without these Python dependencies or raw files.

For a standalone export from an already-built `web_demo/`, without reading
raw results or rerunning energy evaluation:

```bash
python3 scripts/bundle_interactive_demo.py \
  --output Implicit_Dynamics_Interactive_Demo.html
```

The web export uses SHA-256-based asset filenames and deduplicates identical
controls. `export_audit.json` maps every indexed run to its source NPZ hash,
final IoU, frame count, and energy-decomposition check. Node tests validate
all assets, array lengths, masks, contour encodings, final metrics, energy
decomposition, solver clocks, missing-value chart gaps, and duplicate-query
frame selection. Browser checks cover independent and linked playback,
saved-state seeking, collection/observation changes, numerical detail panels,
and the CSV/SVG download actions. Replaying the stored data does not test the
long-training scripts or establish improved scientific performance.
