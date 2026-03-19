export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'essay' | 'case';
export type Subject = 'xingce' | 'shenlun';
export type ExamMode = 'real-exam' | 'knowledge-point';

export interface Option {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  subject: Subject;
  knowledgePoint: string;
  stem: string;
  options?: Option[];
  answer: string;
  explanation: string;
  year?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface GenerateRequest {
  mode: ExamMode;
  subject?: Subject;
  knowledgePoint?: string;
  questionTypes: QuestionType[];
  count: number;
  year?: string;
}

export interface AnalyzeRequest {
  question: Question;
  userAnswer: string;
  sessionId: string;
}
