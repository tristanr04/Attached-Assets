import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import companiesRouter from "./companies";
import crewsRouter from "./crews";
import projectsRouter from "./projects";
import reportsRouter from "./reports";
import catalogRouter from "./catalog";
import dictationRouter from "./dictation";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(companiesRouter);
router.use(crewsRouter);
router.use(projectsRouter);
router.use(reportsRouter);
router.use(catalogRouter);
router.use(dictationRouter);
router.use(dashboardRouter);

export default router;
