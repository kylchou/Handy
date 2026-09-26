"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import { api, friendlyError, saveAccessibility, useRequireLogin } from "@/lib/api";
import type { CustomerProfileDTO, UserDTO } from "@/lib/types";

type Channel = "SMS" | "PHONE" | "IN_APP";
const CHANNEL_LABELS: Record<Channel, string> = { SMS: "Text message", PHONE: "Phone call", IN_APP: "In-app message" };

/** The form keeps plain strings; the backend stores a few of them as small objects. */
interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  accessibilityNotes: string;
  preferredChannel: Channel;
}

function toForm(user: UserDTO, p: CustomerProfileDTO | null): ProfileForm {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? "",
    address: p?.address ?? "",
    emergencyName: p?.emergencyContact?.name ?? "",
    emergencyPhone: p?.emergencyContact?.phone ?? "",
    accessibilityNotes: p?.accessibilityPreferences.mobilityNotes ?? "",
    preferredChannel: p?.communicationPreferences.preferredChannel ?? "IN_APP",
  };
}

export default function ProfilePage() {
  useRequireLogin();
  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .me()
      .then((me) => setProfile(toForm(me.user, me.customerProfile)))
      .catch((err) => setError(friendlyError(err)));
  }, []);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setError("Please fill in your first and last name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const hasContact = profile.emergencyName.trim() && profile.emergencyPhone.trim();
      const user = await api.users.updateMe({
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        phone: profile.phone.trim() || null,
      });
      // Merged, so settings like text size and read-aloud aren't wiped.
      await saveAccessibility({ mobilityNotes: profile.accessibilityNotes.trim() });
      const next = await api.customers.updateProfile({
        address: profile.address.trim() || null,
        emergencyContact: hasContact ? { name: profile.emergencyName.trim(), phone: profile.emergencyPhone.trim() } : null,
        communicationPreferences: { preferredChannel: profile.preferredChannel },
      });
      setProfile(toForm(user, next));
      setSaved(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
        <p className="text-lg text-ink-soft">{error ?? "Loading your profile…"}</p>
        <NavBar />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">My Profile</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Field
          label="First name"
          value={profile.firstName}
          onChange={(v) => update("firstName", v)}
          autoComplete="given-name"
        />
        <Field
          label="Last name"
          value={profile.lastName}
          onChange={(v) => update("lastName", v)}
          autoComplete="family-name"
        />
        <Field
          label="Phone number"
          value={profile.phone}
          onChange={(v) => update("phone", v)}
          type="tel"
          autoComplete="tel"
        />
        <Field
          label="Address"
          value={profile.address}
          onChange={(v) => update("address", v)}
          autoComplete="street-address"
          hint="Used when you say “at my house.”"
        />
        <Field
          label="Emergency contact name"
          value={profile.emergencyName}
          onChange={(v) => update("emergencyName", v)}
          hint="Someone we can reach if needed."
        />
        <Field
          label="Emergency contact phone"
          value={profile.emergencyPhone}
          onChange={(v) => update("emergencyPhone", v)}
          type="tel"
        />
        <Field
          label="Accessibility preferences"
          value={profile.accessibilityNotes}
          onChange={(v) => update("accessibilityNotes", v)}
          hint="For example: hard of hearing, uses a walker, prefers written instructions."
          textarea
        />
        <fieldset>
          <legend className="mb-2 text-lg font-bold text-ink">
            How should workers contact you?
          </legend>
          <div className="space-y-2">
            {(["SMS", "PHONE", "IN_APP"] as const).map((option) => (
              <label
                key={option}
                className="tap-target flex items-center gap-3 rounded-control border-2 border-line bg-white px-4 py-3 text-lg"
              >
                <input
                  type="radio"
                  name="communicationPreferences"
                  value={option}
                  checked={profile.preferredChannel === option}
                  onChange={() => update("preferredChannel", option)}
                  className="h-5 w-5"
                />
                {CHANNEL_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
            {error}
          </p>
        )}

        {saved && (
          <p role="status" className="rounded-control bg-accent-light p-3 text-accent-dark">
            Your profile has been saved.
          </p>
        )}

        <BigButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save Changes"}
        </BigButton>
      </form>

      <NavBar />
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  textarea,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  textarea?: boolean;
  type?: "text" | "tel";
  autoComplete?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-lg font-bold text-ink">
        {label}
      </label>
      {hint && <p className="mb-2 text-ink-soft">{hint}</p>}
      {textarea ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-control border-2 border-field bg-white px-4 py-3 text-lg text-ink"
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full rounded-control border-2 border-field bg-white px-4 py-3 text-lg text-ink"
        />
      )}
    </div>
  );
}
