'use client';

import React, { useState } from 'react';
import {
  Play,
  Flame,
  Dumbbell,
  Sparkles,
  Calendar,
  ArrowRight,
  Folder,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { useGym } from '@/providers/gym/gym-context';
import { useAuth } from '@/providers/auth/auth-context';
import type { NavTab } from './pwa-shell';

interface HomeViewProps {
  onNavigate: (tab: NavTab) => void;
}

export function HomeView({ onNavigate }: HomeViewProps) {
  const { user } = useAuth();
  const {
    folders,
    unfiledTemplates,
    stretchingRoutines,
    activeSession,
    historySessions,
    startWorkoutFromTemplate,
    startStretchingSession,
  } = useGym();

  const [nowMs] = useState<number>(() => Date.now());
  const allTemplates = [...folders.flatMap((f) => f.templates), ...unfiledTemplates];
  const weeklyGoal = user?.preferences?.weeklyGoalSessions ?? 4;

  const sessionsLast7Days = historySessions.filter(
    (s) => nowMs - Date.parse(s.startedAt) <= 7 * 86400000,
  ).length;
  const totalVolumeAllTime = historySessions.reduce((acc, s) => acc + s.totalVolumeKg, 0);

  return (
    <div className="space-y-6 pb-10">
      {/* Hero Banner */}
      <Card className="relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1.5">
            <Badge variant="default" className="rounded-full px-3 py-1 text-xs">
              <Flame className="h-3.5 w-3.5" /> Personal Gym Telemetry
            </Badge>
            <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              Ready to Train, {user?.name?.split(' ')[0] || 'GymBuddy'}
            </h1>
            <p className="text-muted-foreground max-w-xl text-xs sm:text-sm">
              Offline-first workout execution with durable IndexedDB storage, timestamp rest
              timers, and instant backup exercise swaps.
            </p>
          </div>

          {/* Weekly Goal Progress Pill */}
          <div className="bg-secondary/70 flex items-center gap-4 rounded-2xl border px-4 py-3">
            <div>
              <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                7-Day Frequency
              </p>
              <p className="font-mono-tabular text-primary text-2xl font-extrabold">
                {sessionsLast7Days}{' '}
                <span className="text-muted-foreground text-sm">/ {weeklyGoal}</span>
              </p>
            </div>
            <div className="border-l pl-4">
              <p className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                Logged Volume
              </p>
              <p className="font-mono-tabular text-lg font-bold">
                {Math.round(totalVolumeAllTime).toLocaleString()} kg
              </p>
            </div>
          </div>
        </div>

        {/* Active Session Resume Callout */}
        {activeSession && (
          <div className="border-primary bg-primary/15 mt-5 flex flex-col justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center">
            <div>
              <Badge variant="solid" className="text-[10px] uppercase">
                Session In Progress
              </Badge>
              <h2 className="font-display mt-1 text-lg font-bold">
                {activeSession.workoutNameSnapshot}
              </h2>
              <p className="text-muted-foreground text-xs">
                {activeSession.totalSetsCompleted} sets logged •{' '}
                {activeSession.totalVolumeKg.toLocaleString()} kg volume • Persisted locally
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => onNavigate('session')}
              className="shadow-sm"
            >
              <Play className="h-4 w-4 fill-current" /> Resume Active Session
            </Button>
          </div>
        )}
      </Card>

      {/* Quick Launch Split Workouts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold">
            <Folder className="text-primary h-5 w-5" /> Your Training Split ({allTemplates.length})
          </h2>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => onNavigate('workouts')}
            className="h-auto p-0 text-xs font-bold"
          >
            Manage Split & Folders <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {allTemplates.slice(0, 4).map((tpl) => (
            <Card
              key={tpl.id}
              className="hover:border-primary/50 justify-between p-4 transition"
            >
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-primary font-semibold">
                    {folders.find((f) => f.id === tpl.folderId)?.name ?? 'Template'}
                  </span>
                  <span className="text-muted-foreground font-mono-tabular">
                    {tpl.exercises.length} exercises • ~{tpl.estimatedDurationMinutes ?? 60}m
                  </span>
                </div>
                <h3 className="font-display mt-1.5 text-base font-bold">{tpl.name}</h3>
                <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                  {tpl.exercises.map((e) => e.exercise?.name).filter(Boolean).join(' • ')}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground text-[11px]">
                  {tpl.exercises.reduce((acc, e) => acc + e.plannedSets, 0)} working sets
                </span>
                <Button
                  type="button"
                  size="default"
                  onClick={async () => {
                    await startWorkoutFromTemplate(tpl.id);
                    onNavigate('session');
                  }}
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Start
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Stretching & Recent Diary Split */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Stretching Quick Launch */}
        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-base font-bold">
              <Sparkles className="text-accent h-4 w-4" /> Mobility & Stretching Flows
            </h2>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => onNavigate('exercises')}
              className="text-accent h-auto p-0 text-xs font-bold"
            >
              Open Studio →
            </Button>
          </div>
          <div className="space-y-2.5">
            {stretchingRoutines.map((routine) => (
              <div
                key={routine.id}
                className="bg-secondary/40 flex items-center justify-between rounded-2xl p-3.5 text-xs"
              >
                <div>
                  <span className="text-accent text-[10px] font-bold uppercase">
                    {routine.targetArea}
                  </span>
                  <p className="font-display text-sm font-bold">{routine.name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {routine.exercises.length} stretches • ~
                    {Math.round(routine.estimatedDurationSeconds / 60)} min
                  </p>
                </div>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={async () => {
                    await startStretchingSession(routine.id);
                    onNavigate('session');
                  }}
                >
                  <Play className="h-3 w-3 fill-current" /> Start
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Completed Sessions */}
        <Card className="space-y-3 rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-base font-bold">
              <Calendar className="text-primary h-4 w-4" /> Recent Training History
            </h2>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => onNavigate('diary')}
              className="h-auto p-0 text-xs font-bold"
            >
              Full Diary →
            </Button>
          </div>

          {historySessions.length === 0 ? (
            <div className="bg-secondary/30 text-muted-foreground rounded-2xl p-6 text-center text-xs">
              <Dumbbell className="mx-auto mb-1.5 h-6 w-6 opacity-50" />
              Complete your first workout session to see your recent logs here.
            </div>
          ) : (
            <div className="space-y-2">
              {historySessions.slice(0, 4).map((sess) => (
                <div
                  key={sess.clientSessionId}
                  onClick={() => onNavigate('diary')}
                  className="bg-secondary/40 hover:bg-secondary/70 flex cursor-pointer items-center justify-between rounded-2xl p-3 text-xs transition"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="text-primary h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-bold">{sess.workoutNameSnapshot}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {new Date(sess.startedAt).toLocaleDateString()} • {sess.totalSetsCompleted}{' '}
                        sets
                      </p>
                    </div>
                  </div>
                  <span className="font-mono-tabular text-primary font-bold">
                    {sess.totalVolumeKg > 0
                      ? `${sess.totalVolumeKg.toLocaleString()} kg`
                      : `${Math.round(sess.totalStretchSeconds / 60)}m stretch`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
