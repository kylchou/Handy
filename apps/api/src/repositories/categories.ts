import { eq } from "drizzle-orm";
import { serviceCategories, type Database } from "@handy/db";
import type { ServiceCategoryCode } from "@handy/contracts";

export const categoriesRepo = {
  async list(db: Database) {
    return db.select().from(serviceCategories).orderBy(serviceCategories.name);
  },
  async get(db: Database, id: ServiceCategoryCode) {
    const [row] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    return row ?? null;
  },
};
