"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import { api, friendlyError, useRequireLogin } from "@/lib/api";

export default function SettingsPage() {
  useRequireLogin();
  const router = useRouter();
  const [largeText, setLargeText] = useState(false);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [highContrast, setHighContrast] = useState(false);

  async function handleLogout() {
    await api.auth.logout();
    router.push("/login");
  }

  async function handleInvite() {
    setInviteError(null);
    try {
      setInvite(await api.customers.createCaregiverInvite());
    } catch (err) {
      setInviteError(friendlyError(err));
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Settings</h1>

      <section className="mb-8 space-y-4">
        <h2 className="text-lg font-bold text-ink">Display</h2>
        <ToggleRow
          label="Extra large text"
          checked={largeText}
          onChange={setLargeText}
        />
        <ToggleRow
          label="High contrast mode"
          checked={highContrast}
          onChange={setHighContrast}
        />
        <p className="text-ink-soft">
          These settings make everything on screen easier to read. Voice
          input and voice responses can be turned on from the microphone
          button whenever you're asking for help.
        </p>
      </section>

      <section className="mb-8 space-y-2">
        <h2 className="text-lg font-bold text-ink">Family &amp; Caregivers</h2>
        <p className="text-ink-soft">
          You can invite a family member to see your upcoming and completed
          services. This is entirely optional.
        </p>
        {invite ? (
          <div className="rounded-card border-2 border-accent bg-accent-light p-5 text-center">
            <p className="text-lg text-ink">Give your family member this code</p>
            <p className="my-2 text-4xl font-bold tracking-[0.3em] text-accent-dark">{invite.code}</p>
            <p className="text-ink-soft">
              They enter it after signing up as a caregiver. It works until{" "}
              {new Date(invite.expiresAt).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" })}.
            </p>
          </div>
        ) : (
          <BigButton variant="secondary" onClick={handleInvite}>
            Invite a Family Member
          </BigButton>
        )}
        {inviteError && (
          <p role="alert" className="rounded-control bg-danger-light p-3 text-danger">
            {inviteError}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Account</h2>
        <BigButton variant="danger" onClick={handleLogout}>
          Log Out
        </BigButton>
      </section>

      <NavBar />
    </main>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="tap-target flex items-center justify-between rounded-control border-2 border-line bg-white px-4 py-3">
      <span className="text-lg font-bold text-ink">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6"
      />
    </label>
  );
}
