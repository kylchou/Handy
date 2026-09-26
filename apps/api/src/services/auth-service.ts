import { hashPassword, verifyPassword } from "@handy/db";
import type { AuthResponse, LoginBody, MeResponse, SignupBody } from "@handy/contracts";
import { ApiError } from "../lib/errors";
import { fillCoordinates } from "../lib/geocoder";
import { customerProfilesRepo, usersRepo } from "../repositories/users";
import { workersRepo } from "../repositories/workers";
import type { Actor, ServiceContext } from "./context";
import { toCustomerProfileDTO, toUserDTO, toWorkerProfileDTO } from "./mappers";

export type TokenSigner = (actor: Actor) => { token: string; expiresAt: string };

export class AuthService {
  constructor(
    private ctx: ServiceContext,
    private sign: TokenSigner,
  ) {}

  async signup(body: SignupBody): Promise<AuthResponse> {
    if (await usersRepo.findByEmail(this.ctx.db, body.email)) {
      throw new ApiError("CONFLICT", "An account with this email already exists. Try logging in instead.");
    }
    const passwordHash = await hashPassword(body.password);
    const place = await fillCoordinates(this.ctx.geocoder, body);
    const user = await this.ctx.db.transaction(async (tx) => {
      const user = await usersRepo.create(tx, {
        role: body.role,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash,
      });
      const location = { address: place.address ?? null, latitude: place.latitude ?? null, longitude: place.longitude ?? null };
      if (body.role === "CUSTOMER") {
        await customerProfilesRepo.upsert(tx, user.id, location);
      } else if (body.role === "WORKER") {
        // New workers start PENDING verification and are not matched until an admin verifies them.
        await workersRepo.createProfile(tx, { userId: user.id, ...location, verificationStatus: "PENDING" });
      }
      return user;
    });
    return { ...this.sign({ id: user.id, role: user.role }), user: toUserDTO(user) };
  }

  async login(body: LoginBody): Promise<AuthResponse> {
    const user = await usersRepo.findByEmail(this.ctx.db, body.email);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new ApiError("UNAUTHENTICATED", "That email and password don't match our records.");
    }
    return { ...this.sign({ id: user.id, role: user.role }), user: toUserDTO(user) };
  }

  async me(actor: Actor): Promise<MeResponse> {
    const user = await usersRepo.findById(this.ctx.db, actor.id);
    if (!user) throw new ApiError("UNAUTHENTICATED", "Your session has ended. Please log in again.");
    let customerProfile: MeResponse["customerProfile"] = null;
    let workerProfile: MeResponse["workerProfile"] = null;
    if (user.role === "CUSTOMER") {
      const p = await customerProfilesRepo.get(this.ctx.db, user.id);
      customerProfile = p ? toCustomerProfileDTO(p) : null;
    } else if (user.role === "WORKER") {
      const p = await workersRepo.getProfile(this.ctx.db, user.id);
      if (p) {
        const [quals, slots] = await Promise.all([
          workersRepo.qualifications(this.ctx.db, [user.id]),
          workersRepo.availability(this.ctx.db, [user.id]),
        ]);
        workerProfile = toWorkerProfileDTO(p, quals, slots);
      }
    }
    return { user: toUserDTO(user), customerProfile, workerProfile };
  }
}
