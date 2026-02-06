"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CreateUserSchema } from "common/types";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { cn } from "@/app/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const INSIGHT_WORDS = ["Real-time", "Actionable", "Data-driven", "Live"];

type FieldErrors = { name?: string; email?: string; password?: string };

function fieldErrorsFromZod(
  issues: Array<{ path: readonly (string | number)[]; message: string }>,
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
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = INSIGHT_WORDS[wordIndex] ?? "";
    const id = setTimeout(() => {
      if (isDeleting) {
        if (charIndex === 0) {
          setIsDeleting(false);
          setWordIndex((i) => (i + 1) % INSIGHT_WORDS.length);
        } else {
          setCharIndex((c) => c - 1);
        }
      } else {
        if (charIndex === currentWord.length) {
          setIsDeleting(true);
        } else {
          setCharIndex((c) => c + 1);
        }
      }
    }, 150);
    return () => clearTimeout(id);
  }, [wordIndex, charIndex, isDeleting]);

  const typewriterText = (INSIGHT_WORDS[wordIndex] ?? "").slice(0, charIndex);

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
          }>,
        ),
      );
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

  const formPanel = (
    <div className="min-h-screen flex-1 flex flex-col justify-center items-center px-8 py-12 sm:px-12 lg:px-16 bg-[#F7F7F7]">
      <div className="w-full max-w-md">
        {success ? (
          <Card className="border-0 shadow-none bg-transparent">
            <CardContent className="pt-0">
              <p className="text-[#1A1A1A] font-semibold text-lg">
                Account created. Redirecting to sign-in…
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-1">
                Welcome
              </h1>
            </div>
            <Card className="w-full max-w-md border-0 shadow-none bg-transparent">
              <CardHeader className="px-0 pt-0 text-center">
                <CardTitle className="text-xl font-semibold text-[#1A1A1A]">
                  Create an account
                </CardTitle>
                <CardDescription className="text-[#595959]">
                  Enter your details below to get started
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pt-6 pb-6">
                <form id="signup-form" onSubmit={handleSubmit} noValidate>
                  <div className="flex flex-col gap-6">
                    <div className="grid gap-2">
                      <Label
                        htmlFor="name"
                        className="text-[#595959] font-medium"
                      >
                        Name
                      </Label>
                      <Input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (fieldErrors.name)
                            setFieldErrors((p) => ({ ...p, name: undefined }));
                        }}
                        required
                        placeholder="Your name"
                        aria-invalid={!!fieldErrors.name}
                        className={cn(
                          "bg-white text-[#1A1A1A] placeholder:text-[#A6A6A6]",
                          fieldErrors.name
                            ? "border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500"
                            : "border-[#D9D9D9] focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336]",
                        )}
                      />
                      {fieldErrors.name && (
                        <p className="text-sm text-destructive">
                          {fieldErrors.name}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="email"
                        className="text-[#595959] font-medium"
                      >
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (fieldErrors.email)
                            setFieldErrors((p) => ({
                              ...p,
                              email: undefined,
                            }));
                        }}
                        required
                        placeholder="you@example.com"
                        aria-invalid={!!fieldErrors.email}
                        className={cn(
                          "bg-white text-[#1A1A1A] placeholder:text-[#A6A6A6]",
                          fieldErrors.email
                            ? "border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500"
                            : "border-[#D9D9D9] focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336]",
                        )}
                      />
                      {fieldErrors.email && (
                        <p className="text-sm text-destructive">
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label
                        htmlFor="password"
                        className="text-[#595959] font-medium"
                      >
                        Password
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password)
                            setFieldErrors((p) => ({
                              ...p,
                              password: undefined,
                            }));
                        }}
                        required
                        minLength={8}
                        maxLength={20}
                        placeholder="••••••••"
                        aria-invalid={!!fieldErrors.password}
                        className={cn(
                          "bg-white text-[#1A1A1A] placeholder:text-[#A6A6A6]",
                          fieldErrors.password
                            ? "border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500"
                            : "border-[#D9D9D9] focus-visible:ring-[#4AA336] focus-visible:border-[#4AA336]",
                        )}
                      />
                      {fieldErrors.password && (
                        <p className="text-sm text-destructive">
                          {fieldErrors.password}
                        </p>
                      )}
                      <p className="text-xs text-[#595959]">
                        8–20 chars, 1 uppercase, 1 lowercase, 1 number, 1 of
                        !@#$%^&*
                      </p>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </form>
              </CardContent>
              <CardFooter className="flex flex-col gap-2 px-0 pb-0">
                <Button
                  type="submit"
                  form="signup-form"
                  disabled={loading}
                  className="w-full bg-[#4AA336] text-white hover:bg-[#3d8a2e] focus-visible:ring-[#4AA336]"
                >
                  {loading ? "Creating account…" : "Create an account"}
                </Button>
                <CardAction className="col-start-1 col-span-2 justify-self-center flex items-center justify-center gap-2">
                  <p>Already have an account?</p>
                  <Button
                    variant="link"
                    asChild
                    className="text-[#4AA336] p-0 underline underline-offset-4 decoration-[#4AA336] hover:decoration-[#4AA336]"
                  >
                    <Link href="/pages/sign-in">Sign-In Here</Link>
                  </Button>
                </CardAction>
              </CardFooter>
            </Card>
          </>
        )}
      </div>
    </div>
  );

  const darkPanel = (
    <div
      className="hidden lg:flex flex-1 min-h-screen bg-charcoal items-center justify-center p-12 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url(/dark-panel-bg.png)" }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-charcoal/60" aria-hidden />
      <div className="relative z-10 w-full max-w-md flex items-center justify-center p-6 text-center">
        <p className="text-white/90 text-5xl font-medium leading-relaxed whitespace-nowrap text-outline-black">
          <span className="inline-block min-w-[7.5rem] overflow-hidden whitespace-nowrap text-left align-bottom">
            {typewriterText}
          </span>{" "}
          insights that drive
          <br />
          <span className="text-gradient-sunrise text-outline-black">smarter decisions</span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {formPanel}
      {darkPanel}
    </div>
  );
}
