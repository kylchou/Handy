"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { api, friendlyError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.auth.login(values);
      if (user.role !== "WORKER") {
        await api.auth.logout();
        setError("This app is for workers. Customers can log in on the main Handy app.");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(friendlyError(err, "We couldn't log you in. Check your email and password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="Welcome back"
      subtitle="Log in to see jobs near you."
      fields={[
        { key: "email", label: "Email", type: "email", autoComplete: "email" },
        { key: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      values={values}
      onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
      onSubmit={login}
      submitLabel="Log In"
      loading={loading}
      error={error}
      footer={
        <>
          New to Handy?{" "}
          <Link href="/signup" className="font-bold text-accent underline">
            Sign up to work
          </Link>
        </>
      }
    />
  );
}
