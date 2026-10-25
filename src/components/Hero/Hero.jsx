import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

export default function Hero() {
  const images = [
    "/PDC1.jpg", 
    "/PDC2.jpg", 
    "/PDC3.jpg",  
  ];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative bg-[#F9F8F5] overflow-hidden min-h-[85vh] flex items-center">
      
      {/* CAROUSEL D'IMAGES À DROITE - SANS CLIP-PATH */}
      <div className="absolute top-0 right-0 w-full lg:w-1/2 h-[40vh] lg:h-full z-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full h-full bg-[#E5A913]/10"
          >
            {/* object-contain garantit que l'image est visible en entier sans coupure */}
            <img 
              src={images[index]} 
              alt="PDC Visual" 
              className="w-full h-full object-cover"
            />
          </motion.div>
        </AnimatePresence>

        {/* INDICATEURS DOTS (Niveau) */}
        <div className="absolute bottom-6 left-0 w-full flex justify-center gap-3 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-3 w-3 border-2 border-[#0D5931] transition-all duration-300 ${index === i ? 'bg-[#E5A913]' : 'bg-transparent'}`}
            />
          ))}
        </div>
      </div>

      {/* CONTENU TEXTE */}
      <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28 flex flex-col lg:flex-row items-center z-10 w-full">
        <div className="flex-1 lg:max-w-2xl bg-[#F9F8F5]/90 lg:bg-transparent p-6 lg:p-0">
          <p className="text-[#0D5931] font-black tracking-widest uppercase text-xs border-l-4 border-[#E5A913] pl-3 mb-6">
            Parti des Démocrates Camerounais
          </p>
          <h1 className="text-5xl lg:text-7xl font-black text-slate-900 leading-[0.9] uppercase">
            Un Cameroun <br/>
            <span className="text-[#0D5931]">digne</span>, <span className="text-[#E5A913]">juste</span> <br/>
            et souverain.
          </h1>
          <p className="mt-8 text-slate-700 text-lg font-medium max-w-lg">
            Héritiers d'une vision historique, nous bâtissons aujourd'hui le Cameroun de demain.
          </p>
          <p className="mt-2 text-[#E5A913] text-lg font-medium max-w-lg">
            Dieu – Patrie – Justice - Démocratie
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/adhesion" className="px-8 py-4 bg-[#0D5931] text-[#F9F8F5] font-black uppercase text-sm border-2 border-[#0D5931] shadow-[4px_4px_0px_0px_#E5A913] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all">
              Rejoindre le PDC
            </Link>
            <Link to="/soutenir" className="px-8 py-4 bg-transparent text-[#0D5931] font-black uppercase text-sm border-2 border-[#0D5931] hover:bg-[#0D5931] hover:text-[#F9F8F5] transition-all">
              Soutenir le parti
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}