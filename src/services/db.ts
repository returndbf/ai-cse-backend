import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'exam.db');

let db: Database.Database;

export function initDB() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      question TEXT NOT NULL,
      user_answer TEXT,
      is_correct INTEGER,
      ai_analysis TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  return db;
}

export function getDB() {
  if (!db) initDB();
  return db;
}

export function saveHistoryRecord(record: {
  id: string;
  sessionId: string;
  question: object;
  userAnswer: string;
  isCorrect: boolean | null;
  aiAnalysis: string;
  createdAt: number;
}) {
  const database = getDB();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO history (id, session_id, question, user_answer, is_correct, ai_analysis, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    record.id,
    record.sessionId,
    JSON.stringify(record.question),
    record.userAnswer,
    record.isCorrect === null ? null : (record.isCorrect ? 1 : 0),
    record.aiAnalysis,
    record.createdAt
  );
}

export function getHistoryRecords(limit = 50) {
  const database = getDB();
  const rows = database.prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map((row: any) => ({
    ...row,
    question: JSON.parse(row.question),
    isCorrect: row.is_correct === null ? null : Boolean(row.is_correct),
  }));
}
