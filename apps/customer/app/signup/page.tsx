"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BigButton from "@/components/BigButton";
import { api, friendlyError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.auth.signup({ ...form, role: "CUSTOMER", phone: form.phone || undefined });
      window.localStorage.setItem("user_first_name", user.firstName);
      router.push("/chat");
    } catch (err) {
      setError(friendlyError(err, "We couldn't create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  const fields: { key: keyof typeof form; label: string; type: string; autoComplete: string }[] = [
    { key: "firstName", label: "First name", type: "text", autoComplete: "given-name" },
    { key: "lastName", label: "Last name", type: "text", autoComplete: "family-name" },
    { key: "email", label: "Email", type: "email", autoComplete: "email" },
    { key: "phone", label: "Phone number", type: "tel", autoComplete: "tel" },
    { key: "password", label: "Password", type: "password", autoComplete: "new-password" },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 text-3xl font-bold text-ink">Create your account</h1>
      <p className="mb-8 text-lg text-ink-soft">It only takes a minute.</p>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key} className="mb-2 block text-lg font-bold text-ink">
              {f.label}
            </label>
            <input
              id={f.key}
              type={f.type}
              autoComplete={f.autoComplete}
              required
              value={form[f.key]}
              onChange={update(f.key)}
              className="w-full rounded-control border-2 border-field bg-white px-4 py-3 text-lg text-ink"
            />
          </div>
        ))}

        {error && (
          <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
            {error}
          </p>
        )}

        <BigButton type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </BigButton>
      </form>

      <p className="mt-6 text-center text-lg text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-accent underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
