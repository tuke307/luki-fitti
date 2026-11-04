import copy
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from import_training import build, session_key, stable_id, timestamp, validate

ROOT = Path(__file__).parent


class Catalog:
    def execute(self, query, parameters):
        self.slug = parameters[0]
        return self

    def fetchone(self):
        return {'id': 'example-system-exercise', 'primaryMuscleGroup': 'HAMSTRINGS', 'exerciseType': 'STRENGTH'}


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'example.json').read_text())
        self.mapping = json.loads((ROOT / 'example-mapping.json').read_text())

    def test_warmups_excluded_from_volume_but_counted_as_completed(self):
        names = validate(self.data, self.mapping)
        rows = build(Catalog(), self.data, self.mapping, names, 'example-user', 'example-source', datetime(2026, 1, 1))
        session = next(r for t, r in rows if t == 'WorkoutSession')
        self.assertEqual(session['totalSetsCompleted'], 2)
        self.assertEqual(session['totalRepsCompleted'], 20)
        self.assertEqual(session['totalVolumeKg'], 400)
        self.assertEqual(session['startedAt'], datetime(2026, 1, 12, 17))
        self.assertEqual(len({r['id'] for _, r in rows}), len(rows))

    def test_pounds_and_cardio(self):
        ex = self.data['sessions'][0]['exercises'][0]
        ex['sets'] = [{'number': 1, 'weight': 100, 'weightUnit': 'LBS', 'reps': 10}]
        rows = build(Catalog(), self.data, self.mapping, validate(self.data, self.mapping), 'user', 'source', datetime(2026, 1, 1))
        self.assertEqual(next(r for t, r in rows if t == 'WorkoutSession')['totalVolumeKg'], 453.6)
        ex['sets'] = [{'number': 1, 'durationSeconds': 300, 'distanceMeters': 1000}]
        rows = build(Catalog(), self.data, self.mapping, validate(self.data, self.mapping), 'user', 'source', datetime(2026, 1, 1))
        self.assertEqual(next(r for t, r in rows if t == 'SessionSet')['distanceMeters'], 1000)
        self.assertEqual(next(r for t, r in rows if t == 'WorkoutSession')['totalVolumeKg'], 0)

    def test_stable_ids_and_account_isolation(self):
        session = self.data['sessions'][0]
        before = session_key(session)
        session['name'] = 'Renamed workout'
        self.assertEqual(session_key(session), before)  # A source ID survives renames.
        self.assertEqual(stable_id('u', 'app', before), stable_id('u', 'app', before))
        self.assertNotEqual(stable_id('u', 'app', before), stable_id('other-user', 'app', before))
        self.assertNotEqual(stable_id('u', 'app', before), stable_id('u', 'other-app', before))

    def test_reject_invalid_or_ambiguous_data(self):
        for item in [{'number': 1, 'weightKg': -1, 'reps': 10}, {'number': 1, 'reps': float('nan')}, {'number': 1}, {'number': 1, 'reps': 10, 'setType': 'UNKNOWN'}, {'number': 1, 'weightKg': 5, 'weightUnit': 'LBS', 'reps': 10}]:
            data = copy.deepcopy(self.data)
            data['sessions'][0]['exercises'][0]['sets'] = [item]
            with self.assertRaises(ValueError):
                validate(data, self.mapping)
        with self.assertRaises(ValueError):
            validate(self.data, {})
        self.data['sessions'].append(copy.deepcopy(self.data['sessions'][0]))
        with self.assertRaises(ValueError):
            validate(self.data, self.mapping)
        with self.assertRaises(ValueError):
            timestamp('2026-01-12T18:00:00')

    def test_adapter_dst_decimals_empty_sets_and_cardio(self):
        content = '''"Example A";"2026-10-24 18:00 Uhr";"1:00 Std."
"1. Example raise · Maschine · 10 Wdh"
#;KG;WDH
1;12,5;10
2;20;8
3;-;-

"Example B";"2026-10-26 18:00 Uhr";"5 Min."
"1. Example cardio · Maschine"
#;KM;MIN.
1;1,5;5
'''
        with tempfile.TemporaryDirectory() as directory:
            csv = Path(directory) / 'workouts.csv'
            output = Path(directory) / 'normalized.json'
            csv.write_text(content, encoding='utf-8-sig')
            command = [sys.executable, str(ROOT / 'prepare_alpha_progression.py'), '--workouts', str(csv), '--output', str(output), '--warmup-first', 'Example raise · Maschine']
            subprocess.run(command, check=True, capture_output=True)
            data = json.loads(output.read_text(encoding='utf8'))
            self.assertEqual(data['sessions'][0]['startedAt'], '2026-10-24T16:00:00+00:00')
            self.assertEqual(data['sessions'][1]['startedAt'], '2026-10-26T17:00:00+00:00')
            sets = data['sessions'][0]['exercises'][0]['sets']
            self.assertEqual(sets[0]['weightKg'], 12.5)
            self.assertEqual(sets[0]['setType'], 'WARMUP')
            self.assertEqual(sets[1]['setType'], 'WORKING')
            self.assertEqual(data['sessions'][0]['totalVolumeKg'], 160)
            self.assertEqual(data['skippedEmptySets'], 1)
            cardio = data['sessions'][1]['exercises'][0]['sets'][0]
            self.assertEqual(cardio['distanceMeters'], 1500)
            self.assertEqual(cardio['durationSeconds'], 300)
            csv.write_text(content.replace('2;20;8', '2;20;-'), encoding='utf8')
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
