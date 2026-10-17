'use client';

import React, { useState } from 'react';
import { User, LogOut, LogIn, UserPlus } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Badge } from '@luki-fitti/ui/components/ui/badge';
import { Button } from '@luki-fitti/ui/components/ui/button';
import { Card } from '@luki-fitti/ui/components/ui/card';
import { Input } from '@luki-fitti/ui/components/ui/input';
import { NativeSelect } from '@luki-fitti/ui/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@luki-fitti/ui/components/ui/tabs';
import { useAuth } from '@/providers/auth/auth-context';
import { WeightUnit } from '@luki-fitti/common/enums';

export function ProfileImportView() {
  const {
    user,
    authMode,
    login,
    register,
    logout,
    updatePreferences,
    error: authError,
    loading: authLoading,
  } = useAuth();
  const { theme, setTheme } = useTheme();

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Profile & Preferences
        </h1>
        <p className="text-muted-foreground text-sm">
          Account & session status and units & gym preferences
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
                <p className="font-semibold">Appearance / Theme</p>
                <p className="text-muted-foreground text-[11px]">
                  Choose Dark, Light, or follow iOS System setting
                </p>
              </div>
              <Tabs
                value={theme ?? 'dark'}
                onValueChange={(val) => {
                  setTheme(val);
                  if (val === 'dark' || val === 'light' || val === 'system') {
                    void updatePreferences({ theme: val });
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="dark">Dark</TabsTrigger>
                  <TabsTrigger value="light">Light</TabsTrigger>
                  <TabsTrigger value="system">System</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

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
    </div>
  );
}
