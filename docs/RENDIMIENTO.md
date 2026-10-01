# Rendimiento: medición inicial y objetivo móvil

## Qué se ha medido

Medición ejecutada el **1 de octubre de 2026**, en Windows x64 con Node **v24.19.0**. Equipo de escritorio de esta sesión: Ryzen 9 5900X, RTX 3060 y 32 GB de RAM. La prueba usa CPU; no mide la GPU ni dibuja el juego.

Para repetirla desde la carpeta del proyecto:

```sh
node tests/benchmark.mjs
```

El programa ejecuta las reglas reales, con semilla `20261001`, a pasos de 0,1 segundos. Crea dos equipos de 60 unidades, concede presupuesto inicial al escenario de prueba y compra las unidades mediante las órdenes normales. No sustituye el movimiento, la visibilidad, el combate ni las capturas por funciones simuladas. El presupuesto ampliado es una condición del banco de pruebas, no una regla de las partidas normales.

Cada escenario registra **1.000 pasos / 100 segundos de partida**. Mide por separado la simulación y la creación más serialización de cada estado para un cliente. Obtiene dos estados cada 0,2 segundos, equivalentes a 5 actualizaciones por segundo y jugador. Los tiempos de enviar nuevas órdenes se excluyen de la columna de simulación. Los resultados cambian según el equipo y su carga; no son límites garantizados.

| Escenario | Unidades iniciales / finales | Simulación media / p95 | Estado JSON por cliente, media / p95 |
| --- | ---: | ---: | ---: |
| 120 unidades sostenidas, movimiento y visibilidad | 120 / 120 | 0,469 / 1,125 ms | 0,341 / 0,727 ms |
| Combate con nueve clases | 120 / 9 | 0,255 / 0,985 ms | 0,200 / 0,729 ms |

El primer escenario usa unidades antiaéreas terrestres: pueden moverse y disputar sectores, pero no se disparan entre sí. Permite mantener 120 unidades reales durante toda la medición y ejercita la visibilidad y los estados grandes. No mide combate sostenido entre 120 unidades.

El segundo sí mide combate. Registró **479 disparos, 102 explosiones y 111 bajas**; la supresión alcanzó 1. La población media fue de 33,488 unidades. La caída de población explica parte de sus tiempos menores: no debe presentarse como una medición con 120 unidades permanentes.

La comprobación adicional de una partida completa dio victoria por agotamiento de puntos al equipo 0, con los tres sectores capturados: **194,1 segundos de partida / 1.941 pasos**, ejecutados en 17,803 ms. Es un escenario de órdenes programadas para validar el final de partida, no una medida de dificultad de la IA ni una partida jugada por una persona. Las pruebas de la IA están en `tests/simulation.test.mjs`.

## Tamaño de los estados y red

| Escenario | Estado medio / p95 | Por cliente a 5 Hz, media / p95 |
| --- | ---: | ---: |
| 120 unidades sostenidas | 35.954 / 38.182 bytes | 179.772 / 190.910 bytes/s |
| Combate con nueve clases | 13.853 / 45.311 bytes | 69.267 / 226.555 bytes/s |

Son tamaños calculados del JSON completo. No incluyen cabeceras WebSocket/TLS, compresión, latencia, pérdidas ni transporte por Internet. El servidor envía un estado diferente a cada jugador para respetar la niebla. En la primera carga, dos clientes requieren aproximadamente 360 kB/s de salida del servidor. Este coste aconseja medir sesiones largas y reducir datos repetidos antes de aumentar mucho el número de jugadores o unidades.

## Objetivo para Safari

Objetivo provisional: **30 imágenes por segundo**, con un presupuesto de aproximadamente 33,3 ms por imagen, en horizontal y con controles táctiles.

Dispositivos de referencia propuestos:

- iPhone 12: A14 y 4 GB de RAM.
- iPad de 9.ª generación: A13 y 3 GB de RAM.

**No se ha tenido acceso físico a esos dispositivos. No se han medido FPS, temperatura, memoria, batería ni instalación desde Safari en ellos.** Los tiempos de Node en este PC no demuestran ese objetivo de FPS. Tampoco acreditan una partida entre dos dispositivos o dos redes.

Prueba pendiente reproducible en cada dispositivo: versión de iOS/iPadOS registrada, Safari y apertura desde pantalla de inicio, gráficos predeterminados, ahorro de batería desactivado, diez minutos de juego y al menos dos minutos con 120 unidades visibles. Registrar tiempo de imagen medio y p95, memoria disponible, calentamiento, interrupción al cambiar de aplicación y recuperación de conexión. Repetir reduciendo resolución, sombras y vegetación antes de considerar cambios en las reglas.

## Alcance de esta versión

La simulación funciona a 10 Hz y está separada del dibujo. El límite provisional sigue en **120 unidades totales**; esta medición no lo ha reducido ni demuestra que sea el máximo posible en un iPhone. Es el tamaño de carga validado para este incremento y debe revisarse con medidas del juego completo en hardware real.

Queda pendiente perfilar la representación 3D, los gestos, el trabajo de la IA en partidas largas y la red real. También conviene medir estados compactos o actualizaciones de cambios para bajar el consumo de datos sin revelar unidades ocultas.
