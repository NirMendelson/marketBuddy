import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter as Router, Route, Routes } from "react-router-dom";
import Home from "./Home";
import Header from "./Header";

const App = () => {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
};

const root = createRoot(document.getElementById("root"));
root.render(<App />);

export default App;
