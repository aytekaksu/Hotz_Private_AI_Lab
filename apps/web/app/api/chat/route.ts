import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { getUserById, createMessage, getMessagesByConversationId, createConversation, updateConversationTitle, getAttachmentsByIds, setAttachmentMessage } from '@/lib/db';
import { tools } from '@/lib/tools/definitions';
import { executeTool } from '@/lib/tools/executor';
import type { ToolName } from '@/lib/tools/definitions';
import fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages, conversationId, userId, attachments } = await req.json();
    
    if (!userId) {
      return new Response('User ID required', { status: 401 });
    }
    
    // Get user and validate OpenRouter API key
    const user = getUserById(userId);
    if (!user) {
      return new Response('User not found', { status: 404 });
    }
    
    if (!user.openrouter_api_key) {
      return new Response('OpenRouter API key not configured. Please add it in Settings.', { status: 400 });
    }
    
    // Determine conversation ID
    let currentConversationId = conversationId;
    
    // If no conversation ID, create a new conversation
    if (!currentConversationId) {
      const firstMessage = messages[0]?.content || 'New Conversation';
      const title = firstMessage.substring(0, 50);
      const conversation = createConversation(userId, title);
      currentConversationId = conversation.id;
    }
    
    // Save user message to database (with attachment text appended when available)
    const userMessage = messages[messages.length - 1];
    if (userMessage.role === 'user') {
      let content = userMessage.content as string;
      if (Array.isArray(attachments) && attachments.length > 0) {
        const atts = getAttachmentsByIds(attachments);
        if (atts.length) {
          const MAX_CHARS = Number(process.env.MAX_ATTACHMENT_APPEND_CHARS || 50000);
          let appendix = `\n\n[Attachments]\n`;
          for (const att of atts) {
            appendix += `\n---\n${att.filename} (${att.mimetype}, ${att.size} bytes)\n`;
            const txt = att.text_content?.trim() || '';
            if (txt.length > 0) {
              const text = txt.length > MAX_CHARS ? txt.slice(0, MAX_CHARS) + '\n...[truncated]' : txt;
              appendix += text + '\n';
            } else {
              appendix += '[no extractable text found; likely image-only or unsupported format]\n';
            }
          }
          content += appendix;
        }
      }
      
      // Build provider message content: include images as image parts when possible
      const MAX_IMAGES = Number(process.env.MAX_IMAGE_ATTACHMENTS || 3);
      const atts = Array.isArray(attachments) ? getAttachmentsByIds(attachments) : [];
      const imageAtts = atts.filter(a => a.mimetype?.startsWith('image/')).slice(0, MAX_IMAGES);
      if (imageAtts.length > 0) {
        const parts: any[] = [{ type: 'text', text: content }];
        for (const img of imageAtts) {
          try {
            const buf = fs.readFileSync(img.path);
            const dataUrl = `data:${img.mimetype};base64,${buf.toString('base64')}`;
            parts.push({ type: 'image', image: dataUrl });
          } catch (e) {
            console.error('Failed to embed image attachment:', img.path, e);
          }
        }
        (messages as any)[messages.length - 1].content = parts;
      } else {
        // Fallback: text-only
        (messages as any)[messages.length - 1].content = content;
      }
      
      const saved = createMessage(currentConversationId, 'user', content);
      if (Array.isArray(attachments) && attachments.length > 0) {
        try {
          for (const attId of attachments) {
            setAttachmentMessage(attId, saved.id);
          }
        } catch (e) {
          console.error('Failed to link attachments to message:', e);
        }
      }
    }
    
    // Initialize OpenRouter client with user's API key
    const openrouter = createOpenAI({
      apiKey: user.openrouter_api_key,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    
    // Build AI SDK tools from definitions
    const aiTools: Record<string, any> = {};
    
    for (const [toolName, toolDef] of Object.entries(tools)) {
      aiTools[toolName] = {
        description: toolDef.description,
        parameters: toolDef.parameters,
        execute: async (args: any) => {
          console.log(`Tool called: ${toolName}`, args);
          const result = await executeTool(toolName as ToolName, args, userId);
          console.log(`Tool result: ${toolName}`, result);
          return result;
        },
      };
    }
    
    // Stream response from Claude
    const result = await streamText({
      model: openrouter('anthropic/claude-3.5-sonnet'),
      messages,
      tools: aiTools,
      maxTokens: 4096,
      temperature: 0.7,
      onFinish: async ({ text, finishReason, usage }) => {
        // Save assistant message to database
        try {
          createMessage(
            currentConversationId,
            'assistant',
            text,
            undefined,
            usage?.totalTokens
          );
          
          // Update conversation title if this is the first exchange
          const existingMessages = getMessagesByConversationId(currentConversationId);
          if (existingMessages.length <= 2) {
            // Generate a title from the first user message
            const firstUserMsg = existingMessages.find(m => m.role === 'user');
            if (firstUserMsg) {
              const title = firstUserMsg.content.substring(0, 50);
              updateConversationTitle(currentConversationId, title);
            }
          }
        } catch (error) {
          console.error('Error saving assistant message:', error);
        }
      },
    });
    
    // Return stream with conversation ID in headers
    return result.toDataStreamResponse({
      headers: {
        'X-Conversation-Id': currentConversationId,
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
