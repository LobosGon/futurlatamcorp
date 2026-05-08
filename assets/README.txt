FUTUR LATAM CORP – Assets (fotos y videos)
========================================

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
