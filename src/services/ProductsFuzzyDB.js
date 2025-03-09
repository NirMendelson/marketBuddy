
/**
 * Process the product matches from the Azure OpenAI API response
 * @param {Object} apiResponse - The structured response from the Azure OpenAI API
 * @returns {Object} - Processed product matches with recommended actions
 */
export const processProductMatches = (apiResponse) => {
    console.log("Processing Azure OpenAI API response:", apiResponse);
    
    // Safety check for incorrect response format
    if (!apiResponse.items || !Array.isArray(apiResponse.items)) {
      console.error("Invalid API response format:", apiResponse);
      throw new Error("Invalid API response format - expected 'items' array");
    }
    
    const processedItems = apiResponse.items.map(item => {
      // In the future, this would query a product database
      console.log(`Item from API: ${item.product}`);
      
      // Check confidence to determine if the product is certain
      const isCertain = item.confidence > 0.8;
      
      return {
        ...item,
        isCertain,
        recommendedAction: isCertain ? 'add_to_cart' : 'ask_for_clarification',
        matchedProducts: item.possibleMatches || []
      };
    });
    
    // Log the processed items for debugging
    console.log("Processed grocery items:", processedItems);
    
    return {
      items: processedItems,
      summary: {
        totalItems: processedItems.length,
        certainItems: processedItems.filter(item => item.isCertain).length,
        uncertainItems: processedItems.filter(item => !item.isCertain).length
      }
    };
  };