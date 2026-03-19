import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import apiRouter from './api/api';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api', apiRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
    console.log('⚠️  未配置 DEEPSEEK_API_KEY，将使用演示模式（模拟数据）');
    console.log('   在 server/.env 文件中填入您的 DeepSeek API Key 以启用真实AI功能');
  } else {
    console.log('✅ DeepSeek API 已配置，AI功能已启用');
  }
});

export default app;
