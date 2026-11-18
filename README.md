# Implicit Dynamics Explorer — GitHub Pages package

This package contains the prebuilt interactive demo: 960 saved runs, independent
0.25×–4× playback, linked comparisons, energy/QoI/phase plots, numerical algorithm
paragraphs, and CSV/SVG downloads. Static results contains six selected FIM
cases, each with PNG and SVG plots. Sequential motion contains the 12 original
clips and observation filters. The prebuilt pages include local KaTeX fonts
and run directly on GitHub Pages.

1. Copy this package into the root of your intended GitHub repository, retaining
   `web_demo/` and `.github/workflows/implicit-demo-pages.yml`.
2. Select Settings → Pages → Build and deployment → Source → GitHub Actions.
3. Push to `main`, or manually run the Pages workflow. Its deployment reports
   the published URL. Edit the branch selector if your default branch differs.

For an existing Pages site, first integrate the demo into its current publish
folder; this standalone workflow publishes `web_demo/` as the site's root.

To review locally, run `python3 -m http.server 8000` from this folder and open
`http://localhost:8000/web_demo/`. Alternatively, build a single HTML file with
`python3 scripts/bundle_interactive_demo.py --output demo.html` and open it.

Run data/playback checks with `node --test web_demo/tests/core.test.js`.
See the gallery and equation build instructions in INTERACTIVE_DEMO.md.
See INTERACTIVE_DEMO.md for solver definitions, phase projections, clocks,
source provenance, and regeneration using the complete benchmark archive.
This package contains precomputed results; it performs no training or integration.
