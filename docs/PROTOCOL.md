# Red y servidor de Frente Boreal

## Autoridad y despliegue

Un proceso Node ejecuta toda la simulación y la IA. Los navegadores envían órdenes y reciben vistas filtradas para su equipo. No ejecutan una segunda partida online. Cada unidad conserva el identificador de su propietario; incluso en cooperativo, un jugador solo puede dar órdenes a sus unidades. La simulación rechaza las órdenes ajenas.

`node server/index.mjs` escucha por defecto únicamente en `127.0.0.1:8787`. No modifica el cortafuegos ni abre túneles. `HOST=0.0.0.0` requiere configurarlo expresamente en un alojamiento o una red que el usuario haya autorizado. `PORT` permite cambiar el puerto. El servidor HTTP y `/ws` comparten origen. Para una interfaz alojada en otro dominio, configurar `ALLOWED_ORIGINS` con sus orígenes HTTPS exactos, separados por comas. No usar comodines.

El servidor comprueba el `Origin` del navegador. Acepta el mismo origen del endpoint; con la escucha local, ese origen además debe ser localhost/loopback. Acepta también los orígenes explícitos de `ALLOWED_ORIGINS`. Los clientes nativos de pruebas pueden omitir `Origin`. En producción, el proveedor debe terminar HTTPS y reenviar las conexiones WebSocket. El acceso entre redes necesita ese alojamiento público; una dirección `localhost` solo sirve en el propio equipo.

API de pruebas y embebido:

```js
const app = await createServer({ host: '127.0.0.1', port: 0 });
console.log(app.address.url); // Puerto asignado por el sistema
await app.close();
```

## Sala privada

Hay un máximo de dos personas por sala (`solo`: una). Los códigos tienen ocho caracteres aleatorios y no se enumeran en ninguna API. Las credenciales de reanudación son 32 bytes aleatorios, nunca aparecen en la vista de la sala y deben guardarse únicamente en el dispositivo del jugador. El código permite entrar al vestíbulo; el token permite recuperar una plaza existente.

Cliente → servidor, JSON de texto:

| Mensaje | Campos y efecto |
| --- | --- |
| `create` | `name`, `mode: solo/coop/versus`, `deck` y `config` opcionales; valida ajustes, crea una sala y toma la primera plaza. |
| `join` | `code`, `name`, `deck` opcional; entra antes del inicio. |
| `configure` | `config`; solo el anfitrión en el vestíbulo. Publica los ajustes validados y reinicia la preparación de todos si cambian. |
| `team` | `team: 0/1`; solo en vestíbulo. Cooperativo y solo usan equipo 0. Reinicia la preparación. |
| `ready` | `ready: boolean`, `configRevision`; para prepararse debe coincidir con la revisión actual recibida. Desmarcarse no exige revisión. |
| `start` | Solo el anfitrión, todas las plazas ocupadas, conectadas y preparadas. Duelo exige equipos distintos. |
| `command` | `seq` entero creciente y `command` según el contrato de simulación. |
| `time` | `speed: 0/0.5/1/2`; pausa o cambia la velocidad. Cualquier participante activo de cooperativo puede enviarlo, igual que el jugador individual. PvP lo rechaza. |
| `resume` | `code`, `token`; recupera su identidad y sus confirmaciones anteriores. |
| `leave` | Libera la plaza; durante una partida finaliza la sesión para todos. |

Servidor → cliente:

| Mensaje | Contenido |
| --- | --- |
| `welcome` | `playerId`, `token`, `code`; guardar la credencial actualizada. |
| `room` | `room: {code,mode,hostId,status,paused,config,configRevision,players:[{id,name,team,ready,connected}]}`. |
| `state` | `state` de `snapshotFor(game,playerId)`, más `paused`, `pauseReason`, `reconnectDeadline`, `timeControl` y `pendingOrders`. |
| `ack` | `seq`, `ok`, `error` opcional. `queued: true` significa que la orden está preparada para reanudar. |
| `commandResult` | Resultado definitivo de una orden preparada: `seq`, `ok`, `queued: false`, `error` opcional. |
| `error` | `message` legible en español. |
| `ended` | `message`; la sala o la conexión del jugador ya no mantienen esa sesión. |

El servidor ignora identidades suministradas en una orden: utiliza la sesión del WebSocket. No acepta órdenes antes del inicio, durante la interrupción por desconexión ni después del final. Durante la pausa manual sí permite prepararlas sin efectos jugables. Cada jugador conserva las 256 últimas confirmaciones: reenviar el mismo `seq` devuelve su confirmación sin ejecutar otra vez el gasto o la orden. Secuencias anteriores a esa ventana se rechazan. El cliente debe conservar el contador al reconectar, repetir una orden pendiente con su mismo `seq` y usar un número superior para una nueva orden.

## Ajustes compartidos

El contrato de `shared/config.mjs` se usa en el servidor y en el trabajador de la partida individual. `config` contiene:

| Campo | Valor predeterminado | Validación y efecto |
| --- | --- | --- |
| `mapId` | `valle-bruma` | Identificador del catálogo de mapas; el mapa fija su tamaño, terreno y objetivos. |
| `startingResources` | `410` | Entero de 0 a 10000, aplicado una vez a cada jugador y a la IA. |
| `incomeMultiplier` | `1` | Uno de 0,5 / 1 / 2 / 3 / 5; multiplica los ingresos normales durante la partida. No altera precios ni presupuesto inicial. |
| `maxUnits` | `120` | Entero de 24 a 120; límite global de unidades de la partida. |
| `duration` | `720` | Entero de 180 a 3600 segundos; duración máxima. |
| `tickets` | `300` | Entero de 100 a 2000; puntuación inicial de cada bando. |

Omitir ajustes utiliza los valores predeterminados; los objetos parciales completan los campos ausentes con esos valores. Se rechazan campos desconocidos, tipos incorrectos y valores fuera de rango. La restauración tolerante de preferencias locales no sustituye esta validación del servidor.

Cada sala empieza con `configRevision: 1`. Un cambio efectivo aumenta la revisión y desmarca a todos. Una preparación enviada con una revisión antigua o sin revisión se rechaza, aunque llegue después del cambio por retraso de red. Una petición idéntica conserva la revisión y la preparación. Al iniciar se entrega la misma configuración a la simulación autoritativa; tanto `room` como `state` exponen esos valores y quedan bloqueados durante la partida. Al reconectar se recibe la configuración actual del servidor.

El servidor mantiene la ruta pendiente de cada unidad, escoge el objetivo, interrumpe el movimiento, resuelve los disparos y reanuda el trayecto. Los clientes no calculan otro combate. Los estados de unidades del propio equipo incluyen `combatPaused` y `combatTargetId`, junto a la orden y el destino pendiente; la vista rival sigue ocultando órdenes y datos tácticos privados.

## Edificios y privacidad

Las órdenes nuevas usan el mismo canal `command`, con su secuencia y propietario autenticado:

- `{type: 'garrison', unitIds, buildingId}`: solicita una plaza para cada escuadra de infantería y una ruta hasta un acceso válido. La simulación reserva las plazas en orden autoritativo; ocupar exige completar el desplazamiento. No se permite compartir edificio entre enemigos.
- `{type: 'exit', unitIds}`: cancela la entrada pendiente o saca las tropas a posiciones exteriores transitables. Una orden `move` desde dentro realiza la salida antes de recorrer su destino.

El mapa público define la geometría, los accesos y la capacidad estática de cada edificio. `state.buildings` contiene `id`, `team`, `known`, `observed`, `occupied`, `reserved` y `occupantIds`. Las reservas y las plazas aliadas se comparten dentro del equipo. Un edificio sin reclamación aliada ni ocupantes enemigos detectados devuelve los datos dinámicos como `null`, indicadores falsos e identificadores vacíos; no se distingue así entre vacío y enemigo oculto. La información rival detectada se limita a los ocupantes visibles y no revela sus reservas. `known` indica reclamación aliada; `observed` indica ocupantes detectados.

Las unidades visibles incluyen `garrisonedIn`; `pendingBuildingId` solo se entrega al propio equipo. Los eventos de entrada y salida enemigos requieren que la unidad esté detectada. Las respuestas de entrada no distinguen entre capacidad agotada, reclamación hostil y acceso no disponible: no proporcionan un contador oculto como vía alternativa de reconocimiento.

## Tiempo y órdenes preparadas

`shared/match-control.mjs` gobierna el reloj tanto en el servidor como en el trabajador individual. `timeControl` vale `null` en PvP. En los modos contra IA contiene:

```js
{ paused, speed, lastSpeed, revision, changedBy, changedByName }
```

`speed` es cero durante la pausa; `lastSpeed` conserva la última velocidad positiva. Toda solicitud válida aumenta `revision` y registra la identidad y nombre del jugador autenticado. El proceso del servidor decide el orden de solicitudes concurrentes y transmite inmediatamente el mismo resultado a ambos participantes. Cambiar a 0,5×, 1× o 2× reanuda. No existe restricción al anfitrión para estos controles.

Cada paso de simulación sigue siendo de 0,1 segundos de juego. Un acumulador decide cuántos corresponden al tiempo real y a la velocidad; todos los sistemas reciben ese mismo paso, incluidos ingresos, recargas, proyectiles, decisiones de IA, captura y duración de la partida. Cambiar velocidad no cambia los ingresos por minuto de juego ni vuelve a aplicar el multiplicador económico.

Durante la pausa manual, las órdenes jugables se validan primero por formato y propiedad y se guardan en una cola con un máximo de 64 por jugador. No crean unidades, reservan edificios, gastan recursos, despliegan humo ni cambian rutas todavía. Al primer paso de juego después de reanudar se aplican en el orden recibido y se ejecuta su validación completa. Puede fallar una orden preparada, por ejemplo si otras órdenes ya gastaron el presupuesto; se comunica con `commandResult`. Una orden posterior de movimiento o de detenerse sustituye a la anterior al aplicarse. `pendingOrders` cuenta únicamente las órdenes del receptor. Los reintentos con el mismo `seq` no duplican la cola, y su confirmación guardada se actualiza con el resultado final.

Rendirse y salir de la sesión permanecen disponibles como decisiones explícitas para terminar la participación, incluso con el reloj detenido. Son distintas de preparar una acción jugable.

La pausa de conexión (`state.paused`) es independiente de la pausa manual (`state.timeControl.paused`). Reconectar conserva el reloj, su revisión y las órdenes preparadas. Ping, mensajes, estados y reconexión continúan mientras está pausada la simulación. El menú o el segundo plano individual suspenden además el trabajador sin borrar la velocidad manual. Al reanudar no se acumula el tiempo suspendido: se reinicia el intervalo y el resto del acumulador. Los retrasos de planificación superiores a un segundo se descartan; los menores se limitan a 0,25 segundos reales y a cinco pasos por actualización.

## Ritmo, niebla y conexión

- Simulación: paso fijo de 100 ms de juego, con ritmo 0,5× / 1× / 2× en modos contra IA y 1× en PvP. El estado se transmite cada 200 ms reales, también en pausa; no se recupera tiempo perdido mediante saltos grandes.
- Cada cliente recibe exclusivamente `snapshotFor` de su identidad. La simulación decide qué enemigos y eventos puede ver su equipo.
- Una desconexión conocida pausa toda la partida. Se concede un plazo de 90 segundos por defecto. Los demás reciben el motivo y una fecha límite Unix en milisegundos.
- Al reanudar se rota el token y se invalida cualquier WebSocket anterior de esa plaza. Guardar siempre el nuevo `welcome`.
- Si se agota el plazo, la partida termina con `ended`. No se inventa un vencedor para una desconexión. Si el proceso se reinicia, las salas se pierden: esta versión las guarda en memoria.
- Ping/pong cada 15 segundos detecta conexiones que desaparecen sin cierre; su detección puede tardar hasta unos 30 segundos. El plazo de reconexión empieza cuando el servidor detecta la pérdida.
- Las salas sin partida caducan a los 30 minutos de inactividad. Una plaza desconectada del vestíbulo se libera al agotar el plazo; el anfitrión pasa al primer participante restante.

## Límites y archivos

Máximo 16 KiB por mensaje, 32 conexiones, 8 salas, 30 mensajes por segundo por conexión con una ráfaga inicial de 80. `MAX_ROOMS` y `MAX_CONNECTIONS` permiten reducir estos límites en un alojamiento pequeño; solo deberían aumentarse después de medirlo. Una conexión que acumula más de 512 KiB de salida se cierra para impedir que un cliente lento agote memoria. Estos límites sirven para un prototipo privado: no son una garantía de capacidad medida ni una defensa completa de un servicio público masivo. La CPU de la simulación crece con las salas activas y unidades; si el proceso se satura, la simulación se ralentiza y no acumula pasos de recuperación. Los límites gratuitos del proveedor siguen aplicándose aunque el servidor admita más salas.

`GET /health` devuelve estado básico. Los archivos públicos se limitan a `index.html`, manifiesto, service worker, icono y carpetas `client/`, `shared/`, `public/`; los alias `vendor/` e `icons/` apuntan dentro de `public/`. No se sirven `server/`, `tests/`, `node_modules/`, archivos ocultos ni rutas que salgan del proyecto. El service worker y el HTML se revalidan, y el manifiesto puede solicitarse desde `/manifest.webmanifest`.

Las pruebas automatizadas usan clientes WebSocket reales conectados por TCP al servidor local. Eso verifica comunicación y reglas de servidor; no equivale a haber jugado en dos dispositivos físicos ni desde redes distintas.

El cliente conserva las órdenes todavía sin confirmar y su `seq` en el almacenamiento de la pestaña. Reintenta cada 2,5 segundos; tras tres envíos sin confirmación intenta recuperar la conexión. Al recibir un `welcome` nuevo reenvía las órdenes pendientes con el mismo `seq`. Una credencial rechazada termina la recuperación con un mensaje claro. El abandono voluntario invalida los manejadores del socket anterior para que un mensaje tardío no afecte a la nueva pantalla. La prueba de pérdida de confirmación rompe una conexión TCP real después de aplicar una orden y descartar deliberadamente su primer `ack`; las funciones de almacenamiento de navegador se emulan en Node para esa prueba.
