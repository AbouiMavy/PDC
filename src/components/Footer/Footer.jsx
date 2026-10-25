import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-[#F9F8F5] pt-16 pb-8 border-t-8 border-[#E5A913]">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
        
        {/* COLONNE 1 : IDENTITÉ */}
        <div className="col-span-1 md:col-span-2">
          <h3 className="text-2xl font-black uppercase mb-4 text-[#E5A913]">PDC / CPD</h3>
          <p className="text-slate-400 max-w-sm leading-relaxed mb-6">
            Héritiers d'une vision historique, nous bâtissons aujourd'hui le Cameroun de demain. 
            Engagement, vérité et souveraineté nationale.
          </p>
          <div className="flex gap-4">
             {/* Ici vos liens sociaux avec style brutaliste */}
            <a href="#" className="w-10 h-10 border-2 border-white flex items-center justify-center hover:bg-[#E5A913] hover:text-slate-900 transition-all">FB</a>
            <a href="#" className="w-10 h-10 border-2 border-white flex items-center justify-center hover:bg-[#E5A913] hover:text-slate-900 transition-all">X</a>
          </div>
        </div>

        {/* COLONNE 2 : LIENS */}
        <div>
          <h4 className="font-black uppercase mb-6 border-b-2 border-[#0D5931] pb-2 text-[#E5A913]">Le Parti</h4>
          <ul className="space-y-3 text-sm font-bold uppercase tracking-widest text-slate-400">
            <li><Link to="/histoire" className="hover:text-white">Histoire</Link></li>
            <li><Link to="/statuts" className="hover:text-white">Statuts</Link></li>
            <li><Link to="/organisation" className="hover:text-white">Organisation</Link></li>
          </ul>
        </div>

        {/* COLONNE 3 : CONTACT */}
        <div>
          <h4 className="font-black uppercase mb-6 border-b-2 border-[#0D5931] pb-2 text-[#E5A913]">Contact</h4>
          <p className="text-sm text-slate-400 mb-2">BP 35130 Yaoundé, Bastos</p>
          <p className="text-sm text-slate-400 mb-2">1er étage, Immeuble Campost (Yaoundé, Nlongkak)</p>
          <p className="text-sm text-slate-400">contact.democrates@gmail.com</p>
        </div>

      </div>

      <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-slate-800 text-[10px] uppercase tracking-widest text-slate-500 text-center">
        © 2026 Parti des Démocrates Camerounais (PDC). Tous droits réservés. Unis dans la vérité, refondons la nation.
      </div>
    </footer>
  );
}