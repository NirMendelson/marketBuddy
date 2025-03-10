/**
 * A hybrid approach for matching grocery items to products:
 * 1. Uses traditional fuzzy matching to find candidate products
 * 2. Sends candidates to GPT-4 for final selection and confidence scoring
 */

// Import the database connection from the existing db.js
const { pool } = require('../config/db');

// Thresholds and constants
const FUZZY_MATCH_THRESHOLD = 0.4; // Lower threshold for first-pass to get more candidates
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
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  // Prevent division by zero
  if (maxLength === 0) return 1.0;
  return 1 - distance / maxLength;
}

/**
 * Find candidate products using traditional fuzzy matching
 * @param {Object} item - Parsed item from GPT-4 (quantity, unit, product)
 * @returns {Promise<Array>} - Array of candidate products
 */
async function findCandidateProducts(item) {
  try {
    console.log(`Finding candidate products for: ${JSON.stringify(item)}`);
    
    // Get products from database
    const result = await pool.query(
      'SELECT * FROM products'
    );
    
    const products = result.rows;
    console.log(`Fetched ${products.length} products from database`);
    
    // Extract percentage from product name if it exists
    const percentageMatch = item.product.match(/(\d+)%/);
    const percentageValue = percentageMatch ? percentageMatch[1] : null;
    
    // Score each product
    const scoredProducts = products.map(product => {
      // Base similarity on product name
      let similarity = calculateSimilarity(product.name, item.product);
      
      // Boost similarity if the unit matches
      if (item.unit && product.unit_measure === item.unit) {
        similarity += 0.1; // Boost for matching unit
      }
      
      // Boost similarity for percentage match if present
      if (percentageValue && product.name.includes(`${percentageValue}%`)) {
        similarity += 0.2; // Significant boost for percentage match
      }
      
      // Boost similarity if the size matches (if provided)
      if (item.size && product.size === item.size) {
        similarity += 0.1; // Boost for matching size
      }
      
      // Cap similarity at 1.0
      similarity = Math.min(similarity, 1.0);
      
      return {
        product,
        similarity
      };
    });
    
    // Filter by threshold and sort by similarity (highest first)
    const candidates = scoredProducts
      .filter(item => item.similarity >= FUZZY_MATCH_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_CANDIDATES_FOR_GPT); // Limit number of candidates
    
    console.log(`Found ${candidates.length} candidate products above threshold ${FUZZY_MATCH_THRESHOLD}`);
    
    return candidates;
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
  // STEP 3.3.1: Check if we have any candidates
  // If no candidates, return early
  if (candidates.length === 0) {
    return {
      matched: false,
      message: "No product matches found"
    };
  }
  
  // STEP 3.3.2: Check for single high-confidence match
  // If only one candidate with high similarity, return it directly without calling GPT-4
  if (candidates.length === 1 && candidates[0].similarity > 0.9) {
    return {
      matched: true,
      product: candidates[0].product,
      confidence: candidates[0].similarity,
      message: "Single high-confidence match found"
    };
  }
  
  try {
    // STEP 3.3.3: Format candidates for GPT-4
    const candidatesText = candidates.map((candidate, index) => {
      return `${index + 1}. ${candidate.product.name} (${candidate.product.brand || 'No brand'}, ${candidate.product.size} ${candidate.product.unit_measure}, ${candidate.product.price} ₪)`;
    }).join('\n');
    
    // STEP 3.3.4: Create prompt for GPT-4
    const prompt = `I need to match a grocery item to the best product in a database.

Original item: ${item.quantity} ${item.unit} ${item.product}${item.size ? `, ${item.size}` : ''}

Candidate products:
${candidatesText}

Please analyze these candidates and select the best match for the original item. Return your response as a JSON object with the following structure:
{
  "selectedIndex": number, // The 1-based index of the best matching product (or 0 if none match well)
  "confidence": number, // Your confidence in this match from 0 to 1
  "reasoning": string // Brief explanation of why this is the best match
}`;

    // STEP 3.3.5: Call GPT-4 API with the candidates
    // This uses the gptApiCall function passed from GPT4API.js
    console.log("Sending candidate products to GPT-4 for selection");
    const gptResponse = await gptApiCall(prompt);
    console.log("GPT-4 response:", gptResponse);
    
    // STEP 3.3.6: Parse GPT-4 response
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
    
    // STEP 3.3.7: Process the match result
    if (matchResult.selectedIndex > 0 && matchResult.selectedIndex <= candidates.length) {
      const selectedCandidate = candidates[matchResult.selectedIndex - 1];
      
      return {
        matched: true,
        product: selectedCandidate.product,
        confidence: matchResult.confidence,
        reasoning: matchResult.reasoning,
        message: "GPT-4 selected the best product match"
      };
    } else {
      return {
        matched: false,
        confidence: matchResult.confidence,
        reasoning: matchResult.reasoning,
        message: "GPT-4 did not find a suitable match"
      };
    }
  } catch (error) {
    // STEP 3.3.8: Error handling - fallback to highest fuzzy match if GPT-4 fails
    console.error("Error in GPT product selection:", error);
    
    // Fallback to highest fuzzy match score if GPT-4 fails
    if (candidates.length > 0) {
      return {
        matched: true,
        product: candidates[0].product,
        confidence: candidates[0].similarity,
        message: "Fallback to highest fuzzy match score due to GPT-4 error"
      };
    } else {
      return {
        matched: false,
        message: "No product matches found and GPT-4 selection failed"
      };
    }
  }
}

/**
 * Process multiple items using the hybrid matching approach
 * @param {Array} items - Array of items parsed from GPT-4
 * @param {Function} gptApiCall - Function to call GPT-4 API
 * @returns {Promise<Array>} - Processed items with matches
 */
exports.processItemsWithHybridMatching = async function(items, gptApiCall) {
  const processedItems = [];
  
  // Process each item sequentially to avoid overwhelming the database or API
  for (const item of items) {
    console.log(`Processing item with hybrid matching: ${JSON.stringify(item)}`);
    
    // Step 1: Find candidate products using fuzzy matching
    const candidates = await findCandidateProducts(item);
    
    // Step 2: Use GPT-4 to select the best match from candidates
    const matchResult = await gptSelectBestMatch(item, candidates, gptApiCall);
    
    // Format the result
    const processedItem = {
      ...item,
      isCertain: matchResult.matched && matchResult.confidence > 0.8,
      confidence: matchResult.confidence || 0,
      reasonForMatch: matchResult.reasoning || matchResult.message,
      matchedProducts: candidates.map(candidate => ({
        id: candidate.product.product_id,
        name: candidate.product.name,
        brand: candidate.product.brand,
        size: candidate.product.size,
        unit: candidate.product.unit_measure,
        price: candidate.product.price,
        confidence: candidate.similarity
      }))
    };
    
    // If we have a match, add it as the first item in matchedProducts
    if (matchResult.matched) {
      // Remove the matched product if it already exists in the list
      processedItem.matchedProducts = processedItem.matchedProducts.filter(
        p => p.id !== matchResult.product.product_id
      );
      
      // Add it as the first item
      processedItem.matchedProducts.unshift({
        id: matchResult.product.product_id,
        name: matchResult.product.name,
        brand: matchResult.product.brand,
        size: matchResult.product.size,
        unit: matchResult.product.unit_measure,
        price: matchResult.product.price,
        confidence: matchResult.confidence,
        isSelectedByGPT: true
      });
    }
    
    processedItems.push(processedItem);
  }
  
  return processedItems;
};