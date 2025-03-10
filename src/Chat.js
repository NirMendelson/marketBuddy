import React, { useState } from "react";
import "./Chat.css";
import { FiSend, FiUser, FiPlus, FiInfo } from "react-icons/fi";

// API client function to call backend
const processGroceryList = async (message) => {
  try {
    // Call the backend API endpoint
    const response = await fetch('/process-grocery-list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error in processGroceryList:', error);
    throw error;
  }
};

const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [groceryItems, setGroceryItems] = useState([]);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showGroceryList, setShowGroceryList] = useState(false);

  const handleSend = async () => {
    if (message.trim() !== "") {
      // Add user message to chat
      const userMessage = message;
      setMessages([...messages, { text: userMessage, sender: "user" }]);
      setMessage(""); // Clear input field immediately for better UX
      
      // Check if the message looks like a grocery list based on DB schema
      const isGroceryList = (() => {
        // These units exactly match the unit_measure values in the database
        const validUnitMeasures = [
          "מ\"ל",  // milliliter - exactly as stored in DB
          "גרם",   // gram - exactly as stored in DB
          "ק\"ג",  // kilogram - exactly as stored in DB
          "ליטר",  // liter - exactly as stored in DB
        ];
        
        // Create a regex pattern that matches any of the valid units
        const unitPattern = new RegExp(validUnitMeasures.join("|"), "i");
        
        return (
          // Format patterns that match our database format
          userMessage.match(/\d+\s+[א-ת]/) ||  // Number followed by Hebrew text
          userMessage.match(/\d+%/) ||         // Percentage (like in "חלב 3%")
          userMessage.match(unitPattern) ||    // Contains any valid unit measure
          userMessage.match(/\d+\s+(גרם|מ"ל|ק"ג|ליטר|יחידה)/) || // Number with unit
          
          // Multiple items (likely a list)
          userMessage.split(',').length > 1 || 
          userMessage.split('\n').length > 1
        );
      })();
      
      if (isGroceryList) {
        setIsProcessing(true);
        
        // Unique ID for the "thinking" message
        const thinkingMsgId = Date.now().toString();
        
        try {
          // Add a "thinking" message
          setMessages(msgs => [...msgs, { 
            id: thinkingMsgId,
            text: "מתחבר ל-Azure OpenAI API... מעבד את הרשימה שלך...", 
            sender: "ai",
            isProcessing: true
          }]);
          
          // Call AI service to process grocery list
          console.log("Calling Azure OpenAI API with message:", userMessage);
          const aiResponse = await processGroceryList(userMessage);
          
          // Log the full structured response to console
          console.log("Azure OpenAI API Processing Results:", aiResponse);
          
          // Remove the "thinking" message
          setMessages(msgs => msgs.filter(m => m.id !== thinkingMsgId));
          
          // Format a response based on the AI processing
          const formattedResponse = formatAIResponse(aiResponse);
          
          // Add the formatted response to chat
          setMessages(msgs => [...msgs, { 
            text: formattedResponse, 
            sender: "ai" 
          }]);
          
          // Update grocery items state with the processed items
          updateGroceryItems(aiResponse.items);
          
          // Show the grocery list if we found items
          if (aiResponse.items && aiResponse.items.length > 0) {
            setShowGroceryList(true);
          }
          
        } catch (error) {
          console.error("Error processing grocery list with Azure OpenAI API:", error);
          
          // Remove the "thinking" message
          setMessages(msgs => msgs.filter(m => m.id !== thinkingMsgId));
          
          // Add error message with more specific details
          setMessages(msgs => [...msgs, { 
            text: `שגיאה בחיבור ל-Azure OpenAI API: ${error.message}. אנא בדוק את פרטי ההתחברות ב-.env או פנה למנהל המערכת.`, 
            sender: "ai" 
          }]);
        } finally {
          setIsProcessing(false);
        }
      } else {
        // Handle regular chat messages
        setTimeout(() => {
          setMessages(msgs => [...msgs, { 
            text: "אני יכול לעזור לך עם הקניות. נסה לרשום רשימת קניות בפורמט: '2 גבינה לבנה 9%, 250 גרם'. ניתן להוסיף כמה פריטים בהודעה אחת, מופרדים בפסיקים או שורות חדשות.", 
            sender: "ai" 
          }]);
        }, 500);
      }
    }
  };

  // Format the AI response into a readable message
  const formatAIResponse = (aiResponse) => {
    if (!aiResponse.items || aiResponse.items.length === 0) {
      return "לא הצלחתי לזהות פריטים ברשימה שלך. אנא נסה שוב.";
    }
    
    const itemsList = aiResponse.items.map(item => {
      // Generate text for item based on certainty and matches
      let itemText = '';
      
      if (item.isCertain && item.matchedProducts.length > 0) {
        const topMatch = item.matchedProducts[0];
        itemText = `• זיהיתי בוודאות: ${item.quantity} ${topMatch.unit} ${topMatch.name} (${topMatch.brand || 'ללא מותג'}, ${topMatch.price} ₪)`;
        
        // Add reasoning if available
        if (item.reasonForMatch) {
          itemText += `\n   הסבר: ${item.reasonForMatch}`;
        }
      } else if (item.matchedProducts.length > 0) {
        itemText = `• מצאתי כמה אפשרויות עבור "${item.product}":\n`;
        
        // List top 3 matches
        const topMatches = item.matchedProducts.slice(0, 3);
        topMatches.forEach((match, index) => {
          const isSelectedByGPT = match.isSelectedByGPT ? "✓ " : "";
          itemText += `   ${isSelectedByGPT}${index + 1}. ${match.name} (${match.brand || 'ללא מותג'}, ${match.price} ₪)\n`;
        });
        
        // Add reasoning if available
        if (item.reasonForMatch) {
          itemText += `   הסבר: ${item.reasonForMatch}\n`;
        }
        
        itemText += "   אנא ציין איזו אפשרות מתאימה לך.";
      } else {
        itemText = `• לא מצאתי התאמה מדויקת עבור "${item.product}". אנא נסה לתאר את המוצר בצורה אחרת.`;
      }
      
      return itemText;
    }).join('\n\n');
    
    const summary = `סיכום: זיהיתי ${aiResponse.summary.totalItems} פריטים, מתוכם ${aiResponse.summary.certainItems} בוודאות גבוהה.`;
    
    return `זיהיתי את הפריטים הבאים ברשימה שלך עם המערכת המשולבת (AI + מטצ'ינג מדויק):\n\n${itemsList}\n\n${summary}`;
  };

  // Update the grocery items state with the processed items
  const updateGroceryItems = (items) => {
    const newItems = items.map(item => {
      // Create a new item object for our state
      const topMatch = item.matchedProducts.length > 0 ? item.matchedProducts[0] : null;
      
      return {
        id: Date.now() + Math.random(), // Generate a unique ID
        name: topMatch ? topMatch.name : item.product,
        quantity: item.quantity,
        unit: topMatch ? topMatch.unit : item.unit,
        price: topMatch ? topMatch.price : null,
        isCertain: item.isCertain,
        originalItem: item,
        selected: item.isCertain, // Auto-select certain items
        alternativeOptions: item.matchedProducts,
        // Include the reasoning from GPT-4 if available
        reasonForMatch: item.reasonForMatch || null
      };
    });
    
    // Add the new items to our grocery list
    setGroceryItems(prev => [...prev, ...newItems]);
  };

  // Handle item selection from alternatives
  const handleItemSelection = (itemId, selectedOptionIndex) => {
    setGroceryItems(items => 
      items.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              selected: true,
              name: item.alternativeOptions[selectedOptionIndex].name,
              price: item.alternativeOptions[selectedOptionIndex].price,
              unit: item.alternativeOptions[selectedOptionIndex].unit
            } 
          : item
      )
    );
  };

  // Handle removing an item from the grocery list
  const handleRemoveItem = (itemId) => {
    setGroceryItems(items => items.filter(item => item.id !== itemId));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevents new line in input
      handleSend();
    }
  };

  // Add a new empty message for the user to enter another grocery item
  const handleAddAnotherItem = () => {
    setShowGroceryList(false);
    setMessage("");
    // Focus on the input field
    document.querySelector(".chat-input").focus();
  };

  // Create a component for displaying the grocery list
  const GroceryList = () => {
    if (!showGroceryList || groceryItems.length === 0) return null;
    
    return (
      <div className="grocery-list-container">
        <h3>רשימת קניות</h3>
        <div className="grocery-items">
          {groceryItems.map(item => (
            <div key={item.id} className={`grocery-item ${item.selected ? 'selected' : 'unselected'}`}>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-details">
                  {item.quantity} {item.unit} {item.price ? `• ${item.price} ₪` : ''}
                </div>
                
                {/* Show reasoning if available */}
                {item.reasonForMatch && (
                  <div className="item-reasoning">
                    <FiInfo size={14} /> {item.reasonForMatch}
                  </div>
                )}
              </div>
              
              {!item.selected && item.alternativeOptions && item.alternativeOptions.length > 0 && (
                <div className="item-options">
                  <div className="options-label">בחר מוצר:</div>
                  <div className="options-list">
                    {item.alternativeOptions.slice(0, 3).map((option, index) => (
                      <button 
                        key={index} 
                        className={`option-button ${option.isSelectedByGPT ? 'ai-recommended' : ''}`}
                        onClick={() => handleItemSelection(item.id, index)}
                      >
                        {option.isSelectedByGPT && <FiInfo size={14} title="AI המלצת" />} 
                        {option.name} ({option.brand || 'ללא מותג'}, {option.price} ₪)
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <button 
                className="remove-item-button" 
                onClick={() => handleRemoveItem(item.id)}
              >
                הסר
              </button>
            </div>
          ))}
        </div>
        
        <div className="grocery-actions">
          <button className="add-item-button" onClick={handleAddAnotherItem}>
            <FiPlus size={16} /> הוסף פריט נוסף
          </button>
          <button className="checkout-button" disabled={groceryItems.filter(i => i.selected).length === 0}>
            המשך לקופה
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <button className="user-button" onClick={() => setShowUserInfo(true)}>
          <FiUser size={20} />
        </button>
      </div>

      {/* Display the grocery list if available */}
      <GroceryList />
      
      {/* Only show chat messages if grocery list is not shown */}
      {!showGroceryList && (
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div 
              key={msg.id || index} 
              className={`message ${msg.sender} ${msg.isProcessing ? 'processing' : ''}`}
            >
              {msg.text}
            </div>
          ))}
        </div>
      )}

      <div className="chat-input-container">
        <input
          type="text"
          className="chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={showGroceryList 
            ? "הוסף פריט נוסף לרשימת הקניות..." 
            : "הקלד פריט קניות (למשל: 2 גבינה לבנה 9%, 250 גרם)..."}
          disabled={isProcessing}
        />
        <button 
          className="send-button" 
          onClick={handleSend} 
          disabled={isProcessing}
        >
          <FiSend size={20} />
        </button>
      </div>

      {showUserInfo && (
        <div className="user-info-modal">
          <div className="user-info-content">
            <h3>פרטי משתמש</h3>
            <p>שם: ישראל ישראלי</p>
            <p>דוא"ל: israel@example.com</p>
            <button className="close-button" onClick={() => setShowUserInfo(false)}>סגור</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;