#!/usr/bin/env python3
"""Build the static Pages galleries from the offline archive and original motion HTML."""

from __future__ import annotations

import argparse
import base64
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "web_demo"
CASES = [
    "cloud_8301_crescent__sequential",
    "image_8301_split2__sequential",
    "cloud_8301_split3__sequential",
    "image_8301_merge__full",
    "cloud_8301_ring__full",
    "image_8301_hollow_square__sequential",
]
FIGURES = [
    ("primary_fields", "Implicit field over time", "Six saved states show the inferred level function, with the clean boundary overlaid."),
    ("primary_error", "Signed field difference", "Red marks overestimation of the clean binary reference. Blue marks underestimation."),
    ("primary_phase", "Hamiltonian and phase trajectories", "Each query stage has a frozen energy slice and an overlay of the saved field and momentum projections."),
    ("information", "Fisher information and feedback", "Spatial FIM maps, projected spectra, and dissipation traces track the measurement stages."),
]


def page(title, summary, active, content, base="./", script=""):
    links = (
        ("Explorer", "index.html#explorer"),
        ("Algorithms", "index.html#algorithms"),
        ("Static results", "results/index.html"),
        ("Sequential motion", "sequential_motion_gallery.html"),
    )
    nav = "\n      ".join(
        f'<a href="{base}{path}"{ " aria-current=\"page\"" if label == active else ""}>{label}</a>'
        for label, path in links
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{escape(summary, quote=True)}">
  <title>{escape(title)} | Implicit Dynamics Explorer</title>
  <link rel="stylesheet" href="{base}styles.css">
  <link rel="stylesheet" href="{base}gallery.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{base}index.html"><span class="brand-mark" aria-hidden="true">∿</span><span>Deformable Splines<span class="brand-sub">NUMERICAL EXPERIMENTS</span></span></a>
    <nav aria-label="Main navigation">
      {nav}
    </nav>
  </header>
  <main class="gallery-main">
    {content}
  </main>
  <footer><span>Deformable Splines · Implicit field benchmarks</span></footer>
  {script}
</body>
</html>
"""


def intro(title, summary, actions=""):
    return f"""<header class="gallery-intro">
      <h1>{escape(title)}</h1>
      <p>{escape(summary)}</p>
      {actions}
    </header>"""


def write_static(archive, catalog):
    directory = SITE / "results"
    directory.mkdir(exist_ok=True)
    families = {family["id"] for collection in catalog["collections"] for family in collection["families"]}
    cards = []
    with ZipFile(archive) as source:
        prefix = "implicit_offline_gallery/"
        manifest = json.loads(source.read(prefix + "manifest.json"))
        records = {case["case"]: case for case in manifest["cases"]}
        for case_id in CASES:
            record = records[case_id]
            shape = record["shape"]
            title = catalog["shapes"][shape]
            domain = {"image": "Noisy grayscale image", "cloud": "Noisy boundary cloud"}[record["domain"]]
            protocol = {"full": "Full observation", "sequential": "Sequential observation"}[record["visibility"]]
            context = f"{domain} · {protocol} · Seed {record['seed']}"
            family_id = f"fim__{record['domain']}__noisy__{shape}__{record['seed']}__{record['visibility']}"
            if family_id not in families:
                raise ValueError(f"Explorer case unavailable: {family_id}")
            relative = f"../assets/results/{case_id}"
            destination = SITE / "assets" / "results" / case_id
            destination.mkdir(parents=True, exist_ok=True)
            figures = []
            for stem, heading, description in FIGURES:
                for extension in ("png", "svg"):
                    name = f"{stem}.{extension}"
                    (destination / name).write_bytes(source.read(f"{prefix}cases/{case_id}/{name}"))
                figures.append(f"""<figure class="result-figure">
        <a href="{relative}/{stem}.png"><img src="{relative}/{stem}.png" alt="{escape(heading)} for {escape(title)}" loading="lazy"></a>
        <figcaption><h2>{escape(heading)}</h2><p>{escape(description)}</p>
          <div class="figure-links"><a href="{relative}/{stem}.png">Open full PNG</a><a href="{relative}/{stem}.svg">Open SVG</a></div>
        </figcaption>
      </figure>""")
            actions = f"""<div class="gallery-actions">
        <a class="gallery-link" href="index.html">All static cases</a>
        <a class="gallery-link" href="../index.html?case={family_id}#explorer">Open this case in Explorer</a>
      </div>"""
            case_page = intro(title, context, actions) + '<div class="result-grid">' + "\n".join(figures) + "</div>"
            (directory / f"{shape}.html").write_text(page(title, context, "Static results", case_page, "../"))
            cards.append(f"""<article class="result-card">
        <a href="{shape}.html"><img src="{relative}/primary_fields.png" alt="Field snapshots for {escape(title)}" loading="lazy"></a>
        <div class="card-details"><h2><a href="{shape}.html">{escape(title)}</a></h2>
          <p>{escape(context)}</p>
          <a class="gallery-link" href="{shape}.html">View case figures</a>
        </div>
      </article>""")
    summary = "Six saved cases from the FIM benchmark. Open a case to inspect field snapshots, signed error, Hamiltonian slices, and Fisher information."
    content = intro("Static results", summary) + '<div class="gallery-grid">' + "\n".join(cards) + "</div>"
    (directory / "index.html").write_text(page("Static results", summary, "Static results", content, "../"))


class MotionGallery(HTMLParser):
    def __init__(self):
        super().__init__()
        self.clips = []
        self.mode = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "article":
            self.mode = values.get("data-mode")
        if tag == "img" and self.mode in {"sequential_local", "sequential_cloud"}:
            prefix = "data:image/gif;base64,"
            src = values.get("src", "")
            if not src.startswith(prefix):
                raise ValueError("Expected an embedded GIF in the input gallery")
            self.clips.append((self.mode, values["alt"], base64.b64decode(src[len(prefix):], validate=True)))

    def handle_endtag(self, tag):
        if tag == "article":
            self.mode = None


def write_motion(original):
    parser = MotionGallery()
    parser.feed(original.read_text())
    if not parser.clips:
        raise ValueError("No sequential motion clips found")
    directory = SITE / "assets" / "sequential"
    directory.mkdir(parents=True, exist_ok=True)
    labels = {"sequential_local": "Sequential local field", "sequential_cloud": "Sequential boundary cloud"}
    cards = []
    for index, (mode, title, gif) in enumerate(parser.clips, 1):
        name = f"clip-{index:02d}"
        (directory / f"{name}.gif").write_bytes(gif)
        with Image.open(BytesIO(gif)) as image:
            width, height = image.size
            image.convert("RGB").save(directory / f"{name}.webp", quality=90)
        path = f"./assets/sequential/{name}"
        alt = f"{title}, {labels[mode].lower()}"
        cards.append(f"""<article class="motion-card" data-mode="{mode}">
        <header><h2>{escape(title)}</h2><p>{labels[mode]}</p></header>
        <img src="{path}.webp" data-poster="{path}.webp" data-animation="{path}.gif" alt="{escape(alt)}" width="{width}" height="{height}" loading="lazy">
        <div class="figure-links">
          <button type="button" class="button motion-toggle" aria-label="Play animation for {escape(alt)}">Play animation</button>
          <a href="{path}.gif">Open GIF</a>
        </div>
      </article>""")
    filters = """<div class="gallery-actions motion-filters" role="group" aria-label="Filter by observation">
        <button class="button" type="button" data-filter="all" aria-pressed="true">All</button>
        <button class="button" type="button" data-filter="sequential_local" aria-pressed="false">Local field</button>
        <button class="button" type="button" data-filter="sequential_cloud" aria-pressed="false">Boundary cloud</button>
      </div>"""
    summary = "Compare the original sequential local-field and boundary-cloud animations. Play clips individually or filter by observation type."
    content = intro("Sequential motion gallery", summary, filters) + '<div class="motion-grid">' + "\n".join(cards) + "</div>"
    (SITE / "sequential_motion_gallery.html").write_text(page(
        "Sequential motion gallery", summary, "Sequential motion", content,
        script='<script src="./motion-gallery.js" defer></script>',
    ))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--static-archive", type=Path, required=True)
    parser.add_argument("--motion-html", type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads((SITE / "catalog.json").read_text())
    write_static(args.static_archive, catalog)
    write_motion(args.motion_html)


if __name__ == "__main__":
    main()
