"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import { getProfile, updateProfile } from "@/lib/api";
import type { CustomerProfileDTO } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfileDTO | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  function update<K extends keyof CustomerProfileDTO>(key: K, value: CustomerProfileDTO[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await updateProfile(profile);
    setSaving(false);
    setSaved(true);
  }

  if (!profile) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
        <p className="text-lg text-ink-soft">Loading your profile…</p>
        <NavBar />
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">My Profile</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Field
          label="Address"
          value={profile.address}
          onChange={(v) => update("address", v)}
        />
        <Field
          label="Emergency contact"
          value={profile.emergencyContact ?? ""}
          onChange={(v) => update("emergencyContact", v)}
          hint="Name and phone number of someone we can reach if needed."
        />
        <Field
          label="Accessibility preferences"
          value={profile.accessibilityPreferences ?? ""}
          onChange={(v) => update("accessibilityPreferences", v)}
          hint="For example: hard of hearing, uses a walker, prefers written instructions."
          textarea
        />
        <fieldset>
          <legend className="mb-2 text-lg font-bold text-ink">
            How should workers contact you?
          </legend>
          <div className="space-y-2">
            {["text", "call", "app"].map((option) => (
              <label
                key={option}
                className="tap-target flex items-center gap-3 rounded-control border-2 border-line bg-white px-4 py-3 text-lg"
              >
                <input
                  type="radio"
                  name="communicationPreferences"
                  value={option}
                  checked={profile.communicationPreferences === option}
                  onChange={() => update("communicationPreferences", option)}
                  className="h-5 w-5"
                />
                {option === "text" ? "Text message" : option === "call" ? "Phone call" : "In-app message"}
              </label>
            ))}
          </div>
        </fieldset>

        {saved && (
          <p className="rounded-control bg-accent-light p-3 text-accent-dark">
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  textarea?: boolean;
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
          className="w-full rounded-control border-2 border-line bg-white px-4 py-3 text-lg text-ink"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-control border-2 border-line bg-white px-4 py-3 text-lg text-ink"
        />
      )}
    </div>
  );
}
