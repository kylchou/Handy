"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { api, friendlyError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signup() {
    setError(null);
    setLoading(true);
    try {
      await api.auth.signup({
        role: "WORKER",
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        address: values.address || undefined,
      });
      // Next: pick the kinds of jobs they can do.
      router.push("/profile?welcome=1");
    } catch (err) {
      setError(friendlyError(err, "We couldn't create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthForm
      title="Work with Handy"
      subtitle="Help older adults near you with errands, rides, and odd jobs."
      fields={[
        { key: "firstName", label: "First name", autoComplete: "given-name" },
        { key: "lastName", label: "Last name", autoComplete: "family-name" },
        { key: "email", label: "Email", type: "email", autoComplete: "email" },
        { key: "phone", label: "Phone", type: "tel", autoComplete: "tel", optional: true },
        { key: "address", label: "Where you'll work from", autoComplete: "street-address", hint: "We use this to find jobs near you. Customers never see it." },
        { key: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
      ]}
      values={values}
      onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
      onSubmit={signup}
      submitLabel="Create Account"
      loading={loading}
      error={error}
      footer={
        <>
          Already working with us?{" "}
          <Link href="/login" className="font-bold text-accent underline">
            Log in
          </Link>
        </>
      }
    />
  );
}
