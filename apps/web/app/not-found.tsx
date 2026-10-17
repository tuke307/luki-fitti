'use client';

import Link from 'next/link';
import { Dumbbell } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md items-center space-y-4 rounded-3xl p-8 text-center">
        <div className="bg-primary/15 text-primary flex h-14 w-14 items-center justify-center rounded-2xl">
          <Dumbbell className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-bold">Page Not Found</h1>
          <p className="text-muted-foreground text-xs leading-relaxed">
            The requested gym view could not be found. Return to the main workout dashboard.
          </p>
        </div>
        <Button size="lg" asChild>
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </Card>
    </div>
  );
}
