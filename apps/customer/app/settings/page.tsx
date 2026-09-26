"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import BigButton from "@/components/BigButton";
import { api, friendlyError, saveAccessibility, useRequireLogin } from "@/lib/api";
import { applyDisplay, displayFrom, TEXT_SIZES, type DisplayPrefs } from "@/lib/display";
import { useSpeech } from "@/lib/useSpeech";

export default function SettingsPage() {
  useRequireLogin();
  const router = useRouter();
  const speech = useSpeech();
  const [display, setDisplay] = useState<DisplayPrefs | null>(null);
  const [readAloud, setReadAloud] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    api.customers
      .getProfile()
      .then((p) => {
        const next = displayFrom(p.accessibilityPreferences);
        setDisplay(next);
        applyDisplay(next);
        setReadAloud(p.accessibilityPreferences.voiceResponses !== false);
      })
      .catch((err) => setSaveError(friendlyError(err)));
  }, []);

  /** Applies right away, saves in the background. */
  function save(patch: Partial<DisplayPrefs> & { voiceResponses?: boolean }) {
    setSaveError(null);
    saveAccessibility({
      ...patch,
      // Kept in step for anything still reading the old on/off setting.
      ...(patch.textSize && { largeText: patch.textSize !== "DEFAULT" }),
    }).catch(() => setSaveError("That change works for now, but it couldn't be saved. Please try again."));
  }

  function changeDisplay(patch: Partial<DisplayPrefs>) {
    if (!display) return;
    const next = { ...display, ...patch };
    setDisplay(next);
    applyDisplay(next);
    save(patch);
  }

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    if (!next) speech.stop();
    save({ voiceResponses: next });
  }

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

        {!display ? (
          <p className="text-lg text-ink-soft">{saveError ?? "Loading your settings…"}</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Text size">
              <p className="mb-2 text-lg font-bold text-ink">Text size</p>
              <div className="grid grid-cols-3 gap-2">
                {TEXT_SIZES.map((size) => {
                  const selected = display.textSize === size.value;
                  return (
                    <button
                      key={size.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => changeDisplay({ textSize: size.value })}
                      // Fixed px so each button previews its own size, whatever size is on now.
                      style={{ fontSize: `${size.px}px`, lineHeight: 1.2 }}
                      className={`tap-target flex min-h-[4.5rem] items-center justify-center rounded-control border-2 px-2 py-3 font-bold ${
                        selected
                          ? "border-accent bg-accent-light text-accent-dark"
                          : "border-line bg-white text-ink hover:border-accent"
                      }`}
                    >
                      {size.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <ToggleRow
              label="High contrast"
              hint="Darker text and borders on a plain white background."
              checked={display.highContrast}
              onChange={(v) => changeDisplay({ highContrast: v })}
            />
          </>
        )}
      </section>

      {speech.supported && display && (
        <section className="mb-8 space-y-4">
          <h2 className="text-lg font-bold text-ink">Voice</h2>
          <ToggleRow
            label="Read replies aloud"
            hint="The assistant reads its answers out loud. Emergency messages are always read."
            checked={readAloud}
            onChange={toggleReadAloud}
          />
        </section>
      )}

      {saveError && display && (
        <p role="alert" className="mb-8 rounded-control bg-danger-light p-3 text-danger">
          {saveError}
        </p>
      )}

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
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="tap-target flex items-center justify-between gap-4 rounded-control border-2 border-line bg-white px-4 py-3">
      <span>
        <span className="block text-lg font-bold text-ink">{label}</span>
        {hint && <span className="block text-ink-soft">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-7 w-7 shrink-0 accent-accent"
      />
    </label>
  );
}
