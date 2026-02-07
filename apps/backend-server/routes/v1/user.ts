import { Router } from "express";
import jwt from "jsonwebtoken";
import authMiddleware, { type AuthRequest } from "./middleware.js";
import bcrypt from "bcrypt";
import { CreateUserSchema, SigninSchema } from "common/types";
import { JWT_SECRET } from "backend-common/config";

// Lazy-load db so /health and server startup don't block on DB connection
let prismaPromise: Promise<typeof import("db/client").default> | null = null;
function getPrisma() {
  if (!prismaPromise) prismaPromise = import("db/client").then((m) => m.default);
  return prismaPromise;
}

const usersRouter = Router();

usersRouter.post("/sign-up", async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Incorrect inputs",
      issues: parsed.error.issues,
    });
    return;
  }

  const { email, password, name } = parsed.data;

  try {
    const prisma = await getPrisma();
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.redirect(303, "/sign-in");
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await (await getPrisma()).user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Error during sign-up:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

usersRouter.post("/sign-in", async (req, res) => {
  const parsed = SigninSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: "Incorrect inputs",
      issues: parsed.error.issues,
    });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const prisma = await getPrisma();
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      res.redirect(303, "/sign-up");
      return;
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password
    );

    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = jwt.sign(
      {
        userId: existingUser.id,
        email: existingUser.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      })
      .json({ message: "Logged in", token });
  } catch (error) {
    console.error("Error during sign-in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

usersRouter.get("/profile", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        portfolio: {
          include: { stocks: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    type UserWithProfile = typeof user & { phoneNumber?: string | null; countryCode?: string | null; bio?: string | null };
    const profileUser = user as UserWithProfile;
    const stocks = user.portfolio?.stocks ?? [];
    const totalInvestment = stocks.reduce(
      (sum, s) => sum + Number(s.investment),
      0
    );

    const profileStocks = stocks.map((s) => {
      const investment = Number(s.investment);
      const portfolioPercent =
        totalInvestment > 0 ? (investment / totalInvestment) * 100 : 0;
      return {
        id: s.id,
        stockName: s.name,
        symbol: s.symbol,
        industry: (s as { industry?: string }).industry ?? null,
        purchasePrice: Number(s.purchasedPrice),
        quantity: s.purchasedQuantity,
        investment,
        portfolioPercent: Math.round(portfolioPercent * 100) / 100,
        exchange: (s as { exchange?: string }).exchange ?? "NSE",
      };
    });

    res.json({
      id: profileUser.id,
      name: profileUser.name,
      email: profileUser.email,
      phoneNumber: profileUser.phoneNumber ?? null,
      countryCode: profileUser.countryCode ?? null,
      bio: profileUser.bio ?? null,
      stocks: profileStocks,
      totalInvestment,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

usersRouter.patch("/profile", authMiddleware, async (req, res) => {
  const { userId } = req as AuthRequest;
  const body = req.body as Record<string, unknown>;
  const updates: { name?: string; email?: string; phoneNumber?: string | null; countryCode?: string | null; bio?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.email === "string" && body.email.trim()) updates.email = body.email.trim();
  if (body.phoneNumber !== undefined) updates.phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() || null : null;
  if (body.countryCode !== undefined) updates.countryCode = typeof body.countryCode === "string" ? body.countryCode.trim() || null : null;
  if (body.bio !== undefined) updates.bio = typeof body.bio === "string" ? body.bio.trim() || null : null;

  try {
    const prisma = await getPrisma();
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });
    type UserWithProfile = typeof updated & { phoneNumber?: string | null; countryCode?: string | null; bio?: string | null };
    const profileUser = updated as UserWithProfile;
    res.json({
      id: profileUser.id,
      name: profileUser.name,
      email: profileUser.email,
      phoneNumber: profileUser.phoneNumber ?? null,
      countryCode: profileUser.countryCode ?? null,
      bio: profileUser.bio ?? null,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default usersRouter;
