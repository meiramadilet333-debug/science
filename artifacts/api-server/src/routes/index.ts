import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scientificRadarRouter from "./scientific-radar";
import scientificResearchRouter from "./scientific-research";
import scientificTopicsRouter from "./scientific-topics";
import scientificSourcesRouter from "./scientific-sources";
import scientificWorksRouter from "./scientific-works";
import scientificPublicationsRouter from "./scientific-publications";
import grantsRouter from "./grants";
import scientificAssistantRouter from "./scientific-assistant";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scientificRadarRouter);
router.use(scientificResearchRouter);
router.use(scientificTopicsRouter);
router.use(scientificSourcesRouter);
router.use(scientificWorksRouter);
router.use(scientificPublicationsRouter);
router.use(grantsRouter);
router.use(scientificAssistantRouter);

export default router;
