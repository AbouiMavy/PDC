import Actualite from "../../components/Actualite/Actualite";
import HistoireBrief from "../../components/HistoireBrief/HistoireBrief";
import Navbar from "../../components/Navbar/Navbar";
import Organisation from "../../components/Organisation/Organisation";
import Video from "../../components/Video/Video";
import Home from "../../pages/Home";

export default function UserLayout() {
    return (
        <div>
            <Navbar/>
            <Home/>
            <HistoireBrief/>
            <Organisation/>
            <Actualite/>
            <Video/>
        </div>
    )
}