import Actualite from "../components/Actualite/Actualite";
import Hero from "../components/Hero/Hero";
import HistoireBrief from "../components/HistoireBrief/HistoireBrief";
import Organisation from "../components/Organisation/Organisation";
import Video from "../components/Video/Video";

export default function Home(){
    return(
        <>
            <Hero/>
            <HistoireBrief/>
            <Organisation/>
            <Actualite/>
            <Video/>
        </>
    )
}