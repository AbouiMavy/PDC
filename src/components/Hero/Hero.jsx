import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="relative bg-[#F9F8F5] overflow-hidden min-h-[85vh] flex items-center">
      
      {/* Layout asymétrique split : Texte à gauche, Image à droite */}
      <div className="absolute top-0 right-0 w-full lg:w-1/2 h-1/2 lg:h-full z-0 opacity-15 lg:opacity-100">
        <div 
          className="w-full h-full bg-cover bg-center lg:[clip-path:polygon(15%_0%,_100%_0%,_100%_100%,_0%_100%)]"
          style={{ 
            backgroundImage: "url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQNO7-TRN_Ha7BAbuQQHKDt2ex66-2_FM3NU3ONIgxeGw&s=10')" 
          }}
        />
        {/* Overlay subtil à droite pour l'intégration */}
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-[#F9F8F5] via-transparent to-transparent lg:[clip-path:polygon(15%_0%,_100%_0%,_100%_100%,_0%_100%)]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28 flex flex-col lg:flex-row items-center gap-12 z-10 w-full">

        {/* TEXT CONTENT */}
        <div className="flex-1 text-center lg:text-left lg:max-w-2xl">

          <p className="text-[#0D5931] font-bold tracking-widest uppercase text-xs border-l-4 border-[#E5A913] pl-3 inline-block">
            Parti des Démocrates Camerounais
          </p>

          <h1 className="mt-6 text-4xl lg:text-6xl font-black text-slate-900 leading-tight">
            Pour un Cameroun <span className="text-[#0D5931] underline decoration-[#E5A913] decoration-4 underline-offset-8">fort</span>,  
            <span className="text-[#E5A913]"> juste</span> et souverain
          </h1>

          <p className="mt-8 text-slate-600 text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
            Le PDC incarne une vision nouvelle fondée sur la démocratie, le développement,
            la jeunesse et la souveraineté nationale.
          </p>

          {/* CTA - Nouveau style minimaliste / néo-brutaliste */}
          <div className="mt-10 flex flex-col sm:flex-row gap-5 justify-center lg:justify-start">

            <Link
              to="/adhesion"
              className="px-8 py-4 bg-[#0D5931] text-[#F9F8F5] font-extrabold tracking-wide uppercase text-sm border-2 border-[#0D5931] hover:bg-transparent hover:text-[#0D5931] transition-all duration-300 shadow-[4px_4px_0px_0px_#E5A913] text-center"
            >
              Rejoindre le PDC
            </Link>

            <Link
              to="/soutenir"
              className="px-8 py-4 bg-transparent text-[#0D5931] font-extrabold tracking-wide uppercase text-sm border-2 border-[#0D5931] hover:bg-[#0D5931] hover:text-[#F9F8F5] transition-all duration-300 text-center"
            >
              Soutenir le parti
            </Link>

          </div>
        </div>

        {/* Espaceur pour le layout sur grand écran */}
        <div className="flex-1 hidden lg:block" />

      </div>
    </section>
  );
}