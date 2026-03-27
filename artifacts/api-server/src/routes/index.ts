import { Router, type IRouter } from "express";
import healthRouter from "./health";
import claudeRouter from "./claude";
import mediaRouter from "./media";
import analyzeRouter from "./analyze";

const router: IRouter = Router();

router.use(healthRouter);
router.use(claudeRouter);
router.use(mediaRouter);
router.use(analyzeRouter);

export default router;
