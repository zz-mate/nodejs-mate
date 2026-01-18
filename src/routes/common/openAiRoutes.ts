import express from 'express';
import { qianWenSendMsg } from '../../controllers/common/qianwenController';

const router = express.Router();

// 单文件上传接口
router.post('/common/openai/qianwen',qianWenSendMsg);


export default router;