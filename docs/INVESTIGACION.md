# Investigación técnica y de diseño

Consulta documental: 1 de octubre de 2026. Solo se utilizan fuentes del fabricante, plataforma o documentación local del plugin. No se ha registrado ni desplegado ningún servicio, ni probado un iPhone/iPad físico.

## Resumen para decidir

**Propuesta:** cliente web táctil con WebGL2 y PWA; simulación autoritativa en Node.js con WebSocket, servida junto al cliente desde una sola instancia Free de Render para el prototipo. Es un encaje directo y reduce problemas de origen, cookies y configuración. Requiere autenticación del propietario para publicar. No permite prometer disponibilidad permanente ni partidas que sobrevivan a reinicios si solo se guarda estado en memoria.

**Alternativa comprobada documentalmente:** Cloudflare Workers + un Durable Object por partida, con backend SQLite y plan Free. Admite estado y WebSocket, pero exige adaptar el servidor al modelo de Workers. La duración de la simulación continua consume cuota incluso usando WebSocket Hibernation.

**Sites:** sirve para el cliente y endpoints compatibles con Workers; sus instrucciones actuales no documentan Durable Objects ni un proceso Node persistente. No asumir que Sites por sí solo ofrece la autoridad continua de las partidas. Un backend externo sí podría conectarse desde el cliente si se publica y configura expresamente.

## 1. Qué conservar de WARNO

La presentación actual de Eugen confirma grupos de combate personalizados, armas combinadas, reconocimiento, maniobra y escenarios tácticos. La página oficial de Steam añade el constructor a partir de divisiones, infantería, blindados, artillería, defensa aérea, helicópteros y aviones; además de despliegue previo, reglas de enfrentamiento y órdenes asistidas. Fuentes: [Eugen: WARNO](https://eugensystems.com/games/warno/) y [ficha del desarrollador en Steam](https://store.steampowered.com/app/1611600/WARNO/).

El diario oficial «FOB, LoS & Balancing», de febrero de 2023, explica reconocimiento/detección frente a ocultación, edificios y bosques que cortan visión, logística de munición/combustible/reparación y función de supresión de la artillería. Se usa como evidencia del diseño, no como tabla del equilibrio vigente. [Diario oficial](https://store.steampowered.com/news/app/1611600/view/3638380959507217693) ([texto del feed oficial leído](https://store.steampowered.com/news/posts/?enddate=1676014771&feed=steam_community_announcements)).

El diario «Hello World!», de diciembre de 2021, describe cohesión afectada por daños y fatiga, con consecuencias sobre movilidad, puntería y recarga; órdenes inteligentes para capturar/defender y asistencia de artillería; e información sobre visibilidad y posibilidad de disparo. No trasladar porcentajes de aquel anuncio como datos actuales. [Diario oficial, texto leído](https://store.steampowered.com/news/posts/?enddate=1640338934&feed=steam_community_announcements).

**Traducción propuesta a un prototipo móvil:** pocas clases claramente distintas, visión compartida por equipo, niebla de guerra calculada por el servidor, bosque/edificios que importan, economía para refuerzos, captura territorial, cohesión, suministro y humo. Una cadena breve de decisiones —observar, cubrir, maniobrar, sostener— conserva mejor la intención que reproducir cientos de fichas. Estadísticas, nombres, mapa, gráficos y equilibrio serán originales. Esta es una decisión de diseño; no una descripción de una versión reducida oficial de WARNO.

## 2. iPhone/iPad y Safari

| Capacidad | Evidencia oficial | Decisión propuesta |
|---|---|---|
| WebGL2 | WebKit anunció WebGL2 en Safari 15, con WebGL sobre Metal. [Safari 15](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/) | Detectar `getContext('webgl2')`; no identificar compatibilidad solo por modelo o agente del navegador. |
| Puntero táctil, ratón, lápiz | Pointer Events se incorporó en Safari 13. [Safari 13](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/) | Unificar tap, drag, selección y gesto de cámara con Pointer Events. |
| Ratón/trackpad iPad | WebKit recomienda Pointer Events y detección de capacidades; desde iPadOS 13.4 los ratones no producen eventos táctiles. [Safari 13.1](https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/) | Evitar controles que funcionen exclusivamente con eventos touch. |
| Instalación PWA | Con manifest `display: standalone` o `fullscreen`, un sitio añadido a Inicio abre como aplicación. iOS/iPadOS 16.4 añadió Web Push en esas aplicaciones. [PWA en iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Manifest, iconos, orientación preferida horizontal y guía breve «Añadir a pantalla de inicio». |

La compatibilidad de API no demuestra rendimiento ni ergonomía. Se propone iOS/iPadOS 16.4 o posterior como objetivo inicial conservador; limitar densidad, resolución interna y efectos. Faltan pruebas físicas de gestos, rotación, memoria, temperatura, recuperación al volver de segundo plano y conexión 4G/5G. Una PWA instalable no convierte una partida online en offline: eso exigiría otro modo de simulación local, explícitamente etiquetado.

## 3. Render gratuito

**Comprobado en documentos:** admite web services Node.js y despliegue gratis. Una instancia Free tiene 512 MB de RAM. Render publica que se puede empezar sin tarjeta; una respuesta de personal de Render advierte de que ciertas cuentas pueden recibir una solicitud de tarjeta para verificación. Fuentes: [primer despliegue](https://render.com/docs/your-first-deploy), [precios](https://render.com/pricing), [artículo oficial sobre planes gratuitos](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), [respuesta oficial sobre verificación](https://community.render.com/t/the-deployement-of-a-web-service-fails/36005).

- 750 horas de instancia gratuitas por mes y workspace; se comparten entre servicios.
- Suspensión tras 15 minutos sin tráfico HTTP ni mensajes WebSocket entrantes; reactivación de aproximadamente un minuto.
- Si se agotan las horas, los servicios gratis quedan suspendidos hasta el mes siguiente.
- Disco efímero; reiniciar, redesplegar o dormir elimina cambios locales. Sin disco persistente en Free.
- Render puede reiniciar una instancia gratis en cualquier momento.
- Postgres gratis caduca tras 30 días. Key Value gratis pierde sus datos al reiniciar.
- Ancho de banda y minutos de compilación tienen cuotas del workspace. Sin método de pago se suspende el servicio o se bloquean nuevas compilaciones al agotarlas; con método de pago pueden generarse cargos.

Fuente de estos límites: [Deploy for Free](https://render.com/docs/free). La [FAQ de facturación](https://render.com/docs/faq) confirma que una instancia gratuita no impide cargos adicionales cuando hay tarjeta. No fijar una cifra de ancho de banda sin verla en la cuenta: la documentación remite al panel para su cuota incluida.

Los web services aceptan WebSocket; Node puede usar `ws`; hacia Internet debe ser `wss`. No hay duración máxima impuesta a la conexión, pero hay cierres por mantenimiento y reinicios; se recomienda heartbeat y reconexión. [WebSocket en Render](https://render.com/docs/websocket). Desde el 24 de febrero de 2026, los mensajes WebSocket entrantes retrasan el reposo, corrigiendo el comportamiento anterior basado solo en HTTP. [Cambio oficial](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages).

**Aplicación propuesta:** una sola instancia sirve recursos y partida; cerrar salas vacías, usar heartbeat durante la sesión real y recuperar la conexión con token y secuencia. No crear un ping artificial externo para mantener servicio despierto todo el día. Guardar snapshots en memoria permite recuperar una desconexión mientras vive el proceso; no salva un reinicio de Render. El producto debe distinguir ambas situaciones. Si se pide persistencia tras reinicios, hará falta almacenamiento duradero gratuito comprobado o cambiar el backend.

## 4. Cloudflare Durable Objects gratuito

Durable Objects se ofrece en Workers Free con almacenamiento SQLite. Cuotas: 100.000 solicitudes/día y 13.000 GB-s/día; agotarlas provoca errores hasta reinicio diario a 00:00 UTC. El cómputo reserva 128 MB por objeto; los mensajes WebSocket entrantes se facturan 20:1 y los salientes no se cobran como solicitudes. [Precios oficiales DO](https://developers.cloudflare.com/durable-objects/platform/pricing/). El producto anuncia inicio sin tarjeta. [Producto Durable Objects](https://www.cloudflare.com/products/durable-objects/).

Workers tiene además su propia cuota Free: 100.000 solicitudes/día y 10 ms de CPU por invocación; recursos estáticos gratuitos e ilimitados. La conexión WebSocket cuenta como petición del Worker, sus mensajes enrutados no. [Precios Workers](https://developers.cloudflare.com/workers/platform/pricing/). DO dispone de límites propios, incluyendo 5 GB de almacenamiento total en Free y 30 segundos de CPU por invocación por defecto. [Límites DO](https://developers.cloudflare.com/durable-objects/platform/limits/).

Una simulación con `setInterval`/`setTimeout` activos no puede hibernar. Además, el objeto puede reiniciarse; debe escribir estado de forma incremental y reconectar clientes. No hay hook de apagado garantizado. [Ciclo de vida DO](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/). [WebSocket y Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) permite conservar conexiones durante inactividad elegible; no ofrece simulación activa gratis ilimitada.

**Estimación, no prueba:** 13.000 / 0,128 / 3.600 ≈ 28 horas de objeto activo al día sumadas entre partidas. Un objeto por partida significa que dos partidas simultáneas consumen unas dos horas de objeto por hora real. Hay que reservar margen para salas, recuperación y otras operaciones. Mejor para un prototipo pequeño que para prometer concurrencia ilimitada. No activar Workers Paid para superar cuotas bajo una condición de coste cero.

## 5. Capacidad documentada de Sites

Se leyeron las habilidades locales `sites-building`, `sites-hosting` y referencias `starter-capabilities.md` y `persistence-and-storage.md` del plugin Sites 0.1.75. Se buscó en todo el plugin «Durable Objects», `durable_objects` y «WebSockets» sin resultados.

- `sites-building` pide salida ESM compatible con Cloudflare Workers y un `fetch(request, env, ctx)` exportado.
- `starter-capabilities` documenta bindings D1 y R2.
- `sites-hosting` permite en `.openai/hosting.json` únicamente `project_id`, configuración estática, D1/R2, plugins/connectors verificados y capabilities admitidas.
- Se prohíben sockets TCP crudos en Sites alojados; esto no es una prohibición general de WebSocket, pero tampoco prueba soporte para un servidor persistente.

**Conclusión limitada a evidencia:** no se encontró una ruta admitida para declarar, migrar y publicar un Durable Object desde Sites. No afirmar «Sites no soporta WebSocket» en términos absolutos; sí «la simulación continua autoritativa mediante DO no está documentada en la integración disponible». No se creó ningún Site para probarlo.

## 6. Qué está comprobado y qué queda propuesto

**Comprobado:** existencia de las API Safari indicadas; documentación vigente de Render/Cloudflare; inspiración y sistemas de WARNO en fuentes del desarrollador; capacidades locales documentadas de Sites.

**No probado aquí:** juego en dispositivos Apple, FPS, estabilidad de 30 minutos, consumo de red, latencia real, capacidad de cada instancia, comportamiento del código del juego, reconexión real entre dos dispositivos, alta de cuenta sin verificación adicional y publicación funcional. Las cifras de FPS/unidades/tick/concurrencia deben figurar como objetivos hasta medirlas.
