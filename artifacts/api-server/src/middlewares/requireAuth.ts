import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, companyMembershipsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  userId?: number;
  clerkUserId?: string;
  companyRole?: string;
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.clerkUserId = clerkUserId;

  // JIT-provision user
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (user) {
    req.userId = user.id;
  }

  next();
};

export const requireCompanyRole = (
  roles: string[],
) => async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const companyId = parseInt(req.params.companyId ?? req.query.companyId as string, 10);
  if (!req.userId || isNaN(companyId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [membership] = await db
    .select()
    .from(companyMembershipsTable)
    .where(eq(companyMembershipsTable.companyId, companyId));

  if (!membership || !roles.includes(membership.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  req.companyRole = membership.role;
  next();
};
