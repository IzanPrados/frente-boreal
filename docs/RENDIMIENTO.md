# Rendimiento: tres mapas y 120 unidades

## Alcance de la medición

Medición del **1 de octubre de 2026**, Windows x64, Node **v24.19.0**, Ryzen 9 5900X, RTX 3060 y 32 GB de RAM. Datos completos: [CPU-MEDICION.json](CPU-MEDICION.json) y [RENDER-MEDICION.json](RENDER-MEDICION.json). Los resultados describen este equipo y estas cargas; no garantizan el rendimiento de Safari ni del servidor gratuito de Render.

Para repetir la medición de simulación:

```sh
node tests/benchmark.mjs
```

El programa usa la simulación del juego, semilla `20261001`, pasos de 0,1 s y dos bandos de 60 unidades. El presupuesto ampliado pertenece al escenario de prueba. Las compras, órdenes, navegación, detección, disparos, daños y capturas siguen las reglas reales.

Cada carga dura **1.000 pasos / 100 segundos simulados**. Se miden por separado el paso de simulación y la creación más serialización JSON de cada estado. Se generan dos estados cada 0,2 segundos, equivalentes a 5 actualizaciones por segundo y jugador. El cálculo de nuevas rutas se mide aparte. Los índices de terreno y navegación de cada mapa se preparan al usarlos por primera vez, fuera de los intervalos medidos de paso y estado.

## Simulación y estados

| Mapa | Carga | Unidades iniciales / finales | Paso medio / p95 | Estado JSON por cliente, medio / p95 |
| --- | --- | ---: | ---: | ---: |
| Valle, 1600 × 1000 | 120 sostenidas | 120 / 120 | 0,261 / 0,699 ms | 0,197 / 0,410 ms |
| Valle | Combate de nueve clases | 120 / 12 | 0,165 / 0,867 ms | 0,163 / 0,652 ms |
| Cuenca, 2400 × 1600 | 120 sostenidas | 120 / 120 | 0,369 / 0,874 ms | 0,221 / 0,447 ms |
| Cuenca | Combate de nueve clases | 120 / 7 | 0,151 / 0,790 ms | 0,136 / 0,508 ms |
| Frontera, 3200 × 2000 | 120 sostenidas | 120 / 120 | 0,388 / 0,858 ms | 0,226 / 0,425 ms |
| Frontera | Combate de nueve clases | 120 / 8 | 0,187 / 0,861 ms | 0,160 / 0,480 ms |

La carga sostenida usa antiaéreos terrestres que se mueven, detectan y disputan sectores, pero no se disparan entre sí. Mantiene 120 unidades durante toda la medición. La carga de combate sí incluye pérdidas: registró 491/443/482 disparos, 107/83/90 explosiones y 108/113/112 bajas en los tres mapas. Sus poblaciones medias fueron 35,561/35,797/42,974; no equivale a combate permanente de 120 unidades.

Objetivos de regresión en este PC: p95 de paso inferior a **10 ms**, p95 de estado inferior a **10 ms** y p95 de orden de grupo inferior a **100 ms**. Dejan margen dentro del paso de 100 ms del servidor. Todos se cumplieron; el programa informa del resultado sin convertir una máquina lenta en un fallo funcional de las reglas.

## Navegación y órdenes de grupo

Se midieron **24 órdenes por mapa**, cada una con 60 unidades, hacia flancos opuestos. Las órdenes calculan rutas reales para cada posición de la formación y fuerzan desvíos por puentes y canales.

| Mapa | Rutas con desvíos | Orden de 60 unidades, media / p95 / máxima |
| --- | ---: | ---: |
| Valle | 1.284 de 1.440 | 8,894 / 9,825 / 13,243 ms |
| Cuenca | 1.284 de 1.440 | 19,393 / 20,799 / 20,822 ms |
| Frontera | 1.440 de 1.440 | 35,371 / 36,186 / 36,883 ms |

La primera medición del mapa grande dio **181,366 ms p95** por orden. Se sustituyó la búsqueda lineal de nodos A* por una cola de prioridad y se guardaron las conexiones transitables de cada mapa. El resultado bajó a **36,186 ms p95**, conservando el terreno y las rutas.

La revisión también corrigió dos fallos de navegación: los segmentos suavizados podían cortar una esquina diminuta de un canal, y un destino válido junto a una orilla podía pertenecer a una celda cuyo centro era agua. Ahora se comprueba la intersección completa con el agua y se conectan los extremos exactos a celdas transitables. Hay pruebas de regresión para ambos casos, rutas desde ambas bases a todos los objetivos nuevos y 600 rutas arbitrarias con semilla en mapas alternados.

## Partidas completas con IA

El banco adicional empieza una partida contra la IA en cada mapa, envía las tres tropas iniciales del jugador a sectores distintos y ejecuta la simulación hasta el final. Es una prueba programada de las reglas, no una partida jugada por una persona.

| Mapa | Tiempo de partida | Pasos | Tiempo de ejecución | Sectores con propietario al final | Final |
| --- | ---: | ---: | ---: | ---: | --- |
| Valle | 203,7 s | 2.037 | 40,985 ms | 3/3 | Victoria de la IA por puntos |
| Cuenca | 177,0 s | 1.770 | 27,104 ms | 5/5 | Victoria de la IA por puntos |
| Frontera | 179,1 s | 1.791 | 44,996 ms | 7/7 | Victoria de la IA por puntos |

## Tamaño de los estados

| Mapa, 120 unidades sostenidas | Estado medio / p95 | Por cliente a 5 Hz, media / p95 |
| --- | ---: | ---: |
| Valle | 40.939 / 43.081 bytes | 204.693 / 215.405 bytes/s |
| Cuenca | 40.360 / 43.346 bytes | 201.798 / 216.730 bytes/s |
| Frontera | 39.674 / 43.535 bytes | 198.368 / 217.675 bytes/s |

Son tamaños del JSON completo. No incluyen WebSocket/TLS, compresión, latencia, pérdidas ni transporte por Internet. En Frontera, dos jugadores con esta carga requieren aproximadamente **397 kB/s** de salida. La niebla se filtra por jugador. Conviene medir sesiones largas y estudiar estados incrementales antes de aumentar el límite de unidades o el número de participantes.

## Dibujo en el ordenador

Prueba separada con Edge/Chromium, ventana de 1440 × 900, WebGL mediante la **RTX 3060**. Usa una colocación sintética de 120 unidades reales, todas visibles, y seis segundos de muestreo por mapa. El estado llega a una instancia aislada del navegador para cargar el dibujo; esa sustitución no existe en producción. No mide una partida completa ni combate sostenido.

| Mapa | FPS observados | Intervalo medio / p95 | Llamadas de dibujo | Triángulos |
| --- | ---: | ---: | ---: | ---: |
| Valle | 240 | 4,17 / 4,30 ms | 369 | 24.632 |
| Cuenca | 240 | 4,17 / 4,30 ms | 373 | 36.616 |
| Frontera | 240 | 4,17 / 4,30 ms | 377 | 45.440 |

Las tres mediciones alcanzaron el límite observado de 240 FPS. Unir las piezas estáticas de cada unidad por material redujo en el mapa grande las llamadas de dibujo de 957 a 377, manteniendo los 45.440 triángulos. También se indexó el terreno y se optimizó el dibujo de la visión. No se eliminó la complejidad táctica para alcanzar estas cifras.

Para repetir esta parte: iniciar el servidor local, disponer de Playwright y Edge, y ejecutar `node tests/render-benchmark.mjs`. `PLAYWRIGHT_MODULE`, `BROWSER_CHANNEL` y `GAME_URL` permiten indicar la instalación y dirección usadas.

## Pendiente en Safari y entre dispositivos

Objetivo móvil provisional: **30 FPS** en horizontal, unos 33,3 ms por imagen. Referencias propuestas: iPhone 12 y iPad de 9.ª generación. **No se ha tenido acceso físico a esos equipos.** No se han medido en ellos FPS, memoria, temperatura, batería, instalación desde Safari ni comportamiento desde la pantalla de inicio.

Quedan pendientes diez minutos de juego en cada dispositivo real, al menos dos con 120 unidades visibles, y pruebas de interrupción y recuperación de conexión entre dos redes. Las pruebas táctiles y de tamaños de pantalla ejecutadas en el ordenador, y los clientes WebSocket locales, no sustituyen esas comprobaciones. El límite se mantiene en **120 unidades totales**; no se ha reducido para estos mapas ni se afirma que sea el máximo posible en un iPhone.
