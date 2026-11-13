import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import focusMediaRouter from "./focusMedia";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(focusMediaRouter);

export default router;
