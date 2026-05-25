import crypto from 'node:crypto';

export function validateLineSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET!;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(rawBody))
    .digest('base64');
  return expected === signature;
}

export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  const payload = { replyToken, messages };
  console.log(JSON.stringify({ tag: 'line.reply.request', replyToken, messageCount: messages.length, messages }));

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error(JSON.stringify({ tag: 'line.reply.error', status: res.status, body: responseText }));
  } else {
    console.log(JSON.stringify({ tag: 'line.reply.success', status: res.status, body: responseText }));
  }
}

// Push an unsolicited message to a single user (no replyToken needed).
export async function pushMessage(to: string, messages: LineMessage[]): Promise<void> {
  const payload = { to, messages };
  console.log(JSON.stringify({ tag: 'line.push.request', to, messageCount: messages.length, messages }));

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  if (!res.ok) {
    console.error(JSON.stringify({ tag: 'line.push.error', status: res.status, body: responseText }));
  } else {
    console.log(JSON.stringify({ tag: 'line.push.success', status: res.status, body: responseText }));
  }
}

export type LineMessage =
  | { type: 'text'; text: string }
  | { type: 'sticker'; packageId: string; stickerId: string }
  | { type: 'flex'; altText: string; contents: unknown }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface LineEvent {
  type: string;
  mode: 'active' | 'standby';
  webhookEventId: string;
  deliveryContext: { isRedelivery: boolean };
  timestamp?: number;
  replyToken?: string;
  source: {
    type: 'user' | 'group' | 'room';
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  postback?: {
    data: string;
    params?: Record<string, string>;
  };
  message?: LineEventMessage;
  follow?: { isUnblocked: boolean };
}

export interface LineEventMessage {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker';
  text?: string;
}
