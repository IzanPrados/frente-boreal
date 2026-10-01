# Rendimiento v0.4: cuatro mapas, edificios y 120 unidades

## Alcance de la medición de CPU

Medición del **2 de octubre de 2026 a las 00:22, hora de Madrid** (1 de octubre a las 22:22 UTC), Windows x64, Node **v24.19.0**, Ryzen 9 5900X, RTX 3060 y 32 GB de RAM. Resultados completos: [CPU-MEDICION.json](CPU-MEDICION.json). Describe este equipo y estas cargas; no garantiza el rendimiento de Safari ni del servidor gratuito de Render.

Para repetirla desde la carpeta del proyecto:

```sh
node tests/benchmark.mjs
```

El programa usa las reglas del juego, semilla `20261001`, pasos de 0,1 s y dos bandos de 60 unidades. El presupuesto ampliado pertenece al escenario de prueba. Las compras, órdenes, rutas, detección, disparos, daños y capturas usan la implementación real. La infantería tiene los valores de v0.4: alcance 185 y visión 250. Los estados se miden con visibilidad normal, sin activar el revelado de enemigos.

Cada carga dura **1.000 pasos / 100 segundos simulados**. Se miden por separado el paso de simulación y la creación más serialización JSON de cada estado. Se generan dos estados cada 0,2 segundos: 5 actualizaciones por segundo y jugador. El cálculo de órdenes y rutas se mide aparte. Los índices de terreno y navegación se preparan al usarlos por primera vez, fuera de los intervalos medidos de paso y estado.

El mapa nuevo **Estuario mide 4800 × 3000**, frente a **3200 × 2000** de Frontera: 14,4 frente a 6,4 millones de unidades cuadradas, **2,25 veces la superficie**. Las cargas incluyen 6/14/28/96 edificios sólidos en Valle, Cuenca, Frontera y Estuario, además de vegetación aislada, arboledas y bosque denso. No se redujo el límite de 120 unidades.

## Simulación y estados

| Mapa     | Carga                   | Unidades iniciales / finales | Paso medio / p95 | Estado JSON por cliente, medio / p95 |
| -------- | ----------------------- | ---------------------------: | ---------------: | -----------------------------------: |
| Valle    | 120 sostenidas          |                    120 / 120 | 0,483 / 0,726 ms |                     0,338 / 0,491 ms |
| Valle    | Combate de nueve clases |                     120 / 14 | 0,203 / 0,862 ms |                     0,192 / 0,762 ms |
| Cuenca   | 120 sostenidas          |                    120 / 120 | 0,482 / 0,871 ms |                     0,311 / 0,459 ms |
| Cuenca   | Combate de nueve clases |                     120 / 10 | 0,185 / 0,832 ms |                     0,188 / 0,612 ms |
| Frontera | 120 sostenidas          |                    120 / 120 | 0,498 / 0,891 ms |                     0,358 / 0,588 ms |
| Frontera | Combate de nueve clases |                      120 / 5 | 0,232 / 0,872 ms |                     0,222 / 0,621 ms |
| Estuario | 120 sostenidas          |                    120 / 120 | 0,520 / 0,878 ms |                     0,398 / 0,629 ms |
| Estuario | Combate de nueve clases |                     120 / 15 | 0,310 / 0,894 ms |                     0,304 / 0,717 ms |

La carga sostenida usa antiaéreos terrestres que se mueven, detectan y disputan sectores sin dispararse entre sí. Mantiene 120 unidades. La carga de combate sí pierde unidades: registró 426/461/510/470 disparos, 84/91/104/59 explosiones y 106/110/115/105 bajas en los cuatro mapas. Sus poblaciones medias fueron 34,750/38,846/43,224/55,205; no equivale a combate permanente de 120 unidades.

Objetivos de regresión en este PC: p95 de paso inferior a **10 ms**, p95 de estado inferior a **10 ms** y p95 de orden de grupo inferior a **100 ms**. Todos se cumplieron. Son presupuestos de escritorio que dejan margen dentro del paso de 100 ms del servidor; el banco informa del resultado sin convertir una máquina lenta en un fallo funcional de las reglas.

## Navegación y órdenes de grupo

Se miden **24 órdenes por mapa**, cada una con 60 unidades, hacia flancos opuestos. Cada orden calcula las rutas de la formación y obliga a sortear agua y edificios. Las variantes se repiten, por lo que la media incluye el beneficio de la caché; se indica también la primera orden.

| Mapa     | Rutas con desvíos | Primera orden | Orden de 60 unidades, media / p95 / máxima |
| -------- | ----------------: | ------------: | -----------------------------------------: |
| Valle    |     1332 de 1.440 |      5,145 ms |                   1,988 / 5,457 / 5,669 ms |
| Cuenca   |     1368 de 1.440 |     11,569 ms |                 4,090 / 12,086 / 12,718 ms |
| Frontera |     1440 de 1.440 |     20,753 ms |                 6,600 / 20,753 / 21,297 ms |
| Estuario |     1440 de 1.440 |     48,753 ms |                14,340 / 49,359 / 51,465 ms |

Se conservan la cola de prioridad A\* y las conexiones transitables precalculadas. Para el mapa nuevo se añadió una caché acotada a **1.024 rutas por mapa**, basada en celdas inmutables. Los conectores al punto exacto y cada segmento suavizado se vuelven a comprobar; las rutas mutables de las unidades no se comparten. Una prueba verifica que una ruta guardada por otra sala no cambie el resultado de una orden posterior.

Durante el desarrollo de v0.3, Estuario alcanzó **89,035 ms p95** por orden antes de añadir la caché y **50,840 ms** después. La medición final de v0.4 registra **49,359 ms p95**. Son ejecuciones distintas; la pequeña diferencia entre versiones no acredita por sí sola una mejora. El filtro de alcance evita comprobar rayos de disparo para objetivos demasiado lejanos. Los edificios se consultan mediante un índice espacial; se calcula la altura de los rayos respecto a sus volúmenes. La vegetación usa zonas con densidad y muestreo limitado, sin simulación de hojas.

Las pruebas cubren esquinas de canales, orillas, puentes, obstáculos sólidos y puntos exactos de entrada. Incluyen todos los objetivos desde ambas bases, todas las puertas y 800 rutas arbitrarias por semilla entre los cuatro mapas. No se sustituyeron obstáculos por decoración para mejorar las cifras.

## Partidas completas con IA

El banco inicia una partida contra la IA en cada mapa y envía las tres tropas iniciales del jugador a sectores distintos. Después ejecuta hasta el final. Es una prueba programada de las reglas, no una partida humana. En las cuatro partidas ganó la IA por puntos.

| Mapa     | Tiempo de partida | Tiempo de ejecución | Sectores con propietario al final | Entradas reales en edificios |
| -------- | ----------------: | ------------------: | --------------------------------: | ---------------------------: |
| Valle    |           206,9 s |           83,982 ms |                               3/3 |                            2 |
| Cuenca   |           170,4 s |           82,789 ms |                               5/5 |                            3 |
| Frontera |           169,8 s |           67,744 ms |                               7/7 |                            5 |
| Estuario |           220,4 s |           76,651 ms |                               7/9 |                            5 |

En Estuario hubo un máximo simultáneo de tres ocupantes. El banco registra entradas efectivas después del desplazamiento hasta una puerta; no cuenta las reservas como ocupación. Las pruebas específicas verifican protección, conservación de salud/munición/supresión, salidas, ventanas, bloqueo por otras paredes y ocultación de ocupantes enemigos.

## Tamaño de los estados

| Mapa, 120 unidades sostenidas |    Estado medio / p95 | Por cliente a 5 Hz, media / p95 |
| ----------------------------- | --------------------: | ------------------------------: |
| Valle                         | 51.097 / 53.662 bytes |       255.485 / 268.310 bytes/s |
| Cuenca                        | 51.588 / 55.195 bytes |       257.939 / 275.975 bytes/s |
| Frontera                      | 52.955 / 57.674 bytes |       264.776 / 288.370 bytes/s |
| Estuario                      | 61.851 / 68.961 bytes |       309.257 / 344.805 bytes/s |

Son tamaños del JSON completo, con el estado de edificios filtrado por niebla. Incluyen los nuevos campos que distinguen detección normal y revelado visual, pero no miden la carga adicional de activar el revelado. Excluyen WebSocket/TLS, compresión, latencia, pérdidas y transporte por Internet. En Estuario, dos jugadores con esta carga suponen aproximadamente **619 kB/s** de salida media. Conviene medir sesiones largas y estudiar estados incrementales antes de ampliar participantes o unidades.

## Dibujo en el ordenador

Medición separada del **2 de octubre a las 00:24, hora de Madrid** (1 de octubre a las 22:24 UTC), con Edge/Chromium, ventana de 1440 × 900 y WebGL mediante la **RTX 3060**. Colocación sintética de 120 unidades reales, todas visibles, durante seis segundos por mapa. El estado sustituido se inyecta solo en un contexto de prueba aislado; esa función no existe en producción. No mide una partida completa ni combate sostenido. Datos: [RENDER-MEDICION.json](RENDER-MEDICION.json).

| Mapa     | FPS observados | Intervalo medio / p95 | Llamadas de dibujo | Triángulos |
| -------- | -------------: | --------------------: | -----------------: | ---------: |
| Valle    |            237 |        4,23 / 4,30 ms |                203 |     61.964 |
| Cuenca   |            235 |        4,25 / 4,30 ms |                210 |     96.918 |
| Frontera |            235 |        4,26 / 4,30 ms |                215 |    122.136 |
| Estuario |            236 |        4,24 / 4,30 ms |                221 |    216.766 |

Los árboles comparten geometría mediante instancias. Suelo, edificios y partes fijas de las unidades se agrupan para reducir llamadas de dibujo. En v0.4, los colores de paredes, tejados y unidades se guardan por vértice para combinar geometrías que antes necesitaban materiales separados. Se conservan los volúmenes y detalles añadidos: Estuario pasa de **386 llamadas y 150.334 triángulos en v0.3** a **221 llamadas y 216.766 triángulos en v0.4**. Son un **42,7 % menos de llamadas**, con un **44,2 % más de triángulos**. No se quitaron edificios ni vegetación funcional para obtener estos resultados.

La niebla se actualiza cada 700 ms con una cuadrícula de 8 unidades y 96 rayos por observador o ventana. Es una aproximación visual del terreno visible; el servidor decide la detección exacta. El revelado autorizado puede añadir enemigos ocultos al estado de un jugador y los marca como mostrados sin detección. No despeja la niebla real ni modifica la percepción, los blancos automáticos o la IA. Al ocultarlos, el estado vuelve a contener únicamente los enemigos detectados normalmente.

Repetición: iniciar el servidor, disponer de Playwright y Edge, y ejecutar `node tests/render-benchmark.mjs`. `PLAYWRIGHT_MODULE`, `BROWSER_CHANNEL` y `GAME_URL` indican la instalación y dirección usadas. Estas cifras de escritorio no acreditan 235–237 FPS en un teléfono.

## Pendiente en Safari y entre dispositivos

Objetivo móvil provisional: **30 FPS** en horizontal, unos 33,3 ms por imagen. Referencias propuestas: iPhone 12 y iPad de 9.ª generación. **No se ha tenido acceso físico a esos equipos.** No se han medido en ellos FPS, memoria, temperatura, batería, instalación desde Safari ni comportamiento desde la pantalla de inicio.

Quedan pendientes diez minutos de juego en cada dispositivo real, al menos dos con 120 unidades visibles, y pruebas de interrupción y recuperación de conexión entre dos redes. Las pruebas táctiles y de tamaños de pantalla ejecutadas en el ordenador, y los clientes WebSocket locales, no sustituyen esas comprobaciones. El límite se mantiene en **120 unidades totales**; no se ha reducido para estos mapas ni se afirma que sea el máximo posible en un iPhone.
