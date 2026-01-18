import express from 'express';
import { singleFileMulter, batchFileMulter, handleSingleUpload, handleBatchUpload } from '../../controllers/common/uploadController';

const router = express.Router();

// 单文件上传接口
router.post('/common/upload/single', singleFileMulter, handleSingleUpload);

// 批量文件上传接口
router.post('/common/upload/batch', batchFileMulter, handleBatchUpload);

export default router;