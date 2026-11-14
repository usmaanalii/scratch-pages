"""Reproduce the display counts without exporting lookup records."""
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPTS = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def summary(directory):
    for source in ('lane', 'mufradat'):
        subprocess.run([sys.executable, SCRIPTS / f'{source}-data/import.py',
                        '--expanded', '--output', directory / source], check=True)
    subprocess.run(['node', SCRIPTS / 'quran-data/import.mjs', '--output', directory / 'corpus'],
                   check=True, stdout=subprocess.DEVNULL)
    lane_report = directory / 'lane/coverage.json'
    mufradat_report = directory / 'mufradat/coverage.json'
    overlap_path = directory / 'overlap.json'
    subprocess.run([sys.executable, SCRIPTS / 'quran-data/lexicon.py',
                    '--lane', lane_report, '--mufradat', mufradat_report, '--output', overlap_path], check=True)

    lane, mufradat, overlap = map(read, (lane_report, mufradat_report, overlap_path))
    inventory = read(directory / 'corpus/lexicon-inventory.json')
    if inventory['corpusSha256'] != overlap['corpusSha256'] or inventory['referenceSha256'] != overlap['referenceSha256']:
        raise ValueError('The aggregate inputs do not share the pinned sources')
    words = inventory['words']
    roots = sum(any(stem['root'] for stem in word['stems']) for word in words)
    lemmas = sum(any(stem['lemma'] for stem in word['stems']) for word in words)
    keyed = sum(any(stem['root'] or stem['lemma'] for stem in word['stems']) for word in words)
    lane_roots, mufradat_roots = set(lane['roots']['mapped']), set(mufradat['roots']['mapped'])

    def dictionary_row(scope):
        group = overlap[scope]
        return dict(total=group['words'], lane=group['laneOnly'] + group['both'],
                    mufradat=group['mufradatOnly'] + group['both'], either=group['words'] - group['neither'])

    source = dictionary_row('source')
    return {
        'corpus': dict(chapters=len({word['chapter'] for word in words}), words=len(words),
                       withRoot=roots, withLemma=lemmas),
        'historical': dict(matched=overlap['verified']['words'],
                           reference=read(directory / 'corpus/coverage.json')['referenceOccurrences']),
        'dictionary': {
            'all': source,
            'keyed': dict(source, total=keyed),
            'roots': dict(total=len(inventory['roots']), lane=len(lane_roots),
                          mufradat=len(mufradat_roots), either=len(lane_roots | mufradat_roots)),
            'historical': dictionary_row('verified'),
        },
    }


if __name__ == '__main__':
    with TemporaryDirectory(prefix='quran-coverage-imports-') as directory:
        data = summary(Path(directory))
    Path(sys.argv[1]).write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
