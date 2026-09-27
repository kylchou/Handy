"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, friendlyError } from "@/lib/api";
import { ErrorNote } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.auth.login({ email, password });
      if (user.role !== "ADMIN") {
        await api.auth.logout();
        setError("This dashboard is only for the Handy team.");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(friendlyError(err, "We couldn't log you in."));
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-control border-2 border-field/60 bg-white px-4 py-3 text-lg";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="font-bold uppercase tracking-wide text-accent">Handy Admin</p>
      <h1 className="mb-6 text-3xl font-bold text-ink">Log in</h1>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1 block font-bold">
            Email
          </label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block font-bold">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button
          type="submit"
          disabled={loading}
          className="min-h-[48px] w-full rounded-control bg-accent px-5 py-3 text-lg font-bold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          {loading ? "One moment…" : "Log In"}
        </button>
      </form>
    </main>
  );
}
