import { Link } from "react-router-dom";
import { User, Shield, Users, Layers, ArrowRight } from "lucide-react";

export default function Organisation() {
  const bureauExecutif = [
    {
      icon: <User size={24} className="text-[#E5A913]" />,
      role: "Président National",
      name: "Dr. Louis-Tobie Mbida",
      desc: "Garant de la ligne idéologique du parti, il dirige le Bureau Politique et orchestre la stratégie nationale depuis la réhabilitation de 1991."
    },
    {
      icon: <Shield size={24} className="text-[#E5A913]" />,
      role: "Secrétariat Général",
      name: "Administration Centrale",
      desc: "En charge de la coordination administrative, de la gestion des fédérations régionales et de l'exécution des directives du Bureau."
    },
    {
      icon: <Users size={24} className="text-[#E5A913]" />,
      role: "Comité Directeur",
      name: "Organe Délibérant",
      desc: "Structure collégiale assurant la liaison entre la base militante et le sommet exécutif pour les prises de décisions urgentes."
    },
    {
      icon: <Layers size={24} className="text-[#E5A913]" />,
      role: "Fédérations & Sections",
      name: "Coordinations Locales",
      desc: "Responsables du déploiement des campagnes de terrain, de l'encadrement de la jeunesse et des cellules d'action locales."
    }
  ];

  return (
    <section className="bg-[#0D5931] py-20 lg:py-28 border-t-2 border-white/10 text-[#F9F8F5]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* EN-TÊTE CHOC */}
        <div className="text-center lg:text-left mb-16 max-w-2xl">
          <span className="text-[#E5A913] text-start font-black tracking-widest uppercase text-xs block mb-3">
            Gouvernance & Commandement
          </span>
          <h2 className="text-3xl lg:text-5xl text-start font-black uppercase tracking-tight text-white">
            Le Bureau <span className="text-[#E5A913]">Exécutif</span> et ses instances.
          </h2>
        </div>

        {/* GRILLE DU BUREAU EXÉCUTIF (BORDURES BLANCHES SUR FOND VERT) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {bureauExecutif.map((membre, index) => (
            <div 
              key={index}
              className="bg-[#0b4727] border-2 border-white/20 p-6 flex flex-col justify-between shadow-[4px_4px_0px_0px_#E5A913] transition-transform hover:-translate-y-1 duration-200"
            >
              <div>
                <div className="w-12 h-12 bg-[#0D5931] border border-white/20 flex items-center justify-center mb-6 shadow-[2px_2px_0px_0px_#E5A913]">
                  {membre.icon}
                </div>
                
                <span className="text-[#E5A913] font-black tracking-wider uppercase text-[10px] block mb-1">
                  {membre.role}
                </span>
                
                <h3 className="text-lg font-black text-white uppercase tracking-wide mb-3">
                  {membre.name}
                </h3>
                
                <p className="text-white/70 text-sm font-medium leading-relaxed">
                  {membre.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* COMPLÉMENT STATUTAIRE */}
        <div className="mt-12 text-center lg:text-left">
          <Link
            to="/statuts"
            className="inline-flex items-center gap-2 text-xs font-black text-[#E5A913] uppercase tracking-wider border-b-2 border-[#E5A913] pb-1 hover:text-white transition-colors"
          >
            Consulter la répartition officielle des pouvoirs
            <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </section>
  );
}