import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getUserById, createMessage, getMessagesByConversationId, createConversation, updateConversationTitle } from '@/lib/db';
import { tools } from '@/lib/tools/definitions';
import { executeTool } from '@/lib/n8n-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { messages, conversationId, userId } = await req.json();
    
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
    
    // Save user message to database
    const userMessage = messages[messages.length - 1];
    if (userMessage.role === 'user') {
      createMessage(currentConversationId, 'user', userMessage.content);
    }
    
    // Initialize OpenRouter client with user's API key
    const openrouter = createOpenAI({
      apiKey: user.openrouter_api_key,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    
    // Convert our tool definitions to AI SDK format
    const aiTools: Record<string, any> = {};
    
    Object.entries(tools).forEach(([name, def]) => {
      aiTools[name] = tool({
        description: def.description,
        parameters: def.parameters,
        execute: async (params) => {
          console.log(`Executing tool: ${name}`, params);
          
          // Execute tool via n8n
          const result = await executeTool(name, params, userId);
          
          if (!result.success) {
            return {
              error: result.error || 'Tool execution failed',
            };
          }
          
          return result.data;
        },
      });
    });
    
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
    return new Response(result.toAIStream(), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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


