"""Import normalized training JSON; default runs a transaction and rolls it back.

See docs/training-data-import.md. No credentials or target account are embedded.
"""

import argparse
import hashlib
import json
import math
import os
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

NAMESPACE = uuid.UUID('62fdfe05-28dd-5da2-b6e8-110d24eb40f5')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def timestamp(value):
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(dt.tzinfo is not None, 'Timestamps must include a UTC offset')
    dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.replace(microsecond=dt.microsecond // 1000 * 1000)


def number(value, name, integer=False, minimum=0):
    require(isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value >= minimum, f'Invalid {name}')
    require(not integer or int(value) == value, f'{name} must be an integer')


def validate(data, mapping):
    require(isinstance(data.get('sessions', []), list), 'sessions must be a list')
    require(isinstance(data.get('plans', []), list), 'plans must be a list')
    require(data.get('sessions') or data.get('plans'), 'No sessions or plans')
    names = set()
    session_keys = set()
    for session in data.get('sessions', []):
        require(isinstance(session.get('name'), str) and 0 < len(session['name']) <= 160, 'Invalid session name')
        timestamp(session['startedAt'])
        if session.get('completedAtEstimated'):
            require(timestamp(session['completedAtEstimated']) >= timestamp(session['startedAt']), 'End precedes start')
        number(session['durationSeconds'], 'durationSeconds', integer=True)
        key = session_key(session)
        require(key not in session_keys, 'Duplicate session key in input')
        session_keys.add(key)
        for exercise in session['exercises']:
            names.add(exercise['name'])
            require(len(exercise['sets']) <= 40, 'Too many sets per exercise')
            warmups = sum(s.get('setType') == 'WARMUP' for s in exercise['sets'])
            require(warmups <= 10 and len(exercise['sets']) - warmups <= 30, 'At most 10 warmup and 30 working sets')
            if exercise.get('targetReps') is not None:
                number(exercise['targetReps'], 'targetReps', integer=True)
            numbers = set()
            for item in exercise['sets']:
                number(item['number'], 'set number', integer=True, minimum=1)
                require(item['number'] not in numbers, 'Duplicate set number')
                numbers.add(item['number'])
                require(item.get('setType', 'WORKING') in ['WORKING', 'WARMUP', 'DROPSET', 'STRETCH'], 'Unknown setType')
                require(item.get('weightUnit', 'KG') in ['KG', 'LBS'], 'Unknown weightUnit')
                require(not ('weightKg' in item and 'weight' in item), 'Use weightKg OR weight')
                require('weightKg' not in item or item.get('weightUnit', 'KG') == 'KG', 'weightKg cannot use LBS')
                for field in ['weightKg', 'weight', 'reps', 'durationSeconds', 'distanceMeters']:
                    if item.get(field) is not None:
                        number(item[field], field, integer=field in ['reps', 'durationSeconds'])
                require(any(item.get(k) is not None for k in ['reps', 'durationSeconds', 'distanceMeters']), 'Empty set must be removed before import')
    plan_names = set()
    for plan in data.get('plans', []):
        require(plan['name'] not in plan_names, 'Duplicate plan name')
        plan_names.add(plan['name'])
        days = set()
        for day in plan['days']:
            require(day['name'] not in days, 'Duplicate day name')
            days.add(day['name'])
            for exercise in day['exercises']:
                names.add(exercise['name'])
                number(exercise['plannedSets'], 'plannedSets', integer=True, minimum=1)
                require(exercise['plannedSets'] <= 30, 'At most 30 planned sets')
                number(exercise['targetReps'], 'targetReps', integer=True, minimum=1)
    for name in names:
        require(isinstance(name, str) and 0 < len(name) <= 160, 'Invalid exercise name')
        require(name in mapping, f'Missing exercise mapping: {name}')
        entry = mapping[name]
        require(('slug' in entry) != ('custom' in entry), f'Map {name} to slug OR custom')
        if 'custom' in entry:
            require(all(k in entry['custom'] for k in ['primaryMuscleGroup', 'equipment', 'exerciseType']), f'Incomplete custom exercise: {name}')
    return names


def session_key(session):
    # Source IDs are preferred; filenames/export dates never participate.
    return str(session['sourceId']) if session.get('sourceId') else timestamp(session['startedAt']).isoformat() + '|' + session['name']


def stable_id(user_id, source, *parts):
    return str(uuid.uuid5(NAMESPACE, json.dumps([user_id, source, *parts], ensure_ascii=False)))


def dump(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding='utf-8')


def snapshot(connection, user_id):
    from psycopg import sql
    result = {}
    for table in ['Exercise', 'WorkoutFolder', 'WorkoutTemplate', 'WorkoutSession']:
        result[table] = connection.execute(sql.SQL('SELECT * FROM {} WHERE "userId"=%s ORDER BY id').format(sql.Identifier(table)), (user_id,)).fetchall()
    for table, parent, field in [('ExerciseMuscleGroup', 'Exercise', 'exerciseId'), ('WorkoutTemplateExercise', 'WorkoutTemplate', 'templateId'), ('SessionExercise', 'WorkoutSession', 'sessionId')]:
        result[table] = connection.execute(sql.SQL('SELECT ch.* FROM {} ch JOIN {} p ON ch.{}=p.id WHERE p."userId"=%s ORDER BY ch.id').format(sql.Identifier(table), sql.Identifier(parent), sql.Identifier(field)), (user_id,)).fetchall()
    result['SessionSet'] = connection.execute('SELECT s.* FROM "SessionSet" s JOIN "SessionExercise" e ON s."sessionExerciseId"=e.id JOIN "WorkoutSession" w ON e."sessionId"=w.id WHERE w."userId"=%s ORDER BY s.id', (user_id,)).fetchall()
    return result


def build(connection, data, mapping, names, user_id, source, now):
    from psycopg.types.json import Jsonb
    rows = []
    catalog = {}
    def ident(*parts):
        return stable_id(user_id, source, *parts)
    for name in sorted(names):
        entry = mapping[name]
        if 'slug' in entry:
            found = connection.execute('SELECT id,"primaryMuscleGroup","exerciseType" FROM "Exercise" WHERE slug=%s AND ("isSystem" OR "userId"=%s)', (entry['slug'], user_id)).fetchone()
            require(found is not None, f'Exercise not accessible: {name}')
            catalog[name] = found
        else:
            custom = entry['custom']
            eid = ident('exercise', name)
            catalog[name] = dict(custom, id=eid)
            rows.append(('Exercise', {'id': eid, 'slug': 'import-' + eid, 'userId': user_id, 'name': name, 'description': custom.get('description', 'Imported from ' + source), 'category': 'CARDIO' if custom['exerciseType'] == 'CARDIO' else 'ISOLATION', 'exerciseType': custom['exerciseType'], 'primaryMuscleGroup': custom['primaryMuscleGroup'], 'equipment': custom['equipment'], 'isSystem': False, 'updatedAt': now}))
            rows.append(('ExerciseMuscleGroup', {'id': ident('muscle', name), 'exerciseId': eid, 'muscleGroup': custom['primaryMuscleGroup'], 'isPrimary': True}))
    for pi, plan in enumerate(data.get('plans', [])):
        fid = ident('folder', plan['name'])
        rows.append(('WorkoutFolder', {'id': fid, 'userId': user_id, 'name': plan['name'], 'sortOrder': pi, 'updatedAt': now}))
        for di, day in enumerate(plan['days']):
            tid = ident('template', plan['name'], day['name'])
            rows.append(('WorkoutTemplate', {'id': tid, 'userId': user_id, 'folderId': fid, 'name': day['name'], 'sortOrder': di, 'description': 'Imported from ' + source + '; unspecified rest periods use the app default.', 'updatedAt': now}))
            for ei, ex in enumerate(day['exercises']):
                sets = [{'setType': 'WORKING', 'weight': None, 'reps': ex['targetReps'], 'durationSeconds': None} for _ in range(ex['plannedSets'])]
                rows.append(('WorkoutTemplateExercise', {'id': ident('template-exercise', tid, ei), 'templateId': tid, 'exerciseId': catalog[ex['name']]['id'], 'orderIndex': ei, 'plannedSets': ex['plannedSets'], 'targetRepsMin': ex['targetReps'], 'targetRepsMax': ex['targetReps'], 'sets': Jsonb(sets)}))
    for session in data.get('sessions', []):
        sid = ident('session', session_key(session))
        volume = reps = count = stretch = 0
        children = []
        for ei, ex in enumerate(session['exercises']):
            meta = catalog[ex['name']]
            eid = ident('session-exercise', sid, ei)
            warmups = sum(s.get('setType') == 'WARMUP' for s in ex['sets'])
            children.append(('SessionExercise', {'id': eid, 'clientExerciseId': eid, 'sessionId': sid, 'exerciseId': meta['id'], 'exerciseNameSnapshot': ex['name'], 'primaryMuscleSnapshot': meta['primaryMuscleGroup'], 'exerciseTypeSnapshot': meta['exerciseType'], 'origin': 'ADDED', 'status': 'COMPLETED' if ex['sets'] else 'SKIPPED', 'orderIndex': ei, 'plannedSets': max(1, len(ex['sets']) - warmups), 'plannedWarmupSets': warmups, 'targetRepsMin': ex.get('targetReps'), 'targetRepsMax': ex.get('targetReps'), 'updatedAt': now}))
            for item in ex['sets']:
                set_id = ident('set', eid, item['number'])
                weight = item.get('weightKg', item.get('weight'))
                unit = item.get('weightUnit', 'KG')
                kind = item.get('setType', 'WORKING')
                count += 1
                reps += item.get('reps') or 0
                if meta['exerciseType'] == 'STRETCHING' or kind == 'STRETCH':
                    stretch += item.get('durationSeconds') or 0
                elif kind != 'WARMUP':
                    volume += (weight or 0) * (0.45359237 if unit == 'LBS' else 1) * (item.get('reps') or 0)
                children.append(('SessionSet', {'id': set_id, 'clientSetId': set_id, 'sessionExerciseId': eid, 'setNumber': item['number'], 'setType': kind, 'weight': weight, 'weightUnit': unit, 'reps': item.get('reps'), 'durationSeconds': item.get('durationSeconds'), 'distanceMeters': item.get('distanceMeters'), 'completed': True, 'updatedAt': now}))
        rows.append(('WorkoutSession', {'id': sid, 'clientSessionId': sid, 'userId': user_id, 'workoutNameSnapshot': session['name'], 'status': 'COMPLETED', 'startedAt': timestamp(session['startedAt']), 'completedAt': timestamp(session['completedAtEstimated']) if session.get('completedAtEstimated') else None, 'activeDurationSeconds': session['durationSeconds'], 'totalVolumeKg': round(volume, 1), 'totalSetsCompleted': count, 'totalRepsCompleted': reps, 'totalStretchSeconds': stretch, 'notes': 'Imported from ' + source + '. Missing set types treated as WORKING; no per-set completion times inferred.', 'updatedAt': now}))
        rows.extend(children)
    require(len({r['id'] for _, r in rows}) == len(rows), 'Duplicate generated IDs')
    return rows


def verify(connection, rows):
    from psycopg import sql
    from psycopg.types.json import Jsonb
    for table in dict.fromkeys(t for t, _ in rows):
        expected = [r for t, r in rows if t == table]
        found = connection.execute(sql.SQL('SELECT * FROM {} WHERE id=ANY(%s)').format(sql.Identifier(table)), ([r['id'] for r in expected],)).fetchall()
        actual = {r['id']: r for r in found}
        require(len(actual) == len(expected), f'Missing rows: {table}')
        for row in expected:
            for field, value in row.items():
                if field == 'updatedAt':
                    continue
                if isinstance(value, Jsonb):
                    value = value.obj
                require(actual[row['id']][field] == value, f'Conflicting existing data: {table}.{field}; no overwrite performed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--mapping', required=True, type=Path)
    parser.add_argument('--source', required=True, help='Stable source app name; reuse for subsequent exports')
    parser.add_argument('--email', required=True)
    parser.add_argument('--output', type=Path, default=Path('.training-import'))
    parser.add_argument('--validate-only', action='store_true', help='Check JSON without connecting')
    parser.add_argument('--commit', action='store_true', help='Persist after an internal rollback rehearsal')
    args = parser.parse_args()
    require(not (args.validate_only and args.commit), 'Choose validation OR commit')
    data, mapping = read_json(args.input), read_json(args.mapping)
    names = validate(data, mapping)
    if args.validate_only:
        print(json.dumps({'validated': True, 'sessions': len(data.get('sessions', [])), 'plans': len(data.get('plans', [])), 'exercises': len(names)}))
        return
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    # libpq reads PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD (or PGPASSFILE).
    with psycopg.connect(sslmode=os.environ.get('PGSSLMODE', 'require'), connect_timeout=15, row_factory=dict_row) as connection:
        connection.execute("SET TIME ZONE 'UTC'")
        connection.execute("SET LOCAL lock_timeout='5s'")
        connection.execute("SET LOCAL statement_timeout='60s'")
        users = connection.execute('SELECT id,email FROM "User" WHERE lower(email)=lower(%s)', (args.email,)).fetchall()
        require(len(users) == 1, 'Target account must exist uniquely')
        uid = users[0]['id']
        # Serialize imports for this account, including imports from different sources.
        lock = int.from_bytes(hashlib.sha256(uid.encode()).digest()[:8], 'big', signed=True)
        connection.execute('SELECT pg_advisory_xact_lock(%s)', (lock,))
        before = snapshot(connection, uid)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        now = now.replace(microsecond=now.microsecond // 1000 * 1000)
        rows = build(connection, data, mapping, names, uid, args.source, now)
        counts = Counter()
        for table in dict.fromkeys(t for t, _ in rows):
            ids = [r['id'] for t, r in rows if t == table]
            existing = connection.execute(sql.SQL('SELECT id FROM {} WHERE id=ANY(%s)').format(sql.Identifier(table)), (ids,)).fetchall()
            counts[table] = len(ids) - len(existing)
        for table, row in rows:
            if table == 'WorkoutSession':
                matches = connection.execute('SELECT id FROM "WorkoutSession" WHERE "userId"=%s AND "startedAt">=%s::timestamp - interval \'1 minute\' AND "startedAt"<=%s::timestamp + interval \'1 minute\' AND id<>%s', (uid, row['startedAt'], row['startedAt'], row['id'])).fetchall()
                require(not matches, 'Possible duplicate workout near the same start time; review manually')
        args.output.mkdir(parents=True, exist_ok=True)
        run = now.strftime('%Y%m%dT%H%M%S%f')
        backup = args.output / ('backup-' + run + '.json')
        dump(backup, before)
        require(read_json(backup) == json.loads(json.dumps(before, default=str)), 'Backup verification failed')
        def write():
            with connection.pipeline():
                for table, row in rows:
                    connection.execute(sql.SQL('INSERT INTO {} ({}) VALUES ({}) ON CONFLICT (id) DO NOTHING').format(sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, row)), sql.SQL(',').join(sql.Placeholder() for _ in row)), list(row.values()))
            verify(connection, rows)
            after = snapshot(connection, uid)
            for table, previous in before.items():
                actual = {r['id']: r for r in after[table]}
                require(all(actual[r['id']] == r for r in previous), 'Existing data changed')
        connection.execute('SAVEPOINT rehearsal')
        write()
        write()  # Verify idempotence within the same transaction.
        connection.execute('ROLLBACK TO SAVEPOINT rehearsal')
        require(snapshot(connection, uid) == before, 'Rollback verification failed')
        report = {'status': 'committed' if args.commit else 'rolled-back', 'source': args.source, 'userId': uid, 'backup': str(backup), 'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(), 'mappingSha256': hashlib.sha256(args.mapping.read_bytes()).hexdigest(), 'newRows': dict(counts), 'ids': {t: [r['id'] for tt, r in rows if tt == t] for t in dict.fromkeys(t for t, _ in rows)}}
        pending = args.output / ('pending-' + run + '.json')
        if args.commit:
            write()
            dump(pending, report)
            connection.commit()
            verify(connection, rows)
        connection.rollback()
        dump(args.output / ('result-' + run + '.json'), report)
        if pending.exists():
            pending.unlink()
        print(json.dumps({'status': report['status'], 'newRows': dict(counts), 'output': str(args.output)}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError) as error:
        raise SystemExit(f'Import aborted: {error}') from None
