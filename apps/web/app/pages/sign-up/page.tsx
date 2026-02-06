"use client";

import { useState } from "react";
import Link from "next/link";
import { CreateUserSchema } from "common/types";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type FieldErrors = { name?: string; email?: string; password?: string };

function fieldErrorsFromZod(
  issues: Array<{ path: readonly (string | number)[]; message: string }>
): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = i.path[0];
    if (key === "name" || key === "email" || key === "password") {
      out[key] = i.message;
    }
  }
  return out;
}

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = CreateUserSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setFieldErrors(
        fieldErrorsFromZod(
          parsed.error.issues as Array<{
            path: readonly (string | number)[];
            message: string;
          }>
        )
      );
      setError("Please fix the errors below.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/users/sign-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => ({}));
      if (res.redirected || res.status === 303) {
        window.location.href = "/pages/sign-in";
        return;
      }
      if (!res.ok) {
        const msg =
          data.message ??
          data.issues?.map((i: { message?: string }) => i.message).join(", ") ??
          "Sign-up failed";
        setError(msg);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/pages/sign-in";
      }, 1500);
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-primary/30">
          <CardContent className="pt-6">
            <p className="text-primary font-semibold text-lg text-center">
              Account created. Redirecting to sign-in…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/30">
        <CardHeader>
          <CardTitle className="text-primary">Sign up</CardTitle>
          <CardDescription>Create an account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
                }}
                required
                placeholder="Your name"
                aria-invalid={!!fieldErrors.name}
              />
              {fieldErrors.name && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                }}
                required
                placeholder="you@example.com"
                aria-invalid={!!fieldErrors.email}
              />
              {fieldErrors.email && (
                <p className="text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                }}
                required
                minLength={8}
                maxLength={20}
                placeholder="••••••••"
                aria-invalid={!!fieldErrors.password}
              />
              {fieldErrors.password && (
                <p className="text-sm text-destructive">{fieldErrors.password}</p>
              )}
              <p className="text-xs text-muted-foreground">
                8–20 chars, 1 uppercase, 1 lowercase, 1 number, 1 of !@#$%^&*
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating account…" : "Sign up"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/pages/sign-in"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
