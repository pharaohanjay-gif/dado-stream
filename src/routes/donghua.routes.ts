import { Router } from 'express';
import * as donghuaController from '../controllers/donghua.controller';

const router = Router();

// GET /api/donghua/home - Get trending/featured donghua
router.get('/home', donghuaController.getDonghuaHome);

// GET /api/donghua/ongoing - Get ongoing donghua series
router.get('/ongoing', donghuaController.getOngoingDonghua);

// GET /api/donghua/completed - Get completed donghua series
router.get('/completed', donghuaController.getCompletedDonghua);

// GET /api/donghua/search?q=keyword - Search donghua
router.get('/search', donghuaController.searchDonghua);

// GET /api/donghua/schedule?day=monday - Get donghua schedule
router.get('/schedule', donghuaController.getDonghuaSchedule);

// GET /api/donghua/:slug - Get donghua detail by slug
router.get('/:slug', donghuaController.getDonghuaDetail);

// GET /api/donghua/:slug/:episode - Watch donghua episode
router.get('/:slug/:episode', donghuaController.watchDonghuaEpisode);

export default router;
