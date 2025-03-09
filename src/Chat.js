import React, { useState } from "react";
import "./Chat.css";
import { FiSend, FiUser } from "react-icons/fi";
import { processGroceryList } from "./services/GPT4API";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSend = async () => {
    if (message.trim() !== "") {
      // Add user message to chat
      const userMessage = message;
      setMessages([...messages, { text: userMessage, sender: "user" }]);
      setMessage(""); // Clear input field immediately for better UX
      
      // Check if the message looks like a grocery list
      // This is a simple heuristic - you may want to improve this
      const isGroceryList = 
        userMessage.match(/\d+\s+\S+/) || // Number followed by text
        userMessage.toLowerCase().includes("גרם") || // Contains unit "gram"
        userMessage.toLowerCase().includes("ק\"ג") || // Contains unit "kg"
        userMessage.toLowerCase().includes("יחידה") || // Contains unit "unit"
        userMessage.split(',').length > 1; // Contains commas (list)
      
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
            text: "אני יכול לעזור לך עם הקניות. נסה לרשום רשימת קניות בפורמט: '2 גבינה לבנה 9%, 250 גרם'", 
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
      const certaintyMessage = item.isCertain 
        ? "זיהיתי בוודאות" 
        : "אני לא בטוח ב-100%, האם התכוונת ל";
      
      const matchesText = item.matchedProducts && item.matchedProducts.length > 0
        ? `\nאפשרויות: ${item.matchedProducts.map(match => match.name).join(', ')}`
        : '';
        
      return `• ${certaintyMessage}: ${item.quantity} ${item.unit} ${item.product}${matchesText}`;
    }).join('\n\n');
    
    return `זיהיתי את הפריטים הבאים ברשימה שלך באמצעות Azure OpenAI:\n\n${itemsList}`;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevents new line in input
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <button className="user-button" onClick={() => setShowUserInfo(true)}>
          <FiUser size={20} />
        </button>
      </div>

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

      <div className="chat-input-container">
        <input
          type="text"
          className="chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="הקלד פריט קניות (למשל: 2 גבינה לבנה 9%, 250 גרם)..."
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