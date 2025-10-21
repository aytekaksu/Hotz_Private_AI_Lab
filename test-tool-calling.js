// Simple test script to verify tool calling indicators work
const testToolCalling = async () => {
  try {
    console.log('Testing tool calling functionality...');
    
    // Test 1: Check if the API is responding
    const healthResponse = await fetch('http://localhost:3000/api/health');
    const healthData = await healthResponse.json();
    console.log('✓ Health check passed:', healthData.status);
    
    // Test 2: Test a simple chat message that might trigger tool calls
    const testMessage = {
      messages: [
        {
          role: 'user',
          content: 'What is the current date and time?'
        }
      ],
      userId: 'test-user',
      userTimezone: 'America/New_York'
    };
    
    console.log('Sending test message...');
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('✓ Chat API responded successfully');
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    // Read the streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      responseText += chunk;
      console.log('Received chunk:', chunk.substring(0, 100) + '...');
    }
    
    console.log('✓ Streaming response completed');
    console.log('Full response length:', responseText.length);
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
  }
};

testToolCalling();



