"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { login, saveToken } from "@/app/lib/kubespark/auth";
import { getI18n } from "@/app/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const i18n = getI18n().login;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectPath = searchParams?.get("redirect") || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await login({ username, password });
      const token = response.data.token;
      if (!token) throw new Error(i18n.errors.missingToken);
      saveToken(token, rememberMe);
      router.push(redirectPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : i18n.errors.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{i18n.title}</CardTitle>
          <CardDescription>{i18n.footer}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <User className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" placeholder={i18n.username.placeholder} value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="relative">
              <Lock className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8 pr-8"
                type={showPassword ? "text" : "password"}
                placeholder={i18n.password.placeholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="absolute right-2 top-2.5" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> {i18n.remember}
            </label>
            {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
            <Button className="w-full" disabled={loading}>{loading ? i18n.actions.submitting : i18n.actions.submit}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
