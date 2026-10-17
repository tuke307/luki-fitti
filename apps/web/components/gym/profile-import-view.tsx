'use client';

import React, { useState } from 'react';
import {
  User,
  Upload,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  LogOut,
  LogIn,
  UserPlus,
  FileSpreadsheet,
} from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { Textarea } from '@luki-fitti/ui/components/ui/textarea';
import { useAuth } from '@/providers/auth/auth-context';
import { useGym } from '@/providers/gym/gym-context';
import { api } from '@/lib/api';
import {
  ExerciseCategory,
  EquipmentType,
  ExerciseType,
  MUSCLE_GROUP_LABELS,
  MuscleGroup,
  SessionExerciseOrigin,
  SessionExerciseStatus,
  SessionStatus,
  SessionType,
  SetType,
  WeightUnit,
} from '@luki-fitti/common/enums';
import { saveLocalHistorySession } from '@/lib/offline/offline-store';
import type {
  ExerciseMappingEntryDto,
  ImportCommitResultDto,
  ImportPreviewResultDto,
} from '@luki-fitti/common/schemas';

const SAMPLE_GYMLIFE_CSV = `Date,Workout Name,Folder,Exercise Name,Set Order,Weight,Unit,Reps,Notes
2026-10-10T17:30:00Z,Day 1 — Chest & Triceps,4er Split (Hypertrophy),Barbell Bench Press,1,82.5,KG,8,Smooth bar speed
2026-10-10T17:30:00Z,Day 1 — Chest & Triceps,4er Split (Hypertrophy),Barbell Bench Press,2,85,KG,8,
2026-10-10T17:30:00Z,Day 1 — Chest & Triceps,4er Split (Hypertrophy),Incline Dumbbell Press,1,32.5,KG,10,
2026-10-10T17:30:00Z,Day 1 — Chest & Triceps,4er Split (Hypertrophy),Cable Rope Tricep Pushdown,1,27.5,KG,14,
2026-10-13T18:00:00Z,Day 3 — Legs & Posterior Chain,4er Split (Hypertrophy),Barbell Back Squat,1,115,KG,7,Below parallel
2026-10-13T18:00:00Z,Day 3 — Legs & Posterior Chain,4er Split (Hypertrophy),Barbell Romanian Deadlift (RDL),1,105,KG,9,
2026-10-13T18:00:00Z,Day 3 — Legs & Posterior Chain,4er Split (Hypertrophy),Pendlay Deficit Row,1,75,KG,8,Custom back movement`;

export function ProfileImportView() {
  const {
    user,
    authMode,
    isAuthenticated,
    login,
    register,
    logout,
    updatePreferences,
    error: authError,
    loading: authLoading,
  } = useAuth();
  const { catalog, createCustomExercise, refreshAllData } = useGym();

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Import Wizard State
  const [importFileName, setImportFileName] = useState('gymlife-export.csv');
  const [importContent, setImportContent] = useState('');
  const [previewResult, setPreviewResult] = useState<ImportPreviewResultDto | null>(null);
  const [mappings, setMappings] = useState<Record<string, ExerciseMappingEntryDto>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importTemplates, setImportTemplates] = useState(true);
  const [commitResult, setCommitResult] = useState<ImportCommitResultDto | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    setImportContent(text);
    setPreviewResult(null);
    setCommitResult(null);
  };

  const runPreview = async (contentToParse = importContent, fileName = importFileName) => {
    setImportError(null);
    setCommitResult(null);
    if (!contentToParse.trim()) {
      setImportError('Please upload a CSV/JSON file or load the sample Gymlife export first.');
      return;
    }

    if (isAuthenticated && navigator.onLine) {
      try {
        const res = await api.imports.preview({
          fileName,
          format: 'AUTO',
          content: contentToParse,
        });
        if (res.success && res.data) {
          setPreviewResult(res.data);
          initMappings(res.data);
          return;
        }
      } catch {
        // Fallback to local client-side preview parser below
      }
    }

    // Client-side preview parser (works even in Offline Local mode!)
    const localPreview = buildLocalImportPreview(contentToParse, fileName);
    setPreviewResult(localPreview);
    initMappings(localPreview);
  };

  const initMappings = (preview: ImportPreviewResultDto) => {
    const next: Record<string, ExerciseMappingEntryDto> = {};
    for (const s of preview.exerciseSuggestions) {
      next[s.sourceName] = {
        sourceName: s.sourceName,
        action: s.matchedExerciseId ? 'MAP' : 'CREATE_CUSTOM',
        targetExerciseId: s.matchedExerciseId ?? catalog[0]?.id,
        primaryMuscleGroup: MuscleGroup.FULL_BODY,
      };
    }
    setMappings(next);
  };

  const buildLocalImportPreview = (
    rawContent: string,
    fileName: string,
  ): ImportPreviewResultDto => {
    const trimmed = rawContent.trim();
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const sessionMap = new Map<
      string,
      ImportPreviewResultDto['sessionsPreview'][number]
    >();
    const uniqueExercises = new Set<string>();
    let totalSets = 0;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as
          | Array<Record<string, unknown>>
          | { workouts?: Array<Record<string, unknown>>; sessions?: Array<Record<string, unknown>> };
        const list = Array.isArray(parsed) ? parsed : (parsed.workouts ?? parsed.sessions ?? []);
        for (const w of list) {
          const startedAt = new Date(
            (w.date as string | number | undefined) ||
              (w.startedAt as string | number | undefined) ||
              Date.now(),
          ).toISOString();
          const workoutName = String(w.workoutName || w.name || 'Imported Workout');
          const fp = `${startedAt.slice(0, 10)}::${workoutName.toLowerCase()}`;
          const rawExercises = Array.isArray(w.exercises)
            ? (w.exercises as Array<Record<string, unknown>>)
            : [];
          const exs = rawExercises.map((ex) => {
            const sourceName = String(ex.name || ex.exerciseName);
            uniqueExercises.add(sourceName);
            const rawSets = Array.isArray(ex.sets)
              ? (ex.sets as Array<Record<string, unknown>>)
              : [];
            const sets = rawSets.map((s, idx) => {
              totalSets += 1;
              return {
                setNumber: idx + 1,
                setType: SetType.WORKING,
                weight: typeof s.weight === 'number' ? s.weight : null,
                weightUnit: WeightUnit.KG,
                reps: typeof s.reps === 'number' ? s.reps : 10,
                durationSeconds: null,
              };
            });
            return { sourceName, matchedExerciseId: null, matchedExerciseName: null, sets };
          });
          sessionMap.set(fp, {
            fingerprint: fp,
            workoutName,
            folderName: typeof w.folder === 'string' ? w.folder : null,
            startedAt,
            durationSeconds: 3600,
            isDuplicate: false,
            exercises: exs,
          });
        }
      } catch {
        return {
          detectedFormat: 'INVALID_JSON',
          fileName,
          totalSessionsFound: 0,
          duplicateSessionsCount: 0,
          totalSetsFound: 0,
          templatesFound: [],
          unmappedExercises: [],
          exerciseSuggestions: [],
          sessionsPreview: [],
          validationErrors: ['Invalid JSON syntax in export file.'],
        };
      }
    } else if (lines.length >= 2) {
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]!.split(',').map((c) => c.trim());
        const startedAt = cols[0] ? new Date(cols[0]).toISOString() : new Date().toISOString();
        const workoutName = cols[1] || 'Gymlife Workout';
        const folderName = cols[2] || null;
        const sourceName = cols[3] || 'Exercise';
        const setOrder = Number(cols[4]) || 1;
        const weight = cols[5] ? Number(cols[5]) : null;
        const unit = (cols[6] || 'KG').toUpperCase() === 'LBS' ? WeightUnit.LBS : WeightUnit.KG;
        const reps = cols[7] ? Number(cols[7]) : 10;

        uniqueExercises.add(sourceName);
        totalSets += 1;
        const fp = `${startedAt.slice(0, 10)}::${workoutName.toLowerCase()}`;
        let sess = sessionMap.get(fp);
        if (!sess) {
          sess = {
            fingerprint: fp,
            workoutName,
            folderName,
            startedAt,
            durationSeconds: 3600,
            isDuplicate: false,
            exercises: [],
          };
          sessionMap.set(fp, sess);
        }
        let ex = sess.exercises.find(
          (e) => e.sourceName.toLowerCase() === sourceName.toLowerCase(),
        );
        if (!ex) {
          ex = { sourceName, matchedExerciseId: null, matchedExerciseName: null, sets: [] };
          sess.exercises.push(ex);
        }
        ex.sets.push({
          setNumber: setOrder,
          setType: SetType.WORKING,
          weight,
          weightUnit: unit,
          reps,
          durationSeconds: null,
        });
      }
    }

    const suggestions = Array.from(uniqueExercises).map((sourceName) => {
      const q = sourceName.toLowerCase();
      const exact = catalog.find((c) => c.name.toLowerCase() === q);
      const fuzzy =
        exact ??
        catalog.find(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            q.includes(c.name.toLowerCase()) ||
            c.tags.some((t) => t.toLowerCase() === q),
        );
      return {
        sourceName,
        matchedExerciseId: fuzzy?.id ?? null,
        matchedExerciseName: fuzzy?.name ?? null,
        confidence: exact
          ? ('EXACT' as const)
          : fuzzy
            ? ('FUZZY' as const)
            : ('UNMATCHED' as const),
      };
    });

    return {
      detectedFormat: fileName.endsWith('.json') ? 'GYMLIFE_JSON' : 'GYMLIFE_CSV',
      fileName,
      totalSessionsFound: sessionMap.size,
      duplicateSessionsCount: 0,
      totalSetsFound: totalSets,
      templatesFound: Array.from(
        new Set(Array.from(sessionMap.values()).map((s) => s.workoutName)),
      ),
      unmappedExercises: suggestions
        .filter((s) => s.confidence === 'UNMATCHED')
        .map((s) => s.sourceName),
      exerciseSuggestions: suggestions,
      sessionsPreview: Array.from(sessionMap.values()),
      validationErrors: [],
    };
  };

  const handleCommitImport = async () => {
    if (!previewResult) return;
    const mappingArray = Object.values(mappings);

    if (isAuthenticated && navigator.onLine) {
      try {
        const res = await api.imports.commit({
          fileName: importFileName,
          format: 'AUTO',
          content: importContent,
          exerciseMappings: mappingArray,
          skipDuplicates,
          importTemplates,
        });
        if (res.success && res.data) {
          setCommitResult(res.data);
          await refreshAllData();
          return;
        }
      } catch {
        // Fallback to local import below
      }
    }

    let createdCustom = 0;
    let importedSets = 0;
    for (const m of mappingArray) {
      if (m.action === 'CREATE_CUSTOM') {
        await createCustomExercise({
          name: m.sourceName,
          description: `Imported from ${importFileName}`,
          instructions: [],
          category: ExerciseCategory.COMPOUND,
          exerciseType: ExerciseType.STRENGTH,
          primaryMuscleGroup: m.primaryMuscleGroup ?? MuscleGroup.FULL_BODY,
          secondaryMuscleGroups: [],
          equipment: EquipmentType.OTHER,
          tags: ['imported', 'gymlife'],
          alternativeExerciseIds: [],
        });
        createdCustom += 1;
      }
    }

    for (const s of previewResult.sessionsPreview) {
      let vol = 0;
      let setsCount = 0;
      let repsCount = 0;
      const exDtos = s.exercises.map((ex, idx) => {
        const sets = ex.sets.map((st, sIdx) => {
          setsCount += 1;
          importedSets += 1;
          repsCount += st.reps ?? 0;
          if (st.weight && st.reps) vol += st.weight * st.reps;
          return {
            id: `imp-set-${idx}-${sIdx}`,
            clientSetId: `imp-cset-${Date.now()}-${idx}-${sIdx}`,
            sessionExerciseId: `imp-sex-${idx}`,
            setNumber: st.setNumber,
            setType: st.setType,
            weight: st.weight,
            weightUnit: st.weightUnit,
            reps: st.reps,
            durationSeconds: st.durationSeconds,
            distanceMeters: null,
            rpe: null,
            completed: true,
            completedAt: s.startedAt,
            isPersonalRecord: false,
            notes: null,
          };
        });
        return {
          id: `imp-sex-${idx}`,
          clientExerciseId: `imp-sex-${Date.now()}-${idx}`,
          sessionId: `imp-sess-${s.fingerprint}`,
          exerciseId: ex.matchedExerciseId,
          replacedExerciseId: null,
          replacedExerciseName: null,
          exerciseNameSnapshot: ex.matchedExerciseName ?? ex.sourceName,
          primaryMuscleSnapshot: MuscleGroup.FULL_BODY,
          exerciseTypeSnapshot: ExerciseType.STRENGTH,
          origin: SessionExerciseOrigin.PLANNED,
          status: SessionExerciseStatus.COMPLETED,
          orderIndex: idx,
          plannedSets: sets.length,
          plannedWarmupSets: 0,
          targetRepsMin: 8,
          targetRepsMax: 12,
          targetWeight: sets[0]?.weight ?? null,
          targetDurationSeconds: null,
          restSeconds: 90,
          alternativeExerciseIds: [],
          notes: null,
          sets,
        };
      });

      await saveLocalHistorySession({
        id: `imp-sess-${s.fingerprint}`,
        clientSessionId: `imp-sess-${s.fingerprint}`,
        userId: user?.id ?? 'local-athlete',
        templateId: null,
        stretchingRoutineId: null,
        sessionType: SessionType.STRENGTH,
        workoutNameSnapshot: s.workoutName,
        status: SessionStatus.COMPLETED,
        startedAt: s.startedAt,
        pausedAt: null,
        completedAt: s.startedAt,
        activeDurationSeconds: s.durationSeconds,
        weightUnit: WeightUnit.KG,
        totalVolumeKg: Math.round(vol),
        totalSetsCompleted: setsCount,
        totalRepsCompleted: repsCount,
        totalStretchSeconds: 0,
        notes: `Imported from ${importFileName}`,
        restTimerEndsAt: null,
        restTimerDurationSec: null,
        restTimerPausedRemSec: null,
        version: 1,
        lastSyncedAt: new Date().toISOString(),
        exercises: exDtos,
      });
    }

    setCommitResult({
      importJobId: `local-job-${Date.now()}`,
      detectedFormat: previewResult.detectedFormat,
      importedSessions: previewResult.sessionsPreview.length,
      importedSets,
      importedTemplates: importTemplates ? previewResult.templatesFound.length : 0,
      createdCustomExercises: createdCustom,
      skippedDuplicates: 0,
      errors: [],
    });
    await refreshAllData();
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Profile, Units & Gymlife Migration
        </h1>
        <p className="text-muted-foreground text-sm">
          Account security, unit preferences, Gymlife / Apple Health import wizard, and iPhone PWA
          setup
        </p>
      </div>

      {/* Account & Preferences Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account & Session Security Card */}
        <Card className="space-y-4 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <User className="text-primary h-5 w-5" />
              <h2 className="font-display text-lg font-bold">Account & Session Status</h2>
            </div>
            <Badge
              variant={authMode === 'AUTHENTICATED' ? 'success' : 'warning'}
              className="rounded-full px-3 py-1 text-[11px]"
            >
              {authMode === 'AUTHENTICATED'
                ? 'Authenticated Server Session'
                : 'Offline Local Session'}
            </Badge>
          </div>

          {user && (
            <div className="bg-secondary/40 rounded-2xl p-3.5 text-xs">
              <p className="text-sm font-bold">{user.name || 'GymBuddy'}</p>
              <p className="text-muted-foreground">{user.email}</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {authMode === 'AUTHENTICATED'
                  ? 'Secured via HTTP-only JWT + CSRF protection. All workouts and history are saved in PostgreSQL.'
                  : 'Guest Mode: Nothing is saved to the server database. Sign in or create an account below to persist your workouts in the database.'}
              </p>
            </div>
          )}

          {authMode === 'AUTHENTICATED' ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void logout()}
              className="hover:bg-destructive/20 hover:text-destructive w-fit"
            >
              <LogOut className="h-4 w-4" /> Sign Out of Server Session
            </Button>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (authTab === 'login') {
                  await login(email, password);
                } else {
                  await register({ email, password, name: name || undefined });
                }
              }}
              className="space-y-3 border-t pt-3"
            >
              <Tabs
                value={authTab}
                onValueChange={(val) => setAuthTab(val as 'login' | 'register')}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Register Account</TabsTrigger>
                </TabsList>
              </Tabs>

              {authTab === 'register' && (
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name (e.g. GymBuddy)"
                  className="text-xs"
                />
              )}
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="text-xs"
              />
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 8 chars, letter + number)"
                className="text-xs"
              />
              {authError && <p className="text-destructive text-xs">{authError}</p>}
              <Button type="submit" disabled={authLoading} className="w-full">
                {authTab === 'login' ? (
                  <>
                    <LogIn className="h-4 w-4" /> Sign In & Sync
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" /> Create Account & Seed Starter Split
                  </>
                )}
              </Button>
            </form>
          )}
        </Card>

        {/* Units & Training Preferences Card */}
        <Card className="space-y-4 rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Units & Gym Preferences</h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Weight Unit</p>
                <p className="text-muted-foreground text-[11px]">
                  Used for set entry and target loads
                </p>
              </div>
              <Tabs
                value={user?.preferences?.weightUnit ?? WeightUnit.KG}
                onValueChange={(val) => void updatePreferences({ weightUnit: val as WeightUnit })}
              >
                <TabsList>
                  <TabsTrigger value={WeightUnit.KG}>KG</TabsTrigger>
                  <TabsTrigger value={WeightUnit.LBS}>LBS</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Default Rest Timer Duration</p>
                <p className="text-muted-foreground text-[11px]">
                  Auto-starts when you log a working set
                </p>
              </div>
              <NativeSelect
                aria-label="Default rest timer seconds"
                value={user?.preferences?.defaultRestSeconds ?? 90}
                onChange={(e) =>
                  void updatePreferences({ defaultRestSeconds: Number(e.target.value) })
                }
                className="bg-secondary font-mono-tabular h-8 font-bold"
              >
                {[60, 75, 90, 120, 150, 180].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec} sec
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Weekly Training Goal</p>
                <p className="text-muted-foreground text-[11px]">
                  Displayed on your Home readiness ring
                </p>
              </div>
              <NativeSelect
                aria-label="Weekly goal sessions"
                value={user?.preferences?.weeklyGoalSessions ?? 4}
                onChange={(e) =>
                  void updatePreferences({ weeklyGoalSessions: Number(e.target.value) })
                }
                className="bg-secondary font-mono-tabular h-8 font-bold"
              >
                {[2, 3, 4, 5, 6].map((g) => (
                  <option key={g} value={g}>
                    {g} sessions / week
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </Card>
      </div>

      {/* Gymlife & Apple Health Data Migration Wizard */}
      <Card className="space-y-4 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="default" className="rounded-full px-3 py-0.5 text-[11px]">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Gymlife & Apple Health Migration
            </Badge>
            <h2 className="font-display mt-1.5 text-xl font-bold">
              Import Existing Training History & Templates
            </h2>
            <p className="text-muted-foreground text-xs">
              Supports Gymlife CSV/JSON workout exports and Apple Health workout JSON exports with
              preview, exercise catalog mapping, custom exercise creation, and duplicate detection.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setImportFileName('gymlife-history-sample.csv');
              setImportContent(SAMPLE_GYMLIFE_CSV);
              void runPreview(SAMPLE_GYMLIFE_CSV, 'gymlife-history-sample.csv');
            }}
            className="hover:border-primary shrink-0 border font-bold"
          >
            Load Sample Gymlife Export
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="bg-secondary/40 hover:bg-secondary/60 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center transition">
            <Upload className="text-primary mb-1.5 h-6 w-6" />
            <span className="text-xs font-bold">Upload .CSV or .JSON File</span>
            <span className="text-muted-foreground mt-0.5 text-[10px]">{importFileName}</span>
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <div className="sm:col-span-2">
            <Textarea
              rows={4}
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder="Paste CSV or JSON export content here, or click 'Load Sample Gymlife Export'..."
              className="font-mono-tabular rounded-2xl p-3 text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              <span>Skip duplicate sessions</span>
            </Label>
            <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={importTemplates}
                onChange={(e) => setImportTemplates(e.target.checked)}
              />
              <span>Create templates & folders from history</span>
            </Label>
          </div>

          <Button type="button" onClick={() => void runPreview()}>
            Validate & Preview Import
          </Button>
        </div>

        {importError && (
          <div className="bg-destructive/15 text-destructive flex items-center gap-2 rounded-xl p-3 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Preview & Mapping Table */}
        {previewResult && (
          <div className="bg-secondary/30 space-y-4 rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold">
                  Preview: {previewResult.totalSessionsFound} Sessions •{' '}
                  {previewResult.totalSetsFound} Sets ({previewResult.detectedFormat})
                </h3>
                <p className="text-muted-foreground text-xs">
                  Templates found: {previewResult.templatesFound.join(', ') || 'None'} • Duplicates
                  detected: {previewResult.duplicateSessionsCount}
                </p>
              </div>
              <Button type="button" onClick={() => void handleCommitImport()}>
                <CheckCircle2 className="h-4 w-4" /> Commit Import Now
              </Button>
            </div>

            {previewResult.validationErrors.length > 0 && (
              <div className="bg-destructive/15 text-destructive rounded-xl p-3 text-xs">
                {previewResult.validationErrors.map((err, idx) => (
                  <p key={idx}>• {err}</p>
                ))}
              </div>
            )}

            {/* Exercise Mapping Controls */}
            <div className="space-y-2">
              <p className="text-xs font-bold tracking-wider uppercase">
                Source Exercise Mapping ({previewResult.exerciseSuggestions.length})
              </p>
              {previewResult.exerciseSuggestions.map((sug) => {
                const currentMap = mappings[sug.sourceName] ?? {
                  sourceName: sug.sourceName,
                  action: 'MAP',
                  targetExerciseId: sug.matchedExerciseId ?? catalog[0]?.id,
                };
                return (
                  <div
                    key={sug.sourceName}
                    className="bg-background flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{sug.sourceName}</span>
                      <Badge
                        variant={
                          sug.confidence === 'EXACT'
                            ? 'success'
                            : sug.confidence === 'FUZZY'
                              ? 'warning'
                              : 'destructive'
                        }
                        className="px-1.5 py-0.5 text-[10px]"
                      >
                        {sug.confidence}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        aria-label={`Mapping action for ${sug.sourceName}`}
                        value={currentMap.action}
                        onChange={(e) =>
                          setMappings((prev) => ({
                            ...prev,
                            [sug.sourceName]: {
                              ...currentMap,
                              action: e.target.value as 'MAP' | 'CREATE_CUSTOM' | 'SKIP',
                            },
                          }))
                        }
                        className="bg-secondary h-8 text-xs font-semibold"
                      >
                        <option value="MAP">Map to Catalog</option>
                        <option value="CREATE_CUSTOM">Create Custom Exercise</option>
                        <option value="SKIP">Skip Exercise</option>
                      </NativeSelect>

                      {currentMap.action === 'MAP' && (
                        <NativeSelect
                          aria-label={`Target catalog exercise for ${sug.sourceName}`}
                          value={currentMap.targetExerciseId ?? ''}
                          onChange={(e) =>
                            setMappings((prev) => ({
                              ...prev,
                              [sug.sourceName]: {
                                ...currentMap,
                                targetExerciseId: e.target.value,
                              },
                            }))
                          }
                          className="bg-secondary h-8 text-xs"
                        >
                          {catalog.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({MUSCLE_GROUP_LABELS[c.primaryMuscleGroup]})
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {commitResult && (
          <div className="border-primary/40 bg-primary/10 rounded-2xl border p-4 text-xs">
            <p className="text-primary font-display text-sm font-bold">
              Import Complete ({commitResult.detectedFormat})
            </p>
            <p className="mt-1">
              Imported <strong>{commitResult.importedSessions}</strong> sessions,{' '}
              <strong>{commitResult.importedSets}</strong> sets,{' '}
              <strong>{commitResult.importedTemplates}</strong> workout templates, and created{' '}
              <strong>{commitResult.createdCustomExercises}</strong> custom exercises (Skipped{' '}
              {commitResult.skippedDuplicates} duplicates).
            </p>
          </div>
        )}
      </Card>

      {/* iPhone Safari Installation Checklist & Architectural Trade-offs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex items-center gap-2">
            <Smartphone className="text-primary h-5 w-5" />
            <h2 className="font-display text-base font-bold">
              iPhone & Safari Home Screen Installation Guide
            </h2>
          </div>
          <ol className="text-muted-foreground space-y-2 text-xs leading-relaxed">
            <li>
              <strong>1. Open in Safari on iPhone:</strong> Navigate to your LukiFitti URL in iOS
              Safari.
            </li>
            <li>
              <strong>2. Add to Home Screen:</strong> Tap the Safari <strong>Share</strong> icon in
              the bottom bar and select <strong>Add to Home Screen</strong>.
            </li>
            <li>
              <strong>3. Standalone Full-Screen Launch:</strong> Launch LukiFitti from your Home
              Screen — it runs in standalone mode without browser chrome, respecting the iPhone
              Dynamic Island and Home Indicator safe areas.
            </li>
            <li>
              <strong>4. Offline Data Warning:</strong> Active workouts are stored in IndexedDB.
              Avoid clearing Safari Website Data while offline with unsynchronized sessions.
            </li>
          </ol>
        </Card>

        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-accent h-5 w-5" />
            <h2 className="font-display text-base font-bold">
              PWA vs Native Architecture Trade-offs
            </h2>
          </div>
          <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
            <p>
              <strong className="text-foreground">Option A — Pure PWA (Implemented):</strong> Zero
              Apple Developer Program cost, no 7-day Personal Team signing expiry, single Next.js +
              NestJS codebase, and full offline workout execution via IndexedDB + timestamp timers.
            </p>
            <p>
              <strong className="text-foreground">Option B — Native iOS Bridge:</strong> Can write
              workouts to HealthKit, but requires Xcode signing and expires every 7 days without a
              paid developer account.
            </p>
            <p>
              <strong className="text-foreground">Option C — Full SwiftUI iOS + watchOS:</strong>{' '}
              Best for standalone Apple Watch wrist controls, reserved as a future native companion
              against the same NestJS API.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
