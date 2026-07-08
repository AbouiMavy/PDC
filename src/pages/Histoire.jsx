import { Download, History, Award, BookOpen, Landmark } from "lucide-react";

export default function Histoire() {
  return (
    <main className="bg-[#F9F8F5] min-h-screen py-16 lg:py-24">
      <div className="max-w-4xl mx-auto px-6">
        
        {/* EN-TÊTE NÉO-BRUTALISTE */}
        <header className="mb-16">
          <div className="inline-block bg-[#0D5931] text-[#F9F8F5] px-4 py-1 font-black uppercase tracking-widest text-xs mb-6 rotate-[-1deg]">
            Mémoire et Engagement
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-slate-900 uppercase tracking-tight mb-8">
            L'Histoire du <br />
            <span className="text-[#0D5931] underline decoration-[#E5A913] decoration-[12px] underline-offset-[-5px]">PDC</span>
          </h1>
          <div className="h-4 w-40 bg-[#E5A913] shadow-[8px_8px_0px_0px_#0D5931]" />
        </header>

        {/* ARTICLE AVEC ACCENTS GRAPHIQUES */}
        <article className="space-y-12 text-slate-800 leading-relaxed text-lg">
          
          <div className="bg-white p-8 border-4 border-slate-900 shadow-[10px_10px_0px_0px_#0D5931]">
            <p className="font-bold text-xl">
              L’histoire du Parti des Démocrates Camerounais — PDC / CPD s’inscrit dans la trajectoire fondatrice du Cameroun moderne. Elle prend racine dans les combats politiques des années 1950, au moment où les Camerounais cherchent à sortir du régime de tutelle.
            </p>
          </div>

          <section className="space-y-6">
            <h3 className="text-2xl font-black text-[#0D5931] uppercase flex items-center gap-3 border-b-4 border-[#0D5931] pb-2">
              <History className="bg-[#E5A913] p-1 text-slate-900" size={32} /> 
              1954 - 1958 : Les Fondations
            </h3>
            <p>
              L’origine politique de cette famille démocrate remonte à 1954, avec le <strong>COCOCAM</strong>. Le 23 décembre 1956, avec le passage de l'ATCAM à l'<strong>ALCAM</strong>, les Démocrates s'affirment comme force parlementaire.
            </p>
            <p>
              Ce parcours mène en 1957 à l'accession d'<strong>André-Marie Mbida</strong> à la fonction de Premier ministre. En <strong>1958</strong>, le PDC est officiellement formalisé avec une mission claire : l'émancipation totale du peuple.
            </p>
          </section>

          <section className="space-y-6">
            <h3 className="text-2xl font-black text-[#0D5931] uppercase flex items-center gap-3 border-b-4 border-[#0D5931] pb-2">
              <Landmark className="bg-[#E5A913] p-1 text-slate-900" size={32} /> 
              1960 - 2025 : Résilience
            </h3>
            <p>
              Après une période de mise en sommeil dans les années 1960, le PDC réapparaît en <strong>1991</strong>, lors du retour au multipartisme, en refusant toute compromission. À partir de 2025, le parti engage une phase de clarification doctrinale, réaffirmant son attachement à la démocratie libérale et à l'État de droit.
            </p>
          </section>

          <section className="space-y-6">
            <h3 className="text-2xl font-black text-[#0D5931] uppercase flex items-center gap-3 border-b-4 border-[#0D5931] pb-2">
              <Award className="bg-[#E5A913] p-1 text-slate-900" size={32} /> 
              2026 : Le Congrès de la Renaissance
            </h3>
            <p>
              Le <strong>13 juin 2026</strong>, le PDC tient son Congrès national ordinaire à Yaoundé-Mbankolo. Ce moment marque le renouveau organisationnel et l'affirmation d'une ligne politique tournée vers la reconquête démocratique du pouvoir.
            </p>
          </section>
          
          <div className="bg-[#0D5931] text-[#F9F8F5] p-8 border-4 border-slate-900 shadow-[10px_10px_0px_0px_#E5A913]">
            <p className="font-black text-xl italic leading-tight">
              "Fidèle à son histoire, le PDC demeure porteur d’une ambition claire : œuvrer à l’émancipation du peuple camerounais et refonder la nation dans la vérité."
            </p>
          </div>
        </article>

        {/* BLOC TÉLÉCHARGEMENT NÉO-BRUTALISTE */}
        <div className="mt-20 border-4 border-slate-900 bg-white p-8 shadow-[12px_12px_0px_0px_#0D5931]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-[#E5A913] p-3 border-2 border-slate-900">
                <BookOpen size={32} className="text-slate-900" />
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Archives Historiques</h4>
                <p className="text-sm font-bold text-slate-600 uppercase">Document officiel (.pdf)</p>
              </div>
            </div>
            <a
              href="/documents/HISTOIRE_PDC.pdf"
              download="Histoire_du_PDC.pdf"
              className="px-8 py-4 bg-[#0D5931] text-[#F9F8F5] font-black uppercase tracking-widest text-sm border-2 border-slate-900 hover:bg-[#E5A913] hover:text-slate-900 transition-all shadow-[6px_6px_0px_0px_#E5A913] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              <Download className="inline mr-2" size={18} />
              Télécharger
            </a>
          </div>
        </div>

      </div>
    </main>
  );
}