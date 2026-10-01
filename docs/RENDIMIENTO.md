# Rendimiento: cuatro mapas, edificios y 120 unidades

## Alcance de la medición de CPU

Medición del **1 de octubre de 2026**, Windows x64, Node **v24.19.0**, Ryzen 9 5900X, RTX 3060 y 32 GB de RAM. Resultados completos: [CPU-MEDICION.json](CPU-MEDICION.json). Describe este equipo y estas cargas; no garantiza el rendimiento de Safari ni del servidor gratuito de Render.

Para repetirla desde la carpeta del proyecto:

```sh
node tests/benchmark.mjs
```

El programa usa las reglas del juego, semilla `20261001`, pasos de 0,1 s y dos bandos de 60 unidades. El presupuesto ampliado pertenece al escenario de prueba. Las compras, órdenes, rutas, detección, disparos, daños y capturas usan la implementación real.

Cada carga dura **1.000 pasos / 100 segundos simulados**. Se miden por separado el paso de simulación y la creación más serialización JSON de cada estado. Se generan dos estados cada 0,2 segundos: 5 actualizaciones por segundo y jugador. El cálculo de órdenes y rutas se mide aparte. Los índices de terreno y navegación se preparan al usarlos por primera vez, fuera de los intervalos medidos de paso y estado.

El mapa nuevo **Estuario mide 4800 × 3000**, frente a **3200 × 2000** de Frontera: 14,4 frente a 6,4 millones de unidades cuadradas, **2,25 veces la superficie**. Las cargas incluyen 6/14/28/96 edificios sólidos en Valle, Cuenca, Frontera y Estuario, además de vegetación aislada, arboledas y bosque denso. No se redujo el límite de 120 unidades.

## Simulación y estados

| Mapa | Carga | Unidades iniciales / finales | Paso medio / p95 | Estado JSON por cliente, medio / p95 |
| --- | --- | ---: | ---: | ---: |
| Valle | 120 sostenidas | 120 / 120 | 0,493 / 0,738 ms | 0,334 / 0,484 ms |
| Valle | Combate de nueve clases | 120 / 4 | 0,224 / 0,917 ms | 0,207 / 0,791 ms |
| Cuenca | 120 sostenidas | 120 / 120 | 0,501 / 0,901 ms | 0,309 / 0,474 ms |
| Cuenca | Combate de nueve clases | 120 / 5 | 0,195 / 0,868 ms | 0,188 / 0,625 ms |
| Frontera | 120 sostenidas | 120 / 120 | 0,471 / 0,875 ms | 0,314 / 0,477 ms |
| Frontera | Combate de nueve clases | 120 / 8 | 0,232 / 0,891 ms | 0,212 / 0,616 ms |
| Estuario | 120 sostenidas | 120 / 120 | 0,52 / 0,893 ms | 0,383 / 0,574 ms |
| Estuario | Combate de nueve clases | 120 / 15 | 0,309 / 0,897 ms | 0,292 / 0,654 ms |

La carga sostenida usa antiaéreos terrestres que se mueven, detectan y disputan sectores sin dispararse entre sí. Mantiene 120 unidades. La carga de combate sí pierde unidades: registró 481/482/520/504 disparos, 125/110/95/72 explosiones y 116/115/112/105 bajas en los cuatro mapas. Sus poblaciones medias fueron 33,269/37,178/44,234/56,063; no equivale a combate permanente de 120 unidades.

Objetivos de regresión en este PC: p95 de paso inferior a **10 ms**, p95 de estado inferior a **10 ms** y p95 de orden de grupo inferior a **100 ms**. Todos se cumplieron. Son presupuestos de escritorio que dejan margen dentro del paso de 100 ms del servidor; el banco informa del resultado sin convertir una máquina lenta en un fallo funcional de las reglas.

## Navegación y órdenes de grupo

Se miden **24 órdenes por mapa**, cada una con 60 unidades, hacia flancos opuestos. Cada orden calcula las rutas de la formación y obliga a sortear agua y edificios. Las variantes se repiten, por lo que la media incluye el beneficio de la caché; se indica también la primera orden.

| Mapa | Rutas con desvíos | Primera orden | Orden de 60 unidades, media / p95 / máxima |
| --- | ---: | ---: | ---: |
| Valle | 1332 de 1.440 | 5,178 ms | 2,101 / 5,81 / 6,389 ms |
| Cuenca | 1368 de 1.440 | 12,559 ms | 4,538 / 14,029 / 14,391 ms |
| Frontera | 1440 de 1.440 | 21,348 ms | 6,753 / 21,096 / 21,348 ms |
| Estuario | 1440 de 1.440 | 50,84 ms | 14,563 / 50,84 / 52,791 ms |

Se conservan la cola de prioridad A* y las conexiones transitables precalculadas. Para el mapa nuevo se añadió una caché acotada a **1.024 rutas por mapa**, basada en celdas inmutables. Los conectores al punto exacto y cada segmento suavizado se vuelven a comprobar; las rutas mutables de las unidades no se comparten. Una prueba verifica que una ruta guardada por otra sala no cambie el resultado de una orden posterior.

En la primera medición de esta revisión, Estuario alcanzó **89,035 ms p95** por orden; con la caché pasó a **50,840 ms**. El filtro de alcance evita comprobar rayos de disparo para objetivos demasiado lejanos. Los edificios se consultan mediante un índice espacial; se calcula la altura de los rayos respecto a sus volúmenes. La vegetación usa zonas con densidad y muestreo limitado, sin simulación de hojas.

Las pruebas cubren esquinas de canales, orillas, puentes, obstáculos sólidos y puntos exactos de entrada. Incluyen todos los objetivos desde ambas bases, todas las puertas y 800 rutas arbitrarias por semilla entre los cuatro mapas. No se sustituyeron obstáculos por decoración para mejorar las cifras.

## Partidas completas con IA

El banco inicia una partida contra la IA en cada mapa y envía las tres tropas iniciales del jugador a sectores distintos. Después ejecuta hasta el final. Es una prueba programada de las reglas, no una partida humana. En las cuatro partidas ganó la IA por puntos.

| Mapa | Tiempo de partida | Tiempo de ejecución | Sectores con propietario al final | Entradas reales en edificios |
| --- | ---: | ---: | ---: | ---: |
| Valle | 201,7 s | 61,331 ms | 3/3 | 2 |
| Cuenca | 179,7 s | 48,186 ms | 5/5 | 3 |
| Frontera | 204,7 s | 60,08 ms | 7/7 | 5 |
| Estuario | 215 s | 65,525 ms | 7/9 | 6 |

En Estuario hubo un máximo simultáneo de tres ocupantes. El banco registra entradas efectivas después del desplazamiento hasta una puerta; no cuenta las reservas como ocupación. Las pruebas específicas verifican protección, conservación de salud/munición/supresión, salidas, ventanas, bloqueo por otras paredes y ocultación de ocupantes enemigos.

## Tamaño de los estados

| Mapa, 120 unidades sostenidas | Estado medio / p95 | Por cliente a 5 Hz, media / p95 |
| --- | ---: | ---: |
| Valle | 46.785 / 49.175 bytes | 233.925 / 245.875 bytes/s |
| Cuenca | 47.219 / 50.548 bytes | 236.095 / 252.740 bytes/s |
| Frontera | 48.417 / 52.747 bytes | 242.087 / 263.735 bytes/s |
| Estuario | 56.177 / 62.674 bytes | 280.886 / 313.370 bytes/s |

Son tamaños del JSON completo, con el estado de edificios filtrado por niebla. Excluyen WebSocket/TLS, compresión, latencia, pérdidas y transporte por Internet. En Estuario, dos jugadores con esta carga suponen aproximadamente **562 kB/s** de salida. Conviene medir sesiones largas y estudiar estados incrementales antes de ampliar participantes o unidades.

## Dibujo en el ordenador

Medición separada con Edge/Chromium, ventana de 1440 × 900 y WebGL mediante la **RTX 3060**. Colocación sintética de 120 unidades reales, todas visibles, durante seis segundos por mapa. El estado sustituido se inyecta solo en un contexto de prueba aislado; esa función no existe en producción. No mide una partida completa ni combate sostenido. Datos: [RENDER-MEDICION.json](RENDER-MEDICION.json).

| Mapa | FPS observados | Intervalo medio / p95 | Llamadas de dibujo | Triángulos |
| --- | ---: | ---: | ---: | ---: |
| Valle | 236 | 4,23 / 4,30 ms | 372 | 37.952 |
| Cuenca | 235 | 4,25 / 4,30 ms | 376 | 69.238 |
| Frontera | 235 | 4,25 / 4,30 ms | 380 | 88.552 |
| Estuario | 235 | 4,25 / 4,30 ms | 386 | 150.334 |

Los árboles comparten geometría mediante instancias. Suelo, edificios y partes fijas de las unidades se agrupan por material. La niebla se actualiza cada 700 ms con una cuadrícula de 8 unidades y 96 rayos por observador o ventana. Es una aproximación visual del terreno visible; el servidor decide la detección exacta y nunca envía enemigos ocultos. No se quitaron edificios ni vegetación funcional para obtener estos resultados.

Repetición: iniciar el servidor, disponer de Playwright y Edge, y ejecutar `node tests/render-benchmark.mjs`. `PLAYWRIGHT_MODULE`, `BROWSER_CHANNEL` y `GAME_URL` indican la instalación y dirección usadas. Estas cifras de escritorio no acreditan 235 FPS en un teléfono.

## Pendiente en Safari y entre dispositivos

Objetivo móvil provisional: **30 FPS** en horizontal, unos 33,3 ms por imagen. Referencias propuestas: iPhone 12 y iPad de 9.ª generación. **No se ha tenido acceso físico a esos equipos.** No se han medido en ellos FPS, memoria, temperatura, batería, instalación desde Safari ni comportamiento desde la pantalla de inicio.

Quedan pendientes diez minutos de juego en cada dispositivo real, al menos dos con 120 unidades visibles, y pruebas de interrupción y recuperación de conexión entre dos redes. Las pruebas táctiles y de tamaños de pantalla ejecutadas en el ordenador, y los clientes WebSocket locales, no sustituyen esas comprobaciones. El límite se mantiene en **120 unidades totales**; no se ha reducido para estos mapas ni se afirma que sea el máximo posible en un iPhone.
