import { useEffect } from 'react';

const GoogleAdIsland = () => {
  useEffect(() => {
    try {
      // Intenta (re)cargar los anuncios de Google
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Error cargando anuncios', e);
    }
  }, []);

  return (
    <div className="my-4 flex justify-center">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', maxWidth: 728, height: 90 }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXX" // ← Reemplaza con tu ID real
        data-ad-slot="YYYYYYYYYY" // ← Reemplaza con tu slot real
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default GoogleAdIsland;
