import { Router } from 'express';
import { liveCheck, readyCheck } from './health.controller.js';

const router = Router();

router.get('/', liveCheck);
router.get('/live', liveCheck);
router.get('/ready', readyCheck);

export default router;
