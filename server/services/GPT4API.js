const { processItemsWithHybridMatching } = require("./ProductsMatching");
const fetch = require('node-fetch');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the root .env file
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath, override: true });

// Use environment variables
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const AZURE_OPENAI_VERSION = process.env.AZURE_OPENAI_VERSION;

/**
 * Process a grocery list message using Azure OpenAI API with hybrid matching
 * @param {string} message - The user's grocery list message
 * @returns {Promise<Object>} - Processed grocery items
 */
exports.processGroceryList = async (message) => {
  try {
    console.log(`Processing grocery list with hybrid matching: ${message}`);
    
    // STEP 1: Validate environment variables for Azure OpenAI
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
      console.error("⛔ Missing Azure OpenAI configuration:");
      if (!AZURE_OPENAI_ENDPOINT) console.error("- AZURE_OPENAI_ENDPOINT is not set");
      if (!AZURE_OPENAI_KEY) console.error("- AZURE_OPENAI_KEY is not set");
      if (!AZURE_OPENAI_DEPLOYMENT) console.error("- AZURE_OPENAI_DEPLOYMENT is not set");
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
 * Clean Hebrew text for JSON parsing
 * @param {string} text - The text to clean
 * @returns {string} - The cleaned text
 */
function cleanHebrewText(text) {
  // Replace Hebrew quotes with regular quotes
  text = text.replace(/״/g, '"');
  text = text.replace(/׳/g, "'");
  
  // Replace problematic Hebrew characters
  text = text.replace(/ק"ג/g, 'קילוגרם');
  text = text.replace(/מ"ל/g, 'מיליליטר');
  text = text.replace(/ל"ל/g, 'ליטר');
  
  return text;
}

/**
 * Parse a grocery list message using Azure OpenAI API
 * @param {string} message - The user's grocery list message
 * @returns {Promise<Array>} - Array of parsed items
 */
async function parseGroceryListWithGPT(message) {
  console.log("Parsing grocery list with Azure OpenAI API...");
  
  // Log API configuration (partially masked for security)
  console.log(`Azure OpenAI Configuration:`);
  console.log(`- Endpoint: ${AZURE_OPENAI_ENDPOINT}`);
  console.log(`- Deployment: ${AZURE_OPENAI_DEPLOYMENT}`);
  console.log(`- API Version: ${AZURE_OPENAI_VERSION}`);
  
  const apiUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_VERSION}`;
  console.log(`Making request to: ${apiUrl}`);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_KEY
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a grocery shopping assistant that helps parse grocery lists in Hebrew.
                     For each item, extract the following:
                     - Quantity (the number of units the user wants to buy, default is 1 if not specified)
                     - Unit (e.g., גרם, קילוגרם, יחידה, מיליליטר, ליטר)
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
                     }
                     
                     Important: 
                     1. Make sure the JSON is properly formatted and all strings are properly escaped.
                     2. Use full unit names (e.g., "קילוגרם" instead of "ק"ג")
                     3. Avoid using quotes within unit or product names`
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.2,
        max_tokens: 1000,
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
    console.log('Azure OpenAI API response:', data);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid API response structure:', data);
      throw new Error('Invalid API response structure');
    }

    const content = data.choices[0].message.content;
    console.log('Raw content from AI:', content);

    try {
      // Clean the content before parsing
      const cleanedContent = cleanHebrewText(content);
      console.log('Cleaned content:', cleanedContent);
      
      // Try to parse the cleaned content
      const parsedData = JSON.parse(cleanedContent);
      console.log('Parsed JSON data:', parsedData);

      if (!parsedData.items || !Array.isArray(parsedData.items)) {
        console.error('Invalid parsed data structure:', parsedData);
        throw new Error('Invalid parsed data structure');
      }

      return parsedData.items;
    } catch (parseError) {
      console.error('Error parsing JSON response:', {
        error: parseError.message,
        content: content,
        position: parseError.position
      });
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error in parseGroceryListWithGPT:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}

/**
 * Call Azure OpenAI API for product selection from candidates
 * @param {string} prompt - The prompt for product selection
 * @returns {Promise<string>} - The GPT-4 response
 */
async function callGPT4ForProductSelection(prompt) {
  console.log("Calling Azure OpenAI for product selection...");
  
  const apiUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_VERSION}`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_KEY
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a grocery shopping assistant that helps match grocery items to products in a database.
                     You will receive a grocery item and a list of candidate products.
                     
                     For cheese products (גבינה), return ALL products that match the specified size.
                     For other products, select the best matching product.
                     
                     Return your response as a JSON object with the following structure:
                     {
                       "selectedIndices": [number], // Array of 1-based indices of matching products
                       "confidence": number, // Your confidence in these matches from 0 to 1
                       "reasoning": string // Brief explanation of why these are the best matches
                     }`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
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



