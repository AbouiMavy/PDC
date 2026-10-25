import { BrowserRouter, Route, Routes } from "react-router-dom";
import UserLayout from "./layouts/User/UserLayout";
import Home from "./pages/Home";
import Histoire from "./pages/Histoire";
import Merci from './pages/Merci';
import Soutenir from "./pages/Soutenir";

import Adhesion from './pages/Adhesion';
import AdhesionMerci from './pages/AdhesionMerci';
import EspaceMilitant from './pages/EspaceMilitant';

export default function App() {
  return (
    // <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserLayout />}>
          <Route index element={<Home />} />
          <Route path="histoire" element={<Histoire />} />
          <Route path="adhesion" element={<Adhesion />} />
          <Route path="adhesion/merci" element={<AdhesionMerci />} />
          <Route path="mon-espace" element={<EspaceMilitant />} />
          <Route path="soutenir/merci" element={<Merci />} />
          <Route path="soutenir" element={<Soutenir />} />
        </Route>
      </Routes>
    // </BrowserRouter>
  );
}