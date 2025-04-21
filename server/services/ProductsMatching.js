/**
 * Improved product matching algorithm for Supabase:
 * 1. Prioritizes product name matches first
 * 2. Uses additional specifications (%, size, brand) as secondary criteria
 * 3. Properly handles quantity for order items (not for matching)
 */

// Import the Supabase client from database config
const { supabase } = require('../config/db');

// Thresholds and constants
const NAME_MATCH_THRESHOLD = 0.5; // Higher threshold for product name matching
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
    
    // Extract specifications from the product name
    const specs = extractSpecifications(item.product);
    console.log(`Extracted specifications: ${JSON.stringify(specs)}`);
    
    // Score each product with primary focus on name matching
    const scoredProducts = products.map(product => {
      // Base similarity on product name (PRIMARY CRITERIA)
      let similarity = calculateSimilarity(product.name, item.product);
      
      // Special handling for meat products
      if (item.product.includes('עוף')) {
        // Boost for exact name matches in meat products
        if (product.name === item.product) {
          similarity = 1.0;
        }
        // Boost for partial matches that include the main product name
        else if (product.name.includes(item.product) || item.product.includes(product.name)) {
          similarity += 0.3;
        }
      }
      
      // Apply secondary criteria as score boosters
      
      // Boost for matching unit
      if (item.unit && product.unit_measure === item.unit) {
        similarity += 0.05;
      }
      
      // Boost for matching percentage if specified
      if (specs.percentage && product.name.includes(`${specs.percentage}%`)) {
        similarity += 0.15;
      }
      
      // Boost for matching brand if specified
      if (specs.brand && product.brand === specs.brand) {
        similarity += 0.15;
      }
      
      // Boost for matching size if specified
      if (specs.size && product.size === specs.size) {
        similarity += 0.1;
      }
      
      // Cap similarity at 1.0
      similarity = Math.min(similarity, 1.0);
      
      return {
        product,
        similarity,
        // Include detailed matching info for debugging
        matchDetails: {
          nameMatch: calculateSimilarity(product.name, item.product),
          hasMatchingUnit: item.unit && product.unit_measure === item.unit,
          hasMatchingPercentage: specs.percentage && product.name.includes(`${specs.percentage}%`),
          hasMatchingBrand: specs.brand && product.brand === specs.brand,
          hasMatchingSize: specs.size && product.size === specs.size
        }
      };
    });
    
    // Filter by name match threshold and sort by similarity (highest first)
    const candidates = scoredProducts
      .filter(item => item.similarity >= NAME_MATCH_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_CANDIDATES_FOR_GPT); // Limit number of candidates
    
    console.log(`Found ${candidates.length} candidate products above threshold ${NAME_MATCH_THRESHOLD}`);
    
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
  // If no candidates, return early
  if (candidates.length === 0) {
    return {
      matched: false,
      message: "No product matches found"
    };
  }
  
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
  "selectedIndex": number, // The 1-based index of the best matching product (or 0 if none match well)
  "confidence": number, // Your confidence in this match from 0 to 1
  "reasoning": string // Brief explanation of why this is the best match
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
    // Error handling - fallback to highest fuzzy match if GPT-4 fails
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