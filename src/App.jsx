import { BrowserRouter, Route, Routes } from "react-router-dom";
import UserLayout from "./layouts/User/UserLayout";
import Home from "./pages/Home";
import Histoire from "./pages/Histoire";
import Merci from './pages/Merci';
import Soutenir from "./pages/Soutenir";

export default function App() {
  return (
    // <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserLayout />}>
          <Route index element={<Home />} />
          <Route path="histoire" element={<Histoire />} />
          <Route path="soutenir/merci" element={<Merci />} />
          <Route path="soutenir" element={<Soutenir />} />
        </Route>
      </Routes>
    // </BrowserRouter>
  );
}