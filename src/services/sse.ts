import { Response } from 'express';

export function sendSSEEvent(res: Response, event: object) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function sendSSEDone(res: Response) {
  res.write('data: [DONE]\n\n');
  res.end();
}

export function setupSSEHeaders(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}
