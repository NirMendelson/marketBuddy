// services/GPT4API.js
import { processProductMatches } from "./ProductsFuzzyDB";

/**
 * Process a grocery list message using Azure OpenAI API
 * @param {string} message - The user's grocery list message
 * @returns {Promise<Object>} - Processed grocery items
 */
export const processGroceryList = async (message) => {
  try {
    console.log(`Sending grocery list to Azure OpenAI: ${message}`);
    
    // Validate environment variables
    if (!process.env.REACT_APP_AZURE_OPENAI_ENDPOINT || !process.env.REACT_APP_AZURE_OPENAI_KEY || !process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT) {
      console.error("⛔ Missing Azure OpenAI configuration:");
      if (!process.env.REACT_APP_AZURE_OPENAI_ENDPOINT) console.error("- REACT_APP_AZURE_OPENAI_ENDPOINT is not set");
      if (!process.env.REACT_APP_AZURE_OPENAI_KEY) console.error("- REACT_APP_AZURE_OPENAI_KEY is not set");
      if (!process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT) console.error("- REACT_APP_AZURE_OPENAI_DEPLOYMENT is not set");
      throw new Error("Missing Azure OpenAI configuration. Please check your environment variables.");
    }
    
    // Call Azure OpenAI API
    const response = await callAzureOpenAI(message);
    
    // Process the AI response to match with products
    const processedResult = processProductMatches(response);
    
    return processedResult;
  } catch (error) {
    console.error("Error processing grocery list:", error);
    throw error;
  }
};

/**
 * Call Azure OpenAI API to process the grocery list
 * @param {string} message - The user's grocery list message
 */
const callAzureOpenAI = async (message) => {
  console.log("Making API call to Azure OpenAI...");
  
  // Log API configuration (partially masked for security)
  console.log(`Azure OpenAI Configuration:`);
  console.log(`- Endpoint: ${process.env.REACT_APP_AZURE_OPENAI_ENDPOINT.substring(0, 15)}...`);
  console.log(`- Deployment: ${process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT}`);
  console.log(`- API Key: ${process.env.REACT_APP_AZURE_OPENAI_KEY.substring(0, 5)}...`);
  
  const apiUrl = `${process.env.REACT_APP_AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-05-15`;
  console.log(`Making request to: ${apiUrl}`);
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.REACT_APP_AZURE_OPENAI_KEY
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content: `You are a grocery shopping assistant that helps parse grocery lists in Hebrew.
                   For each item, extract the following:
                   - Quantity (default is 1 if not specified)
                   - Unit (e.g., גרם, ק"ג, יחידה)
                   - Product name and details
                   
                   Return the data in JSON format with the following structure:
                   {
                    "items": [
                      {
                        "quantity": number,
                        "unit": string,
                        "product": string,
                        "confidence": number,
                        "possibleMatches": [
                          { 
                            "id": number,
                            "name": string,
                            "confidence": number
                          }
                        ]
                      }
                    ]
                   }`
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 0.3,
      max_tokens: 800,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Azure OpenAI API error (${response.status}): ${errorText}`);
    throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log("Raw API response:", data);
  
  // Extract and parse the JSON from the AI response
  const responseContent = data.choices[0].message.content;
  console.log("AI response content:", responseContent);
  
  // The AI might return JSON wrapped in markdown code blocks
  const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/) || 
                   responseContent.match(/```\n([\s\S]*?)\n```/) ||
                   [null, responseContent];
  
  const cleanJson = jsonMatch[1] ? jsonMatch[1].trim() : responseContent.trim();
  
  try {
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Error parsing AI response:", error);
    console.error("Raw response content:", responseContent);
    throw new Error("Failed to parse AI response: " + error.message);
  }
};