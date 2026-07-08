import { Link } from "react-router-dom";
import { ArrowRight, BookOpenText } from "lucide-react";

export default function Organisation() {
  const bureauExecutif = [
    {
      role: "Président Général",
      name: "Simon Pierre Omgba Mbida",
      photo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStGn10msuBsLs-gtSYZduYjHNbwkVME3rkxu8wdTJhQQ&s=10", 
      desc: "Garant de la ligne idéologique et chef de file de la stratégie nationale depuis 2026.",
      link: "https://fr.wikipedia.org/wiki/Simon_Pierre_Omgba_Mbida"
    },
    {
      role: "Secrétaire Général",
      name: "Pr Claude Abe",
      photo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR5A18tzkF7_LWEuG5ZTDBcqz16Sf7gL8damCNCGk116g&s=10",
      desc: "Coordonnateur de l'administration centrale et de la mise en œuvre des directives politiques.",
      link: "https://ucac-icy.net/nos-enseignants/enseignants-de-la-faculte-de-sciences-sociales-et-de-gestion/pr-claude-abe/"
    },
    // {
    //   role: "Secrétaire à la Jeunesse",
    //   name: "Francois Xavier",
    //   photo: "/images/jeunesse.jpg",
    //   desc: "En charge de l'encadrement des forces vives et du déploiement des sections locales.",
    //   link: "https://linkedin.com/in/exemple"
    // },
    // {
    //   role: "Directeur de Cabinet",
    //   name: "Pierre N.",
    //   photo: "/images/cabinet.jpg",
    //   desc: "Superviseur des opérations stratégiques et liaison avec le Comité Directeur.",
    //   link: "https://linkedin.com/in/exemple"
    // }
  ];

  return (
    <section className="bg-[#0D5931] py-20 lg:py-28 text-[#F9F8F5]">
      <div className="max-w-7xl mx-auto px-6">
        
        <div className="mb-16">
          <span className="text-[#E5A913] font-black tracking-widest uppercase text-xs block mb-3">Gouvernance & Commandement</span>
          <h2 className="text-4xl lg:text-6xl font-black uppercase text-white">Le Bureau <span className="text-[#E5A913]">Exécutif</span></h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {bureauExecutif.map((membre, index) => (
            <div key={index} className="bg-white p-2 border-4 border-slate-900 shadow-[8px_8px_0px_0px_#E5A913] transition-transform hover:-translate-y-1">
              {/* IMAGE PORTRAIT */}
              <div className="w-full h-64 bg-slate-200 mb-4 overflow-hidden border-b-4 border-slate-900">
                <img src={membre.photo} alt={membre.name} className="w-full h-full object-cover" />
              </div>

              {/* DÉTAILS */}
              <div className="p-2">
                <span className="text-[#E5A913] font-black uppercase text-[10px] tracking-widest">{membre.role}</span>
                <h3 className="text-lg font-black text-slate-900 uppercase my-1">{membre.name}</h3>
                <p className="text-slate-600 text-sm mb-4 leading-tight">{membre.desc}</p>
                
                {/* LIENS */}
                <a 
                  href={membre.link} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="flex items-center gap-2 text-xs font-black uppercase text-[#0D5931] hover:text-[#E5A913]"
                >
                  {membre.link.includes('wikipedia') ? <BookOpenText size={16}/> : <ArrowRight size={16}/>}
                  Voir profil
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link to="/statuts" className="inline-flex items-center gap-2 bg-[#E5A913] px-8 py-4 text-slate-900 font-black uppercase text-sm shadow-[4px_4px_0px_0px_white] hover:shadow-none transition-all">
            Consulter l'organigramme complet <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}