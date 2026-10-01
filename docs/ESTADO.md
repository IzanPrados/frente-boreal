# Estado de Frente Boreal 0.4

Actualización del proyecto existente · 2 de octubre de 2026

**[Juego](https://frente-boreal.onrender.com)** · **[Código](https://github.com/IzanPrados/frente-boreal)**

## Alcances e identificación

| Infantería | Antes | Ahora |  Cambio |
| ---------- | ----: | ----: | ------: |
| Visión     |   205 |   250 | +22,0 % |
| Disparo    |   150 |   185 | +23,3 % |

Son unidades internas del mapa, centralizadas en `shared/data.mjs`. No son estadísticas oficiales de WARNO. La velocidad sigue en 35: el radio de disparo equivale a 5,29 segundos de desplazamiento, antes 4,29. La visión supera al disparo en 65 unidades, antes 55. En Valle, el radio de tiro pasa del 9,38 % al 11,56 % de la anchura; en Estuario, del 3,13 % al 3,85 %. Jugadores e IA usan los mismos valores. Las otras ocho clases conservan sus estadísticas y escalas.

Los edificios tienen geometría 3D real: tejados inclinados o planos, fachadas con relieve, puertas, ventanas y variaciones de color. Mantienen huella, altura y accesos del terreno funcional. Sombras proyectadas sencillas y luz direccional ayudan a leer su volumen. No se añadió simulación de interiores ni sombras dinámicas costosas.

Las nueve clases tienen modelos diferenciados: grupo de soldados, tanque, transporte, reconocimiento, camión logístico, artillería, antiaéreo, helicóptero y avión. El juego sigue teniendo una única clase funcional de infantería. Pintura de bando y símbolos compactos combinan color y forma: círculo propio, cuadrado aliado y rombo enemigo; el borde discontinuo señala tropas solo reveladas. La selección se marca en dorado, con nombres limitados a una sola unidad seleccionada. Los indicadores propios permiten localizar y seleccionar tropas tapadas por árboles o edificios.

## Revelado autorizado

**Permitir mostrar tropas enemigas** está desactivado por defecto. Se guarda con la última configuración y Restaurar lo desactiva. En red lo decide el anfitrión antes de empezar; ambos participantes ven el permiso y cualquier cambio reinicia su estado de preparados. Al comenzar queda congelado y la autoridad rechaza el revelado si no estaba permitido.

Con permiso aparece **Mostrar enemigos / Ocultar enemigos**, independiente para cada jugador en individual, cooperativo y PvP. También funciona durante una pausa manual. Reconectar recupera la preferencia personal; una nueva partida comienza con el botón apagado.

El estado distingue `detected` de `displayOnly`. Mostrar posiciones no cambia detección, niebla explorada, alcance, tiro, órdenes o conocimiento de la IA. Al ocultar, el siguiente estado vuelve a filtrar las tropas y la ocupación desconocidas, y el cliente retira modelos e información contextual adicional. No se entregan reservas u órdenes enemigas. Los ocupantes enemigos aparecen como indicación del edificio; sus modelos no atraviesan paredes. Los pasajeros transportados no aparecen como tropas independientes.

## Terreno y mapas

Se conservan los tres escenarios anteriores, con poblaciones conectadas, calles, edificios y vegetación revisados. Llanura del Estuario mide **4800 × 3000**, frente a **3200 × 2000** del mayor anterior: **2,25 veces su superficie jugable**.

| Escenario                   | Dimensiones | Objetivos | Edificios sólidos |
| --------------------------- | ----------- | --------: | ----------------: |
| Valle de la Bruma           | 1600 × 1000 |         3 |                 6 |
| Cuenca del Norte            | 2400 × 1600 |         5 |                14 |
| Frontera de los Siete Pasos | 3200 × 2000 |         7 |                28 |
| Llanura del Estuario        | 4800 × 3000 |         9 |                96 |

El Estuario tiene 84 edificios ocupables, cinco puentes, poblaciones, carreteras laterales, bosques y rutas de flanqueo. Los elementos nuevos tienen correspondencia a 180 grados para mantener aproximaciones equivalentes entre bandos. Cámara, vista general y minimapa leen las dimensiones de cada escenario.

Árboles aislados, arboledas y bosque denso afectan de forma distinta a detección, protección y velocidad. La vegetación atenúa los rayos según el tramo atravesado. Las casas dibujadas son los mismos obstáculos que usa la simulación: bloquean movimiento terrestre, visión y tiro directo según la altura. La artillería conserva el fuego indirecto.

Detección, alcance y tiro se comprueban por separado. Un aliado puede detectar un enemigo detrás de una casa, pero una unidad sin tiro válido sigue su camino. El combate automático conserva destino y objetivo estable; Alto y las nuevas órdenes sustituyen la ruta anterior.

## Ocupación real

- La infantería reserva plazas de forma atómica, camina hasta una puerta y entra al llegar. Cambiar la orden o morir libera reservas. Los bandos enemigos no comparten edificio.
- Conserva salud, munición, supresión y demás estado. La protección propia del edificio comienza dentro; sigue siendo vulnerable.
- Dispara desde ventanas exteriores válidas, comprobando la pared propia y otros obstáculos.
- Salir utiliza posiciones transitables y separadas. Mover desde dentro sale y continúa. Si todos los accesos están bloqueados, la orden se rechaza sin sacar tropas a puntos inválidos.
- El panel contextual muestra plazas, reservas y tropas del propio equipo. No publica reservas enemigas; los ocupantes enemigos aparecen si son detectados o mediante revelado autorizado, con esa diferencia indicada.
- La IA ocupa posiciones útiles junto a objetivos y combate contra posiciones detectadas. No se simulan habitaciones ni destrucción de edificios.

## Pausa y velocidad

Pausa, 0,5×, 1× y 2× controlan toda la simulación mediante pasos fijos de 0,1 segundos: movimiento, fuego, proyectiles, recarga, humo, suministro, captura, ingresos e IA. Los recursos por minuto de partida permanecen iguales y el multiplicador se aplica una sola vez.

En pausa siguen funcionando cámara, zoom, selección y consulta de edificios. Hasta 64 órdenes por jugador pueden quedar preparadas; no crean unidades, reservan plazas ni gastan recursos antes de reanudar. Se validan otra vez al ejecutarse y avisan si ya no pueden cumplirse. Rendirse y abandonar siguen disponibles como decisiones de sesión.

**Cualquiera de los dos compañeros** puede cambiar el tiempo. El servidor ordena las peticiones, aumenta su revisión y distribuye el nombre de quien lo cambió. La comunicación continúa y reconectar recupera reloj y órdenes. Uno contra uno conserva 1×.

La suspensión individual al abrir menús o pasar a segundo plano es independiente del reloj manual. Los intervalos largos no se recuperan como una ráfaga de simulación.

## Interfaz y funciones conservadas

Se conserva la interfaz compacta con un solo panel secundario abierto. La información de edificios aparece al solicitarla; las casas compatibles se señalan al seleccionar infantería. Los indicadores propios permiten seleccionar entre árboles. El reloj usa botones de 44 px y una línea discreta con estado y autor.

Se mantienen individual contra IA, cooperativo, PvP, grupos, refuerzos, transporte, humo, logística, artillería, configuración compartida de recursos/ingresos/duración/puntos y último ajuste local. Geometría y texturas propias originales; licencias de Three.js y ws incluidas.

## Pruebas realmente ejecutadas

- **94/94 pruebas Node**, incluida simulación real con casos programados: paredes y alturas, vegetación, ventanas, protección, capacidad, estado conservado, salidas bloqueadas, privacidad, IA y funciones anteriores.
- Se añadieron nueve casos de alcances y revelado, cinco de autoridad/red/worker y tres de geometría e identificación. Incluyen objetivos en las nuevas franjas de visión y disparo, obstáculos, permiso prohibido y autorizado, preferencia independiente en PvP y cooperativo, pasajeros y edificios, y 600 pasos de IA idénticos con/sin proyecciones reveladas. La geometría de todos los edificios se comprueba contra su huella y altura.
- Las pruebas de servidor usan TCP/WebSocket local real. Ambos compañeros pueden cambiar el tiempo, incluso con peticiones casi simultáneas; revisiones idénticas, reconexión, idempotencia y PvP a 1×. El permiso bloqueado en la partida prevalece sobre peticiones del cliente.
- Un minuto de juego a 0,5×, 1× y 2× produce un estado completo idéntico: IA, economía, artillería, recargas, humo y suministro. Pausa y suspensión congelan los efectos.
- Dos clientes locales preparan entradas, salidas y movimiento desde edificios; reservas, llegada a puertas, ocupación y destinos coinciden, sin efectos antes de reanudar.
- Rutas a todos los objetivos desde ambas bases y a todas las puertas. Comprobación adicional de **4000 rutas aleatorias con semilla**: ninguna vacía ni atravesando agua o edificios, con muestreo cada cuatro unidades.
- Partidas completas programadas de IA en los cuatro mapas. En el banco de rendimiento, Estuario terminó a **220,4 segundos de juego**, cinco entradas efectivas y un pico de tres ocupantes. No fue una partida humana.
- Compilación estática y PWA reproducible: **25 recursos**, incluidos terreno, reloj, máscara de visión y nuevos modelos/símbolos.

**12/12 comprobaciones de navegador locales y 12/12 sobre la URL pública**: PvP, cooperativo con control de tiempo por ambos jugadores y reconexión en pausa, cuatro tamaños de pantalla (844 × 390, 390 × 844, 1024 × 768 y 768 × 1024), cambio de cuatro mapas, ocupación real mediante la interfaz en Valle/Estuario y PWA sin conexión con 25 recursos. También se comprobó revelado independiente, permiso visible antes de preparados, encendido durante pausa, apagado que elimina información adicional y ocupación enemiga real que desaparece del panel al ocultar. Cero errores de página. Botones de al menos 44 px, sin paneles o botones recortados; 82–93 % de puntos muestreados del mapa libres durante observación inicial. El botón nuevo se revisó además en anchos de 320, 350 y 375 px. Órdenes preparadas sin efecto en pausa, entrada caminando, panel de ocupantes, salida y economía comprobados por controles reales.

Registro público con ejecuciones fechadas: [PRUEBAS-NAVEGADOR.md](PRUEBAS-NAVEGADOR.md). Registro final local: [PRUEBAS-LOCALES-V04.md](PRUEBAS-LOCALES-V04.md). Son contextos aislados de Edge/Chromium en Windows; gestos y tamaños de dispositivo emulados. La prueba offline bloquea la red del contexto, llega al tick 31 en Estuario y permite alternar revelado.

## Rendimiento

Ryzen 9 5900X, Node 24: Estuario con 120 unidades sostenidas, **0,878 ms p95** por paso, **0,629 ms p95** por estado JSON y **49,359 ms p95** por orden de 60 unidades. Índice espacial de edificios, caché de rutas acotada y conectores exactos comprobados.

RTX 3060: colocación sintética de 120 unidades visibles durante seis segundos a 1440 × 900, **236 FPS** en Estuario, 216766 triángulos y 221 llamadas de dibujo. La versión 0.3 tenía 150334 triángulos y 386 llamadas: se conserva el detalle añadido y se agrupan las partes fijas de cada unidad usando colores por vértice. Árboles por instancias y edificios agrupados. La niebla visual se calcula cada 700 ms y es una aproximación; la detección de enemigos procede siempre de la simulación autoritativa. [Condiciones y datos](RENDIMIENTO.md).

## Publicación

Render confirmó **Deploy succeeded / Live** el 2 de octubre de 2026, a las **00:31:43 de Madrid**. Despliegue: `dep-davdu8psrm7s73bkmg70`. Código ejecutado: `78905ff56eeb05997493c174ed21c7d7194a66fd`. PWA 0.4.0: `22da24dbfd0bacdaf16b`. Se compararon catorce archivos públicos principales con los locales, además de versión/revisión del manifiesto y salud del servidor.

Se conserva el servicio Render existente, Free, sin tarjeta, suscripción ni servicios de pago nuevos. El servidor local solo escucha en 127.0.0.1. Los commits posteriores de documentación y pruebas no alteran el código ejecutado.

Para actualizar: abrir con Internet y pulsar **Actualizar** cuando se ofrezca en operaciones, después de terminar la partida. La PWA conserva la versión anterior hasta completar y verificar la descarga.

## Límites pendientes

- Sin pruebas físicas de Safari, iPhone, iPad o instalación desde Inicio. Faltan orientación, bordes seguros, segundo plano, temperatura y rendimiento durante partidas largas en hardware Apple.
- Dos contextos del mismo PC, incluso sobre el servidor público, no equivalen a dos dispositivos ni a dos redes distintas.
- Render Free puede dormir o reiniciarse. Las salas viven en memoria; se pierden al reiniciar. Reconexión de hasta 90 segundos mientras vive el proceso.
- No se ha medido la capacidad de ocho salas simultáneas en Free. Los estados completos con 120 unidades pueden superar 560 kB/s entre dos clientes; faltan medidas de tráfico y latencia móvil.
- Terreno plano, gráficos sencillos, interiores abstractos y aviación simplificada. El equilibrio humano de mapas y posiciones necesita partidas reales.
