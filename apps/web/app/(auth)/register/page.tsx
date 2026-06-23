"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setTokens } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await api<{ access_token: string; refresh_token: string }>(
        "/api/v1/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
          auth: false,
        },
      );
      setTokens(data.access_token, data.refresh_token);
      router.push("/dashboard");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Daftar Akun</CardTitle>
          <CardDescription>Gratis, tidak perlu kartu kredit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nama</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">
                Password{" "}
                <span className="text-xs font-normal text-muted-foreground">(min 8 karakter)</span>
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Buat Akun"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Masuk
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
