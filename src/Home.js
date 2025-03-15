import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Home.css";

const Home = ({ onAuthChange }) => {
  const navigate = useNavigate();
  const [formMode, setFormMode] = useState("signup"); // "signup" or "login"

  // State for both signup/login forms
  const [formData, setFormData] = useState({
    password: "",
    email: "",
    phone: "",
    name: "",
    number: "",
    street: "",
    city: "",
    supermarket: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle input changes
  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      if (formMode === "signup") {
        // ---- SIGNUP LOGIC ----
        const response = await fetch("/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include', // Important for session cookies
          body: JSON.stringify(formData),
        });

        const result = await response.json();
        if (response.ok) {
          setSuccessMessage(result.success || "נרשמת בהצלחה!");
          // Update authentication status
          onAuthChange(true);
          // Redirect to chat after a brief delay
          setTimeout(() => {
            navigate('/chat');
          }, 1000);
        } else {
          setErrorMessage(result.error || "אירעה שגיאה, נא לנסות שוב.");
        }
      } else {
        // ---- LOGIN LOGIC ----
        const response = await fetch("/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include', // Important for session cookies
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
          }),
        });

        const result = await response.json();
        if (response.ok) {
          setSuccessMessage(result.success || "התחברת בהצלחה!");
          // Update authentication status
          onAuthChange(true);
          // Redirect to chat after a brief delay
          setTimeout(() => {
            navigate('/chat');
          }, 1000);
        } else {
          setErrorMessage(result.error || "שם משתמש או סיסמה שגויים.");
        }
      }
    } catch (error) {
      setErrorMessage("שגיאה בהתחברות לשרת, נא לנסות שוב מאוחר יותר.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Background Image */}
      <div>
        <img className="bg-img" src={`${process.env.PUBLIC_URL}/3000X3000.jpg`} alt="Background" />
      </div>

      {/* Container for the toggle and form */}
      <div className="text-container">
        {/* Toggle (Capsule) */}
        <div className="toggle-container">
          <span
            className={`toggle-option ${
              formMode === "signup" ? "active" : ""
            }`}
            onClick={() => setFormMode("signup")}
          >
            הרשמה
          </span>
          <span
            className={`toggle-option ${
              formMode === "login" ? "active" : ""
            }`}
            onClick={() => setFormMode("login")}
          >
            התחברות
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Email & Password (shown in both modes) */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">אימייל</label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">סיסמה</label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>

          {/* Extra fields only when signing up */}
          {formMode === "signup" && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">מספר טלפון</label>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="name">שם</label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="number">מספר</label>
                  <input
                    type="text"
                    id="number"
                    value={formData.number}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="street">רחוב</label>
                  <input
                    type="text"
                    id="street"
                    value={formData.street}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="city">עיר</label>
                  <input
                    type="text"
                    id="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group full-width">
                  <label htmlFor="supermarket">סופר מועדף</label>
                  <select
                    id="supermarket"
                    value={formData.supermarket}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">בחר סופר</option>
                    <option value="שופרסל">שופרסל</option>
                    <option value="רמי לוי">רמי לוי</option>
                    <option value="מגה">מגה</option>
                    {/* Add more as needed */}
                  </select>
                </div>
              </div>
            </>
          )}

          <button 
            type="submit" 
            className="action-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 
              (formMode === "signup" ? "מבצע הרשמה..." : "מבצע התחברות...") : 
              (formMode === "signup" ? "הרשמה" : "התחברות")
            }
          </button>

          {/* Error/Success Messages */}
          {errorMessage && (
            <div id="error-message" className="error-message">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div id="success-message" className="success-message show">
              {successMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default Home;