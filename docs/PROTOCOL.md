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
| `resume` | `code`, `token`; recupera su identidad y sus confirmaciones anteriores. |
| `leave` | Libera la plaza; durante una partida finaliza la sesión para todos. |

Servidor → cliente:

| Mensaje | Contenido |
| --- | --- |
| `welcome` | `playerId`, `token`, `code`; guardar la credencial actualizada. |
| `room` | `room: {code,mode,hostId,status,paused,config,configRevision,players:[{id,name,team,ready,connected}]}`. |
| `state` | `state` de `snapshotFor(game,playerId)`, más `paused`, `pauseReason`, `reconnectDeadline`. |
| `ack` | `seq`, `ok`, `error` opcional. |
| `error` | `message` legible en español. |
| `ended` | `message`; la sala o la conexión del jugador ya no mantienen esa sesión. |

El servidor ignora identidades suministradas en una orden: utiliza la sesión del WebSocket. No acepta órdenes antes del inicio, durante la pausa ni después del final. Cada jugador conserva las 256 últimas confirmaciones: reenviar el mismo `seq` devuelve su confirmación sin ejecutar otra vez el gasto o la orden. Secuencias anteriores a esa ventana se rechazan. El cliente debe conservar el contador al reconectar, repetir una orden pendiente con su mismo `seq` y usar un número superior para una nueva orden.

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

## Ritmo, niebla y conexión

- Simulación: paso fijo de 100 ms. El estado se transmite cada 200 ms; no se recupera tiempo perdido mediante saltos grandes.
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
