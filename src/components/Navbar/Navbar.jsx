import { useState } from "react";
import { useTranslation } from 'react-i18next';
import LanguageSwitch from '../LanguageSwitch/LanguageSwitch';
import '../LanguageSwitch/LanguageSwitch.css';
import { Link } from "react-router-dom";
import { Menu, X, ChevronDown, Mail, ArrowUpRight, Phone } from "lucide-react";

export default function Navbar() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const toggleDropdown = (name) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setOpenDropdown(null);
  };

  const navLinks = [
    { title: t('nav.home'), path: '/' },
    { title: t('nav.party'), dropdown: [
      { title: t('nav.history'), path: '/histoire' },
      { title: t('nav.organization'), path: '/organisation' },
      { title: t('nav.statutes'), path: '/statuts' },
      { title: t('nav.rules'), path: '/ri' },
    ] },
    { title: t('nav.news'), path: '/actualites' },
    { title: t('nav.program'), path: '/programme' },
    { title: t('nav.resources'), dropdown: [
      { title: t('nav.library'), path: '/bibliotheque' },
      { title: t('nav.videos'), path: '/videos' },
      { title: t('nav.gallery'), path: '/galerie' },
    ] },
    { title: t('nav.contact'), path: '/contact' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#F9F8F5] border-b-2 border-[#0D5931]/10">
      
      {/* BANNER ÉLECTIONS - NOUVEAUTÉ */}
      <div className="bg-[#E5A913] text-[#0D5931] py-2 px-4 text-center font-bold text-xs md:text-sm uppercase tracking-widest flex items-center justify-center gap-2">
        <span>{t('nav.banner')}</span>
        <Link to="/inscription-electorale" className="underline hover:text-white ml-2">
          {t('nav.register')}
        </Link>
      </div>
      {/* TOP BAR - VERT PDC INSTITUTIONNEL */}
      {/* <div className="hidden md:block bg-[#0D5931] text-[#F9F8F5] text-xs font-semibold tracking-wider">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex justify-between items-center">
          <span className="flex items-center gap-2 text-[#E5A913] uppercase">
            Parti des Démocrates Camerounais
          </span>
          <div className="flex items-center gap-5 text-[#F9F8F5]/80">
            <span>Cameroun</span>
            <span className="text-[#E5A913]/40">|</span>
            <a href="mailto:contact@pdc.cm" className="flex items-center gap-1.5 hover:text-[#E5A913] transition-colors">
              <Mail size={13} className="text-[#E5A913]" /> contact@pdc.cm
            </a>
            <span className="text-[#E5A913]/40">|</span>
            <a href="tel:+237696794911" className="flex items-center gap-1.5 hover:text-[#E5A913] transition-colors">
              <Phone size={13} className="text-[#E5A913]" /> 696 794 911
            </a>
          </div>
        </div>
      </div> */}

      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-20">

          {/* LOGO BLOCK */}
          <Link onClick={closeMenu} to="/" className="flex items-center h-20 py-2">
            <img 
              src="/logoPDC.png" 
              alt="PDC" 
              className="h-full w-auto object-contain" 
              onError={(e) => { e.currentTarget.style.display='none'; }}
            />
          </Link>

          {/* DESKTOP NAV - STYLE ÉPURÉ / ANGLES DROITS */}
          <nav className="hidden lg:flex items-center gap-1 text-[14px] font-bold text-slate-800 uppercase tracking-wide">
            {navLinks.map((link) => (
              <div 
                key={link.title} 
                className="relative"
                onMouseEnter={() => link.dropdown && setOpenDropdown(link.title)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                {link.dropdown ? (
                  <>
                    <button
                      onClick={() => toggleDropdown(link.title)}
                      className={`flex items-center gap-1 px-4 py-2 transition-all border-b-2 ${openDropdown === link.title ? 'text-[#0D5931] border-[#E5A913] bg-slate-100/50' : 'border-transparent text-slate-800 hover:text-[#0D5931]'}`}
                    >
                      {link.title}
                      <ChevronDown size={14} className={`transition-transform duration-200 ${openDropdown === link.title ? 'rotate-180 text-[#E5A913]' : 'text-slate-400'}`} />
                    </button>

                    {/* DROPDOWN MINIMALISTE RECTANGULAIRE */}
                    {openDropdown === link.title && (
                      <div className="absolute top-full left-0 mt-0 bg-[#F9F8F5] border-2 border-[#0D5931] shadow-[4px_4px_0px_0px_#E5A913] w-60 py-2 z-10">
                        {link.dropdown.map((subLink) => (
                          <Link
                            key={subLink.title}
                            to={subLink.path}
                            onClick={closeMenu}
                            className="block px-5 py-2.5 text-xs text-slate-800 hover:bg-[#0D5931] hover:text-[#F9F8F5] font-bold uppercase tracking-wide transition-colors"
                          >
                            {subLink.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={link.path}
                    className="block px-4 py-2 border-b-2 border-transparent text-slate-800 hover:text-[#0D5931] hover:border-[#0D5931] transition-all"
                  >
                    {link.title}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* CTA DESKTOP - NO ARRONDIS / SHADOWS SOLIDES */}
          <div className="hidden lg:flex items-center gap-4">
            <LanguageSwitch />
            <Link
              to="/soutenir"
              className="px-5 py-2.5 border-2 border-[#0D5931] text-[#0D5931] hover:bg-[#0D5931] hover:text-[#F9F8F5] transition-all font-extrabold uppercase tracking-wider text-xs"
            >
              {t('nav.support')}
            </Link>

            <Link
              to="/adhesion"
              className="px-5 py-2.5 bg-[#0D5931] text-[#F9F8F5] border-2 border-[#0D5931] hover:bg-transparent hover:text-[#0D5931] transition-all font-extrabold uppercase tracking-wider text-xs flex items-center gap-1.5 shadow-[3px_3px_0px_0px_#E5A913]"
            >
              {t('nav.join')}  <ArrowUpRight size={14} className="text-[#E5A913]" />
            </Link>
          </div>

          {/* MOBILE TOGGLE */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 text-slate-900 hover:bg-slate-200/50 transition-colors"
            aria-label={t('nav.menu')}
          >
            {isOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* MOBILE BLOCK - STRUCTURED & CLEAN */}
      {isOpen && (
        <div className="lg:hidden bg-[#F9F8F5] border-t-2 border-[#0D5931] max-h-[calc(100vh-80px)] overflow-y-auto">
          <nav className="flex flex-col py-6 px-6 gap-1">
            {navLinks.map((link) => (
              <div key={link.title} className="w-full">
                {link.dropdown ? (
                  <>
                    <button
                      onClick={() => toggleDropdown(link.title)}
                      className="flex justify-between items-center w-full py-3.5 text-slate-900 font-extrabold uppercase tracking-wide text-sm border-b border-slate-200"
                    >
                      {link.title}
                      <ChevronDown size={16} className={`transition-transform text-[#E5A913] ${openDropdown === link.title ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {openDropdown === link.title && (
                      <div className="bg-slate-100/60 my-1 py-1 flex flex-col border-l-4 border-[#0D5931]">
                        {link.dropdown.map((subLink) => (
                          <Link
                            key={subLink.title}
                            to={subLink.path}
                            onClick={closeMenu}
                            className="block py-3 px-6 text-xs font-bold text-slate-700 uppercase tracking-wide hover:text-[#0D5931]"
                          >
                            {subLink.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={link.path}
                    onClick={closeMenu}
                    className="block py-3.5 text-slate-900 font-extrabold uppercase tracking-wide text-sm border-b border-slate-200 hover:text-[#0D5931] transition-colors"
                  >
                    {link.title}
                  </Link>
                )}
              </div>
            ))}

            {/* MOBILE ACTION BUTTONS */}
            <div className="flex flex-col gap-4 mt-8">
              <LanguageSwitch />
              <Link
                to="/soutenir"
                onClick={closeMenu}
                className="w-full text-center bg-transparent border-2 border-[#0D5931] text-[#0D5931] py-3.5 font-black uppercase tracking-wider text-xs"
              >
                {t('nav.supportParty')}
              </Link>

              <Link
                to="/adhesion"
                onClick={closeMenu}
                className="w-full text-center bg-[#0D5931] text-[#F9F8F5] py-4 font-black uppercase tracking-wider text-xs shadow-[4px_4px_0px_0px_#E5A913]"
              >
                {t('nav.joinParty')}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}