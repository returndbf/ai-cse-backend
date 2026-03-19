import { Response } from 'express';
import { GenerateRequest, AnalyzeRequest, Question } from '../types';
import { setupSSEHeaders, sendSSEEvent, sendSSEDone } from './sse';

const fetch = require('node-fetch');

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

const QUESTION_TYPE_MAP: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  essay: '简答题',
  case: '案例分析题',
};

function buildGeneratePrompt(req: GenerateRequest): string {
  const typeNames = req.questionTypes.map(t => QUESTION_TYPE_MAP[t] || t).join('、');

  if (req.mode === 'real-exam') {
    const yearStr = req.year ? `${req.year}年` : '近年';
    const subjectStr = req.subject === 'xingce' ? '行政职业能力测验（行测）' : '申论';
    return `你是一位专业的公务员考试命题专家。请严格按照${yearStr}国家公务员考试${subjectStr}真题的风格和难度，生成${req.count}道仿真练习题。

题型要求：${typeNames}

请严格按照以下JSON格式返回，不要输出任何其他内容：
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "subject": "xingce",
      "knowledgePoint": "判断推理",
      "stem": "题目内容...",
      "options": [
        {"key": "A", "text": "选项A"},
        {"key": "B", "text": "选项B"},
        {"key": "C", "text": "选项C"},
        {"key": "D", "text": "选项D"}
      ],
      "answer": "A",
      "explanation": "详细解析...",
      "year": "${req.year || '2024'}",
      "difficulty": "medium"
    }
  ]
}

注意：
- 判断题的options为[{"key":"正确","text":"正确"},{"key":"错误","text":"错误"}]
- 填空题、简答题、案例分析题不需要options字段
- 题目内容要真实、专业，符合公务员考试风格
- 解析要详细，包含解题思路和方法`;
  } else {
    const knowledgeStr = req.knowledgePoint || '综合';
    const subjectStr = req.subject === 'xingce' ? '行测' : '申论';
    return `你是一位专业的公务员考试辅导专家。请针对【${subjectStr} - ${knowledgeStr}】知识点，生成${req.count}道专项练习题。

题型要求：${typeNames}
知识点重点：${knowledgeStr}

请严格按照以下JSON格式返回，不要输出任何其他内容：
{
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "subject": "${req.subject || 'xingce'}",
      "knowledgePoint": "${knowledgeStr}",
      "stem": "题目内容...",
      "options": [
        {"key": "A", "text": "选项A"},
        {"key": "B", "text": "选项B"},
        {"key": "C", "text": "选项C"},
        {"key": "D", "text": "选项D"}
      ],
      "answer": "A",
      "explanation": "详细解析，要体现${knowledgeStr}的核心考点...",
      "difficulty": "medium"
    }
  ]
}

注意：
- 每道题都要紧扣${knowledgeStr}知识点的核心考查内容
- 题目设计要有梯度，体现知识点的不同层次
- 解析要详细，帮助学员理解该知识点的答题方法`;
  }
}

function buildAnalyzePrompt(req: AnalyzeRequest): string {
  const typeStr = QUESTION_TYPE_MAP[req.question.type] || req.question.type;
  const optionsStr = req.question.options
    ? req.question.options.map(o => `${o.key}. ${o.text}`).join('\n')
    : '';

  return `你是一位专业的公务员考试辅导老师，请对以下答题情况进行详细分析和解析。

【题目类型】${typeStr}
【知识点】${req.question.knowledgePoint}
【题目】
${req.question.stem}

${optionsStr ? `【选项】\n${optionsStr}\n` : ''}
【正确答案】${req.question.answer}
【考生答案】${req.userAnswer || '（未作答）'}

请按以下结构进行解析：

**答案判断**
明确指出考生答案是否正确。

**解题思路**
详细分析这道题的解题方法和思维过程。

**知识点讲解**
结合"${req.question.knowledgePoint}"知识点，讲解相关理论和规律。

**易错点提示**
指出这类题型的常见错误和注意事项。

**举一反三**
给出1个类似题目的练习方向或解题技巧总结。`;
}

export async function generateQuestionsSSE(req: GenerateRequest, res: Response) {
  setupSSEHeaders(res);

  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
    // Demo mode: return mock questions
    sendSSEEvent(res, { type: 'content', text: '正在生成仿真练习题...\n\n' });
    await new Promise(r => setTimeout(r, 500));

    const mockQuestions = generateMockQuestions(req);
    sendSSEEvent(res, { type: 'questions', questions: mockQuestions });
    sendSSEEvent(res, { type: 'content', text: `✅ 已为您生成 ${mockQuestions.length} 道练习题，请开始作答！` });
    sendSSEDone(res);
    return;
  }

  const prompt = buildGeneratePrompt(req);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      sendSSEEvent(res, { type: 'error', error: `AI服务请求失败: ${response.status}` });
      sendSSEDone(res);
      return;
    }

    sendSSEEvent(res, { type: 'content', text: '🤖 AI正在生成仿真练习题...\n\n' });

    let fullContent = '';
    const body = response.body;

    for await (const chunk of body) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) fullContent += content;
          } catch (_) { /* ignore */ }
        }
      }
    }

    // Parse JSON from full content
    const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const questions: Question[] = (parsed.questions || []).map((q: Question, i: number) => ({
          ...q,
          id: `q_${Date.now()}_${i}`,
        }));
        sendSSEEvent(res, { type: 'questions', questions });
        sendSSEEvent(res, { type: 'content', text: `✅ 已为您生成 ${questions.length} 道练习题，请开始作答！` });
      } catch (_) {
        sendSSEEvent(res, { type: 'error', error: '题目解析失败，请重试' });
      }
    } else {
      sendSSEEvent(res, { type: 'error', error: 'AI返回格式异常，请重试' });
    }

    sendSSEDone(res);
  } catch (err: any) {
    sendSSEEvent(res, { type: 'error', error: err.message || '请求失败' });
    sendSSEDone(res);
  }
}

export async function analyzeAnswerSSE(req: AnalyzeRequest, res: Response) {
  setupSSEHeaders(res);

  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
    // Demo mode: return mock analysis
    const isCorrect = req.userAnswer === req.question.answer;
    const mockAnalysis = generateMockAnalysis(req, isCorrect);
    for (const char of mockAnalysis) {
      sendSSEEvent(res, { type: 'content', text: char });
      await new Promise(r => setTimeout(r, 15));
    }
    sendSSEDone(res);
    return;
  }

  const prompt = buildAnalyzePrompt(req);

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      sendSSEEvent(res, { type: 'error', error: `AI服务请求失败: ${response.status}` });
      sendSSEDone(res);
      return;
    }

    const body = response.body;
    for await (const chunk of body) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              sendSSEEvent(res, { type: 'content', text: content });
            }
          } catch (_) { /* ignore */ }
        }
      }
    }

    sendSSEDone(res);
  } catch (err: any) {
    sendSSEEvent(res, { type: 'error', error: err.message || '请求失败' });
    sendSSEDone(res);
  }
}

function generateMockQuestions(req: GenerateRequest): Question[] {
  const count = Math.min(req.count, 5);
  const questions: Question[] = [];

  const mockData = [
    {
      type: 'single' as const,
      stem: '下列关于我国宪法修正程序的说法，正确的是：',
      options: [
        { key: 'A', text: '全国人民代表大会常务委员会有权修改宪法' },
        { key: 'B', text: '修宪需要全国人大全体代表的三分之二以上多数通过' },
        { key: 'C', text: '宪法修正案由国务院提出' },
        { key: 'D', text: '修宪需要全国人大全体代表的过半数通过' },
      ],
      answer: 'B',
      explanation: '根据《宪法》第64条，宪法的修改由全国人民代表大会以全体代表的三分之二以上的多数通过。修宪提案权由全国人大常委会或五分之一以上全国人大代表联名提出，而非国务院。',
      knowledgePoint: '常识判断 - 法律',
      difficulty: 'medium' as const,
    },
    {
      type: 'single' as const,
      stem: '某单位共有员工200人，其中参加过培训的有150人，参加过考核的有120人，两者都参加过的有80人。问该单位既没有参加培训也没有参加考核的员工有多少人？',
      options: [
        { key: 'A', text: '10人' },
        { key: 'B', text: '15人' },
        { key: 'C', text: '20人' },
        { key: 'D', text: '25人' },
      ],
      answer: 'A',
      explanation: '用容斥原理：参加培训或考核的人数 = 150 + 120 - 80 = 190人。既没参加培训也没参加考核的人数 = 200 - 190 = 10人。',
      knowledgePoint: '数量关系 - 数学运算',
      difficulty: 'medium' as const,
    },
    {
      type: 'judge' as const,
      stem: '行政法规的效力高于地方性法规和规章的效力。',
      options: [
        { key: '正确', text: '正确' },
        { key: '错误', text: '错误' },
      ],
      answer: '正确',
      explanation: '根据《立法法》的规定，法律的效力高于行政法规、地方性法规、规章。行政法规的效力高于地方性法规、规章。本题表述正确。',
      knowledgePoint: '常识判断 - 法律',
      difficulty: 'easy' as const,
    },
    {
      type: 'single' as const,
      stem: '阅读以下文字，完成下面的问题。\n\n"数字经济是继农业经济、工业经济之后的主要经济形态，是以数据资源为关键要素，以现代信息网络为主要载体，以信息通信技术融合应用、全要素数字化转型为重要推动力，促进公平与效率更加统一的新型经济形态。"\n\n这段文字主要阐述的是：',
      options: [
        { key: 'A', text: '数字经济的历史发展脉络' },
        { key: 'B', text: '数字经济的内涵与特征' },
        { key: 'C', text: '数字经济促进经济公平的方式' },
        { key: 'D', text: '信息通信技术的应用范围' },
      ],
      answer: 'B',
      explanation: '文段通过"是以…以…以…促进…的新型经济形态"的结构，重点阐述了数字经济的关键要素、主要载体、推动力及目标，即数字经济的内涵与特征。A项"历史发展脉络"过于片面；C、D项仅是局部内容。',
      knowledgePoint: '言语理解 - 片段阅读',
      difficulty: 'medium' as const,
    },
    {
      type: 'single' as const,
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
      difficulty: 'hard' as const,
    },
  ];

  for (let i = 0; i < count; i++) {
    const source = mockData[i % mockData.length];
    questions.push({
      ...source,
      id: `demo_${Date.now()}_${i}`,
      subject: req.subject || 'xingce',
      year: req.year,
    });
  }

  return questions;
}

function generateMockAnalysis(req: AnalyzeRequest, isCorrect: boolean): string {
  const statusEmoji = isCorrect ? '✅' : '❌';
  const statusText = isCorrect ? '回答正确！' : '回答错误。';

  return `**答案判断**\n${statusEmoji} ${statusText}正确答案是：**${req.question.answer}**，您的答案是：**${req.userAnswer || '未作答'}**\n\n**解题思路**\n本题考查的是${req.question.knowledgePoint}相关知识。解题时需要仔细分析题干信息，运用排除法逐一分析选项。\n\n${req.question.explanation}\n\n**知识点讲解**\n${req.question.knowledgePoint}是公务员考试的重要考点，需要掌握基本概念和解题方法。建议在日常复习中多做同类练习，加深理解。\n\n**易错点提示**\n• 注意审题，不要被干扰项误导\n• 关键词要重点标注\n• 遇到计算题要列式计算，避免心算出错\n\n**举一反三**\n建议继续练习${req.question.knowledgePoint}专项题目，重点关注题目中的关键信息提取和逻辑推理能力的培养。`;
}
