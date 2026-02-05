import { Router } from "express";
import stocksRouter from "./stocks.js";
import usersRouter from "./user.js";

const router = Router();

router.use("/users", usersRouter);
router.use("/stocks", stocksRouter);

export default router;