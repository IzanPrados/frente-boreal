# Estado de Frente Boreal

1 de octubre de 2026 · Prototipo jugable 0.1

**Juego:** https://frente-boreal.onrender.com

**Código:** https://github.com/IzanPrados/frente-boreal

Es un incremento funcional; todavía no completa la profundidad, los gráficos ni las pruebas físicas del objetivo final.

## Construido

- Juego original en español con terreno y unidades 3D de pocos polígonos, cámara, zoom, selección múltiple, grupos y órdenes explícitas.
- Mapa Valle de la Bruma: tres sectores, río con pasos transitables, carreteras, bosque y poblaciones. Movimiento, cobertura y obstrucción de visión afectan al combate.
- Nueve clases: infantería, carro, transporte con embarque/desembarque, reconocimiento, logística, artillería, antiaéreos, helicópteros y aviones. Estadísticas propias.
- Tres grupos de combate predefinidos, presupuesto, refuerzos, ingresos, captura, puntos, tiempo límite y rendición. Munición, suministro finito, reparación, supresión y humo.
- IA por lógica de juego: despliega, disputa objetivos, cambia prioridades y solo reacciona a enemigos detectados.
- Individual en un trabajador del navegador; cooperativo y duelo con autoridad única del servidor. Simulación a 10 Hz, instantáneas filtradas por visión a 5 Hz. Cada persona dirige únicamente sus unidades.
- Sala por código/invitación, equipos, preparación e inicio. Reconexión con credencial y secuencias sin doble gasto; pausa hasta 90 segundos y cierre explícito si no se recupera.
- PWA con iconos, apertura independiente, ajustes y grupo de combate locales, descarga íntegra y actualización solicitada. Individual offline tras descargar los recursos.
- Módulos separados de simulación/datos, representación, controles, interfaz y red; Git local y repositorio público. Sin API de IA ni servicios de pago en el juego.

## Publicación real

Render confirmó **Deploy succeeded / Live** el 1 de octubre a las **20:06:41 UTC / 22:06:41 Madrid**. Se comprobaron también salud, interfaz y partidas mediante la URL pública.

- Free: **0 €/mes, 0,1 CPU, 512 MB; Frankfurt**. Node 22.23.3.
- Servicio: `srv-davbqanlk1mc739fck3g`; primer despliegue: `dep-davbqbflk1mc739fcmn0`.
- Código ejecutado: `38e3e5092c39bbf98a5fd8aa4a212d904ac967be`.
- Cliente HTTPS y servidor WSS comparten origen. No se añadió tarjeta ni se activó facturación, prueba, base de datos o disco de pago. No se cambió el cortafuegos ni se expuso el ordenador.
- El ordenador puede apagarse: Render ejecuta el servidor. El servidor de desarrollo solo escucha en 127.0.0.1.
- Se registró inicialmente un Site, pero no se publicó. El destino activo es Render. `.openai/hosting.json` conserva esa referencia de trabajo y no acredita otro despliegue.

## Probado realmente

**25/25 pruebas Node pasaron:** 15 de simulación y 10 de servidor/red. Cubren combate, órdenes, presupuesto, propiedad, terreno y rutas, visión/humo, IA sin conocimiento oculto, captura, logística, transporte, artillería, AA, determinismo, victoria/rendición, dos clientes TCP/WebSocket, reconexión, confirmación perdida sin doble gasto, expiración y archivos PWA.

**5/5 comprobaciones de navegador pasaron localmente y contra la publicación real:**

1. Duelo en dos contextos aislados: crear/unir/preparar/iniciar, movimiento real, estado coherente, recarga con identidad conservada y final por rendición.
2. Cooperativo: mismas operaciones, ocho unidades aliadas coherentes, retirada como espectador y salida explícita de sala.
3. Teléfono 844 × 390 emulado: arrastre, pellizco, selección y grupos sin recortes ni órdenes accidentales.
4. Tableta 1024 × 768 emulada: mismas comprobaciones.
5. PWA pública: 18 archivos guardados, bloqueo de red del contexto, recarga y partida individual hasta tick 31; cero excepciones de página.

Navegador: Edge/Chromium 154.0.4258.37, contextos sin perfiles personales; GPU identificada RTX 3060 mediante ANGLE/D3D11. El primer intento offline descubrió licencias `.txt` con 404: se corrigió, se añadió regresión y se repitió con éxito. Detalles y capturas: [PRUEBAS-NAVEGADOR.md](PRUEBAS-NAVEGADOR.md).

**Dos contextos de este PC conectados al servidor público no equivalen a dos dispositivos físicos ni a redes distintas.** Gestos y desconexión son emulados; no se probaron Safari ni modo avión físico.

**Rendimiento CPU:** carga sostenida de 120 unidades: simulación media 0,469 ms / p95 1,125 ms; estado por cliente media 0,341 ms / p95 0,727 ms. Combate con bajas medido aparte y victoria territorial comprobada tras 194,1 segundos simulados. La primera inspección gráfica mostró aproximadamente 148 FPS con fuerzas iniciales: muestra corta de escritorio, no estabilidad ni rendimiento móvil. [Condiciones](RENDIMIENTO.md).

## Límites y pendientes

- Instalación desde Inicio, orientación, cambios de aplicación, latencia y desconexión física en iPhone/iPad. Falta una partida en dos dispositivos y redes distintas.
- Objetivo provisional: 30 FPS durante doce minutos en iPhone 12 e iPad de 9.ª generación con iOS/iPadOS 16.4 o posterior. Aún sin medición física.
- Gráficos provisionales; terreno plano, sin elevación, sonido ni animaciones finales. Poblaciones dan cobertura/obstrucción; las fachadas individuales no tienen colisión propia.
- Aviones con movimiento/parada simplificados; faltan pasadas y salida/reentrada. Equilibrio pendiente de partidas humanas prolongadas. Ejércitos predefinidos, sin editor detallado de divisiones.
- Instantáneas JSON completas: unos 180 kB/s por cliente a 120 unidades en el banco de pruebas. Compactar antes de ampliar concurrencia.
- Límites de protección: 120 unidades, ocho salas, 32 conexiones; no garantizan todas esas salas simultáneas en Free.
- Salas en memoria: un reinicio/suspensión del servidor pierde la partida. Reconexión breve solo mientras vive el proceso.
- Render comparte 750 horas mensuales por workspace, duerme por inactividad y puede tardar unos 50–60 segundos en despertar. Tiene cuotas y puede reiniciar/suspender el servicio. [Fuentes y límites gratuitos](INVESTIGACION.md).

## Siguiente paso

Jugar la URL publicada desde Safari en dispositivos físicos, completar una partida con un amigo desde otra red y registrar FPS, temperatura y recuperación de conexión. Ajustar gráficos y tráfico según esas medidas; después ampliar terreno, aviación y configuración del ejército.

