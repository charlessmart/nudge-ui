import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

function Home() {
  return (
    <main>
      <h1>Packed Vite React current consumer</h1>
      <Link to="/about">About</Link>
    </main>
  );
}

function About() {
  return <p>About the packed current consumer</p>;
}

createRoot(document.getElementById("app")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
    </Routes>
  </BrowserRouter>,
);
