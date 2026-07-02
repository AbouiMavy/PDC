import { Link } from "react-router-dom";
import { Play, Calendar, ArrowRight } from "lucide-react";

export default function Video() {
  const videos = [
    {
      id: 1,
      date: "18 Juin 2026",
      duration: "12:45",
      title: "Intervention du Président National sur les enjeux de la décentralisation",
      excerpt: "Analyse approfondie des réformes structurelles nécessaires pour l'autonomie des collectivités territoriales.",
      coverUrl: "#" // Remplacez par vos images réelles
    },
    {
      id: 2,
      date: "10 Juin 2026",
      duration: "05:20",
      title: "Direct : Message à la jeunesse démocrate et militante",
      excerpt: "Appel à l'engagement civique et présentation des axes du programme axés sur l'innovation et l'emploi.",
      coverUrl: "#"
    }
  ];

  return (
    <section className="bg-[#F9F8F5] py-20 lg:py-28 border-t-2 border-[#0D5931]/10">
      <div className="max-w-7xl mx-auto px-6">

        {/* EN-TÊTE DE LA SECTION */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-16 gap-6">
          <div className="max-w-2xl">
            <span className="text-[#E5A913] font-black tracking-widest uppercase text-xs block mb-3">
              Médiathèque & Interventions
            </span>
            <h2 className="text-3xl lg:text-5xl font-black text-slate-900 uppercase tracking-tight">
              Le PDC en <span className="text-[#0D5931]">Images</span>.
            </h2>
          </div>

          <Link
            to="/videos"
            className="px-6 py-3 bg-transparent text-[#0D5931] font-black uppercase tracking-wider text-xs border-2 border-[#0D5931] hover:bg-[#0D5931] hover:text-[#F9F8F5] transition-all duration-300 whitespace-nowrap"
          >
            Voir toutes les vidéos
          </Link>
        </div>

        {/* GRILLE DES VIDÉOS - FORMAT SPLIT/LARGE */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {videos.map((vid) => (
            <div 
              key={vid.id}
              className="bg-white border-2 border-[#0D5931] flex flex-col shadow-[4px_4px_0px_0px_#0D5931] hover:shadow-[6px_6px_0px_0px_#E5A913] transition-all duration-300"
            >
              {/* ZONE VIDÉO / COUVERTURE */}
              <div className="relative aspect-video bg-slate-900 border-b-2 border-[#0D5931] flex items-center justify-center group overflow-hidden">
                {/* Overlay de survol */}
                <div className="absolute inset-0 bg-[#0D5931]/10 group-hover:bg-[#0D5931]/30 transition-colors duration-300 z-10" />
                
                {/* Bouton Play Néo-brutaliste */}
                <button 
                  className="w-16 h-16 bg-[#E5A913] text-[#0D5931] border-2 border-[#0D5931] flex items-center justify-center shadow-[4px_4px_0px_0px_#0D5931] group-hover:scale-105 transition-transform duration-200 z-20"
                  aria-label="Lire la vidéo"
                >
                  <Play size={24} fill="#0D5931" className="ml-1" />
                </button>

                {/* Badge Durée */}
                <span className="absolute bottom-4 right-4 bg-[#0D5931] text-[#F9F8F5] text-xs font-black px-2 py-1 z-20 tracking-wider">
                  {vid.duration}
                </span>
              </div>

              {/* CONTENU TEXTUEL */}
              <div className="p-6 lg:p-8 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mb-4">
                    <Calendar size={13} />
                    {vid.date}
                  </div>

                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-wide leading-snug mb-3">
                    {vid.title}
                  </h3>

                  <p className="text-slate-600 text-sm font-medium leading-relaxed mb-6">
                    {vid.excerpt}
                  </p>
                </div>

                <div>
                  <Link
                    to={`/videos/${vid.id}`}
                    className="inline-flex items-center gap-2 text-xs font-black text-[#0D5931] uppercase tracking-wider group"
                  >
                    Visionner la séquence
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}