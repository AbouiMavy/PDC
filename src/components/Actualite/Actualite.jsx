import { Link } from "react-router-dom";
import { Calendar, ArrowRight } from "lucide-react";

export default function Actualite() {
  const articles = [
    {
      id: 1,
      date: "20 Juin 2026",
      category: "Communiqué",
      title: "Déclaration du Bureau Politique sur la souveraineté économique",
      excerpt: "Le PDC réaffirme sa position concernant la restructuration des barrières douanières et le soutien prioritaire aux producteurs locaux."
    },
    {
      id: 2,
      date: "15 Juin 2026",
      category: "Mobilisation",
      title: "Rassemblement de la jeunesse démocrate à Yaoundé",
      excerpt: "Retour sur la forte mobilisation des sections locales autour des enjeux de l'insertion professionnelle et de la gouvernance locale."
    },
    {
      id: 3,
      date: "08 Juin 2026",
      category: "Idéologie",
      title: "Hommage aux bâtisseurs : l'héritage d'André-Marie Mbida",
      excerpt: "Une tribune exclusive revenant sur les fondements de la justice sociale qui animent l'action du PDC depuis sa création."
    }
  ];

  return (
    <section className="bg-[#F9F8F5] py-20 lg:py-28 border-t-2 border-[#0D5931]/10">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* EN-TÊTE AVEC BOUTON D'ACCÈS GLOBAL */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-16 gap-6">
          <div className="max-w-2xl">
            <span className="text-[#E5A913] font-black tracking-widest uppercase text-xs block mb-3">
              Actualités & Médias
            </span>
            <h2 className="text-3xl lg:text-5xl font-black text-slate-900 uppercase tracking-tight">
              Suivez l'action <span className="text-[#0D5931]">du terrain</span>.
            </h2>
          </div>
          
          <Link
            to="/actualites"
            className="px-6 py-3 bg-transparent text-[#0D5931] font-black uppercase tracking-wider text-xs border-2 border-[#0D5931] hover:bg-[#0D5931] hover:text-[#F9F8F5] transition-all duration-300 whitespace-nowrap"
          >
            Voir toutes les actualités
          </Link>
        </div>

        {/* LISTE DES ARTICLES */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {articles.map((art) => (
            <article 
              key={art.id}
              className="bg-white border-2 border-[#0D5931] flex flex-col justify-between p-6 lg:p-8 shadow-[4px_4px_0px_0px_#0D5931] hover:shadow-[6px_6px_0px_0px_#E5A913] transition-all duration-300"
            >
              <div>
                {/* META DATA */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                  <span className="text-xs font-black uppercase tracking-widest bg-[#E5A913]/20 text-[#0D5931] px-2.5 py-1">
                    {art.category}
                  </span>
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                    <Calendar size={13} />
                    {art.date}
                  </span>
                </div>

                <h3 className="text-xl font-black text-slate-900 uppercase tracking-wide leading-snug mb-4 hover:text-[#0D5931] transition-colors">
                  <Link to={`/actualites/${art.id}`}>{art.title}</Link>
                </h3>
                
                <p className="text-slate-600 text-sm font-medium leading-relaxed mb-6">
                  {art.excerpt}
                </p>
              </div>

              {/* LIEN LIRE L'ARTICLE */}
              <div>
                <Link
                  to={`/actualites/${art.id}`}
                  className="inline-flex items-center gap-2 text-xs font-black text-[#0D5931] uppercase tracking-wider group"
                >
                  Lire le communiqué
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </article>
          ))}
        </div>

      </div>
    </section>
  );
}