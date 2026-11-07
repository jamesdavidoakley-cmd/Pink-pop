#!/usr/bin/env python3
"""Turn the Lichess puzzle database (CC0) into small, theme-tagged packs for
King Hunt. Run once, commit the output under content/puzzles/.

    pip install zstandard
    python3 scripts/build-puzzles.py path/to/lichess_db_puzzle.csv.zst

CSV columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
`Moves` begins with the opponent's setup move; the rest is the solution.
"""
import csv, io, json, os, sys
import zstandard

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'content', 'puzzles')
os.makedirs(OUT, exist_ok=True)

# Attack-first curriculum themes → pack files. Order matters for the ladder.
PACKS = {
    'mateIn1': 'mate-in-1', 'mateIn2': 'mate-in-2', 'backRankMate': 'back-rank',
    'smotheredMate': 'smothered', 'anastasiaMate': 'anastasia', 'arabianMate': 'arabian',
    'hookMate': 'hook', 'bodenMate': 'boden', 'doubleBishopMate': 'double-bishop',
    'fork': 'fork', 'pin': 'pin', 'skewer': 'skewer', 'discoveredAttack': 'discovered-attack',
    'doubleCheck': 'double-check', 'hangingPiece': 'hanging-piece', 'trappedPiece': 'trapped-piece',
    'deflection': 'deflection', 'attraction': 'attraction', 'sacrifice': 'sacrifice',
    'attackingF2F7': 'f7-attack', 'kingsideAttack': 'kingside-attack', 'queensideAttack': 'queenside-attack',
    'exposedKing': 'exposed-king', 'promotion': 'promotion', 'advancedPawn': 'advanced-pawn',
    'mateIn3': 'mate-in-3', 'intermezzo': 'zwischenzug', 'xRayAttack': 'x-ray',
    'clearance': 'clearance', 'interference': 'interference', 'capturingDefender': 'capture-defender',
}
RATING_MIN, RATING_MAX = 400, 1500
PER_PACK = 400
packs = {v: [] for v in PACKS.values()}
seen = 0
with open(SRC, 'rb') as fh:
    reader = zstandard.ZstdDecompressor().stream_reader(fh)
    text = io.TextIOWrapper(reader, encoding='utf-8')
    rows = csv.reader(text)
    next(rows)  # header
    for row in rows:
        seen += 1
        pid, fen, moves, rating, dev, pop, plays, themes = row[0], row[1], row[2], int(row[3]), int(row[4]), int(row[5]), int(row[6]), row[7].split()
        if not (RATING_MIN <= rating <= RATING_MAX) or pop < 85 or plays < 800 or dev > 90:
            continue
        mv = moves.split()
        if len(mv) > 7:
            continue  # keep solutions short for a 7-year-old
        entry = {'id': pid, 'fen': fen, 'moves': mv, 'rating': rating, 'themes': [t for t in themes if t in PACKS]}
        for t in themes:
            name = PACKS.get(t)
            if name:
                packs[name].append(entry)

total = 0
for name, items in packs.items():
    items.sort(key=lambda e: (e['rating'], -0))  # easiest first
    # spread across the rating range rather than taking only the easiest
    if len(items) > PER_PACK:
        step = len(items) / PER_PACK
        items = [items[int(i * step)] for i in range(PER_PACK)]
    total += len(items)
    with open(os.path.join(OUT, f'{name}.json'), 'w') as f:
        json.dump({'theme': name, 'source': 'lichess_db_puzzle (CC0)', 'count': len(items), 'puzzles': items}, f, separators=(',', ':'))
    print(f'{name:18s} {len(items):4d}')
print(f'scanned {seen} puzzles, kept {total} across {len(packs)} packs')
