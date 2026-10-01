# Estado de Frente Boreal 0.2

Actualización del juego existente · 1 de octubre de 2026

**Juego:** https://frente-boreal.onrender.com · **Código:** https://github.com/IzanPrados/frente-boreal

## Cambios

### Campo de batalla y controles

- Barra superior compacta con puntos, objetivos, recursos y tiempo. Refuerzos, minimapa, grupos y acciones detalladas se abren de uno en uno.
- Sin selección no aparece la franja de órdenes. Al seleccionar se muestran resumen, Mover, Alto y acceso a más acciones. Las estadísticas se consultan bajo demanda.
- La franja se oculta al elegir destino. Un botón de 44 px permite cancelar la orden pendiente con el dedo; cerrar paneles no envía órdenes al mapa.
- Distribución específica para teléfono horizontal y vertical, tableta y escritorio, con bordes seguros y altura dinámica. La aplicación instalada permite ambas orientaciones.
- Minimapa plegable, cámara y vista general adaptados al escenario. Avisos breves de 3,2 segundos; información persistente solo cuando exige actuar.

### Movimiento y combate

- Mover y Avanzar y atacar comprueban blancos cada 0,2 s. Un enemigo detectado, compatible, dentro de alcance y con tiro válido interrumpe la ruta; la unidad conserva destino y camino.
- Mantiene el blanco válido actual; al buscar otro prioriza cercanía con preferencia por exploradores y menor prioridad para logística; usa el identificador para desempatar. No persigue blancos fuera del alcance.
- Tras perder objetivos, una espera máxima de 0,65 s evita alternancias rápidas y permite reanudar la ruta. Sin munición o capacidad de ataque continúa su función.
- Mover de nuevo, fuego dirigido, reabastecer y Alto sustituyen la orden anterior. Alto borra el destino; humo conserva la ruta como habilidad.
- La misma simulación ejecuta el modo individual y el servidor multijugador. El servidor transmite pausa de combate, ataques y reanudación.

### Preparación y economía

- Pantalla previa con recursos iniciales 0–10000; ingresos 0,5×/1×/2×/3×/5×; límite total 24–120 unidades; 3–60 minutos; 100–2000 puntos; escenario y tamaño.
- Valores iniciales: Valle de la Bruma, 410 recursos, 1×, 120 unidades, 12 minutos y 300 puntos. Restauración y último ajuste guardado localmente.
- Cada humano y la IA reciben el saldo inicial y su fuerza de partida. El multiplicador se aplica una sola vez a los 6 recursos por segundo. No modifica saldo inicial ni precios. Los objetivos reducen puntos enemigos, no conceden dinero.
- El anfitrión modifica la configuración; todos la ven antes de prepararse. Cambiarla desmarca a todos y aumenta la revisión. El servidor rechaza una preparación sobre ajustes antiguos y bloquea cambios tras empezar.

### Mapas y navegación

| Escenario | Dimensiones | Objetivos | Áreas funcionales |
|---|---|---:|---:|
| Valle de la Bruma | 1600 × 1000 | 3 | 18 |
| Cuenca del Norte | 2400 × 1600 | 5 | 32 |
| Frontera de los Siete Pasos | 3200 × 2000 | 7 | 62 |

El mapa grande tiene cuatro veces la superficie original, cinco cruces del río, canales laterales, varias poblaciones, bosques y circuitos de carreteras. Los nuevos escenarios tienen simetría de terreno y aproximaciones equivalentes para ambos bandos. Carreteras, agua, bosque y población afectan realmente a movimiento, cobertura y visibilidad. Las casas individuales siguen siendo representación de una zona urbana, sin colisión propia; no hay elevación funcional.

Se corrigieron rutas que rozaban esquinas de agua y destinos válidos de orillas o puentes cuyo centro de celda caía en agua. Cada partida tiene su mapa; los índices compartidos son inmutables y no mezclan salas.

## Pruebas ejecutadas

- **49/49 pruebas Node:** 27 de simulación y movimiento, 9 de mapas/configuración y 13 de servidor/red. Movimiento normal/grupos, detenerse/disparar/reanudar, objetivos ocultos/fuera de alcance, cambios de órdenes, munición, compatibilidad, logística, artillería, transporte, captura, IA, economía, propiedad, reconexión y caché.
- **Dos clientes TCP/WebSocket reales locales:** ajustes compartidos, preparación invalidada, bloqueo al iniciar, precios e ingresos coherentes y grupo que se detiene, combate y reanuda con estados idénticos.
- **7/7 comprobaciones de navegador locales:** duelo, cooperativo, teléfono horizontal 844 × 390, teléfono vertical 390 × 844, tableta 1024 × 768, cambio de tres mapas sin recargar y funcionamiento sin conexión. Controles de al menos 44 px y 89–95 % de los puntos muestreados libres de controles durante la observación inicial.
- Cancelación táctil de movimiento y despliegue, selección/grupos, pan/pellizco, apertura y cierre de paneles sin órdenes fantasma, conservación de identidad al recargar y final de ambos modos online.
- PWA: 20 recursos, incluidos mapas y configuración; recarga con red bloqueada y partida individual hasta tick 31.
- **3000 rutas de comprobación:** ninguna vacía. Rutas reales desde ambas bases a todos los objetivos nuevos sin entrar en agua. Partidas completas de IA en los dos escenarios nuevos, contra un jugador inactivo: victorias por puntos a 142,7 y 169,9 s; capturas de 5/5 y 6/7 objetivos.

Las pruebas de navegador usan Edge/Chromium en Windows con contextos aislados y gestos emulados. Los escenarios programados de simulación prueban reglas reales, pero no equivalen a partidas humanas. El informe cronológico está en [PRUEBAS-NAVEGADOR.md](PRUEBAS-NAVEGADOR.md).

## Rendimiento

Con 120 unidades sostenidas en el mapa grande, el p95 de simulación fue 0,858 ms; generar y serializar el estado, 0,425 ms por cliente. La búsqueda de rutas de un grupo de 60 pasó de 181,4 a 36,2 ms p95 mediante índice espacial, enlaces de navegación y cola de prioridad.

La geometría fija de cada unidad se agrupa por material. En una colocación controlada de 120 unidades, el mapa grande conservó sus 45440 triángulos y pasó de 957 a 377 llamadas de dibujo. La muestra de seis segundos a 1440 × 900 dio 240 FPS limitados por pantalla en RTX 3060; no demuestra rendimiento móvil ni estabilidad durante una partida larga. Condiciones y datos: [RENDIMIENTO.md](RENDIMIENTO.md).

## Publicación y límites

Se conserva el servicio Render existente, identificado como Free. No se añadió tarjeta, suscripción, servicio de pago ni apertura de red del ordenador. El servidor local escucha solo en 127.0.0.1. El código de la actualización se publica en el repositorio existente y requiere desplegarlo en Render.

- Pendiente de verificar físicamente: Safari en iPhone/iPad, pantalla de inicio, bordes seguros reales, orientación, cambios de aplicación, temperatura y FPS durante una partida completa.
- Dos contextos del mismo PC, aunque conecten al servidor público, no equivalen a dos dispositivos o redes distintas. Falta esa prueba física.
- El servidor gratuito puede dormir, tardar en despertar o reiniciarse. Las salas viven en memoria; un reinicio las pierde. Se conservan pausa y reconexión de hasta 90 s mientras vive el proceso.
- Los límites de ocho salas y 32 conexiones son protecciones, no capacidad simultánea comprobada en la instancia Free. Se mantienen estados JSON completos; falta medir tráfico y latencia sostenidos en móviles.
- Gráficos sencillos, terreno plano y aviación de movimiento/parada simplificado. Balance humano de mapas nuevos pendiente; estas limitaciones existentes no se presentan como funciones terminadas.
