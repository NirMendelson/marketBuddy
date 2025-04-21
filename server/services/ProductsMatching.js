/**
 * Improved product matching algorithm for Supabase:
 * 1. Prioritizes product name matches first
 * 2. Uses additional specifications (%, size, brand) as secondary criteria
 * 3. Properly handles quantity for order items (not for matching)
 */

// Import the Supabase client from database config
const { supabase } = require('../config/db');

// Thresholds and constants
const NAME_MATCH_THRESHOLD = 0.3; // Lower threshold for product name matching
const MAX_CANDIDATES_FOR_GPT = 5;  // Maximum number of candidates to send to GPT-4

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - The edit distance between the strings
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  // Initialize the matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1, with 1 being exact match)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Convert to lowercase for better matching
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Check for exact match first
  if (s1 === s2) return 1.0;
  
  // Special handling for meat products
  if (s1.includes('עוף') || s2.includes('עוף')) {
    // For chicken products, prioritize exact name matches
    const s1Words = s1.split(/\s+/);
    const s2Words = s2.split(/\s+/);
    
    // Check if all words in the shorter string are contained in the longer one
    const shorter = s1Words.length < s2Words.length ? s1Words : s2Words;
    const longer = s1Words.length < s2Words.length ? s2Words : s1Words;
    
    const allWordsMatch = shorter.every(word => 
      longer.some(longWord => longWord.includes(word))
    );
    
    if (allWordsMatch) {
      return 0.9; // High score for partial matches in meat products
    }
  }
  
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  // Prevent division by zero
  if (maxLength === 0) return 1.0;
  
  // Calculate base similarity
  let similarity = 1 - distance / maxLength;
  
  // Boost score for partial matches in Hebrew
  if (s1.includes(s2) || s2.includes(s1)) {
    similarity += 0.2;
  }
  
  return Math.min(similarity, 1.0);
}

/**
 * Extract specifications from a product name (%, size, brand)
 * @param {string} productName - Product name to analyze
 * @returns {Object} - Extracted specifications
 */
function extractSpecifications(productName) {
  if (!productName) return {};
  
  const specs = {};
  
  // Extract percentage (e.g., "3%", "5%")
  const percentMatch = productName.match(/(\d+(?:\.\d+)?)%/);
  if (percentMatch) {
    specs.percentage = parseFloat(percentMatch[1]);
  }
  
  // Extract size with unit (e.g., "300 גרם", "1 ליטר")
  const sizeMatch = productName.match(/(\d+(?:\.\d+)?)\s*(גרם|ק"ג|מ"ל|ליטר)/);
  if (sizeMatch) {
    specs.size = parseFloat(sizeMatch[1]);
    specs.sizeUnit = sizeMatch[2];
  }
  
  // Extract common brands (can be expanded)
  const commonBrands = ['תנובה', 'טרה', 'יטבתה', 'עלית', 'אסם', 'תלמה', 'שטראוס', 'רמי לוי'];
  for (const brand of commonBrands) {
    if (productName.includes(brand)) {
      specs.brand = brand;
      break;
    }
  }
  
  return specs;
}

/**
 * Find candidate products using improved matching algorithm
 * that prioritizes product name first
 * @param {Object} item - Parsed item from GPT-4 (quantity, unit, product)
 * @returns {Promise<Array>} - Array of candidate products
 */
async function findCandidateProducts(item) {
  try {
    console.log(`Finding candidate products for: ${JSON.stringify(item)}`);
    
    // Get products from Supabase
    const { data: products, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) throw error;
    
    console.log(`Fetched ${products.length} products from Supabase`);
    
    // Extract the base product name (without size/unit)
    const baseProductName = item.product.split(/\d/)[0].trim();
    console.log(`Base product name: ${baseProductName}`);
    
    // First, find products that contain the base product name
    const nameMatches = products.filter(product => {
      const productName = product.name.toLowerCase();
      const searchName = baseProductName.toLowerCase();
      
      // Special handling for cheese products
      if (searchName.includes('גבינה') || searchName.includes('מוצרלה')) {
        // For cheese products, check if either the product name or search term contains cheese-related words
        const cheeseWords = ['גבינה', 'מוצרלה', 'צהובה', 'לבנה', 'מגורדת'];
        return cheeseWords.some(word => productName.includes(word)) && 
               cheeseWords.some(word => searchName.includes(word));
      }
      
      return productName.includes(searchName);
    });

    console.log(`Found ${nameMatches.length} products with matching name`);
    console.log('All matching products:');
    nameMatches.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name} (${product.brand || 'No brand'}, ${product.size || 'No size'} ${product.unit_measure || 'No unit'}, ${product.price} ₪)`);
    });

    // Extract size from the input product name
    const sizeMatch = item.product.match(/(\d+)\s*(גרם|ק"ג|קילוגרם)/);
    const inputSize = sizeMatch ? parseInt(sizeMatch[1]) : null;
    const inputUnit = sizeMatch ? sizeMatch[2] : null;

    // For cheese products, return all name matches without size filtering
    if (item.product.includes('גבינה') || item.product.includes('מוצרלה')) {
      console.log('Cheese product detected - returning all name matches');
      return nameMatches.map(product => ({
        product,
        similarity: 1.0,
        matchDetails: {
          nameMatch: true,
          hasMatchingSize: false,
          hasMatchingUnit: false
        }
      }));
    }

    // For other products, find the closest size match
    let candidates = nameMatches;
    if (inputSize) {
      // Convert input size to grams for comparison
      const inputSizeInGrams = inputUnit === 'ק"ג' || inputUnit === 'קילוגרם' ? inputSize * 1000 : inputSize;
      
      // Find products that can be combined to match the requested size
      candidates = nameMatches.filter(product => {
        const productSizeMatch = product.name.match(/(\d+)\s*(גרם|ק"ג|קילוגרם)/);
        if (!productSizeMatch) return false;
        
        const productSize = parseInt(productSizeMatch[1]);
        const productUnit = productSizeMatch[2];
        
        // Convert product size to grams
        const productSizeInGrams = productUnit === 'ק"ג' || productUnit === 'קילוגרם' ? productSize * 1000 : productSize;
        
        // Check if the product size is a divisor of the input size
        // This means we can buy multiple of this product to match the requested size
        return inputSizeInGrams % productSizeInGrams === 0;
      });
      
      // If no candidates found with exact size match, return all name matches
      // This allows GPT to choose the best option even if size doesn't match exactly
      if (candidates.length === 0) {
        console.log('No exact size matches found, returning all name matches');
        candidates = nameMatches;
      }
      
      console.log(`Filtered to ${candidates.length} products that can be combined to match the requested size`);
    }

    // Score the remaining candidates
    const scoredCandidates = candidates.map(product => {
      const specs = extractSpecifications(item.product);
      const productSpecs = extractSpecifications(product.name);
      
      let similarity = 0;
      
      // Name match is already guaranteed, so give it full points
      similarity += 0.5;
      
      // Size match - give points if the product size is a divisor of the input size
      if (specs.size && productSpecs.size) {
        const inputSizeInGrams = specs.sizeUnit === 'ק"ג' || specs.sizeUnit === 'קילוגרם' ? specs.size * 1000 : specs.size;
        const productSizeInGrams = productSpecs.sizeUnit === 'ק"ג' || productSpecs.sizeUnit === 'קילוגרם' ? productSpecs.size * 1000 : productSpecs.size;
        
        if (inputSizeInGrams % productSizeInGrams === 0) {
          similarity += 0.3;
        }
      }
      
      // Unit match
      if (specs.sizeUnit && productSpecs.sizeUnit && specs.sizeUnit === productSpecs.sizeUnit) {
        similarity += 0.2;
      }
      
      return {
        product,
        similarity,
        matchDetails: {
          nameMatch: true,
          hasMatchingSize: specs.size && productSpecs.size && specs.size % productSpecs.size === 0,
          hasMatchingUnit: specs.sizeUnit && productSpecs.sizeUnit && specs.sizeUnit === productSpecs.sizeUnit,
          hasMatchingPercentage: specs.percentage && productSpecs.percentage && specs.percentage === productSpecs.percentage,
          hasMatchingBrand: specs.brand && productSpecs.brand && specs.brand === productSpecs.brand
        }
      };
    });
    
    console.log(`Found ${scoredCandidates.length} final candidates`);
    console.log('Top candidates:', scoredCandidates.map(c => ({
      name: c.product.name,
      similarity: c.similarity,
      details: c.matchDetails
    })));
    
    return scoredCandidates;
  } catch (error) {
    console.error("Error finding candidate products:", error);
    return []; // Return empty array on error
  }
}

/**
 * Use GPT-4 to select the best match from candidate products
 * @param {Object} item - Original parsed item from GPT-4
 * @param {Array} candidates - Candidate products from fuzzy matching
 * @param {Function} gptApiCall - Function to call GPT-4 API
 * @returns {Promise<Object>} - Final matched product with confidence score
 */
async function gptSelectBestMatch(item, candidates, gptApiCall) {
  // If no candidates, return early
  if (candidates.length === 0) {
    return {
      matched: false,
      message: "No product matches found"
    };
  }
  
  // Special handling for cheese products - return all matching options
  if (item.product.includes('גבינה')) {
    // Extract size from the input product name
    const sizeMatch = item.product.match(/(\d+)\s*(גרם|ק"ג|קילוגרם)/);
    const inputSize = sizeMatch ? parseInt(sizeMatch[1]) : null;
    const inputUnit = sizeMatch ? sizeMatch[2] : null;

    // Filter candidates to only include those with matching size
    const matchingSizeCandidates = candidates.filter(candidate => {
      const productSizeMatch = candidate.product.name.match(/(\d+)\s*(גרם|ק"ג|קילוגרם)/);
      if (!productSizeMatch) return false;
      
      const productSize = parseInt(productSizeMatch[1]);
      const productUnit = productSizeMatch[2];
      
      // Convert to grams for comparison if needed
      const inputSizeInGrams = inputUnit === 'ק"ג' || inputUnit === 'קילוגרם' ? inputSize * 1000 : inputSize;
      const productSizeInGrams = productUnit === 'ק"ג' || productUnit === 'קילוגרם' ? productSize * 1000 : productSize;
      
      return inputSizeInGrams === productSizeInGrams;
    });

    if (matchingSizeCandidates.length > 0) {
      return {
        matched: true,
        product: matchingSizeCandidates[0].product, // Keep the first one as default
        confidence: matchingSizeCandidates[0].similarity,
        matchedProducts: matchingSizeCandidates.map(c => c.product),
        message: "Multiple cheese options found with matching size",
        isCertain: false // Set to false to ensure options are shown
      };
    }
  }
  
  // If only one candidate with high similarity, return it directly without calling GPT-4
  if (candidates.length === 1 && candidates[0].similarity > 0.9) {
    return {
      matched: true,
      product: candidates[0].product,
      confidence: candidates[0].similarity,
      matchedProducts: [candidates[0].product],
      message: "Single high-confidence match found",
      isCertain: true
    };
  }
  
  try {
    // Format candidates for GPT-4
    const candidatesText = candidates.map((candidate, index) => {
      return `${index + 1}. ${candidate.product.name} (${candidate.product.brand || 'No brand'}, ${candidate.product.size} ${candidate.product.unit_measure}, ${candidate.product.price} ₪)`;
    }).join('\n');
    
    // Create prompt for GPT-4 with focus on product name and specifications
    const prompt = `I need to match a grocery item to the best product in a database.

Original item: ${item.quantity} ${item.unit} ${item.product}${item.size ? `, ${item.size}` : ''}

Extracted specifications:
- Product name: ${item.product}
- Unit: ${item.unit || 'not specified'}
- Size: ${item.size || 'not specified'}
- Specifications: ${JSON.stringify(extractSpecifications(item.product))}

When matching, prioritize the product name match first, then consider specifications like percentage (%) content, size, and brand.

Candidate products:
${candidatesText}

Please analyze these candidates and select the best match for the original item. Return your response as a JSON object with the following structure:
{
  "selectedIndices": [number], // Array of 1-based indices of matching products
  "confidence": number, // Your confidence in these matches from 0 to 1
  "reasoning": string // Brief explanation of why these are the best matches
}`;

    console.log("Sending candidate products to GPT-4 for selection");
    const gptResponse = await gptApiCall(prompt);
    console.log("GPT-4 response:", gptResponse);
    
    // Parse GPT-4 response
    let matchResult;
    try {
      // Try to parse if it's already JSON
      matchResult = typeof gptResponse === 'string' ? JSON.parse(gptResponse) : gptResponse;
    } catch (e) {
      // If not JSON, try to extract JSON from the text
      const jsonMatch = gptResponse.match(/```json\n([\s\S]*?)\n```/) || 
                       gptResponse.match(/```\n([\s\S]*?)\n```/) ||
                       gptResponse.match(/({[\s\S]*})/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          matchResult = JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          throw new Error("Failed to parse GPT-4 response as JSON");
        }
      } else {
        throw new Error("GPT-4 response did not contain valid JSON");
      }
    }
    
    // Process the match result
    if (matchResult.selectedIndices && matchResult.selectedIndices.length > 0) {
      const selectedCandidates = matchResult.selectedIndices
        .filter(index => index > 0 && index <= candidates.length)
        .map(index => candidates[index - 1]);
      
      if (selectedCandidates.length > 0) {
        return {
          matched: true,
          product: selectedCandidates[0].product, // Keep the first one as default
          confidence: matchResult.confidence,
          matchedProducts: selectedCandidates.map(c => c.product),
          reasoning: matchResult.reasoning,
          message: "GPT-4 selected the best product matches",
          isCertain: false // Set to false to ensure options are shown
        };
      }
    }
    
    return {
      matched: false,
      confidence: matchResult.confidence,
      reasoning: matchResult.reasoning,
      message: "GPT-4 did not find a suitable match",
      isCertain: false
    };
  } catch (error) {
    // Error handling - fallback to highest fuzzy match if GPT-4 fails
    console.error("Error in GPT product selection:", error);
    
    // Fallback to highest fuzzy match score if GPT-4 fails
    if (candidates.length > 0) {
      return {
        matched: true,
        product: candidates[0].product,
        confidence: candidates[0].similarity,
        matchedProducts: [candidates[0].product],
        message: "Fallback to highest fuzzy match score due to GPT-4 error",
        isCertain: false
      };
    } else {
      return {
        matched: false,
        message: "No product matches found and GPT-4 selection failed",
        isCertain: false
      };
    }
  }
}

/**
 * Process multiple items using the improved matching approach
 * @param {Array} items - Array of items parsed from GPT-4
 * @param {Function} gptApiCall - Function to call GPT-4 API
 * @returns {Promise<Array>} - Processed items with matches
 */
exports.processItemsWithHybridMatching = async function(items, gptApiCall) {
  const processedItems = [];
  
  // Process each item sequentially to avoid overwhelming the database or API
  for (const item of items) {
    console.log(`Processing item with hybrid matching: ${JSON.stringify(item)}`);
    
    // Step 1: Find candidate products using improved matching algorithm
    const candidates = await findCandidateProducts(item);
    
    // Step 2: Use GPT-4 to select the best match from candidates
    const matchResult = await gptSelectBestMatch(item, candidates, gptApiCall);
    
    // Format the result
    const processedItem = {
      ...item,
      isCertain: matchResult.matched && matchResult.confidence > 0.8 && matchResult.matchedProducts.length === 1,
      confidence: matchResult.confidence || 0,
      reasonForMatch: matchResult.reasoning || matchResult.message,
      matchedProducts: matchResult.matchedProducts || []
    };
    
    processedItems.push(processedItem);
  }
  
  return processedItems;
};