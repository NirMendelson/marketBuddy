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
    
    // STEP 3: Send the parsed items to HybridProductMatcher.js
    // This begins the hybrid matching process in that file
    // We also pass a function that GPT-4 can use for product selection
    const processedItems = await processItemsWithHybridMatching(
      parsedItems, 
      // Pass the function to call GPT-4 API (will be used in HybridProductMatcher.js)
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
                     - Quantity (default is 1 if not specified)
                     - Unit (e.g., גרם, ק"ג, יחידה, מ"ל, ליטר)
                     - Product name and details
                     - Size (if specified separately from quantity)
                     
                     Return the data in JSON format with the following structure:
                     {
                      "items": [
                        {
                          "quantity": number,
                          "unit": string,
                          "product": string,
                          "size": number (optional),
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
    console.error("Error calling Azure OpenAI API, using fallback response:", error);
    // Return a simulated response for testing
    return simulateGroceryListParsing(message);
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
    // Simulate a response for testing
    return simulateProductSelection(prompt);
  }
}

/**
 * Generate a simulated response for testing when GPT-4 API is unavailable
 * @param {string} message - The user's grocery list message
 * @returns {Array} - Simulated parsed items
 */
function simulateGroceryListParsing(message) {
  console.log("Generating simulated parsing for:", message);
  
  // Define some unit patterns to look for
  const unitPatterns = {
    "גרם": /גרם|gram|gr/i,
    "ק\"ג": /ק\"ג|ק"ג|קילו|קג|kg|kilo/i,
    "מ\"ל": /מ\"ל|מ"ל|מיליליטר|מל|ml/i,
    "ליטר": /ליטר|ל'|liter|l/i,
    "יחידה": /יחיד|יח'|יח|unit|piece/i
  };
  
  // Parse for common grocery items
  const items = [];
  
  // Split by comma or newline to handle multiple items
  const lines = message.split(/[,\n]+/);
  
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Extract quantity using regex
    const quantityMatch = trimmedLine.match(/(\d+(\.\d+)?)/);
    const quantity = quantityMatch ? parseFloat(quantityMatch[1]) : 1;
    
    // Remove quantity from the line to get the rest
    let productText = trimmedLine.replace(/^\d+(\.\d+)?/, '').trim();
    
    // Look for size specification (e.g., "250 גרם")
    const sizeMatch = productText.match(/(\d+(\.\d+)?)\s*(גרם|ק"ג|מ"ל|ליטר)/);
    let size = null;
    
    if (sizeMatch) {
      size = parseFloat(sizeMatch[1]);
      // Remove size specification from product text
      productText = productText.replace(sizeMatch[0], '').trim();
    }
    
    // Try to extract unit
    let unit = "יחידה"; // Default unit
    for (const [unitName, pattern] of Object.entries(unitPatterns)) {
      if (pattern.test(productText)) {
        unit = unitName;
        // Remove the unit from the product text
        productText = productText.replace(pattern, '').trim();
        break;
      }
    }
    
    // Extract product name
    // Remove any remaining numbers and punctuation at the start
    const product = productText.replace(/^[\d\s,.]+/, '').trim();
    
    if (product) {
      items.push({
        quantity,
        unit,
        product,
        size: size,
        confidence: 0.8 + (Math.random() * 0.15) // Random confidence between 0.8 and 0.95
      });
    }
  });
  
  return items;
}

/**
 * Simulate GPT-4 product selection for testing
 * @param {string} prompt - The product selection prompt
 * @returns {string} - Simulated GPT-4 response as JSON
 */
function simulateProductSelection(prompt) {
  console.log("Simulating GPT-4 product selection for prompt:", prompt);
  
  // Extract the candidate count from the prompt
  const candidateMatch = prompt.match(/Candidate products:\s+([\s\S]*?)Please analyze/);
  if (!candidateMatch) return JSON.stringify({ selectedIndex: 0, confidence: 0, reasoning: "No candidates found" });
  
  const candidatesText = candidateMatch[1];
  const candidateCount = (candidatesText.match(/\d+\./g) || []).length;
  
  // Randomly select a candidate or none
  const selectedIndex = candidateCount > 0 
    ? Math.floor(Math.random() * (candidateCount + 1)) // 0 to candidateCount
    : 0;
  
  const confidence = selectedIndex === 0 
    ? Math.random() * 0.3 // Low confidence if no selection
    : 0.7 + (Math.random() * 0.3); // 0.7-1.0 if selected
  
  const reasonings = [
    "This product best matches the description and quantity specified by the user.",
    "The product name, brand, and size align perfectly with the user's request.",
    "While not a perfect match, this product is the closest available option.",
    "The percentage content matches exactly what the user requested."
  ];
  
  return JSON.stringify({
    selectedIndex,
    confidence: parseFloat(confidence.toFixed(2)),
    reasoning: selectedIndex > 0 
      ? reasonings[Math.floor(Math.random() * reasonings.length)]
      : "None of the products match the user's request closely enough."
  });
}