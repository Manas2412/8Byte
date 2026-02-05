import { Router } from "express";

const usersRouter = Router();

usersRouter.get("/profile", (_req, res) => {
  res.json({
    id: "demo-user",
    name: "Demo User",
    email: "demo@example.com",
  });
});

usersRouter.post("/login", (req, res) => {
  const { email } = req.body ?? {};

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  res.json({
    token: "demo-token",
    email,
  });
});

export default usersRouter;
