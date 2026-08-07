import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable, companyMembershipsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { parsePositiveId } from "../lib/requestValues";

export interface AuthenticatedRequest extends Request<Record<string, string>> {
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
  const companyId = parsePositiveId(
    req.params.companyId ?? req.query.companyId,
  );
  if (!req.userId || !req.clerkUserId || companyId === null) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [membership] = await db
    .select()
    .from(companyMembershipsTable)
    .where(and(
      eq(companyMembershipsTable.companyId, companyId),
      eq(companyMembershipsTable.clerkUserId, req.clerkUserId),
    ));

  if (!membership || !roles.includes(membership.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  req.companyRole = membership.role;
  next();
};
