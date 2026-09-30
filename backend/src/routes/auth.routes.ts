import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/authTokens";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { UserRole } from "@prisma/client";
import { loginLimiter } from "../middleware/rateLimit";
import { getAccessibleSiteIds } from "../lib/siteAccess";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
    if (!user || !user.isActive) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }
    // Client clarification (2026-08-25): a company that stops paying gets
    // deactivated by SUPER_ADMIN via Company.isActive -- this is the actual
    // enforcement behind that. Checked only after the password verifies (not
    // folded into the "invalid credentials" branch above), so a real user
    // with the right password gets told the real reason instead of a
    // misleading "wrong password," while a wrong-password attempt still
    // reveals nothing about the company's status.
    if (!user.company.isActive) {
      throw new AppError("Your company's access is currently inactive. Contact ALS Solutions.", 403, "COMPANY_INACTIVE");
    }
    const token = signToken({ userId: user.id, companyId: user.companyId, role: user.role, email: user.email, name: user.name });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId },
    });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError("User not found.", 404);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId });
  })
);

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.nativeEnum(UserRole),
  // Site-scoped RBAC (client clarification's 3-tier hierarchy -- see
  // lib/siteAccess.ts). Omitted/undefined = unrestricted, same as today's
  // only behavior; a scoped caller (see below) cannot leave this omitted.
  siteIds: z.array(z.number().int()).optional(),
  // SUPER_ADMIN-only (client clarification, 2026-08-25): targets a
  // different company than the caller's own -- this is the actual
  // onboarding mechanism for a new client's first COMPANY_ADMIN. Silently
  // ignored for every other role, which stays forced to its own company.
  companyId: z.number().int().optional(),
});

/** Validates that every id in `siteIds` is actually one of this company's
 * own sites -- a caller (scoped or not) must never be able to grant access
 * to another company's site by guessing its id. */
async function assertSitesBelongToCompany(companyId: number, siteIds: number[]): Promise<void> {
  if (siteIds.length === 0) return;
  const count = await prisma.site.count({ where: { id: { in: siteIds }, companyId } });
  if (count !== siteIds.length) {
    throw new AppError("One or more siteIds are not valid sites for your company.", 400);
  }
}

async function replaceSiteAccess(userId: number, siteIds: number[]): Promise<void> {
  await prisma.$transaction([
    prisma.userSiteAccess.deleteMany({ where: { userId } }),
    ...(siteIds.length > 0
      ? [prisma.userSiteAccess.createMany({ data: siteIds.map((siteId) => ({ userId, siteId })) })]
      : []),
  ]);
}

// Admin-tier user management (SUPER_ADMIN and COMPANY_ADMIN). SUPER_ADMIN
// manages accounts across every company (client clarification, 2026-08-25:
// SUPER_ADMIN onboards/manages each client company's accounts, though it
// still never sees another company's operational data -- see
// companies.routes.ts's own header comment for that scope line).
// COMPANY_ADMIN/COMPANY_USER stay scoped to their own company exactly as
// before.
authRouter.get(
  "/users",
  requireAuth,
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  asyncHandler(async (req, res) => {
    const callerAccess = await getAccessibleSiteIds(req.user!.userId);
    // An explicit ?companyId= lets SUPER_ADMIN look at one company; omitted
    // lists every company's users, since ALS (SUPER_ADMIN's own company)
    // has none of its own to show by default.
    const companyFilter =
      req.user!.role === UserRole.SUPER_ADMIN
        ? req.query.companyId
          ? Number(req.query.companyId)
          : undefined
        : req.user!.companyId;
    const users = await prisma.user.findMany({
      where: { companyId: companyFilter },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        companyId: true,
        company: { select: { name: true } },
        siteAccess: { select: { siteId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const shaped = users.map((u) => ({ ...u, siteIds: u.siteAccess.map((a) => a.siteId), siteAccess: undefined }));
    // A scoped caller ("Certification Executive") only sees users who share
    // at least one of their own sites -- not the company's unrestricted
    // top-level admins or users scoped to sites they can't see themselves.
    // SUPER_ADMIN is never scoped (holds no UserSiteAccess rows at all), so
    // this branch never applies to it.
    const visible =
      callerAccess === null ? shaped : shaped.filter((u) => u.siteIds.some((id) => callerAccess.includes(id)));
    res.json(visible);
  })
);

authRouter.post(
  "/users",
  requireAuth,
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  asyncHandler(async (req, res) => {
    const data = createUserSchema.parse(req.body);

    // SUPER_ADMIN may target any real company -- the actual mechanism for
    // creating a new client's first COMPANY_ADMIN. Every other role is
    // forced to its own company regardless of what's in the body.
    let targetCompanyId = req.user!.companyId;
    if (req.user!.role === UserRole.SUPER_ADMIN && data.companyId !== undefined) {
      const targetCompany = await prisma.company.findUnique({ where: { id: data.companyId } });
      if (!targetCompany) throw new AppError("Target company not found.", 404);
      targetCompanyId = targetCompany.id;
    }

    const callerAccess = await getAccessibleSiteIds(req.user!.userId);
    let siteIds: number[];
    if (callerAccess !== null) {
      // A scoped admin can only ever create users scoped to sites within
      // their own reach -- never company-wide, and never a site they
      // themselves cannot see. (SUPER_ADMIN is never scoped, so a
      // cross-company create never hits this branch.)
      if (!data.siteIds || data.siteIds.length === 0) {
        throw new AppError(
          "As a site-scoped admin, you must assign the new user to at least one of your own sites.",
          403,
          "SITE_ACCESS_DENIED"
        );
      }
      const notOwned = data.siteIds.filter((id) => !callerAccess.includes(id));
      if (notOwned.length > 0) {
        throw new AppError("You cannot grant access to a site outside your own scope.", 403, "SITE_ACCESS_DENIED");
      }
      siteIds = data.siteIds;
    } else {
      siteIds = data.siteIds ?? [];
    }
    // Validated against the TARGET company, not the caller's own -- matters
    // once SUPER_ADMIN can create a user in a different company than itself.
    await assertSitesBelongToCompany(targetCompanyId, siteIds);

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { companyId: targetCompanyId, name: data.name, email: data.email, passwordHash, role: data.role },
    });
    if (siteIds.length > 0) await replaceSiteAccess(user.id, siteIds);
    res
      .status(201)
      .json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, companyId: user.companyId, siteIds });
  })
);

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
  // When present, REPLACES the user's whole site-access set; omit to leave
  // it unchanged.
  siteIds: z.array(z.number().int()).optional(),
});

authRouter.patch(
  "/users/:id",
  requireAuth,
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = updateUserSchema.parse(req.body);
    // SUPER_ADMIN may target a user in any company; every other role stays
    // scoped to its own company exactly as before.
    const existing = await prisma.user.findFirst({
      where: req.user!.role === UserRole.SUPER_ADMIN ? { id } : { id, companyId: req.user!.companyId },
      include: { siteAccess: { select: { siteId: true } } },
    });
    if (!existing) throw new AppError("User not found.", 404);

    const callerAccess = await getAccessibleSiteIds(req.user!.userId);
    if (callerAccess !== null) {
      // A scoped admin may only manage users who already share one of their
      // own sites -- not the company's unrestricted admins or users scoped
      // elsewhere. (SUPER_ADMIN is never scoped, so this never applies to a
      // cross-company update.)
      const existingSiteIds = existing.siteAccess.map((a) => a.siteId);
      if (!existingSiteIds.some((sid) => callerAccess.includes(sid))) {
        throw new AppError("User not found.", 404);
      }
      if (data.siteIds !== undefined) {
        if (data.siteIds.length === 0 || data.siteIds.some((sid) => !callerAccess.includes(sid))) {
          throw new AppError(
            "As a site-scoped admin, you can only reassign this user to sites within your own scope -- never unrestrict them.",
            403,
            "SITE_ACCESS_DENIED"
          );
        }
      }
    }
    // Validated against the TARGET user's own company, not the caller's --
    // matters once SUPER_ADMIN can update a user in a different company.
    if (data.siteIds !== undefined) await assertSitesBelongToCompany(existing.companyId, data.siteIds);

    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    const user = await prisma.user.update({
      where: { id },
      data: { name: data.name, role: data.role, isActive: data.isActive, passwordHash },
    });
    if (data.siteIds !== undefined) await replaceSiteAccess(id, data.siteIds);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });
  })
);
