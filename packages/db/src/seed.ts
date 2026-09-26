import type { QualificationLevel, ServiceCategoryCode, VerificationStatus } from "@handy/contracts";
import type { Database } from "./client";
import { hashPassword } from "./password";
import {
  customerProfiles,
  jobs,
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

    await tx.insert(users).values({
      role: "ADMIN", firstName: "Ada", lastName: "Admin", email: "admin@handy.demo", passwordHash,
    });

    const [customer] = await tx
      .insert(users)
      .values({ role: "CUSTOMER", firstName: "Margaret", lastName: "Thompson", email: "margaret@handy.demo", phone: "404-555-0100", passwordHash })
      .returning();
    await tx.insert(customerProfiles).values({
      userId: customer!.id,
      address: "123 Main Street, Atlanta, GA",
      latitude: HOME.lat,
      longitude: HOME.lng,
      accessibilityPreferences: { largeText: true, voiceInput: true },
      emergencyContact: { name: "Susan Thompson", phone: "404-555-0101", relationship: "Daughter" },
      communicationPreferences: { preferredChannel: "IN_APP" },
    });

    const workerIds: Record<string, string> = {};
    for (const w of DEMO_WORKERS) {
      const [user] = await tx
        .insert(users)
        .values({ role: "WORKER", firstName: w.firstName, lastName: w.lastName, email: `${w.firstName.toLowerCase()}@handy.demo`, phone: "404-555-0199", passwordHash })
        .returning();
      workerIds[w.firstName] = user!.id;
      await tx.insert(workerProfiles).values({
        userId: user!.id,
        bio: w.bio,
        rating: w.rating,
        ratingCount: w.ratingCount,
        completedJobs: w.completedJobs,
        serviceRadius: w.serviceRadius,
        address: "Atlanta, GA",
        latitude: milesNorth(w.milesAway),
        longitude: HOME.lng,
        availabilityStatus: "AVAILABLE",
        verificationStatus: w.verificationStatus,
      });
      await tx.insert(workerQualifications).values(
        w.services.map(([serviceCategoryId, qualificationLevel]) => ({ workerId: user!.id, serviceCategoryId, qualificationLevel })),
      );
      await tx.insert(workerAvailability).values(
        w.days.map((dayOfWeek) => ({ workerId: user!.id, dayOfWeek, startTime: w.hours[0], endTime: w.hours[1] })),
      );
    }

    // One completed job so the customer's history screen isn't empty.
    const completedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const [pastRequest] = await tx
      .insert(serviceRequests)
      .values({
        customerId: customer!.id,
        serviceCategoryId: "ERRANDS",
        description: "Pick up grocery order from Kroger",
        location: "123 Main Street, Atlanta, GA",
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
        workerId: workerIds.Maria!,
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
      customerId: customer!.id,
      workerId: workerIds.Maria!,
      score: 5,
      comment: "Maria was very helpful and arrived on time.",
      createdAt: completedAt,
    });
  });

  log(`Seeded ${SERVICE_CATEGORY_SEED.length} categories, 1 admin, 1 customer, ${DEMO_WORKERS.length} workers. Password for all: ${DEMO_PASSWORD}`);
}
