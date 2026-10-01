# Estado de Frente Boreal

Fecha: 1 de octubre de 2026. Versión: prototipo 0.1.

Este registro distingue implementación de comprobación. La sesión de integración debe completar la sección de resultados antes de entregar el proyecto.

## Alcance y decisiones

- Juego web original en español, con mapa 3D simplificado y controles táctiles. El objetivo final sigue siendo una experiencia táctica más profunda; esta versión es un incremento jugable.
- Cliente con Three.js 0.186.1; WebGL2 es un requisito que se detecta al abrir.
- Simulación separada de la representación. Individual en trabajador del navegador; cooperativo y 1 contra 1 con autoridad del servidor Node/WebSocket.
- Nueve clases previstas en esta versión: infantería, carro, transporte, reconocimiento, logística, artillería, defensa antiaérea, helicóptero y avión.
- Mapa original Valle de la Bruma, 1600 × 1000 unidades abstractas; límite inicial de 120 unidades totales, simulación de 10 pasos por segundo. Son parámetros iniciales, no límites derivados todavía de medidas en móviles.
- Sin cuentas de jugador ni servicios de IA. Salas privadas identificadas por código; credencial de reconexión por participante.
- Alojamiento propuesto: una instancia Render Free. La publicación y el acceso entre redes distintas deben constar expresamente como verificados antes de darlos por hechos.

## PWA y preparación implementadas

- Manifest con idioma español, apertura independiente y preferencia horizontal.
- Iconos PNG originales FB de 192/512 píxeles, variantes normales y maskable.
- Bibliotecas Three.js y licencias servidas localmente, incluidos `three.module.js` y `three.core.js`.
- Lista de precarga generada a partir de cliente, simulación y recursos públicos; comprobación SHA-256 de cada archivo al instalar.
- Caché completa por versión. No se activa una actualización hasta recibir `SKIP_WAITING` a petición de la interfaz.
- Mensajes al cliente ante descarga fallida o recurso no disponible sin conexión; `/health` y `/ws` quedan fuera de la caché.
- Compilación estática a `dist/`, con comprobación de ruta y rechazo de enlaces antes de reemplazarla.

## Pruebas realizadas

### Preparación de recursos

- `scripts/prepare-assets.mjs` ejecutado correctamente en Windows con el Node incluido en el entorno de trabajo.
- Icono PNG de 192 píxeles abierto e inspeccionado: monograma legible, fondo opaco y margen seguro.
- `scripts/build.mjs` ejecutado correctamente; cliente estático generado con 18 recursos de precarga en ese momento de la integración. Debe regenerarse después de los cambios finales.
- Prueba del service worker en una VM de Node con API de navegador simulada: precarga completa, rechazo de un archivo corrupto por SHA-256, navegación con código de sala, exclusión de `/health`, ausencia de activación implícita y activación mediante `SKIP_WAITING`. Todas pasaron. Esta prueba aislada no equivale a una prueba PWA en navegador ni en Safari.
- Todavía deben consolidarse aquí las comprobaciones finales de simulación, red e interfaz de la sesión de integración.

### Pendiente de validación física o externa

- Instalación y apertura desde Inicio en iPhone/iPad reales.
- Gestos táctiles, rotación, interrupción por cambio de aplicación y recuperación de red en dispositivos reales.
- 1 contra 1 y cooperativo en dos dispositivos físicos.
- Acceso desde redes distintas y comportamiento del alojamiento gratuito publicado.
- Partida prolongada y medición de FPS, temperatura y memoria en hardware Apple.

La disponibilidad de WebGL2/Pointer Events/PWA está verificada en documentación oficial; eso no acredita estas pruebas prácticas.

## Objetivos de rendimiento provisionales

Referencias propuestas, todavía sin acceso a estos dispositivos: iPhone 12 con iOS 16.4 o posterior e iPad de 9.ª generación con iPadOS 16.4 o posterior. Objetivo: 30 FPS estables durante una partida de 12 minutos, con brillo medio, calidad Ligera/Equilibrada y 30, 60 y 120 unidades para distinguir coste del renderizado y de la simulación. Registrar versión exacta del sistema, resolución interna, número de unidades, percentiles de tiempo por fotograma y temperatura percibida; una prueba de escritorio no acredita este objetivo.

## Límites conocidos

- Gráficos y reglas tácticas simplificados; no es una reproducción completa de WARNO.
- El avión es apoyo aéreo dirigido con movimiento/parada simplificados; todavía no modela pasadas, circuito de salida y reentrada de una aeronave real.
- Salas y partidas compartidas en memoria: una reconexión breve puede recuperarse mientras vive el proceso; un reinicio del servidor pierde la sala.
- PWA offline permite individual tras carga completa; no permite multijugador sin Internet.
- La plataforma puede cerrar/reiniciar una instancia gratuita o suspenderla por cuotas. El repositorio contiene configuración, no una promesa de servicio activo.
- El contenido inicial y el tamaño máximo de fuerzas son provisionales; no se justifican como resultado de medidas aún no realizadas.

## Siguiente paso

Cerrar la integración local con ciclo completo de partida, pruebas automatizadas y dos clientes comunicándose. Después, publicar únicamente en condiciones gratuitas sin tarjeta y comprobar dos dispositivos desde redes diferentes. Documentar los resultados reales antes de considerar completada la etapa de distribución.
