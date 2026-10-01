# Frente Boreal

Prototipo editable de combate táctico en tiempo real para navegador, con gráficos 3D sencillos y controles táctiles. Proyecto original e independiente; WARNO es una referencia de diseño, no un producto incluido ni una afiliación.

**[Jugar ahora](https://frente-boreal.onrender.com)** · **[Código en GitHub](https://github.com/IzanPrados/frente-boreal)**

Publicación real en Render Free, Frankfurt. No hace falta dejar encendido tu ordenador. La instancia puede dormir por inactividad y tardar aproximadamente un minuto en despertar. El modo individual y ambos modos multijugador están implementados; las pruebas físicas de Safari y de dos dispositivos/redes siguen pendientes.

En el ordenador de esta entrega también puedes abrir `Iniciar-juego.cmd`: usa Node ya disponible y escucha solo en este equipo. Si arrancas desde una copia nueva, instala primero las dependencias como se indica debajo.

La versión 0.3 añade edificios sólidos y ocupables, vegetación diferenciada, pausa y velocidades compartidas en cooperativo, y un cuarto mapa de 4800 × 3000. Conserva la interfaz contextual, el combate automático durante el movimiento y los ajustes de partida compartidos. El registro de implementación, pruebas y límites está en [docs/ESTADO.md](docs/ESTADO.md).

## Ejecutar en tu ordenador

Requisitos: Node.js 22 o posterior y npm. Abre una terminal en esta carpeta:

```powershell
npm install
npm run prepare:assets
npm start
```

Abre [Frente Boreal local](http://127.0.0.1:8787). Mantén la terminal abierta mientras uses este servidor; puedes detenerlo con `Ctrl+C`.

La dirección `127.0.0.1` funciona únicamente en el ordenador que lo ejecuta. El servidor escucha ahí de forma predeterminada; esta orden no expone el ordenador a Internet ni cambia el cortafuegos.

Si utilizas pnpm, el proyecto incluye `pnpm-lock.yaml`: puedes instalar con `pnpm install --frozen-lockfile` y ejecutar los mismos scripts mediante `pnpm run`.

## Jugar

- **Individual:** «Jugar contra la IA», configura la operación y comienza. La simulación se ejecuta en un trabajador del navegador; después de guardar correctamente la PWA, este modo puede abrirse sin conexión.
- **Cooperativo:** crea «Cooperativo vs. IA», comparte la invitación o el código y espera al segundo jugador. Ambos controláis vuestro ejército dentro del mismo equipo.
- **Uno contra uno:** crea la sala, comparte el código, asigna equipos opuestos y marca la preparación antes de iniciar.
- **Victoria:** disputa los objetivos del escenario. La ventaja territorial reduce los puntos del adversario. La partida termina al agotar sus puntos o al alcanzar el tiempo límite.

### Ajustes y mapas

Antes de iniciar o crear una sala se eligen recursos iniciales (0–10000), ingresos (0,5× / 1× / 2× / 3× / 5×), límite total de unidades (24–120), duración (3–60 minutos), puntos (100–2000) y escenario. El saldo inicial se añade a las tropas de partida; el multiplicador afecta solo a los 6 recursos por segundo, con las mismas reglas para cada humano y la IA. Los precios permanecen iguales. El botón de restauración recupera 410 recursos, 1×, 120 unidades, 12 minutos y 300 puntos.

| Escenario | Tamaño | Objetivos |
|---|---|---:|
| Valle de la Bruma | Compacto · 1600 × 1000 | 3 |
| Cuenca del Norte | Mediano · 2400 × 1600 | 5 |
| Frontera de los Siete Pasos | Grande · 3200 × 2000 | 7 |
| Llanura del Estuario | Extenso · 4800 × 3000 | 9 |

Cada tamaño tiene un trazado propio. El Estuario tiene 2,25 veces la superficie del mayor anterior, 96 edificios, 84 ocupables, poblaciones conectadas y cinco puentes. Los tres mapas anteriores se conservan y mejoran. Las carreteras aceleran; vegetación, humo y paredes afectan a la visión. El agua se cruza por pasos transitables. En sala, todos ven los ajustes del anfitrión antes de prepararse. Cualquier cambio cancela la preparación de ambos; al empezar quedan bloqueados. La última configuración se guarda en el dispositivo.

### Controles

| Acción | Táctil y ratón |
|---|---|
| Mover cámara | Arrastrar el mapa. |
| Zoom | Pellizcar con dos dedos; rueda del ratón o botones + y − en «Mapa». «Vista general» encuadra todo el escenario. |
| Seleccionar | Tocar una unidad propia. «＋▣» permite añadir varias. |
| Guardar grupo | Abrir «Grupos», «Guardar selección» y después 1, 2 o 3. Tocar el número recupera el grupo. |
| Dar orden | Seleccionar tropas, elegir «Mover» o «Avanzar y atacar» y tocar el destino. |
| Embarcar | Seleccionar infantería, elegir «Embarcar» y tocar un transporte propio cercano. |
| Refuerzos | Elegir una unidad y colocarla dentro de tu zona de despliegue. |
| Más acciones y estadísticas | Botón «•••» de la selección; estadísticas bajo demanda. |
| Cancelar orden pendiente | Tocar «Cancelar ×» o Escape, antes de elegir destino. |
| Ocupar edificio | Seleccionar infantería, tocar un edificio compatible y pulsar «Entrar». También está en «•••». |
| Ver ocupantes y salir | Tocar la posición ocupada; seleccionar una unidad propia del panel o pulsar «Salir». Mover desde dentro ordena salir y continuar. |
| Pausa y velocidad | «Ⅱ», «0,5×», «1×» y «2×». Disponible contra IA y cooperativo; cualquiera de los compañeros controla el reloj. |

Mover y Avanzar y atacar detienen la unidad ante un enemigo válido, conservan el destino y continúan al perder el objetivo; no persiguen fuera de alcance. «Alto» cancela el destino. El humo es una habilidad y conserva la ruta. Arrastrar mueve la cámara aunque haya una orden seleccionada. Los paneles se abren de uno en uno; funcionan en horizontal y vertical.

### Terreno y ocupación

Árboles aislados, arboledas y bosque denso tienen distintas propiedades de ocultación, paso y protección. Los indicadores propios permanecen seleccionables. Detectar un enemigo con otra unidad no permite disparar a través de una pared. La artillería conserva su fuego indirecto; la aviación puede ver o disparar por encima de obstáculos según las alturas del rayo y del edificio.

Las casas dibujadas corresponden a obstáculos reales. La infantería reserva plaza, camina hasta una puerta y solo recibe protección al entrar. Ocupantes y reservas no pueden superar la capacidad ni mezclar bandos. Dentro conserva su estado y combate desde ventanas exteriores válidas; otras paredes siguen bloqueando. Salir utiliza posiciones exteriores transitables y separadas. La IA puede ocupar edificios próximos a objetivos. La ocupación enemiga no aparece automáticamente a través de la niebla. No hay interiores ni destrucción de edificios.

### Tiempo compartido

La pausa mantiene cámara, zoom, selección y consulta de información. Las órdenes quedan preparadas y sus efectos se aplican al reanudar: no se gastan recursos ni se despliegan tropas durante la pausa. Se validan otra vez al ejecutarse; una orden imposible muestra un aviso. Máximo 64 órdenes preparadas por jugador. Rendirse y abandonar siguen disponibles como decisiones de sesión.

0,5×, 1× y 2× cambian todo el tiempo de juego, incluidos combate, ingresos e IA. Los recursos por minuto de partida permanecen iguales. En cooperativo ambos reciben un único reloj y el nombre de quien lo cambió; reconectar conserva ese estado. Uno contra uno mantiene 1× y sus reglas anteriores. El tiempo transcurrido durante una pausa o una suspensión no se recupera de golpe.

## Qué significa «multijugador» aquí

Un proceso Node mantiene el estado válido de la partida y ejecuta su IA. Los clientes envían órdenes; el servidor valida propietario, recursos y reglas antes de aplicarlas. Cada equipo recibe su visibilidad. Las partidas compartidas necesitan una conexión WebSocket con ese servidor.

| Situación | Qué permite |
|---|---|
| Dos pestañas en `127.0.0.1` | Verificar comunicación real entre clientes en el mismo ordenador. |
| Dos dispositivos de una red local | Requiere que el propietario configure deliberadamente una dirección LAN. No demuestra acceso desde redes distintas. |
| Dos dispositivos en redes distintas | Requiere publicar el servidor y el cliente, o conectar el cliente a un servidor público autorizado. |
| PWA sin Internet | Modo individual tras una primera descarga completa. No conecta a otro jugador. |

Si se pierde temporalmente un participante, la partida compartida se pausa y permite recuperar la conexión hasta 90 segundos. Las salas viven en memoria: si se reinicia el servidor, la sala se pierde y hay que crear otra. No hay cuentas obligatorias para los jugadores.

Variables disponibles del servidor:

| Variable | Valor predeterminado | Uso |
|---|---|---|
| `HOST` | `127.0.0.1` | Interfaz de escucha. El alojamiento público necesita `0.0.0.0`. |
| `PORT` | `8787` | Puerto; Render proporciona el suyo. |
| `ALLOWED_ORIGINS` | Política del mismo origen | Lista de orígenes exactos separados por comas si se aloja el cliente por separado. |

Cambiar `HOST` a `0.0.0.0` en tu ordenador permite conexiones desde otras interfaces y requiere una decisión expresa del propietario. Este proyecto no abre puertos del router ni modifica reglas de seguridad.

## Instalar como PWA en iPhone/iPad

Primero hace falta una dirección **HTTPS publicada**; `127.0.0.1` en el móvil se refiere al propio móvil. Una dirección HTTP de la LAN puede servir para probar la interfaz, pero no equivale a una instalación PWA con las condiciones de seguridad requeridas.

1. Abre la dirección HTTPS del juego en Safari con conexión.
2. Espera a que termine la preparación para uso sin conexión.
3. Abre «Compartir», elige «Añadir a pantalla de inicio» y, cuando aparezca, activa «Abrir como app».
4. Abre el icono Frente Boreal. Usa preferentemente la orientación horizontal.
5. Cuando se ofrezca una actualización, termina antes la partida y pulsa «Actualizar».

El sistema guarda una versión completa con comprobación de integridad de sus archivos. Una actualización incompleta conserva la anterior. El código no fuerza una actualización durante una partida. Los ajustes y la selección de grupo de combate son locales al navegador/dispositivo; borrar los datos del sitio los elimina.

Safari debe permitir almacenamiento local y service workers. El sistema operativo puede retirar archivos almacenados; si falta alguno, vuelve a abrir con conexión. La instalación, los gestos y el rendimiento en hardware Apple real deben verificarse según el registro de pruebas.

## Publicar gratis con Render

Esta entrega ya está publicada en la dirección indicada arriba. `render.yaml` permite reproducir **una instancia web Free** para servir cliente y WebSocket juntos; los pasos siguientes son para otro despliegue. Los cambios en un repositorio público conectado manualmente pueden requerir «Manual Deploy» en Render.

1. Inicia sesión directamente en Render y en tu proveedor Git, sin compartir contraseñas ni tokens en el chat.
2. Sube el proyecto a un repositorio autorizado e importa `render.yaml` mediante un Blueprint, o crea un Web Service con los valores de ese archivo.
3. Comprueba **plan Free**, Node 22, compilación `npm install --omit=dev && npm run prepare:assets`, arranque `npm start`, `HOST=0.0.0.0` y salud `/health`.
4. No añadas tarjeta, facturación por consumo, prueba de pago ni servicio adicional. Si la cuenta exige tarjeta para verificarse, detén ese alta: no cumple la condición de cero pagos/tarjetas del proyecto.
5. Tras el despliegue, abre la URL HTTPS que Render asigne y comprueba dos dispositivos desde redes distintas. El campo «Servidor multijugador» puede quedar vacío cuando cliente y servidor comparten origen.

Condiciones verificadas documentalmente el 1 de octubre de 2026: 750 horas gratuitas al mes por workspace, reposo tras 15 minutos sin tráfico entrante, arranque posterior de aproximadamente un minuto, disco efímero y posibles reinicios. La actividad WebSocket entrante cuenta para evitar el reposo durante partidas. Al agotar cuotas sin método de pago se suspenden servicios o compilaciones. Render no recomienda Free para producción. [Límites oficiales](https://render.com/docs/free), [WebSocket](https://render.com/docs/websocket) y [condiciones de facturación](https://render.com/docs/faq).

El plan gratis permite probar con un amigo sujeto a sus cuotas. No garantiza un servicio permanente. No añadas pings externos para mantenerlo despierto artificialmente. El proyecto no usa API de IA, modelos de pago ni anuncios.

## Compilar y comprobar

```powershell
npm test
npm run build
```

`build` prepara dependencias e iconos, comprueba la lista de archivos necesarios y crea `dist/`. Solo reemplaza esa carpeta, verificando que esté dentro del proyecto y que no sea un enlace. `dist/` contiene el cliente estático y el modo individual; el servidor está en `server/` y hace falta para las partidas compartidas. No abras `index.html` con `file://`: usa el servidor local o alojamiento HTTPS.

Después de cambiar cliente, simulación, datos, manifest o recursos públicos, vuelve a ejecutar `npm run prepare:assets` antes de probar la PWA. Su versión de caché se calcula a partir del contenido, por lo que la actualización se detecta sin editar números manualmente. Para desarrollar sin caché antigua, elimina el registro del service worker en las herramientas del navegador o acepta la nueva versión.

Las pruebas automatizadas no sustituyen una partida real en dos dispositivos. [ESTADO](docs/ESTADO.md) separa pruebas ejecutadas, medidas y pendientes.

## Estructura

```text
client/        Interfaz, representación 3D, controles, red y modo individual
shared/        Reglas, IA, visibilidad, mapa y datos de unidades
server/        Salas y autoridad de las partidas compartidas
public/        PWA, iconos y bibliotecas locales
scripts/       Preparación reproducible y copia estática
tests/         Pruebas de simulación y red
docs/          Estado del proyecto e investigación
```

La representación gráfica lee la simulación; cambiar resolución o efectos no modifica sus reglas. Estadísticas y mapa están en `shared/data.mjs`. No se incluyen campañas, tienda ni clasificaciones. Licencia del código propio: [MIT](LICENSE). Dependencias y procedencia: [THIRD_PARTY](THIRD_PARTY.md).
