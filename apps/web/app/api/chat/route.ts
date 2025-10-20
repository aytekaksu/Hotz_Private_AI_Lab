import { createOpenAI } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { getUserById, createMessage, getMessagesByConversationId, createConversationWithAgent, updateConversationTitle, getAttachmentsByIds, setAttachmentMessage, getUserOpenRouterKey, initializeDefaultTools, getConversationTools, getOAuthCredential, initializeToolsFromAgent, getAgentById } from '@/lib/db';
import { tools, toolMetadata } from '@/lib/tools/definitions';
import { executeTool } from '@/lib/tools/executor';
import type { ToolName } from '@/lib/tools/definitions';
import fs from 'fs';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingMessage = {
  role: 'system' | 'user' | 'assistant';
  content?: any;
  parts?: Array<any>;
  metadata?: Record<string, any>;
};

const extractTextFromParts = (parts: Array<any> | undefined): string => {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(part => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('');
};

const extractTextFromContentArray = (content: Array<any> | undefined): string => {
  if (!Array.isArray(content)) return '';
  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
};

const extractMessageText = (message: IncomingMessage): string => {
  if (!message) return '';
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return extractTextFromContentArray(message.content);
  }
  if (Array.isArray(message.parts)) {
    return extractTextFromParts(message.parts);
  }
  return '';
};

// Keep original parts as-is to preserve tool call metadata for UI chips
const toUIParts = (message: IncomingMessage): any[] => {
  if (Array.isArray(message.parts)) {
    return message.parts.map((part) => (typeof part === 'object' && part !== null ? { ...part } : part));
  }
  if (Array.isArray(message.content)) {
    return message.content.map((part) => (typeof part === 'object' && part !== null ? { ...part } : part));
  }
  if (typeof message.content === 'string') {
    return [{ type: 'text', text: message.content }];
  }
  return [{ type: 'text', text: '' }];
};

export async function POST(req: Request) {
  try {
    const { messages, conversationId, userId, attachments, userTimezone, agentId } = await req.json();
    const headerTimezone = req.headers.get('X-User-Timezone');
    const incomingMessages: IncomingMessage[] = Array.isArray(messages) ? messages : [];
    const normalizedMessages = incomingMessages.map(message => ({
      role: message.role,
      parts: toUIParts(message),
      metadata: message.metadata,
    }));
    
    if (!userId) {
      return new Response('User ID required', { status: 401 });
    }
    
    // Get user and validate OpenRouter API key
    const user = getUserById(userId);
    if (!user) {
      return new Response('User not found', { status: 404 });
    }
    
    // Use user's API key or fallback to environment variable
    let apiKey = getUserOpenRouterKey(userId);
    if (!apiKey) {
      // Fallback to environment variable for development/testing
      apiKey = process.env.OPENROUTER_API_KEY || null;
      
      if (!apiKey) {
        return new Response('OpenRouter API key not configured. Please add it in Settings.', { status: 400 });
      }
    }
    
    // Determine conversation ID
    let currentConversationId = conversationId;
    
    // If no conversation ID, create a new conversation
    if (!currentConversationId) {
      const firstMessage = extractMessageText(incomingMessages[0]) || 'New Conversation';
      const title = firstMessage.substring(0, 50);
      const conversation = createConversationWithAgent(userId, title, agentId || null);
      currentConversationId = conversation.id;
      
      // Initialize default tools (all disabled) for new conversation or inherit from agent
      if (agentId) {
        try { initializeToolsFromAgent(currentConversationId, agentId); } catch {}
      } else {
        initializeDefaultTools(currentConversationId);
      }
    }
    
    if (incomingMessages.length === 0) {
      return new Response('Messages required', { status: 400 });
    }
    
    // Save user message to database (with attachment text appended when available)
    const userMessage = incomingMessages[incomingMessages.length - 1];
    if (userMessage.role === 'user') {
      let content = extractMessageText(userMessage);
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
            parts.push({
              type: 'file',
              mediaType: img.mimetype || 'image/jpeg',
              filename: img.filename,
              url: dataUrl,
            });
          } catch (e) {
            console.error('Failed to embed image attachment:', img.path, e);
          }
        }
        normalizedMessages[normalizedMessages.length - 1].parts = parts;
      } else {
        // Fallback: text-only
        normalizedMessages[normalizedMessages.length - 1].parts = [{ type: 'text', text: content }];
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
    
    // Initialize OpenRouter client with API key
    const openrouter = createOpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    
    // In-memory tool events captured during this response (for history)
    const toolEvents: Array<{
      type: 'dynamic-tool';
      toolName: string;
      toolCallId: string;
      state: 'output-available' | 'output-error';
      input: unknown;
      output?: unknown;
      errorText?: string;
      preliminary?: boolean;
    }> = [];

    // Get enabled tools for this conversation
    const conversationTools = getConversationTools(currentConversationId);
    const enabledToolNames = conversationTools
      .filter(t => t.enabled)
      .map(t => t.tool_name);
    
    // Build AI SDK tools from definitions - only include enabled tools with auth
    const aiTools: Record<string, any> = {};
    const availableToolsList: Array<{name: string, description: string}> = [];
    
    for (const toolName of enabledToolNames) {
      const toolDef = tools[toolName as ToolName];
      const metadata = toolMetadata[toolName as ToolName];
      
      // Check if tool requires auth and if user has it
      let canUse = true;
      if (metadata.requiresAuth) {
        const authConnected = !!getOAuthCredential(userId, metadata.authProvider!);
        if (!authConnected) {
          canUse = false;
        }
      }
      
      // Only add tool if user can use it
      if (canUse) {
        aiTools[toolName] = {
          description: toolDef.description,
          parameters: toolDef.parameters,
          execute: async (args: any) => {
            console.log(`Tool called: ${toolName}`, args);
            const toolCallId = randomUUID();
            try {
              const result = await executeTool(toolName as ToolName, args, userId);
              console.log(`Tool result: ${toolName}`, result);
              toolEvents.push({
                type: 'dynamic-tool',
                toolName,
                toolCallId,
                state: 'output-available',
                input: args,
                output: result,
              });
              return result;
            } catch (e: any) {
              const msg = e && typeof e === 'object' && 'message' in e ? (e as any).message : 'Tool failed';
              toolEvents.push({
                type: 'dynamic-tool',
                toolName,
                toolCallId,
                state: 'output-error',
                input: args,
                errorText: String(msg),
              });
              throw e;
            }
          },
        };
        
        availableToolsList.push({
          name: toolName,
          description: toolDef.description
        });
      }
    }
    
    // Always add system tools (not shown to user, always available)
    aiTools['get_current_datetime'] = {
      description: tools['get_current_datetime'].description,
      parameters: tools['get_current_datetime'].parameters,
      execute: async (args: any) => {
        console.log('Tool called: get_current_datetime', args);
        const toolCallId = randomUUID();
        try {
          const result = await executeTool('get_current_datetime', args, userId);
          console.log('Tool result: get_current_datetime', result);
          toolEvents.push({
            type: 'dynamic-tool',
            toolName: 'get_current_datetime',
            toolCallId,
            state: 'output-available',
            input: args,
            output: result,
          });
          return result;
        } catch (e: any) {
          const msg = e && typeof e === 'object' && 'message' in e ? (e as any).message : 'Tool failed';
          toolEvents.push({
            type: 'dynamic-tool',
            toolName: 'get_current_datetime',
            toolCallId,
            state: 'output-error',
            input: args,
            errorText: String(msg),
          });
          throw e;
        }
      },
    };
    availableToolsList.push({
      name: 'get_current_datetime',
      description: tools['get_current_datetime'].description
    });
    
    // Get current date/time for context using user's timezone
    const now = new Date();
    const timezone = userTimezone || headerTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    
    // Format date/time in user's timezone
    const userDate = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long'
    }).format(now);
    
    const monthName = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'long'
    }).format(now);
    
    const dateString = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone
    }).format(now); // YYYY-MM-DD format
    
    const timeString = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    // Get timezone offset for user's timezone
    const userDateObj = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const utcDateObj = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const timezoneOffset = (userDateObj.getTime() - utcDateObj.getTime()) / (1000 * 60 * 60);
    const timezoneString = `UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`;
    
    const currentDateTime = `${userDate} (${timezone}, ${timezoneString})`;
    
    // Build system prompt with available tools and (optional) agent prompts
    let systemPrompt = `You are a helpful AI assistant.

You have access to the current date and time information:
- Current date and time: ${currentDateTime}
- Date: ${dateString}
- Time: ${timeString}
- Timezone: ${timezone} (${timezoneString})
- Day of week: ${dayOfWeek}

Use this information only when users specifically ask about dates, times, or when you need to calculate relative dates like "tomorrow", "next week", etc. Do not volunteer this information unless it's relevant to the user's question.

You also have access to the get_current_datetime tool if you need to get the current time during the conversation.`;
    
    if (availableToolsList.filter(t => t.name !== 'get_current_datetime').length > 0) {
      systemPrompt += '\n\nYou have access to the following additional tools in this conversation:\n';
      for (const tool of availableToolsList) {
        if (tool.name !== 'get_current_datetime') {
          systemPrompt += `- ${tool.name}: ${tool.description}\n`;
        }
      }
      systemPrompt += '\nUse these tools when appropriate to help the user.';
    }
    
    systemPrompt += `\n\nGuidelines:\n- Always integrate information returned by get_current_datetime naturally in your reply; do not mention using a tool or imply you had to look it up.\n- You may call get_current_datetime multiple times in a conversation, but keep the interaction seamless for the user.`;

    // Merge agent prompts if agent is present
    let agentSlug: string | undefined;
    if (agentId) {
      const agent = getAgentById(agentId);
      if (agent) {
        agentSlug = agent.slug;
        const base = agent.override_system_prompt?.trim();
        const extra = agent.extra_system_prompt?.trim();
        if (base && base.length > 0) {
          systemPrompt = base;
        }
        if (extra && extra.length > 0) {
          systemPrompt += `\n\n[Additional Context]\n${extra}`;
        }
      }
    }
    
    console.log('System prompt:', systemPrompt);
    console.log('Available tools:', Object.keys(aiTools));
    console.log('Tools list:', availableToolsList.map(t => t.name));
    
    const uiMessagesForModel = [
      {
        role: 'system' as const,
        parts: [{ type: 'text' as const, text: systemPrompt }],
      },
      ...normalizedMessages.map(message => ({
        role: message.role,
        parts: message.parts,
        metadata: message.metadata,
      })),
    ];

    const aiMessages = convertToModelMessages(uiMessagesForModel, {
      tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
      ignoreIncompleteToolCalls: true,
    });

    // Stream response from the selected model
    const result = await streamText({
      model: openrouter.chat('anthropic/claude-haiku-4.5'),
      messages: aiMessages,
      tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
      maxOutputTokens: 4096,
      temperature: 0.7,
      stopWhen: [stepCountIs(8)],
      onFinish: async ({ text, usage, response }) => {
        // Save assistant message to database
        try {
          const responseText =
            text ??
            (response?.messages || [])
              .filter((msg: any) => msg.role === 'assistant')
              .map((msg: any) => {
                if (typeof msg.content === 'string') {
                  return msg.content;
                }
                if (Array.isArray(msg.content)) {
                  return msg.content
                    .map((part: any) => {
                      if (typeof part === 'string') return part;
                      if (part && typeof part === 'object' && typeof part.text === 'string') {
                        return part.text;
                      }
                      return '';
                    })
                    .join('');
                }
                return '';
              })
              .join('') ??
            '';
          // Persist only tool call events; UI renders them below the answer
          const assistantToolCalls = toolEvents;

          createMessage(
            currentConversationId,
            'assistant',
            responseText,
            assistantToolCalls,
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
    return result.toUIMessageStreamResponse({
      headers: {
        'X-Conversation-Id': currentConversationId,
        ...(agentId ? { 'X-Agent-Slug': agentSlug || '' } : {}),
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const isRetryError = typeof error === 'object' && error !== null && 'reason' in error && (error as any).reason === 'maxRetriesExceeded';
    const message = error instanceof Error ? error.message : 'An error occurred';
    const responseMessage = isRetryError
      ? 'Upstream model timed out before responding. Please try again in a moment.'
      : message;
    return new Response(
      JSON.stringify({ 
        error: responseMessage,
        detail: message,
      }),
      { 
        status: isRetryError ? 504 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
