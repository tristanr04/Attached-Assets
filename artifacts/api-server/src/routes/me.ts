import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const clerkUserId = req.clerkUserId!;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  if (!user) {
    res.status(404).json({ error: "User profile not found. Call POST /me to create one." });
    return;
  }

  res.json({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
});

router.post("/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const clerkUserId = req.clerkUserId!;
  const { email, firstName, lastName, phone } = req.body;

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));

  let user;
  if (existing.length > 0) {
    [user] = await db
      .update(usersTable)
      .set({ email, firstName: firstName ?? null, lastName: lastName ?? null, phone: phone ?? null })
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .returning();
  } else {
    [user] = await db
      .insert(usersTable)
      .values({ clerkUserId, email, firstName: firstName ?? null, lastName: lastName ?? null, phone: phone ?? null })
      .returning();
  }

  res.json({
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  });
});

export default router;
