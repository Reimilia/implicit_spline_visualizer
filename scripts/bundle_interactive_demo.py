#!/usr/bin/env python3
"""Bundle the prebuilt viewer as one local-file-compatible HTML (stdlib only)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT = "import { frameAt, extent, ticks, nearestFrame, buildPath, csvForRun, phaseProject } from './core.js';"


def bundle(source: Path, destination: Path) -> None:
    source = source.resolve()
    index = (source / 'index.html').read_text()
    style = (source / 'styles.css').read_text()
    app = (source / 'app.js').read_text()
    core = (source / 'core.js').read_text()
    if app.count(IMPORT) != 1:
        raise ValueError('Update the standalone bundler for the current core import')
    app = app.replace(IMPORT, '')
    core = core.replace('export function ', 'function ').replace('export const ', 'const ')
    catalog = json.loads((source / 'catalog.json').read_text())
    referenced = set()
    for collection in catalog['collections']:
        for family in collection['families']:
            referenced.add(family['input'])
            referenced.update(run['asset'] for run in family['runs'])
    records = {'catalog.json': catalog}
    for path in sorted(referenced):
        file = (source / path).resolve()
        if not file.is_relative_to(source):
            raise ValueError('Asset outside the static root')
        records[path] = json.loads(file.read_text())
    payload = json.dumps(records, separators=(',', ':'), ensure_ascii=False).replace('<', r'\u003c')
    index = index.replace('<link rel="stylesheet" href="./styles.css">', '<style>' + style + '</style>')
    index = index.replace('<script type="module" src="./app.js"></script>',
        '<script>window.IMPLICIT_DEMO_DATA=' + payload + ';</script><script>' + core + '\n' + app + '</script>')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(index)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'web_demo')
    parser.add_argument('--output', type=Path, default=ROOT / 'Implicit_Dynamics_Interactive_Demo.html')
    args = parser.parse_args()
    bundle(args.source, args.output)
    print(f'Wrote {args.output} ({args.output.stat().st_size / 2**20:.1f} MiB)')


if __name__ == '__main__':
    main()
