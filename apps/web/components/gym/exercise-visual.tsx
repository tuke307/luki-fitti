'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, Play, Pause, Dumbbell, Sparkles, Video } from 'lucide-react';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { resolveExerciseMedia } from '@luki-fitti/common/catalog';
import { MuscleGroup } from '@luki-fitti/common/enums';
import { useLocale } from '@/providers/i18n/locale-context';
import type { ExerciseDto } from '@luki-fitti/common/schemas';

interface ExerciseVisualProps {
  exercise: {
    id?: string | null;
    slug?: string | null;
    name: string;
    primaryMuscleGroup: MuscleGroup;
    secondaryMuscleGroups?: MuscleGroup[];
    media?: ExerciseDto['media'];
    /** User-created exercises never get catalog photos guessed for them. */
    isSystem?: boolean;
  };
  variant?: 'thumbnail' | 'card' | 'detail';
  className?: string;
}

export function ExerciseVisual({
  exercise,
  variant = 'card',
  className = '',
}: ExerciseVisualProps) {
  const { t, format, muscleLabel } = useLocale();
  const mediaList = resolveExerciseMedia(exercise);
  const imageFrames = mediaList.filter(
    (m) => m.mediaType === 'IMAGE' || m.mediaType === 'GIF' || m.mediaType === 'SVG',
  );
  const videoLink = mediaList.find((m) => m.mediaType === 'VIDEO_LINK');

  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [isPlayingLoop, setIsPlayingLoop] = useState(variant === 'detail');
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isPlayingLoop || imageFrames.length < 2) return;
    const id = window.setInterval(() => {
      setActiveFrameIdx((prev) => (prev + 1) % imageFrames.length);
    }, 1100);
    return () => window.clearInterval(id);
  }, [isPlayingLoop, imageFrames.length]);

  const validFrames = imageFrames.filter((f) => !failedUrls[f.url]);
  const currentFrame =
    validFrames[activeFrameIdx % Math.max(1, validFrames.length)] ?? validFrames[0];

  if (variant === 'thumbnail') {
    return (
      <div
        className={`bg-secondary/70 border-border/60 relative flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${className}`}
      >
        {currentFrame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentFrame.url}
            alt={exercise.name}
            loading="lazy"
            onError={() => setFailedUrls((prev) => ({ ...prev, [currentFrame.url]: true }))}
            className="h-full w-full object-cover"
          />
        ) : (
          <Dumbbell className="text-primary h-5 w-5 opacity-75" />
        )}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        onMouseEnter={() => {
          if (imageFrames.length > 1) setIsPlayingLoop(true);
        }}
        onMouseLeave={() => {
          setIsPlayingLoop(false);
          setActiveFrameIdx(0);
        }}
        className={`bg-secondary/50 border-border/50 relative h-36 w-full overflow-hidden rounded-2xl border ${className}`}
      >
        {validFrames.length >= 2 ? (
          <div className="grid h-full w-full grid-cols-2 gap-0.5 bg-black/20">
            {validFrames.slice(0, 2).map((frame, idx) => (
              <div key={frame.id} className="relative h-full w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frame.url}
                  alt={format(t.visual.frameAlt, { name: exercise.name, step: idx + 1 })}
                  loading="lazy"
                  onError={() => setFailedUrls((prev) => ({ ...prev, [frame.url]: true }))}
                  className={`h-full w-full object-cover transition duration-300 ${
                    isPlayingLoop && activeFrameIdx === idx
                      ? 'scale-105 brightness-110'
                      : 'opacity-95'
                  }`}
                />
                <span className="bg-background/80 text-foreground tabular-nums absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-xs font-bold backdrop-blur-xs">
                  {idx === 0 ? t.visual.startFrame : t.visual.finishFrame}
                </span>
              </div>
            ))}
          </div>
        ) : currentFrame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentFrame.url}
            alt={exercise.name}
            loading="lazy"
            onError={() => setFailedUrls((prev) => ({ ...prev, [currentFrame.url]: true }))}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <MuscleAnatomySvg
              primary={exercise.primaryMuscleGroup}
              secondary={exercise.secondaryMuscleGroups ?? []}
            />
          </div>
        )}
      </div>
    );
  }

  // variant === 'detail'
  const youtubeSearchUrl =
    videoLink?.url ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${exercise.name} exercise form tutorial`,
    )}`;
  const muscleWikiUrl = `https://musclewiki.com/exercises?search=${encodeURIComponent(
    exercise.name,
  )}`;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Animated Motion Player + Start/Finish Frames */}
      {validFrames.length > 0 && (
        <div className="bg-secondary/35 overflow-hidden rounded-2xl border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="accent" className="text-xs">
                <Sparkles className="h-3 w-3" /> {t.visual.motionPreviewBadge}
              </Badge>
              <span className="text-muted-foreground text-xs font-medium">
                {isPlayingLoop
                  ? format(t.visual.animatingStep, {
                      current: (activeFrameIdx % validFrames.length) + 1,
                      total: validFrames.length,
                    })
                  : t.visual.startPeakContraction}
              </span>
            </div>
            {validFrames.length > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setIsPlayingLoop((p) => !p)}
                className="h-7 text-xs font-bold"
              >
                {isPlayingLoop ? (
                  <>
                    <Pause className="h-3 w-3" /> {t.visual.pauseLoopBtn}
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 fill-current" /> {t.visual.animateGifBtn}
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {/* Animated Primary Frame */}
            {currentFrame && (
              <div className="border-primary/40 relative h-44 overflow-hidden rounded-xl border sm:col-span-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentFrame.url}
                  alt={currentFrame.caption ?? exercise.name}
                  onError={() => setFailedUrls((prev) => ({ ...prev, [currentFrame.url]: true }))}
                  className="h-full w-full object-cover"
                />
                <span className="bg-primary text-primary-foreground tabular-nums absolute top-2 left-2 rounded-md px-2 py-0.5 text-xs font-semibold">
                  {activeFrameIdx % validFrames.length === 0
                    ? t.visual.step1Start
                    : t.visual.step2Contract}
                </span>
              </div>
            )}

            {/* Side-by-Side Frame Strip */}
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              {validFrames.slice(0, 2).map((frame, idx) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => {
                    setIsPlayingLoop(false);
                    setActiveFrameIdx(idx);
                  }}
                  className={`relative h-44 overflow-hidden rounded-xl border text-left transition ${
                    activeFrameIdx % validFrames.length === idx
                      ? 'border-primary ring-primary/30 ring-2'
                      : 'border-border/60 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frame.url}
                    alt={format(t.visual.frameAlt, { name: exercise.name, step: idx + 1 })}
                    onError={() => setFailedUrls((prev) => ({ ...prev, [frame.url]: true }))}
                    className="h-full w-full object-cover"
                  />
                  <span className="bg-background/85 text-foreground absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-xs font-bold backdrop-blur-xs">
                    {idx === 0 ? t.visual.step1StartPos : t.visual.step2PeakPos}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Anatomical Muscle Map + External Video Tutorials */}
      <div className="bg-secondary/40 flex flex-col justify-between gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <MuscleAnatomySvg
            primary={exercise.primaryMuscleGroup}
            secondary={exercise.secondaryMuscleGroups ?? []}
          />
          <div>
            <p className="text-xs font-bold">{t.visual.targetMusclesBadge}</p>
            <p className="text-primary mt-0.5 text-sm font-bold">
              {t.visual.primaryLabel} {muscleLabel(exercise.primaryMuscleGroup)}
            </p>
            {exercise.secondaryMuscleGroups && exercise.secondaryMuscleGroups.length > 0 && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t.visual.secondaryLabel}{' '}
                {exercise.secondaryMuscleGroups.map((m) => muscleLabel(m)).join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="xs" className="font-bold">
            <a href={youtubeSearchUrl} target="_blank" rel="noopener noreferrer">
              <Video className="text-primary h-3.5 w-3.5" />
              {t.visual.youtubeGuideBtn}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          </Button>
          <Button asChild variant="secondary" size="xs" className="font-bold">
            <a href={muscleWikiUrl} target="_blank" rel="noopener noreferrer">
              {t.visual.muscleWikiBtn}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MuscleAnatomySvg({
  primary,
  secondary,
}: {
  primary: MuscleGroup;
  secondary: MuscleGroup[];
}) {
  const getFill = (mg: MuscleGroup) => {
    if (primary === mg || primary === MuscleGroup.FULL_BODY) return '#CCFF00';
    if (secondary.includes(mg)) return '#00E5FF';
    return 'currentColor';
  };

  const getOpacity = (mg: MuscleGroup) => {
    if (primary === mg || primary === MuscleGroup.FULL_BODY) return 0.95;
    if (secondary.includes(mg)) return 0.65;
    return 0.16;
  };

  return (
    <svg
      viewBox="0 0 120 110"
      className="text-muted-foreground h-16 w-20 shrink-0"
      aria-label="Anatomical Muscle Highlight"
    >
      {/* Front Silhouette (Left) */}
      <g transform="translate(8, 4)">
        <circle cx="20" cy="8" r="6" fill="currentColor" fillOpacity="0.25" />
        <rect
          x="5"
          y="16"
          width="7"
          height="10"
          rx="3"
          fill={getFill(MuscleGroup.SHOULDERS)}
          fillOpacity={getOpacity(MuscleGroup.SHOULDERS)}
        />
        <rect
          x="28"
          y="16"
          width="7"
          height="10"
          rx="3"
          fill={getFill(MuscleGroup.SHOULDERS)}
          fillOpacity={getOpacity(MuscleGroup.SHOULDERS)}
        />
        <rect
          x="12"
          y="16"
          width="16"
          height="11"
          rx="3"
          fill={getFill(MuscleGroup.CHEST)}
          fillOpacity={getOpacity(MuscleGroup.CHEST)}
        />
        <rect
          x="13"
          y="28"
          width="14"
          height="16"
          rx="2.5"
          fill={getFill(MuscleGroup.ABS_CORE)}
          fillOpacity={getOpacity(MuscleGroup.ABS_CORE)}
        />
        <rect
          x="4"
          y="27"
          width="6"
          height="11"
          rx="2.5"
          fill={getFill(MuscleGroup.BICEPS)}
          fillOpacity={getOpacity(MuscleGroup.BICEPS)}
        />
        <rect
          x="30"
          y="27"
          width="6"
          height="11"
          rx="2.5"
          fill={getFill(MuscleGroup.BICEPS)}
          fillOpacity={getOpacity(MuscleGroup.BICEPS)}
        />
        <rect
          x="3"
          y="39"
          width="5"
          height="11"
          rx="2"
          fill={getFill(MuscleGroup.FOREARMS)}
          fillOpacity={getOpacity(MuscleGroup.FOREARMS)}
        />
        <rect
          x="32"
          y="39"
          width="5"
          height="11"
          rx="2"
          fill={getFill(MuscleGroup.FOREARMS)}
          fillOpacity={getOpacity(MuscleGroup.FOREARMS)}
        />
        <rect
          x="12"
          y="45"
          width="16"
          height="6"
          rx="2"
          fill={getFill(MuscleGroup.HIP_FLEXORS)}
          fillOpacity={getOpacity(MuscleGroup.HIP_FLEXORS)}
        />
        <rect
          x="11"
          y="52"
          width="8"
          height="22"
          rx="3.5"
          fill={getFill(MuscleGroup.QUADRICEPS)}
          fillOpacity={getOpacity(MuscleGroup.QUADRICEPS)}
        />
        <rect
          x="21"
          y="52"
          width="8"
          height="22"
          rx="3.5"
          fill={getFill(MuscleGroup.QUADRICEPS)}
          fillOpacity={getOpacity(MuscleGroup.QUADRICEPS)}
        />
        <rect
          x="12"
          y="76"
          width="6"
          height="18"
          rx="2.5"
          fill={getFill(MuscleGroup.CALVES)}
          fillOpacity={getOpacity(MuscleGroup.CALVES)}
        />
        <rect
          x="22"
          y="76"
          width="6"
          height="18"
          rx="2.5"
          fill={getFill(MuscleGroup.CALVES)}
          fillOpacity={getOpacity(MuscleGroup.CALVES)}
        />
      </g>

      {/* Back Silhouette (Right) */}
      <g transform="translate(66, 4)">
        <circle cx="20" cy="8" r="6" fill="currentColor" fillOpacity="0.25" />
        <rect
          x="5"
          y="16"
          width="7"
          height="9"
          rx="3"
          fill={getFill(MuscleGroup.SHOULDERS)}
          fillOpacity={getOpacity(MuscleGroup.SHOULDERS)}
        />
        <rect
          x="28"
          y="16"
          width="7"
          height="9"
          rx="3"
          fill={getFill(MuscleGroup.SHOULDERS)}
          fillOpacity={getOpacity(MuscleGroup.SHOULDERS)}
        />
        <rect
          x="11"
          y="16"
          width="18"
          height="25"
          rx="3.5"
          fill={getFill(MuscleGroup.BACK)}
          fillOpacity={getOpacity(MuscleGroup.BACK)}
        />
        <rect
          x="4"
          y="26"
          width="6"
          height="12"
          rx="2.5"
          fill={getFill(MuscleGroup.TRICEPS)}
          fillOpacity={getOpacity(MuscleGroup.TRICEPS)}
        />
        <rect
          x="30"
          y="26"
          width="6"
          height="12"
          rx="2.5"
          fill={getFill(MuscleGroup.TRICEPS)}
          fillOpacity={getOpacity(MuscleGroup.TRICEPS)}
        />
        <rect
          x="11"
          y="42"
          width="18"
          height="11"
          rx="4"
          fill={getFill(MuscleGroup.GLUTES)}
          fillOpacity={getOpacity(MuscleGroup.GLUTES)}
        />
        <rect
          x="11"
          y="54"
          width="8"
          height="20"
          rx="3.5"
          fill={getFill(MuscleGroup.HAMSTRINGS)}
          fillOpacity={getOpacity(MuscleGroup.HAMSTRINGS)}
        />
        <rect
          x="21"
          y="54"
          width="8"
          height="20"
          rx="3.5"
          fill={getFill(MuscleGroup.HAMSTRINGS)}
          fillOpacity={getOpacity(MuscleGroup.HAMSTRINGS)}
        />
        <rect
          x="12"
          y="76"
          width="6"
          height="18"
          rx="2.5"
          fill={getFill(MuscleGroup.CALVES)}
          fillOpacity={getOpacity(MuscleGroup.CALVES)}
        />
        <rect
          x="22"
          y="76"
          width="6"
          height="18"
          rx="2.5"
          fill={getFill(MuscleGroup.CALVES)}
          fillOpacity={getOpacity(MuscleGroup.CALVES)}
        />
      </g>
    </svg>
  );
}
