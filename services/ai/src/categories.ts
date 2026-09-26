/** Service category codes, matching spec's ServiceCategory seeds. Table + code → id mapping owned by Engineer 2. */
export const SERVICE_CATEGORIES = [
  "HOME_MAINTENANCE",
  "CLEANING",
  "LAWN_CARE",
  "ERRANDS",
  "TRANSPORTATION",
  "PET_ASSISTANCE",
  "TECH_SUPPORT",
  "COMPANIONSHIP",
  "MOVING_ASSISTANCE",
] as const;

export type ServiceCategoryCode = (typeof SERVICE_CATEGORIES)[number];

export const CATEGORY_INFO: Record<ServiceCategoryCode, { label: string; covers: string }> = {
  HOME_MAINTENANCE: {
    label: "Home maintenance",
    covers:
      "minor repairs, light bulbs and porch lights, smoke alarm batteries, furniture assembly, small leaks, looking at an appliance that stopped working",
  },
  CLEANING: { label: "Cleaning", covers: "house cleaning, tidying, organizing, laundry" },
  LAWN_CARE: { label: "Lawn care", covers: "mowing, raking leaves, weeding, yard cleanup, snow shoveling" },
  ERRANDS: {
    label: "Errands",
    covers: "grocery pickup, pharmacy pickup, package returns, shopping, post office runs (customer stays home)",
  },
  TRANSPORTATION: {
    label: "Transportation",
    covers: "rides to appointments, the airport, church, or the store (customer rides along)",
  },
  PET_ASSISTANCE: { label: "Pet help", covers: "dog walking, feeding and check-ins, taking a pet to the vet" },
  TECH_SUPPORT: {
    label: "Tech help",
    covers: "phones, computers, tablets, smart TVs, Wi-Fi, printers, video calls",
  },
  COMPANIONSHIP: {
    label: "Companionship",
    covers: "check-in visits, conversation, going along to an activity, everyday non-medical help",
  },
  MOVING_ASSISTANCE: {
    label: "Moving help",
    covers: "moving furniture, carrying heavy items, loading and unloading",
  },
};
