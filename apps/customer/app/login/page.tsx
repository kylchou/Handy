"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BigButton from "@/components/BigButton";
import PasswordInput from "@/components/PasswordInput";
import { api, friendlyError, ROLE_KEY } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.auth.login({ email, password });
      window.localStorage.setItem("user_first_name", user.firstName);
      window.localStorage.setItem(ROLE_KEY, user.role);
      // Family members who help someone get their own view.
      router.push(user.role === "CAREGIVER" ? "/family" : "/chat");
    } catch (err) {
      setError(friendlyError(err, "We couldn't log you in. Please check your email and password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-ink">Welcome back</h1>
      <p className="mb-8 text-lg text-ink-soft">Log in to get help with anything.</p>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="mb-2 block text-lg font-bold text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-control border-2 border-field bg-white px-4 py-3 text-lg text-ink"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-lg font-bold text-ink">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-control border-2 border-field bg-white px-4 py-3 text-lg text-ink"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
            {error}
          </p>
        )}

        <BigButton type="submit" disabled={loading}>
          {loading ? "Logging in…" : "Log In"}
        </BigButton>
      </form>

      <p className="mt-6 text-center text-lg text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="font-bold text-accent underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
