import { eq, inArray, notInArray } from "drizzle-orm";
import type { QualificationLevel, ServiceCategoryCode, VerificationStatus } from "@handy/contracts";
import type { Database } from "./client";
import { hashPassword } from "./password";
import {
  caregiverInvites,
  caregiverLinks,
  conversations,
  customerProfiles,
  jobMessages,
  jobOffers,
  jobs,
  messages,
  notifications,
  ratings,
  serviceCategories,
  serviceRequests,
  users,
  workerAvailability,
  workerProfiles,
  workerQualifications,
} from "./schema";

export const DEMO_PASSWORD = "password123";

export const SERVICE_CATEGORY_SEED: Array<typeof serviceCategories.$inferInsert> = [
  { id: "HOME_MAINTENANCE", name: "Home maintenance", description: "Light bulbs, fixtures, small repairs, furniture assembly", requiresQualification: true, basePriceCents: 4500 },
  { id: "CLEANING", name: "Cleaning", description: "House cleaning and tidying up", requiresQualification: false, basePriceCents: 5000 },
  { id: "LAWN_CARE", name: "Lawn care", description: "Mowing, weeding, raking leaves", requiresQualification: false, basePriceCents: 4000 },
  { id: "ERRANDS", name: "Errands", description: "Grocery pickup, pharmacy pickup, package returns, shopping", requiresQualification: false, basePriceCents: 2500 },
  { id: "TRANSPORTATION", name: "Transportation", description: "Rides to appointments, the airport, or the store", requiresQualification: true, basePriceCents: 3000 },
  { id: "PET_ASSISTANCE", name: "Pet assistance", description: "Dog walking, pet transportation, feeding and check-ins", requiresQualification: true, basePriceCents: 2500 },
  { id: "TECH_SUPPORT", name: "Technology help", description: "Phones, computers, smart TVs, Wi-Fi", requiresQualification: false, basePriceCents: 3500 },
  { id: "COMPANIONSHIP", name: "Companionship", description: "Check-in visits, conversation, accompanying to activities (non-medical)", requiresQualification: false, basePriceCents: 3000 },
  { id: "MOVING_ASSISTANCE", name: "Moving help", description: "Moving furniture and heavy items", requiresQualification: true, basePriceCents: 3500 },
];

// Demo area: around Georgia Tech, Atlanta. 1 mile ≈ 0.0145° latitude.
const HOME = { lat: 33.7756, lng: -84.3963 };
const milesNorth = (mi: number) => HOME.lat + mi * 0.01449;
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

interface DemoWorker {
  firstName: string;
  lastName: string;
  bio: string;
  rating: number;
  ratingCount: number;
  completedJobs: number;
  milesAway: number;
  serviceRadius: number;
  verificationStatus: VerificationStatus;
  services: Array<[ServiceCategoryCode, QualificationLevel]>;
  days: number[];
  hours: [string, string];
}

const DEMO_WORKERS: DemoWorker[] = [
  {
    firstName: "James", lastName: "Robinson", bio: "Handyman for 20 years. Happy to help with anything around the house.",
    rating: 4.9, ratingCount: 80, completedJobs: 87, milesAway: 2.4, serviceRadius: 15, verificationStatus: "VERIFIED",
    services: [["HOME_MAINTENANCE", "EXPERIENCED"], ["MOVING_ASSISTANCE", "EXPERIENCED"]], days: EVERY_DAY, hours: ["08:00", "21:00"],
  },
  {
    firstName: "Maria", lastName: "Lopez", bio: "Errands, cleaning and yard work. Always on time.",
    rating: 4.8, ratingCount: 48, completedJobs: 52, milesAway: 3.1, serviceRadius: 12, verificationStatus: "VERIFIED",
    services: [["ERRANDS", "EXPERIENCED"], ["LAWN_CARE", "BASIC"], ["CLEANING", "EXPERIENCED"]], days: EVERY_DAY, hours: ["09:00", "18:00"],
  },
  {
    firstName: "David", lastName: "Chen", bio: "Retired teacher. I drive to appointments and enjoy good conversation.",
    rating: 4.7, ratingCount: 30, completedJobs: 34, milesAway: 1.8, serviceRadius: 20, verificationStatus: "VERIFIED",
    services: [["TRANSPORTATION", "EXPERIENCED"], ["COMPANIONSHIP", "EXPERIENCED"], ["ERRANDS", "BASIC"]], days: EVERY_DAY, hours: ["08:00", "20:00"],
  },
  {
    firstName: "Aisha", lastName: "Patel", bio: "IT professional who loves helping people get comfortable with technology.",
    rating: 4.95, ratingCount: 40, completedJobs: 41, milesAway: 4.0, serviceRadius: 15, verificationStatus: "VERIFIED",
    services: [["TECH_SUPPORT", "CERTIFIED"], ["COMPANIONSHIP", "BASIC"]], days: EVERY_DAY, hours: ["10:00", "20:00"],
  },
  {
    firstName: "Tom", lastName: "Walker", bio: "Strong back, pickup truck, and a lawn mower.",
    rating: 4.6, ratingCount: 22, completedJobs: 25, milesAway: 5.5, serviceRadius: 25, verificationStatus: "VERIFIED",
    services: [["MOVING_ASSISTANCE", "EXPERIENCED"], ["HOME_MAINTENANCE", "BASIC"], ["LAWN_CARE", "EXPERIENCED"]], days: EVERY_DAY, hours: ["07:00", "19:00"],
  },
  {
    firstName: "Grace", lastName: "Kim", bio: "Dog walker and pet sitter. Your pets are family to me.",
    rating: 4.9, ratingCount: 60, completedJobs: 66, milesAway: 2.0, serviceRadius: 10, verificationStatus: "VERIFIED",
    services: [["PET_ASSISTANCE", "EXPERIENCED"], ["ERRANDS", "BASIC"]], days: EVERY_DAY, hours: ["07:00", "19:00"],
  },
  {
    firstName: "Marcus", lastName: "Johnson", bio: "Cleaning and moving help on weekdays.",
    rating: 4.5, ratingCount: 15, completedJobs: 18, milesAway: 9.0, serviceRadius: 15, verificationStatus: "VERIFIED",
    services: [["CLEANING", "BASIC"], ["MOVING_ASSISTANCE", "BASIC"]], days: WEEKDAYS, hours: ["08:00", "17:00"],
  },
  {
    firstName: "Linda", lastName: "Brooks", bio: "New to the platform — background check in progress.",
    rating: 0, ratingCount: 0, completedJobs: 0, milesAway: 1.2, serviceRadius: 10, verificationStatus: "PENDING",
    services: [["COMPANIONSHIP", "BASIC"], ["TRANSPORTATION", "BASIC"]], days: EVERY_DAY, hours: ["09:00", "17:00"],
  },
];

const ADMIN = { role: "ADMIN" as const, firstName: "Ada", lastName: "Admin", email: "admin@handy.demo", phone: null };
const CUSTOMER = { role: "CUSTOMER" as const, firstName: "Margaret", lastName: "Thompson", email: "margaret@handy.demo", phone: "404-555-0100" };
/** Margaret's daughter (also her emergency contact), linked as her caregiver. */
const CAREGIVER = { role: "CAREGIVER" as const, firstName: "Susan", lastName: "Thompson", email: "susan@handy.demo", phone: "404-555-0101" };
const CUSTOMER_PROFILE = {
  address: "123 Main Street, Atlanta, GA",
  latitude: HOME.lat,
  longitude: HOME.lng,
  accessibilityPreferences: { largeText: true, voiceInput: true },
  emergencyContact: { name: "Susan Thompson", phone: "404-555-0101", relationship: "Daughter" },
  communicationPreferences: { preferredChannel: "IN_APP" as const },
};
const workerUser = (w: DemoWorker) => ({
  role: "WORKER" as const,
  firstName: w.firstName,
  lastName: w.lastName,
  email: `${w.firstName.toLowerCase()}@handy.demo`,
  phone: "404-555-0199",
});
const workerProfile = (w: DemoWorker) => ({
  bio: w.bio,
  rating: w.rating,
  ratingCount: w.ratingCount,
  completedJobs: w.completedJobs,
  serviceRadius: w.serviceRadius,
  address: "Atlanta, GA",
  latitude: milesNorth(w.milesAway),
  longitude: HOME.lng,
  availabilityStatus: "AVAILABLE" as const,
  verificationStatus: w.verificationStatus,
});

/** All emails the seed creates. */
export const DEMO_EMAILS = [ADMIN.email, CUSTOMER.email, CAREGIVER.email, ...DEMO_WORKERS.map((w) => workerUser(w).email)];

async function insertWorkerServices(tx: Database, workerId: string, w: DemoWorker) {
  await tx.insert(workerQualifications).values(
    w.services.map(([serviceCategoryId, qualificationLevel]) => ({ workerId, serviceCategoryId, qualificationLevel })),
  );
  await tx.insert(workerAvailability).values(w.days.map((dayOfWeek) => ({ workerId, dayOfWeek, startTime: w.hours[0], endTime: w.hours[1] })));
}

/** One completed job so the customer's history screen isn't empty. */
async function insertPastJob(tx: Database, customerId: string, workerId: string) {
  const completedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const [pastRequest] = await tx
    .insert(serviceRequests)
    .values({
      customerId,
      serviceCategoryId: "ERRANDS",
      description: "Pick up grocery order from Kroger",
      location: CUSTOMER_PROFILE.address,
      latitude: HOME.lat,
      longitude: HOME.lng,
      requestedDate: completedAt.toISOString().slice(0, 10),
      requestedStartTime: "15:00",
      requestedEndTime: "16:00",
      status: "COMPLETED",
      estimatedPriceCents: 2500,
      platformFeeCents: 500,
      createdAt: completedAt,
    })
    .returning();
  const [pastJob] = await tx
    .insert(jobs)
    .values({
      requestId: pastRequest!.id,
      workerId,
      status: "COMPLETED",
      acceptedAt: completedAt,
      enRouteAt: completedAt,
      arrivedAt: completedAt,
      startedAt: completedAt,
      completedAt,
      finalPriceCents: 2500,
      createdAt: completedAt,
    })
    .returning();
  await tx.insert(ratings).values({
    jobId: pastJob!.id,
    customerId,
    workerId,
    score: 5,
    comment: "Maria was very helpful and arrived on time.",
    createdAt: completedAt,
  });
}

export async function isSeeded(db: Database): Promise<boolean> {
  const rows = await db.select({ id: serviceCategories.id }).from(serviceCategories).limit(1);
  return rows.length > 0;
}

/** Inserts service categories and demo accounts. No-op when already seeded. */
export async function seed(db: Database, log: (msg: string) => void = console.log): Promise<void> {
  if (await isSeeded(db)) {
    log("Database already seeded — skipping.");
    return;
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    await tx.insert(serviceCategories).values(SERVICE_CATEGORY_SEED);

    await tx.insert(users).values({ ...ADMIN, passwordHash });
    const [customer] = await tx.insert(users).values({ ...CUSTOMER, passwordHash }).returning();
    await tx.insert(customerProfiles).values({ userId: customer!.id, ...CUSTOMER_PROFILE });
    const [caregiver] = await tx.insert(users).values({ ...CAREGIVER, passwordHash }).returning();
    await tx.insert(caregiverLinks).values({ customerId: customer!.id, caregiverId: caregiver!.id });

    const workerIds: Record<string, string> = {};
    for (const w of DEMO_WORKERS) {
      const [user] = await tx.insert(users).values({ ...workerUser(w), passwordHash }).returning();
      workerIds[w.firstName] = user!.id;
      await tx.insert(workerProfiles).values({ userId: user!.id, ...workerProfile(w) });
      await insertWorkerServices(tx, user!.id, w);
    }
    await insertPastJob(tx, customer!.id, workerIds.Maria!);
  });

  log(`Seeded ${SERVICE_CATEGORY_SEED.length} categories, 1 admin, 1 customer, 1 caregiver, ${DEMO_WORKERS.length} workers. Password for all: ${DEMO_PASSWORD}`);
}

/**
 * Puts the database back to the freshly seeded demo state without changing
 * the demo accounts' ids, so anyone already logged in stays logged in.
 * Removes all requests, jobs, chats and notifications, and any accounts that
 * signed up after seeding.
 */
export async function resetDemoData(db: Database): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db.transaction(async (tx) => {
    await tx.delete(notifications);
    await tx.delete(ratings);
    await tx.delete(jobMessages);
    await tx.delete(jobs);
    await tx.delete(jobOffers);
    await tx.delete(serviceRequests);
    await tx.delete(messages);
    await tx.delete(conversations);
    await tx.delete(caregiverInvites);
    await tx.delete(caregiverLinks);
    await tx.delete(users).where(notInArray(users.email, DEMO_EMAILS));

    const existing = await tx.select().from(users).where(inArray(users.email, DEMO_EMAILS));
    const idByEmail = new Map(existing.map((u) => [u.email, u.id]));
    const need = (email: string) => {
      const id = idByEmail.get(email);
      if (!id) throw new Error(`Demo account ${email} is missing; run pnpm db:reset instead.`);
      return id;
    };

    const customerId = need(CUSTOMER.email);
    await tx.update(users).set(CUSTOMER).where(eq(users.id, customerId));
    await tx.update(customerProfiles).set(CUSTOMER_PROFILE).where(eq(customerProfiles.userId, customerId));
    // Databases seeded before caregivers existed won't have Susan yet.
    const caregiverId =
      idByEmail.get(CAREGIVER.email) ?? (await tx.insert(users).values({ ...CAREGIVER, passwordHash }).returning())[0]!.id;
    await tx.update(users).set(CAREGIVER).where(eq(users.id, caregiverId));
    await tx.insert(caregiverLinks).values({ customerId, caregiverId });

    for (const w of DEMO_WORKERS) {
      const id = need(workerUser(w).email);
      await tx.update(users).set(workerUser(w)).where(eq(users.id, id));
      await tx.update(workerProfiles).set(workerProfile(w)).where(eq(workerProfiles.userId, id));
      await tx.delete(workerQualifications).where(eq(workerQualifications.workerId, id));
      await tx.delete(workerAvailability).where(eq(workerAvailability.workerId, id));
      await insertWorkerServices(tx, id, w);
    }
    await insertPastJob(tx, customerId, need("maria@handy.demo"));
  });
}
