'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { ProgressPose, PROGRESS_POSES } from '@luki-fitti/common/enums';
import type { ProgressCheckInDto, ProgressPhotoDto } from '@luki-fitti/common/schemas';
import { progress } from '@/lib/api';
import { formatWeighInDate } from '@/lib/body-weight/weight-format';
import { useAuth } from '@/providers/auth/auth-context';
import { useLocale } from '@/providers/i18n/locale-context';

function PoseThumb({ photo, alt }: { photo: ProgressPhotoDto | undefined; alt: string }) {
  const { t } = useLocale();
  return (
    <div className="bg-secondary aspect-[2/3] w-full overflow-hidden rounded-[0.625rem]">
      {photo?.url ? (
        <span className="relative block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin API image */}
          <img src={photo.url} alt={alt} className="h-full w-full object-cover" />
          {photo.kind === 'AI_TARGET' && (
            <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1 text-[0.625rem] font-semibold">
              {t.progress.aiTargetBadge}
            </span>
          )}
        </span>
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center">
          <Camera className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t.progress.noPhoto}</span>
        </div>
      )}
    </div>
  );
}

/** The pinned AI target entry the iOS app creates (see ProgressPhotoStore.targetClientEntryId). */
const isTarget = (c: ProgressCheckInDto) => c.clientEntryId === 'ai-progress-target';

export function ProgressSection() {
  const { t, format, bcp47 } = useLocale();
  const { authMode } = useAuth();
  const [checkIns, setCheckIns] = useState<ProgressCheckInDto[] | null>(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [comparePose, setComparePose] = useState<ProgressPose>(ProgressPose.FRONT);

  useEffect(() => {
    if (authMode !== 'AUTHENTICATED') return;
    let alive = true;
    progress
      .listCheckIns()
      .then((res) => {
        // The pinned AI target goes first; it is not a dated check-in.
        if (alive)
          setCheckIns(
            [...(res.data ?? [])].sort((x, y) => Number(isTarget(y)) - Number(isTarget(x))),
          );
      })
      .catch(() => {
        if (alive) setCheckIns([]);
      });
    return () => {
      alive = false;
    };
  }, [authMode]);

  const poseLabel = (pose: ProgressPose) => t.progress.poses[pose];
  const dateLabel = (iso: string) => formatWeighInDate(iso, bcp47);

  const dated = useMemo(() => (checkIns ?? []).filter((c) => !isTarget(c)), [checkIns]);
  const a = useMemo(() => checkIns?.find((c) => c.id === compareA), [checkIns, compareA]);
  const b = useMemo(() => checkIns?.find((c) => c.id === compareB), [checkIns, compareB]);
  const photoFor = (c: ProgressCheckInDto | undefined, pose: ProgressPose) =>
    c?.photos.find((p) => p.pose === pose);

  return (
    <Card className="space-y-4 rounded-[1.25rem] p-5">
      <div className="flex items-center gap-2.5">
        <Camera className="text-primary h-5 w-5" aria-hidden="true" />
        <div>
          <h3 className="font-display text-lg font-bold">{t.progress.title}</h3>
          <p className="text-muted-foreground text-xs">{t.progress.sub}</p>
        </div>
      </div>

      {checkIns == null ? null : checkIns.length === 0 ? (
        <p className="text-muted-foreground py-2 text-center text-[0.9375rem]">
          {t.progress.emptyHint}
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {checkIns.map((c) => (
              <li
                key={c.id}
                className="border-border space-y-2 rounded-[0.875rem] border p-3"
                data-testid={`progress-checkin-${c.id}`}
              >
                <p className="text-[0.9375rem] font-semibold">
                  {isTarget(c) ? t.progress.aiTargetBadge : dateLabel(c.takenAt)}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PROGRESS_POSES.map((pose) => (
                    <PoseThumb
                      key={pose}
                      photo={photoFor(c, pose)}
                      alt={format(t.progress.photoAlt, {
                        pose: poseLabel(pose),
                        date: dateLabel(c.takenAt),
                      })}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>

          {dated.length >= 2 && (
            <div className="space-y-2">
              <p className="text-[0.9375rem] font-semibold">{t.progress.compareTitle}</p>
              <div className="grid grid-cols-3 gap-2">
                <NativeSelect
                  aria-label={t.progress.compareA}
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                >
                  <option value="">{t.progress.compareA}</option>
                  {dated.map((c) => (
                    <option key={c.id} value={c.id}>
                      {dateLabel(c.takenAt)}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label={t.progress.compareB}
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                >
                  <option value="">{t.progress.compareB}</option>
                  {dated
                    .filter((c) => c.id !== compareA)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {dateLabel(c.takenAt)}
                      </option>
                    ))}
                </NativeSelect>
                <NativeSelect
                  aria-label={t.progress.poseLabel}
                  value={comparePose}
                  onChange={(e) => setComparePose(e.target.value as ProgressPose)}
                >
                  {PROGRESS_POSES.map((pose) => (
                    <option key={pose} value={pose}>
                      {poseLabel(pose)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {a && b && (
                <div className="grid grid-cols-2 gap-2" data-testid="progress-compare">
                  <PoseThumb
                    photo={photoFor(a, comparePose)}
                    alt={format(t.progress.photoAlt, {
                      pose: poseLabel(comparePose),
                      date: dateLabel(a.takenAt),
                    })}
                  />
                  <PoseThumb
                    photo={photoFor(b, comparePose)}
                    alt={format(t.progress.photoAlt, {
                      pose: poseLabel(comparePose),
                      date: dateLabel(b.takenAt),
                    })}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
