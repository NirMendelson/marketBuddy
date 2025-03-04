import React, { useState } from "react";
import "./Chat.css";
import { FiSend, FiUser } from "react-icons/fi";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [showUserInfo, setShowUserInfo] = useState(false);

  const handleSend = () => {
    if (message.trim() !== "") {
      setMessages([...messages, { text: message, sender: "user" }]);
      setMessage("");
    }
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
          <div key={index} className={`message ${msg.sender}`}>
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
          onKeyDown={handleKeyDown} // Listen for Enter key
          placeholder="Type a message..."
        />
        <button className="send-button" onClick={handleSend}>
          <FiSend size={20} />
        </button>
      </div>

      {showUserInfo && (
        <div className="user-info-modal">
          <div className="user-info-content">
            <h3>User Details</h3>
            <p>Name: John Doe</p>
            <p>Email: johndoe@example.com</p>
            <button className="close-button" onClick={() => setShowUserInfo(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
