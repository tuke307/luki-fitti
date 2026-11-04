"""Adapter for German Alpha Progression CSV exports; produces normalized JSON only.

No database connection. Explicit warmup rules require user-confirmed exercise names.
"""
import argparse,csv,json,re,hashlib
from pathlib import Path
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workouts',required=True,type=Path)
parser.add_argument('--plans',type=Path)
parser.add_argument('--output',required=True,type=Path)
parser.add_argument('--timezone',default='Europe/Berlin')
parser.add_argument('--warmup-first',action='append',default=[],help='Exact confirmed exercise name whose first set is a warmup')
args=parser.parse_args()
source=Path.cwd()
workout_file=args.workouts

def require(condition, detail):
 if not condition: raise ValueError(str(detail))

def rows(name):
 with (source/name).open(encoding='utf-8-sig',newline='') as f:
  yield from csv.reader(f,delimiter=';')
def exercise(text):
 return re.sub(r'^\d+\. ','',text)
sessions=[]; skipped=0; names=set()
for row in rows(workout_file):
 if not row: continue
 if len(row)==3 and re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2} Uhr',row[1]):
  start=datetime.strptime(row[1],'%Y-%m-%d %H:%M Uhr').replace(tzinfo=ZoneInfo(args.timezone))
  m=re.fullmatch(r'(\d+):(\d{2}) Std\.',row[2])
  minutes=re.fullmatch(r'(\d+) Min\.',row[2])
  require(m or minutes, row)
  duration=(int(m[1])*60+int(m[2]))*60 if m else int(minutes[1])*60
  session={'name':row[0],'startedAt':start.astimezone(timezone.utc).isoformat(),'durationSeconds':duration,'completedAtEstimated':(start+timedelta(seconds=duration)).astimezone(timezone.utc).isoformat(),'exercises':[]}
  sessions.append(session)
 elif len(row)==1 and re.match(r'^\d+\. ',row[0]):
  parts=exercise(row[0]).rsplit(' · ',1); has_reps=bool(re.fullmatch(r'\d+ Wdh',parts[1]))
  ex={'name':parts[0] if has_reps else exercise(row[0]),'targetReps':int(parts[1].split()[0]) if has_reps else None,'sets':[],'sourceSetCount':0}
  names.add(ex['name']); session['exercises'].append(ex)
 elif row[0]=='#':
  require(row in [['#','KG','WDH'],['#','KM','MIN.']], row)
  units=row[1:]
 elif row[0].isdigit():
  require(len(row)==3, row)
  ex['sourceSetCount']+=1
  if row[1:]==['-','-']: skipped+=1; continue
  require('-' not in row[1:], ('Partial set requires review',row))
  if units==['KM','MIN.']:
   ex['sets'].append({'setType':'WARMUP' if ex['name'] in args.warmup_first and int(row[0])==1 else 'WORKING','number':int(row[0]),'distanceMeters':float(row[1].replace(',','.'))*1000,'durationSeconds':float(row[2].replace(',','.'))*60})
  else:
   weight=float(row[1].replace(',','.')); reps=int(row[2]); require(weight>=0 and reps>=0, row)
   ex['sets'].append({'setType':'WARMUP' if ex['name'] in args.warmup_first and int(row[0])==1 else 'WORKING','number':int(row[0]),'weightKg':weight,'reps':reps})
 else: raise ValueError(row)
plans=[]
for row in (rows(args.plans) if args.plans else []):
 if not row:continue
 if len(row)==2:
  plan={'name':row[0],'date':row[1],'days':[]}; plans.append(plan)
 elif len(row)==1:
  require(row[0].startswith('Tag '), row)
  day={'name':row[0],'exercises':[]}; plan['days'].append(day)
 else:
  require(len(row)==3, row)
  name=exercise(row[0]); names.add(name)
  day['exercises'].append({'name':name,'plannedSets':int(row[1].split()[0]),'targetReps':int(row[2].split()[0])})
for s in sessions:
 sets=[x for e in s['exercises'] for x in e['sets']]
 s['totalSetsCompleted']=len(sets); s['totalRepsCompleted']=sum(x.get('reps',0) for x in sets)
 s['totalVolumeKg']=round(sum(x.get('weightKg',0)*x.get('reps',0) for x in sets if x['setType']!='WARMUP'),1)

files=[args.workouts]+([args.plans] if args.plans else [])
data={'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'sessions':sessions,'plans':plans,'exerciseNames':sorted(names),'skippedEmptySets':skipped,'assumptions':['Missing source set types treated as WORKING except explicitly confirmed --warmup-first rules.']}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'sessions':len(sessions),'sets':sum(s['totalSetsCompleted'] for s in sessions),'skippedEmptySets':skipped,'plans':len(plans)},ensure_ascii=False))
