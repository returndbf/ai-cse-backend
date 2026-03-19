require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// AI service - Aliyun Qwen
const fetch = require('node-fetch');
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_API_KEY = process.env.QWEN_API_KEY || '';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';

function setupSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

function generateMockQuestions(req) {
  const count = Math.min(req.count || 3, 5);
  
  // Determine knowledge points to use - handle knowledgePointsBySubject first
  let kpList = [];
  const customKeyword = req.customKeyword;
  const subject = req.subject || 'xingce';
  
  if (req.knowledgePointsBySubject) {
    // Flatten knowledge points from both subjects
    const xingceKps = req.knowledgePointsBySubject.xingce || [];
    const shenlunKps = req.knowledgePointsBySubject.shenlun || [];
    kpList = [...xingceKps, ...shenlunKps];
  } else {
    kpList = req.knowledgePoints || (req.knowledgePoint ? [req.knowledgePoint] : []);
  }
  
  // Mock data organized by category
  const mockDataByCategory = {
    // 行测分类
    '政治理论': [
      {
        type: 'single',
        stem: '习近平新时代中国特色社会主义思想的核心要义是：',
        options: [
          { key: 'A', text: '坚持和发展中国特色社会主义' },
          { key: 'B', text: '实现中华民族伟大复兴' },
          { key: 'C', text: '建设社会主义现代化强国' },
          { key: 'D', text: '推动构建人类命运共同体' },
        ],
        answer: 'A',
        explanation: '习近平新时代中国特色社会主义思想的核心要义是坚持和发展中国特色社会主义。',
        knowledgePoint: '政治理论',
        difficulty: 'easy',
      },
    ],
    '言语理解与表达': [
      {
        type: 'single',
        stem: '阅读以下文字，完成下面的问题。\n\n"数字经济是继农业经济、工业经济之后的主要经济形态，是以数据资源为关键要素，以现代信息网络为主要载体，以信息通信技术融合应用、全要素数字化转型为重要推动力，促进公平与效率更加统一的新型经济形态。"\n\n这段文字主要阐述的是：',
        options: [
          { key: 'A', text: '数字经济的历史发展脉络' },
          { key: 'B', text: '数字经济的内涵与特征' },
          { key: 'C', text: '数字经济促进经济公平的方式' },
          { key: 'D', text: '信息通信技术的应用范围' },
        ],
        answer: 'B',
        explanation: '文段通过"是以…以…以…促进…的新型经济形态"的结构，重点阐述了数字经济的内涵与特征。',
        knowledgePoint: '言语理解与表达',
        difficulty: 'medium',
      },
    ],
    '数量关系': [
      {
        type: 'single',
        stem: '某单位共有员工200人，其中参加过培训的有150人，参加过考核的有120人，两者都参加过的有80人。问该单位既没有参加培训也没有参加考核的员工有多少人？',
        options: [
          { key: 'A', text: '10人' },
          { key: 'B', text: '15人' },
          { key: 'C', text: '20人' },
          { key: 'D', text: '25人' },
        ],
        answer: 'A',
        explanation: '用容斥原理：参加培训或考核的人数 = 150 + 120 - 80 = 190人。既没参加培训也没参加考核的人数 = 200 - 190 = 10人。',
        knowledgePoint: '数量关系',
        difficulty: 'medium',
      },
    ],
    '判断推理': [
      {
        type: 'single',
        stem: '请找出下列图形变化的规律：\n□ ○ △ □ ○ △ □ ？\n下一个图形应该是什么？',
        options: [
          { key: 'A', text: '□' },
          { key: 'B', text: '○' },
          { key: 'C', text: '△' },
          { key: 'D', text: '◇' },
        ],
        answer: 'B',
        explanation: '图形按照□→○→△的顺序循环排列，所以下一个应该是○。',
        knowledgePoint: '判断推理',
        difficulty: 'easy',
      },
    ],
    '常识判断': [
      {
        type: 'single',
        stem: '下列关于我国宪法修正程序的说法，正确的是：',
        options: [
          { key: 'A', text: '全国人民代表大会常务委员会有权修改宪法' },
          { key: 'B', text: '修宪需要全国人大全体代表的三分之二以上多数通过' },
          { key: 'C', text: '宪法修正案由国务院提出' },
          { key: 'D', text: '修宪需要全国人大全体代表的过半数通过' },
        ],
        answer: 'B',
        explanation: '根据《宪法》第64条，宪法的修改由全国人民代表大会以全体代表的三分之二以上的多数通过。',
        knowledgePoint: '常识判断',
        difficulty: 'medium',
      },
      {
        type: 'judge',
        stem: '行政法规的效力高于地方性法规和规章的效力。',
        options: [
          { key: '正确', text: '正确' },
          { key: '错误', text: '错误' },
        ],
        answer: '正确',
        explanation: '根据《立法法》的规定，行政法规的效力高于地方性法规、规章。本题表述正确。',
        knowledgePoint: '常识判断',
        difficulty: 'easy',
      },
    ],
    '资料分析': [
      {
        type: 'single',
        stem: '某市2023年GDP为5000亿元，同比增长6%。其中第三产业增加值为3000亿元，同比增长8%。则该市2023年第三产业增加值占GDP的比重比2022年（约）：',
        options: [
          { key: 'A', text: '增加了约1.1个百分点' },
          { key: 'B', text: '减少了约1.1个百分点' },
          { key: 'C', text: '增加了约0.8个百分点' },
          { key: 'D', text: '减少了约0.8个百分点' },
        ],
        answer: 'A',
        explanation: '2023年比重 = 3000/5000 = 60%。2022年GDP = 5000/1.06 ≈ 4717亿，2022年第三产业 = 3000/1.08 ≈ 2778亿，2022年比重 ≈ 2778/4717 ≈ 58.9%。变化 = 60% - 58.9% ≈ 1.1个百分点，增加。',
        knowledgePoint: '资料分析',
        difficulty: 'hard',
      },
    ],
    // 申论分类
    '摘抄': [
      {
        type: 'essay',
        stem: '给定以下材料，请直接摘抄材料中体现"数字经济发展成就"的关键语句。\n\n材料：我国数字经济规模从2012年的11万亿元增长到2022年的50万亿元，占GDP比重从20%提升到40%以上。数字经济核心产业增加值占GDP比重达到10%以上。',
        answer: '我国数字经济规模从2012年的11万亿元增长到2022年的50万亿元，占GDP比重从20%提升到40%以上。数字经济核心产业增加值占GDP比重达到10%以上。',
        explanation: '摘抄题要求直接从原文中提取关键信息，不加修改。',
        knowledgePoint: '申论 - 摘抄',
        difficulty: 'easy',
      },
    ],
    '概括归纳': [
      {
        type: 'essay',
        stem: '给定以下材料，请归纳概括当前我国乡村振兴战略面临的主要问题。（字数200字左右）\n\n材料：近年来，我国积极推进乡村振兴战略，取得了显著成就，但也面临诸多挑战。部分农村地区人才外流严重，青壮年劳动力持续向城市转移；农业生产方式仍较传统，机械化、智能化水平有待提高；农村基础设施建设虽有改善，但与城市相比差距仍然较大；农村集体经济组织发展不平衡，部分地区集体经济薄弱；农村环境污染问题依然存在，生态保护任务较重。',
        answer: '主要问题包括：一是人才流失严重，农村空心化趋势明显；二是农业现代化水平不足，传统生产方式制约发展；三是城乡基础设施差距较大；四是农村集体经济发展不平衡；五是生态环境保护压力较大。',
        explanation: '归纳概括题要求从材料中提取要点，注意每个要点要简洁、准确。',
        knowledgePoint: '申论 - 概括归纳',
        difficulty: 'medium',
      },
    ],
    '分析推导': [
      {
        type: 'essay',
        stem: '给定以下材料，分析"城市更新"对提升城市竞争力的作用。\n\n材料：城市更新不仅是物质空间的改造，更是功能品质的提升。通过城中村改造、基础设施升级、公共服务完善等措施，能够有效提升城市承载能力，吸引人才集聚，促进产业升级，推动经济高质量发展。',
        answer: '城市更新对提升城市竞争力的作用主要体现在：1）提升承载能力：完善基础设施，增强城市接纳能力；2）吸引人才集聚：改善居住环境和生活品质；3）促进产业升级：为新兴产业发展提供空间；4）推动高质量发展：实现经济效益和社会效益双赢。',
        explanation: '分析推导题需要在理解材料基础上进行深度分析，挖掘背后逻辑关系。',
        knowledgePoint: '申论 - 分析推导',
        difficulty: 'medium',
      },
    ],
  };
  
  // Fallback generic questions
  const genericQuestions = [
    {
      type: 'single',
      stem: '下列关于我国宪法修正程序的说法，正确的是：',
      options: [
        { key: 'A', text: '全国人民代表大会常务委员会有权修改宪法' },
        { key: 'B', text: '修宪需要全国人大全体代表的三分之二以上多数通过' },
        { key: 'C', text: '宪法修正案由国务院提出' },
        { key: 'D', text: '修宪需要全国人大全体代表的过半数通过' },
      ],
      answer: 'B',
      explanation: '根据《宪法》第64条，宪法的修改由全国人民代表大会以全体代表的三分之二以上的多数通过。',
      knowledgePoint: '常识判断',
      difficulty: 'medium',
    },
    {
      type: 'single',
      stem: '某单位共有员工200人，其中参加过培训的有150人，参加过考核的有120人，两者都参加过的有80人。问该单位既没有参加培训也没有参加考核的员工有多少人？',
      options: [
        { key: 'A', text: '10人' },
        { key: 'B', text: '15人' },
        { key: 'C', text: '20人' },
        { key: 'D', text: '25人' },
      ],
      answer: 'A',
      explanation: '用容斥原理：参加培训或考核的人数 = 150 + 120 - 80 = 190人。既没参加培训也没参加考核的人数 = 200 - 190 = 10人。',
      knowledgePoint: '数量关系',
      difficulty: 'medium',
    },
    {
      type: 'essay',
      stem: '给定以下材料，请归纳概括当前我国乡村振兴战略面临的主要问题。（字数200字左右）\n\n材料：近年来，我国积极推进乡村振兴战略，取得了显著成就，但也面临诸多挑战。部分农村地区人才外流严重，青壮年劳动力持续向城市转移；农业生产方式仍较传统，机械化、智能化水平有待提高；农村基础设施建设虽有改善，但与城市相比差距仍然较大；农村集体经济组织发展不平衡，部分地区集体经济薄弱；农村环境污染问题依然存在，生态保护任务较重。',
      answer: '主要问题包括：一是人才流失严重，农村空心化趋势明显；二是农业现代化水平不足，传统生产方式制约发展；三是城乡基础设施差距较大；四是农村集体经济发展不平衡；五是生态环境保护压力较大。',
      explanation: '归纳概括题要求从材料中提取要点，注意每个要点要简洁、准确，覆盖材料中的主要信息。',
      knowledgePoint: '申论 - 概括归纳',
      difficulty: 'medium',
    },
  ];
  
  const questions = [];
  const usedCategories = new Set();
  
  // If custom keyword provided, use generic questions with modified knowledge point
  if (customKeyword) {
    for (let i = 0; i < count; i++) {
      const src = genericQuestions[i % genericQuestions.length];
      questions.push({
        ...src,
        id: `demo_${Date.now()}_${i}`,
        subject: subject,
        knowledgePoint: customKeyword,
        year: req.year,
      });
    }
    return questions;
  }
  
  // If knowledge points specified, use them
  if (kpList.length > 0) {
    for (let i = 0; i < count; i++) {
      // Cycle through selected knowledge points
      const kpName = kpList[i % kpList.length];
      const categoryQuestions = mockDataByCategory[kpName] || genericQuestions;
      const src = categoryQuestions[i % categoryQuestions.length];
      questions.push({
        ...src,
        id: `demo_${Date.now()}_${i}`,
        subject: subject,
        knowledgePoint: src.knowledgePoint || kpName,
        year: req.year,
      });
    }
    return questions;
  }
  
  // Default: use generic questions
  for (let i = 0; i < count; i++) {
    const src = genericQuestions[i % genericQuestions.length];
    questions.push({
      ...src,
      id: `demo_${Date.now()}_${i}`,
      subject: subject,
      year: req.year,
    });
  }
  return questions;
}

// Generate endpoint
app.post('/api/generate', async (req, res) => {
  setupSSE(res);
  const body = req.body;
  
  if (!QWEN_API_KEY || QWEN_API_KEY === 'your_qwen_api_key_here') {
    sendEvent(res, { type: 'content', text: '🤖 AI正在为您生成仿真练习题...\n\n' });
    await new Promise(r => setTimeout(r, 600));
    const questions = generateMockQuestions(body);
    sendEvent(res, { type: 'questions', questions });
    sendEvent(res, { type: 'content', text: `✅ 已为您生成 ${questions.length} 道练习题，请开始作答！` });
    sendDone(res);
    return;
  }

  // DeepSeek API call
  const typeMap = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题', case: '案例分析题' };
  const subject = body.subject === 'shenlun' ? '申论' : '行政职业能力测验（行测）';
  const year = body.year || '2024';

  // 真题仿真模式：根据科目强制设置题型
  // 行测 → 单选题；申论 → 写作题（essay）
  let questionTypes;
  if (body.mode === 'real-exam') {
    questionTypes = body.subject === 'shenlun' ? ['essay'] : ['single'];
  } else {
    questionTypes = body.questionTypes || ['single'];
  }
  const typeNames = questionTypes.map(t => typeMap[t] || t).join('、');
  
  // Handle knowledge points - could be single (knowledgePoint), multiple (knowledgePoints), grouped by subject, or custom keyword
  let kp = '';
  let kpDescription = '';
  
  if (body.customKeyword) {
    // Custom keyword takes priority
    kp = body.customKeyword;
    kpDescription = `针对您自定义输入的知识点【${kp}】`;
  } else if (body.knowledgePointsBySubject) {
    // Handle knowledge points grouped by subject
    const parts = [];
    if (body.knowledgePointsBySubject.xingce && body.knowledgePointsBySubject.xingce.length > 0) {
      parts.push(`行测: ${body.knowledgePointsBySubject.xingce.join('、')}`);
    }
    if (body.knowledgePointsBySubject.shenlun && body.knowledgePointsBySubject.shenlun.length > 0) {
      parts.push(`申论: ${body.knowledgePointsBySubject.shenlun.join('、')}`);
    }
    kp = parts.join(' | ');
    kpDescription = `针对以下知识点【${kp}】`;
  } else if (body.knowledgePoints && body.knowledgePoints.length > 0) {
    kp = body.knowledgePoints.join('、');
    kpDescription = `针对【${subject}-${kp}】知识点`;
  } else if (body.knowledgePoint) {
    kp = body.knowledgePoint;
    kpDescription = `针对【${subject}-${kp}】知识点`;
  }
  
  // Build per-type format instructions so AI knows how to generate each type correctly
  const typeFormatGuide = questionTypes.map(t => {
    switch (t) {
      case 'single':
        return `单选题(type:"single")：options必须为[{"key":"A","text":"选项内容"},{"key":"B","text":"选项内容"},{"key":"C","text":"选项内容"},{"key":"D","text":"选项内容"}]，answer为单个字母如"A"`;
      case 'multiple':
        return `多选题(type:"multiple")：options必须为[{"key":"A","text":"选项内容"},{"key":"B","text":"选项内容"},{"key":"C","text":"选项内容"},{"key":"D","text":"选项内容"}]，answer为多个字母用逗号分隔如"A,C"`;
      case 'judge':
        return `判断题(type:"judge")：options必须为[{"key":"正确","text":"正确"},{"key":"错误","text":"错误"}]，answer为"正确"或"错误"`;
      case 'fill':
        return `填空题(type:"fill")：不要options字段，answer为填空答案文本`;
      case 'essay':
        return `简答题(type:"essay")：不要options字段，answer为参考要点`;
      case 'case':
        return `案例分析题(type:"case")：不要options字段，answer为分析要点`;
      default:
        return '';
    }
  }).filter(Boolean).join('；');

  const count = body.count || 3;
  // Distribute question types evenly across count
  const typeDistribution = Array.from({ length: count }, (_, i) => questionTypes[i % questionTypes.length]);
  const typeDistributionStr = typeDistribution.join(',');

  const baseJsonTemplate = `{"questions":[每道题一个对象]}`;
  const subjectVal = body.subject || 'xingce';

  const prompt = body.mode === 'real-exam'
    ? `你是公务员考试命题专家。按${year}年国考${subject}真题风格，严格按以下要求生成${count}道仿真题。

题型分配（按顺序）：${typeDistributionStr}
题型格式说明：${typeFormatGuide}

重要规则：
1. 每道题的type字段必须严格按照题型分配顺序填写，不能全部填single！
2. options字段必须是对象数组格式，每个对象包含key和text两个字段，禁止使用字符串数组！
3. 只返回JSON，不要任何其他文字、代码块标记或解释！

返回格式示例（单选题）：
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "subject": "${subjectVal}",
      "knowledgePoint": "对应知识点",
      "stem": "题目内容",
      "options": [{"key":"A","text":"选项A内容"},{"key":"B","text":"选项B内容"},{"key":"C","text":"选项C内容"},{"key":"D","text":"选项D内容"}],
      "answer": "A",
      "explanation": "详细解析",
      "year": "${year}",
      "difficulty": "easy"
    }
  ]
}`
    : `你是公务员考试辅导专家。${kpDescription}，严格按以下要求生成${count}道练习题。

题型分配（按顺序）：${typeDistributionStr}
题型格式说明：${typeFormatGuide}

重要规则：
1. 每道题的type字段必须严格按照题型分配顺序填写，不能全部填single！
2. options字段必须是对象数组格式，每个对象包含key和text两个字段，禁止使用字符串数组！
3. 只返回JSON，不要任何其他文字、代码块标记或解释！

返回格式示例（单选题）：
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "subject": "${subjectVal}",
      "knowledgePoint": "${kp || body.customKeyword || '综合'}",
      "stem": "题目内容",
      "options": [{"key":"A","text":"选项A内容"},{"key":"B","text":"选项B内容"},{"key":"C","text":"选项C内容"},{"key":"D","text":"选项D内容"}],
      "answer": "A",
      "explanation": "详细解析",
      "difficulty": "easy"
    }
  ]
}`;
  console.log('Generated prompt for Qwen API:', prompt);

  // Normalize options returned by AI: handles both {key,text} objects and plain strings
  function normalizeOptions(type, options) {
    // fill/essay/case: no options needed
    if (type === 'fill' || type === 'essay' || type === 'case') return undefined;

    // judge: always return fixed options
    if (type === 'judge') {
      return [{ key: '正确', text: '正确' }, { key: '错误', text: '错误' }];
    }

    // single/multiple: normalize options array
    if (!Array.isArray(options) || options.length === 0) {
      // fallback: generate placeholder options
      return ['A', 'B', 'C', 'D'].map(k => ({ key: k, text: `选项${k}` }));
    }

    return options.map((opt, idx) => {
      if (opt && typeof opt === 'object' && 'key' in opt && 'text' in opt) {
        // Already correct format
        return { key: String(opt.key), text: String(opt.text) };
      }
      if (typeof opt === 'string') {
        // AI returned "A. 选项内容" or "A、选项内容" or just "选项内容"
        const match = opt.match(/^([A-Da-d])[\.、．\s]+(.+)$/);
        if (match) {
          return { key: match[1].toUpperCase(), text: match[2].trim() };
        }
        // Fallback: use letter by index
        const key = String.fromCharCode(65 + idx);
        return { key, text: opt.trim() };
      }
      // Unknown format fallback
      const key = String.fromCharCode(65 + idx);
      return { key, text: String(opt) };
    });
  }

  try {
    const response = await fetch(`${QWEN_BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QWEN_API_KEY}` },
      body: JSON.stringify({ model: QWEN_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096 }),
    });
    // console.log('Qwen API response status:', response);
    sendEvent(res, { type: 'content', text: '🤖 AI正在生成仿真练习题...\n\n' });
    
    const data = await response.json();
    console.log('Qwen API response data:', data);
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const questions = (parsed.questions || []).map((q, i) => {
        const normalizedOptions = normalizeOptions(q.type, q.options);
        return {
          ...q,
          id: `q_${Date.now()}_${i}`,
          options: normalizedOptions,
        };
      });
      sendEvent(res, { type: 'questions', questions });
      sendEvent(res, { type: 'content', text: `✅ 已为您生成 ${questions.length} 道练习题，请开始作答！` });
    } else {
      sendEvent(res, { type: 'error', error: 'AI返回格式异常，请重试' });
    }
  } catch (err) {
    sendEvent(res, { type: 'error', error: err.message || '请求失败' });
  }
  sendDone(res);
});

// Analyze endpoint with streaming
app.post('/api/analyze', async (req, res) => {
  setupSSE(res);
  const body = req.body;
  const question = body.question;
  const userAnswer = body.userAnswer || '';
  
  if (!QWEN_API_KEY || QWEN_API_KEY === 'your_qwen_api_key_here') {
    const isCorrect = userAnswer === question.answer;
    const status = isCorrect ? '✅ 回答正确！' : `❌ 回答错误。正确答案是：**${question.answer}**`;
    const analysis = `**答案判断**\n${status}，您的答案是：**${userAnswer || '未作答'}**\n\n**解题思路**\n本题考查${question.knowledgePoint}知识点。${question.explanation}\n\n**知识点讲解**\n${question.knowledgePoint}是公务员考试的重要考点，需要掌握基本概念和解题规律，建议多做同类练习巩固理解。\n\n**易错点提示**\n• 仔细审题，关注关键词和限定词\n• 用排除法逐一分析选项\n• 遇到计算题要列式，避免心算出错\n\n**举一反三**\n建议继续练习${question.knowledgePoint}专项题目，重点提升该类题型的解题速度和准确率。`;
    
    const chars = analysis.split('');
    for (const char of chars) {
      sendEvent(res, { type: 'content', text: char });
      await new Promise(r => setTimeout(r, 12));
    }
    sendDone(res);
    return;
  }

  const typeMap = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题', case: '案例分析题' };
  const opts = question.options ? question.options.map(o => `${o.key}. ${o.text}`).join('\n') : '';
  const prompt = `你是公务员考试辅导老师，请详细解析：\n【题型】${typeMap[question.type]}\n【题目】${question.stem}\n${opts ? `【选项】\n${opts}\n` : ''}【正确答案】${question.answer}\n【考生答案】${userAnswer || '未作答'}\n\n请按以下格式：\n**答案判断**\n**解题思路**\n**知识点讲解**\n**易错点提示**\n**举一反三**`;

  try {
    const response = await fetch(`${QWEN_BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${QWEN_API_KEY}` },
      body: JSON.stringify({ model: QWEN_MODEL, messages: [{ role: 'user', content: prompt }], stream: true, temperature: 0.3, max_tokens: 2048 }),
    });

    const body_stream = response.body;
    for await (const chunk of body_stream) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) sendEvent(res, { type: 'content', text: content });
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    sendEvent(res, { type: 'error', error: err.message || '请求失败' });
  }
  sendDone(res);
});

// History endpoints (in-memory for demo)
const historyStore = [];
app.get('/api/history', (req, res) => res.json({ records: historyStore.slice(0, 50) }));
app.post('/api/history', (req, res) => {
  const record = { id: `h_${Date.now()}`, ...req.body, createdAt: Date.now() };
  historyStore.unshift(record);
  res.json({ success: true, id: record.id });
});
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, World!' });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!QWEN_API_KEY || QWEN_API_KEY === 'your_qwen_api_key_here') {
    console.log('Demo mode active - using mock data');
  } else {
    console.log('Qwen API configured');
  }
});
