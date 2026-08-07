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
import laborClassificationsRouter from "./labor-classifications";
import billableItemsRouter from "./billable-items";
import reportTemplatesRouter from "./report-templates";
import pkbRouter from "./pkb";
import poleCaptureRouter from "./pole-capture";
import poleAssetsRouter from "./pole-assets";

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
router.use(laborClassificationsRouter);
router.use(billableItemsRouter);
router.use(reportTemplatesRouter);
router.use(pkbRouter);
router.use(poleCaptureRouter);
router.use(poleAssetsRouter);

export default router;
