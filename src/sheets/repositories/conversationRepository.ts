import { v4 as uuidv4 } from 'uuid';
import { appendRow, getRows } from '../sheetsClient';
import { Conversation, ConversationRole } from '../../types';

const TAB = 'Conversations';
const HEADER_ROWS = 1;

function rowToConversation(row: string[]): Conversation {
  return {
    id: row[0] ?? '',
    leadId: row[1] ?? '',
    role: (row[2] as ConversationRole) || ConversationRole.USER,
    content: row[3] ?? '',
    channel: row[4] ?? '',
    createdAt: row[5] ?? '',
  };
}

export async function insertMessage(
  leadId: string,
  role: ConversationRole,
  content: string,
  channel: string
): Promise<Conversation> {
  const msg: Conversation = {
    id: uuidv4(),
    leadId,
    role,
    content,
    channel,
    createdAt: new Date().toISOString(),
  };

  await appendRow(TAB, [msg.id, msg.leadId, msg.role, msg.content, msg.channel, msg.createdAt]);
  return msg;
}

export async function getConversationByLeadId(leadId: string): Promise<Conversation[]> {
  const rows = await getRows(TAB);
  return rows
    .slice(HEADER_ROWS)
    .filter(r => r[0] && r[1] === leadId)
    .map(rowToConversation);
}
