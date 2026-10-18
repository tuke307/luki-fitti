'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Dumbbell, LogIn, UserPlus, MailCheck } from 'lucide-react';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { Label } from '@luki-fitti/ui/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useAuth } from '@/providers/auth/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const {
    login,
    register,
    resendConfirmation,
    continueOfflineLocal,
    error,
    infoMessage,
    loading,
  } = useAuth();
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
                Personal Gym & Workout Tracker
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-semibold">
                Password
              </Label>
              {mode === 'login' && (
                <Link
                  href="/forgot-password"
                  className="text-primary text-xs font-semibold hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
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

          {infoMessage && (
            <div className="border-primary/40 bg-primary/15 text-primary space-y-2 rounded-2xl border p-3.5 text-xs">
              <div className="flex items-start gap-2">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{infoMessage}</span>
              </div>
              {email.trim() && (
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  disabled={loading}
                  onClick={() => void resendConfirmation(email.trim())}
                >
                  Resend Confirmation Email
                </Button>
              )}
            </div>
          )}

          {error && (
            <div className="space-y-2">
              <p className="text-destructive text-xs">{error}</p>
              {error.toLowerCase().includes('confirm your email') && email.trim() && (
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  disabled={loading}
                  onClick={() => void resendConfirmation(email.trim())}
                >
                  <MailCheck className="h-3.5 w-3.5" /> Resend Confirmation Email
                </Button>
              )}
            </div>
          )}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {mode === 'login' ? (
              <>
                <LogIn className="h-4 w-4" /> Sign In
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" /> Register & Send Confirmation Link
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
