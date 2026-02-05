import { Router } from "express";
import jwt from "jsonwebtoken";
import authMiddleware, { type AuthRequest } from "./middleware.js";
import bcrypt from "bcrypt";
import "dotenv/config";
import { CreateUserSchema, SigninSchema } from "common/types";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

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
      // Existing user – redirect to sign-in page on the web app
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
      .json({ message: "Logged in" });
  } catch (error) {
    console.error("Error during sign-in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

usersRouter.get("/profile", authMiddleware, (req, res) => {
  const { userId } = req as AuthRequest;
  res.json({
    id: userId
  });
});


export default usersRouter;
