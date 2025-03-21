const { processItemsWithHybridMatching } = require("./ProductsMatching");

/**
 * Process a grocery list message using Azure OpenAI API with hybrid matching
 * @param {string} message - The user's grocery list message
 * @returns {Promise<Object>} - Processed grocery items
 */
exports.processGroceryList = async (message) => {
  try {
    console.log(`Processing grocery list with hybrid matching: ${message}`);
    
    // STEP 1: Validate environment variables for Azure OpenAI
    if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY || !process.env.AZURE_OPENAI_DEPLOYMENT) {
      console.error("⛔ Missing Azure OpenAI configuration:");
      if (!process.env.AZURE_OPENAI_ENDPOINT) console.error("- AZURE_OPENAI_ENDPOINT is not set");
      if (!process.env.AZURE_OPENAI_KEY) console.error("- AZURE_OPENAI_KEY is not set");
      if (!process.env.AZURE_OPENAI_DEPLOYMENT) console.error("- AZURE_OPENAI_DEPLOYMENT is not set");
      throw new Error("Missing Azure OpenAI configuration. Please check your environment variables.");
    }
    
    // STEP 2: Parse grocery list free text into structured items using GPT-4
    // This step converts natural language into structured data (quantity, unit, product)
    const parsedItems = await parseGroceryListWithGPT(message);
    
    if (!parsedItems || !Array.isArray(parsedItems) || parsedItems.length === 0) {
      throw new Error("Failed to parse grocery list items");
    }
    
    console.log(`Successfully parsed ${parsedItems.length} items from grocery list`);
    
    // STEP 3: Send the parsed items to ProductsMatching.js
    // This begins the hybrid matching process in that file
    const processedItems = await processItemsWithHybridMatching(
      parsedItems, 
      // Pass the function to call GPT-4 API
      (prompt) => callGPT4ForProductSelection(prompt)
    );
    
    // STEP 4: Format the final results for display
    return {
      items: processedItems,
      summary: {
        totalItems: processedItems.length,
        certainItems: processedItems.filter(item => item.isCertain).length,
        uncertainItems: processedItems.filter(item => !item.isCertain).length
      }
    };
    
  } catch (error) {
    console.error("Error processing grocery list:", error);
    throw error;
  }
};

/**
 * Parse a grocery list message using Azure OpenAI API
 * @param {string} message - The user's grocery list message
 * @returns {Promise<Array>} - Array of parsed items
 */
async function parseGroceryListWithGPT(message) {
  console.log("Parsing grocery list with Azure OpenAI API...");
  
  // Log API configuration (partially masked for security)
  console.log(`Azure OpenAI Configuration:`);
  console.log(`- Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT.substring(0, 15)}...`);
  console.log(`- Deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT}`);
  console.log(`- API Key: ${process.env.AZURE_OPENAI_KEY.substring(0, 5)}...`);
  
  const apiUrl = `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-05-15`;
  console.log(`Making request to: ${apiUrl}`);
  
  // Try to call the Azure OpenAI API, but fall back to a simulated response if it fails
  // This allows testing even without valid API credentials
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.AZURE_OPENAI_KEY
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a grocery shopping assistant that helps parse grocery lists in Hebrew.
                     For each item, extract the following:
                     - Quantity (the number of units the user wants to buy, default is 1 if not specified)
                     - Unit (e.g., גרם, ק"ג, יחידה, מ"ל, ליטר)
                     - Product name and details (including brand, percentage, etc.)
                     
                     Important: The quantity should represent how many of the product the user wants to order, 
                     not the weight/size of each product. The product name should include all specifications 
                     like percentage, brand name, and size. 
                     
                     For example, "2 חלב תנובה 3%" should be:
                     - quantity: 2 (user wants 2 units)
                     - unit: יחידה (the unit is pieces/units)
                     - product: "חלב תנובה 3%" (product name includes the brand and percentage)
                     
                     Return the data in JSON format with the following structure:
                     {
                      "items": [
                        {
                          "quantity": number,
                          "unit": string,
                          "product": string,
                          "confidence": number
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
      const parsedResponse = JSON.parse(cleanJson);
      return parsedResponse.items || [];
    } catch (error) {
      console.error("Error parsing AI response:", error);
      console.error("Raw response content:", responseContent);
      throw new Error("Failed to parse AI response: " + error.message);
    }
  } catch (error) {
    console.error("Error calling Azure OpenAI API:", error);
    throw new Error("Failed to call Azure OpenAI API: " + error.message);
  }
  
}

/**
 * Call Azure OpenAI API for product selection from candidates
 * @param {string} prompt - The prompt for product selection
 * @returns {Promise<string>} - The GPT-4 response
 */
async function callGPT4ForProductSelection(prompt) {
  console.log("Calling Azure OpenAI for product selection...");
  
  const apiUrl = `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-05-15`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.AZURE_OPENAI_KEY
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a grocery shopping assistant that helps match grocery items to products in a database.
                     You will receive a grocery item and a list of candidate products.
                     When matching, prioritize product name matches first, then consider specifications like percentage (%) content, size, and brand.
                     Select the best matching product and explain your reasoning.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2, // Lower temperature for more consistent responses
        max_tokens: 500,
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
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error calling Azure OpenAI for product selection:", error);
    throw new Error("Failed to call Azure OpenAI for product selection: " + error.message);
  }
}



