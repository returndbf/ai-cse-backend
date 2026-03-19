import { Router, Request, Response } from 'express';
import { generateQuestionsSSE, analyzeAnswerSSE } from '../services/ai';
import { saveHistoryRecord, getHistoryRecords } from '../services/db';
import { GenerateRequest, AnalyzeRequest } from '../types';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Generate questions via SSE
router.post('/generate', async (req: Request, res: Response) => {
  const body: GenerateRequest = req.body;

  if (!body.questionTypes || !Array.isArray(body.questionTypes) || body.questionTypes.length === 0) {
    res.status(400).json({ error: '请选择题目类型' });
    return;
  }

  if (!body.count || body.count < 1 || body.count > 10) {
    body.count = 3;
  }

  await generateQuestionsSSE(body, res);
});

// Analyze answer via SSE
router.post('/analyze', async (req: Request, res: Response) => {
  const body: AnalyzeRequest = req.body;

  if (!body.question) {
    res.status(400).json({ error: '缺少题目信息' });
    return;
  }

  await analyzeAnswerSSE(body, res);
});

// Get history records
router.get('/history', (_req: Request, res: Response) => {
  try {
    const records = getHistoryRecords(50);
    res.json({ records });
  } catch (err) {
    res.json({ records: [] });
  }
});

// Save history record
router.post('/history', (req: Request, res: Response) => {
  try {
    const record = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ...req.body,
      createdAt: Date.now(),
    };
    saveHistoryRecord(record);
    res.json({ success: true, id: record.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
