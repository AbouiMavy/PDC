import { Link } from "react-router-dom";
import { Download, ArrowRight } from "lucide-react";

export default function HistoireBrief() {
  return (
    <section className="bg-[#F9F8F5] py-20 lg:py-28 border-t-2 border-[#0D5931]/10">
      <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row gap-12 lg:gap-20 items-stretch">
        
        {/* BLOC GAUCHE : TITRE ET ACCENT GRAPHIQUE */}
        <div className="lg:w-1/3 flex flex-col justify-between">
          <div>
            <span className="text-[#E5A913] font-black tracking-widest uppercase text-xs block mb-3">
              Notre Héritage
            </span>
            <h2 className="text-3xl lg:text-5xl font-black text-slate-900 uppercase tracking-tight leading-tight">
              Depuis 1954 <br />
              <span className="text-[#0D5931]">L'Histoire</span> <br />
              de la démocratie.
            </h2>
          </div>
          
          {/* Ligne graphique de démarcation */}
          <div className="hidden lg:block w-20 h-3 bg-[#0D5931] mt-8 shadow-[4px_4px_0px_0px_#E5A913]" />
        </div>

        {/* BLOC DROITE : TEXTE HISTORIQUE ET ACTIONS */}
        <div className="flex-1 flex flex-col justify-between bg-white border-2 border-[#0D5931] p-8 lg:p-12 shadow-[6px_6px_0px_0px_#0D5931]">
          <div>
            <p className="text-slate-800 text-lg font-bold leading-relaxed mb-6">
              Fondé officiellement le 10 décembre 1954, le Parti Démocrate Camerounais (PDC) est l’un des piliers historiques de la marche du Cameroun vers la souveraineté.
            </p>
            
            <div className="space-y-4 text-slate-600 text-sm lg:text-base leading-relaxed font-medium">
              <p>
                Porté initialement par des figures majeures de l'histoire politique nationale, le PDC s'est rapidement imposé sous le leadership d'<strong>André-Marie Mbida</strong>, qui devint en 1957 le tout premier Premier ministre du Cameroun sous tutelle française. Le parti a incarné une vision d'émancipation structurée, profondément ancrée dans les valeurs de justice sociale et d'équité territoriale.
              </p>
              <p>
                Face à l'avènement du parti unique dans les années 1960, le PDC s'est illustré par sa résistance courageuse pour préserver le pluralisme démocratique, payant le prix fort de la répression politique avant sa mise en sommeil forcée en 1966. 
              </p>
              <p>
                Réactivé avec force en 1991 lors du retour au multipartisme, le PDC poursuit aujourd'hui son engagement historique sous l'impulsion d'une vision modernisée, déterminée à bâtir un Cameroun fort, juste et résolument souverain.
              </p>
            </div>
          </div>

          {/* BOUTONS D'ACTION */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              to="/histoire"
              className="px-6 py-4 bg-[#0D5931] text-[#F9F8F5] font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 border-2 border-[#0D5931] hover:bg-transparent hover:text-[#0D5931] transition-all duration-300 shadow-[3px_3px_0px_0px_#E5A913]"
            >
              Lire l'histoire complète
              <ArrowRight size={14} />
            </Link>

            <a
              href="/documents/histoire-du-pdc.pdf"
              download
              className="px-6 py-4 bg-transparent text-[#0D5931] font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 border-2 border-[#0D5931] hover:bg-[#0D5931] hover:text-[#F9F8F5] transition-all duration-300"
            >
              <Download size={14} />
              Télécharger le manifeste historique (PDF)
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}