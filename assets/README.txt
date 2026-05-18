FUTUR LATAM CORP – Assets (fotos y videos)
========================================

Estructura del sitio (2026):
– website/index.html → selector Miami / Chile
– website/us/       → portafolio Miami (HTML + rutas a ../assets, ../css, ../js)
– website/cl/       → espejo del sitio Miami + projects.html (mapa de parcelas Los Olivos)

Sube aquí tus archivos respetando LOS MISMOS NOMBRES que aparecen en el HTML,
o renombra tus archivos locales para que coincidan (es la forma más rápida).

carpeta: website/assets/images/
---------------------------------
Obligatorios para que no se vean íconos rotos al abrir el sitio (ajusta nombres si usas otros):

  hero-miami.jpg                 → Foto principal del hero (index)
  panel-architecture-blueprint.jpg
  about-welcome-collage.jpg
  about-hero-banner.jpg
  about-miami-office.jpg
  about-chile-hub.jpg
  about-craft-detail.jpg
  contact-section-texture.jpg   → Textura de fondo opcional (index, final)

Miniaturas puertas de acceso (tarjetas Home):
  thumb-residential-gateway.jpg
  thumb-retail-gateway.jpg
  thumb-industrial-gateway.jpg

Residencial:
  res-1-story-01.jpg … (Granada tarjeta; ver model-granada.html)
  res-2-story-01.jpg, res-2-story-02.jpg

  Modena (walkthrough + fotos reales):
  • assets/videos/Video_Unbranded.mp4  → video del modelo (hover + página detalle)
  • carpeta website/assets/images/monroe/  → (sí, el folder se llama “monroe”, pero corresponde a Modena)
  • página: model-modena.html

  granada-hero-render.jpg, granada-gallery-01.jpg … granada-gallery-04.jpg
  granada-gallery-05-plan-thumb.jpg  (miniatura del plano en galería)

Retail:
  retail-plaza-render.jpg
  retail-office-render.jpg

Industrial:
  ind-gallery-01.jpg … ind-gallery-06-plan-thumb.jpg

Planos (ampliar en modal al hacer clic):
carpeta website/assets/images/plans/
  res-1-story-01-plan.jpg … (como en residential.html)
  granada-2600f-floorplan.jpg
  retail-plaza-plan.jpg, retail-office-plan.jpg
  ind-unit-plan.jpg

carpeta: website/assets/videos/
-------------------------------
Todos son OPCIONALES (excepto Modena que ya usa un archivo fijo):
  Video_Unbranded.mp4   ← modelo Modena (hover + model-modena.html)
  hero-city-loop.mp4
  gateway-residential.mp4, gateway-retail.mp4, gateway-industrial.mp4
  res-*-hover.mp4, granada-*.mp4, retail-*.mp4, ind-0*-loop.mp4
  contact-ambient-loop.mp4  (fondo suave en contacto)

Recomendaciones técnicas para hosting:
– Comprime JPG/WebP y videos H.264 (.mp4) en bucle corto (5–15 s) para cargas rápidas.
– El botón “Floor plan” / “Plans” abre un visor modal nativo (etiqueta dialog).

Formulario de contacto:
– Conecta el formulario de contact.html a tu backend (Formspree, Netlify Forms, etc.)
  cambiando el atributo action del <form>.

carpeta: website/assets/chile/ (Chile · visor de parcelas en cl/projects.html)
---------------------------------------------------------
  los-olivos.kmz      → KMZ principal (Planta Gral Los Olivos); referenciado por cl/projects.html.
  parcels.kmz         → Legado; ya no es la ruta por defecto del mapa.
  hero-chile.jpg       → Opcional (legado): si existía en una landing Chile antigua.
  lumina-plaza.jpg     → Opcional: imagen tarjeta “Lumina Plaza”.
  torre-andes.jpg      → Opcional: imagen tarjeta “Torre Andes”.
  parcels.manifest.json → Textos/fotos por parcela (matchField vs. properties.name del GeoJSON).
  demo-parcels.geojson  → Demo embebida si no hay KMZ o falla la carga.
  photos/               → Imágenes referenciadas en manifest (rutas tipo assets/chile/photos/…).

Esquema mínimo de parcels.manifest.json:
  {
    "matchField": "name",
    "parcels": {
      "CODIGO_KML": {
        "title": { "en": "…", "es": "…" },
        "notes": { "en": "…", "es": "…" },
        "photos": ["assets/chile/photos/archivo.jpg"]
      }
    }
  }

La clave (ej. CODIGO_KML) debe coincidir con la propiedad del GeoJSON tras convertir el KML
(por defecto el nombre del Placemark → properties.name). Si usas otro campo, cambia matchField.
