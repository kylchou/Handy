"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Clock } from "lucide-react";
import { SERVICE_CATEGORY_CODES, type QualificationLevel, type RatingDTO, type ServiceCategoryCode, type WorkerProfileDTO } from "@handy/contracts";
import Button from "@/components/Button";
import Page, { ErrorNote } from "@/components/Page";
import { api, friendlyError, useRequireLogin } from "@/lib/api";
import { CATEGORY_LABELS } from "@/lib/format";

type Level = QualificationLevel | "NONE";
const LEVELS: { value: Level; label: string }[] = [
  { value: "NONE", label: "No" },
  { value: "BASIC", label: "Basic" },
  { value: "EXPERIENCED", label: "Experienced" },
  { value: "CERTIFIED", label: "Certified" },
];

const VERIFICATION: Record<string, string> = {
  VERIFIED: "Verified",
  PENDING: "Being reviewed",
  UNVERIFIED: "Not verified yet",
  REJECTED: "Not approved",
};

export default function ProfilePage() {
  useRequireLogin();
  const router = useRouter();
  const [profile, setProfile] = useState<WorkerProfileDTO | null>(null);
  const [reviews, setReviews] = useState<RatingDTO[]>([]);
  const [bio, setBio] = useState("");
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(10);
  const [skills, setSkills] = useState<Record<string, Level>>({});
  const [welcome, setWelcome] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api.getToken()) return; // not logged in, the login redirect handles it
    setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1");
    api.workers
      .getProfile()
      .then((p) => {
        setProfile(p);
        setBio(p.bio ?? "");
        setAddress(p.address ?? "");
        setRadius(p.serviceRadius);
        setSkills(Object.fromEntries(p.qualifications.map((q) => [q.serviceCategoryId, q.qualificationLevel])));
        return api.workers.ratings(p.userId).then(setReviews);
      })
      .catch((err) => setError(friendlyError(err)));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.workers.updateProfile({ bio: bio.trim() || null, address: address.trim() || null, serviceRadius: radius });
      const qualifications = Object.entries(skills)
        .filter(([, level]) => level !== "NONE")
        .map(([serviceCategoryId, level]) => ({
          serviceCategoryId: serviceCategoryId as ServiceCategoryCode,
          qualificationLevel: level as QualificationLevel,
        }));
      setProfile(await api.workers.updateQualifications({ qualifications }));
      setSaved(true);
      if (welcome) router.push("/availability?welcome=1");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await api.auth.logout();
    router.push("/login");
  }

  if (!profile) return <Page title="Profile">{error ? <ErrorNote>{error}</ErrorNote> : <p className="text-ink-soft">Loading…</p>}</Page>;

  return (
    <Page title="Profile">
      <div className="space-y-5">
        {welcome && (
          <p className="rounded-card border-2 border-accent bg-accent-light p-4 text-ink">
            <strong>Welcome to Handy!</strong> Pick the kinds of jobs you can do and how far you'll travel. Then set your hours.
          </p>
        )}

        <p className="flex items-center gap-2 text-lg">
          {profile.verificationStatus === "VERIFIED" ? (
            <BadgeCheck aria-hidden="true" className="text-accent" />
          ) : (
            <Clock aria-hidden="true" className="text-warm" />
          )}
          <span className="font-bold">{VERIFICATION[profile.verificationStatus]}</span>
          {profile.verificationStatus !== "VERIFIED" && <span className="text-ink-soft">· you'll get jobs once you're verified</span>}
        </p>

        <section aria-label="Your reviews" className="space-y-2">
          <h2 className="text-lg font-bold text-ink">
            What customers say <span className="font-normal text-ink-soft">· ★ {profile.rating.toFixed(1)} from {profile.ratingCount} ratings</span>
          </h2>
          <p className="text-sm text-ink-soft">Customers can read these on your card before and during a job.</p>
          {reviews.filter((r) => r.comment).length === 0 ? (
            <p className="rounded-card border border-dashed border-line bg-white p-4 text-ink-soft">No written reviews yet.</p>
          ) : (
            reviews
              .filter((r) => r.comment)
              .slice(0, 10)
              .map((r) => (
                <figure key={r.id} className="rounded-card border border-line bg-white p-3">
                  <p className="text-warm" aria-label={`${r.score} out of 5 stars`}>
                    {"★".repeat(r.score)}
                  </p>
                  <blockquote className="text-ink">"{r.comment}"</blockquote>
                  <figcaption className="text-sm text-ink-soft">
                    {r.reviewerName ?? "A Handy customer"} · {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </figcaption>
                </figure>
              ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Jobs you can do</h2>
          {SERVICE_CATEGORY_CODES.map((code) => (
            <fieldset key={code} className="rounded-card border border-line bg-white p-3">
              <legend className="px-1 font-bold text-ink">{CATEGORY_LABELS[code]}</legend>
              <div className="grid grid-cols-4 gap-1">
                {LEVELS.map(({ value, label }) => {
                  const on = (skills[code] ?? "NONE") === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSkills((s) => ({ ...s, [code]: value }))}
                      className={`rounded-control px-1 py-2 text-sm font-bold ${
                        on ? (value === "NONE" ? "bg-line text-ink" : "bg-accent text-white") : "bg-paper text-ink-soft"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="space-y-2">
          <label htmlFor="radius" className="block text-lg font-bold text-ink">
            How far you'll go: {radius} miles
          </label>
          <input
            id="radius"
            type="range"
            min={1}
            max={50}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </section>

        <section className="space-y-2">
          <label htmlFor="address" className="block text-lg font-bold text-ink">
            Where you work from
          </label>
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-control border-2 border-field/60 bg-white px-4 py-3 text-lg"
          />
          <label htmlFor="bio" className="block pt-2 text-lg font-bold text-ink">
            About you
          </label>
          <p className="text-sm text-ink-soft">Customers see this when you accept their job.</p>
          <textarea
            id="bio"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-control border-2 border-field/60 bg-white px-4 py-3 text-lg"
          />
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !welcome && <p className="rounded-control bg-accent-light p-3 text-accent-dark">Saved.</p>}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : welcome ? "Save and set my hours" : "Save"}
        </Button>

        <Link href="/availability" className="block rounded-control border-2 border-line bg-white px-5 py-3 text-center text-lg font-bold text-ink">
          Set my weekly hours
        </Link>
        <Button variant="danger" onClick={logout}>
          Log Out
        </Button>
      </div>
    </Page>
  );
}
