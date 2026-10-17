'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Dumbbell, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useAuth } from '@/providers/auth/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, continueOfflineLocal, error, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok =
      mode === 'login'
        ? await login(email, password)
        : await register({ email, password, name: name || undefined });
    if (ok) {
      router.push('/');
    }
  };

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-6 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-xl font-extrabold">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <span className="font-display text-lg font-extrabold">
                LUKI<span className="text-primary">FITTI</span>
              </span>
              <span className="text-muted-foreground block text-[11px]">
                Personal Gym & Workout PWA
              </span>
            </div>
          </Link>
        </div>

        <Tabs value={mode} onValueChange={(val) => setMode(val as 'login' | 'register')}>
          <TabsList className="w-full">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="register">Create Account</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GymBuddy"
                className="h-10"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@example.com"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters (letter + number)"
              className="h-10"
            />
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {mode === 'login' ? (
              <>
                <LogIn className="h-4 w-4" /> Sign In
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" /> Register & Seed 4er Split
              </>
            )}
          </Button>
        </form>

        <div className="border-t pt-4 text-center">
          <Button
            type="button"
            variant="link"
            onClick={() => {
              continueOfflineLocal();
              router.push('/');
            }}
            className="text-muted-foreground hover:text-foreground text-xs font-semibold"
          >
            Continue in Guest (Local Only) Mode →
          </Button>
        </div>
      </Card>
    </div>
  );
}
