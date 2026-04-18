import fs from 'fs';
import path from 'path';

const KNOWLEDGE_DIR = path.resolve(process.cwd(), 'knowledge');

const SERVICE_FILE_MAP: Record<string, string> = {
  'web development': 'web-development.md',
  'mobile app':      'mobile-app.md',
  'seo':             'seo.md',
  'digital marketing': 'digital-marketing.md',
  'consulting':      'consulting.md',
};

export function getKnowledge(serviceInterest: string): string {
  const key = serviceInterest.toLowerCase().trim();
  const filename = SERVICE_FILE_MAP[key] ?? 'default.md';
  const filePath = path.join(KNOWLEDGE_DIR, filename);

  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    const fallback = path.join(KNOWLEDGE_DIR, 'default.md');
    return fs.readFileSync(fallback, 'utf-8');
  }
}
