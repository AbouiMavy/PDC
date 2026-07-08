import { BrowserRouter, Route, Routes } from "react-router-dom";
import UserLayout from "./layouts/User/UserLayout";
import Home from "./pages/Home";
import Histoire from "./pages/Histoire";

export default function App() {
  return (
    // <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserLayout />}>
          <Route index element={<Home />} />
          <Route path="histoire" element={<Histoire />} />
        </Route>
      </Routes>
    // </BrowserRouter>
  );
}