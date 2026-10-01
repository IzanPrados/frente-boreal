# Pruebas de navegador

## Resultado vigente

Las rondas completas del 1 de octubre de 2026, primero en local y después contra [la publicación real de Frente Boreal](https://frente-boreal.onrender.com), pasaron las cinco comprobaciones: duelo, cooperativo, teléfono emulado, tableta emulada y PWA sin red. Edge comunicó NVIDIA GeForce RTX 3060 mediante ANGLE/Direct3D11; no se forzó un renderizador por software. No hubo excepciones JavaScript de página.

Se encontró y corrigió un fallo real previo: el servidor respondía 404 a las licencias `.txt` incluidas en la precarga, lo que impedía instalar una caché completa. Tras admitir su tipo de archivo y reiniciar el servidor, la nueva instalación guardó los 18 recursos y el modo individual alcanzó el tick 31 después de recargar con la red bloqueada. Se conserva debajo el resultado fallido para mostrar qué se detectó y la ronda posterior que verificó la corrección.

Las sesiones multijugador se ejecutaron en dos contextos aislados del mismo navegador y ordenador. La última ronda utilizó HTTPS y WebSocket reales hacia Render por Internet: creación, unión, preparación, inicio, movimiento y recarga con recuperación de identidad pasaron en ambos modos. El duelo terminó para ambos tras rendición; en cooperativo, la retirada conservó el juego del compañero y la salida explícita cerró la sala. La PWA pública guardó los 18 archivos y permitió recargar e iniciar individual con la red bloqueada. Esto acredita acceso al servidor publicado desde este ordenador; quedan pendientes dos dispositivos físicos y redes distintas.

Pruebas automatizadas en contextos nuevos y aislados: no se reutilizaron perfiles personales, cookies ni historial. Se controló la interfaz y se leyó `window.__FB__` para observar estado/cámara, sin modificar reglas mediante API de depuración.

Ejecución reproducible: inicia `npm start` y ejecuta `node tests/browser.mjs`. Requiere Playwright instalado o `PLAYWRIGHT_MODULE` con su URL de módulo. `GAME_URL` permite cambiar el servidor local. `--skip-offline` y `--offline-only` separan las comprobaciones cuando se están editando recursos. Ejecuta `npm run prepare:assets` antes de probar offline.

## Ejecución 2026-10-01T19:58:09.550Z

Servidor: http://127.0.0.1:8787. Navegador: Microsoft Edge/Chromium 154.0.4258.37, headless, sin forzar SwiftShader.

### Pasó: UI multijugador 1 contra 1

Duración: 1.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 4,
    "visibleUnitsSecond": 4
  },
  "reloadRetainedPlayer": true,
  "ending": "Rendición termina para ambos",
  "pageErrors": 0
}
```

### Pasó: UI multijugador cooperativo

Duración: 1.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 8,
    "visibleUnitsSecond": 8
  },
  "reloadRetainedPlayer": true,
  "ending": "Retirada permite observar; salida explícita termina sala",
  "pageErrors": 0
}
```

### Pasó: Viewport teléfono 844×390 y gestos táctiles emulados

Duración: 0.8 s.

```json
{
  "viewport": {
    "width": 844,
    "height": 390
  },
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "accidentalOrders": 0,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport tableta 1024×768 y gestos táctiles emulados

Duración: 0.7 s.

```json
{
  "viewport": {
    "width": 1024,
    "height": 768
  },
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "accidentalOrders": 0,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

## Ejecución 2026-10-01T19:59:21.466Z

Servidor: http://127.0.0.1:8787. Navegador: Microsoft Edge/Chromium 154.0.4258.37, headless, sin forzar SwiftShader.

### Falló: PWA individual tras recarga sin red

Duración: 0.5 s.

```json
{
  "error": "No se completó la descarga para jugar sin conexión."
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

## Ejecución 2026-10-01T20:01:24.641Z

Servidor: http://127.0.0.1:8787. Navegador: Microsoft Edge/Chromium 154.0.4258.37, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11).

### Pasó: UI multijugador 1 contra 1

Duración: 1.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 4,
    "visibleUnitsSecond": 4
  },
  "reloadRetainedPlayer": true,
  "ending": "Rendición termina para ambos",
  "pageErrors": 0
}
```

### Pasó: UI multijugador cooperativo

Duración: 1.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 8,
    "visibleUnitsSecond": 8
  },
  "reloadRetainedPlayer": true,
  "ending": "Retirada permite observar; salida explícita termina sala",
  "pageErrors": 0
}
```

### Pasó: Viewport teléfono 844×390 y gestos táctiles emulados

Duración: 1.3 s.

```json
{
  "viewport": {
    "width": 844,
    "height": 390
  },
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "saveRecallGroup": true,
  "accidentalOrders": 0,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport tableta 1024×768 y gestos táctiles emulados

Duración: 1.3 s.

```json
{
  "viewport": {
    "width": 1024,
    "height": 768
  },
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "saveRecallGroup": true,
  "accidentalOrders": 0,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: PWA individual tras recarga sin red

Duración: 3.7 s.

```json
{
  "loadedInFreshContext": true,
  "cachedFiles": 18,
  "missing": 0,
  "offlineReload": true,
  "soloTick": 31,
  "pageErrors": 0,
  "limitation": "Desconexión emulada con Playwright; no modo avión físico"
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

## Ejecución 2026-10-01T20:07:23.588Z

Servidor: https://frente-boreal.onrender.com. Navegador: Microsoft Edge/Chromium 154.0.4258.37, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11).

### Pasó: UI multijugador 1 contra 1

Duración: 2.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 4,
    "visibleUnitsSecond": 4
  },
  "reloadRetainedPlayer": true,
  "ending": "Rendición termina para ambos",
  "pageErrors": 0
}
```

### Pasó: UI multijugador cooperativo

Duración: 2.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 8,
    "visibleUnitsSecond": 8
  },
  "reloadRetainedPlayer": true,
  "ending": "Retirada permite observar; salida explícita termina sala",
  "pageErrors": 0
}
```

### Pasó: Viewport teléfono 844×390 y gestos táctiles emulados

Duración: 1.8 s.

```json
{
  "viewport": {
    "width": 844,
    "height": 390
  },
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "saveRecallGroup": true,
  "accidentalOrders": 0,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport tableta 1024×768 y gestos táctiles emulados

Duración: 1.6 s.

```json
{
  "viewport": {
    "width": 1024,
    "height": 768
  },
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "saveRecallGroup": true,
  "accidentalOrders": 0,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: PWA individual tras recarga sin red

Duración: 5.4 s.

```json
{
  "loadedInFreshContext": true,
  "cachedFiles": 18,
  "missing": 0,
  "offlineReload": true,
  "soloTick": 31,
  "pageErrors": 0,
  "limitation": "Desconexión emulada con Playwright; no modo avión físico"
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

## Ejecución 2026-10-01T20:56:01.191Z

Servidor: http://127.0.0.1:8787. Navegador: Microsoft Edge/Chromium 154.0.4258.48, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11).

### Pasó: UI multijugador 1 contra 1

Duración: 2 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "largeMap": "frontera-de-los-siete-pasos",
  "configVisibleToBoth": true,
  "hostChangesResetReady": true,
  "sameAuthorityConfig": true,
  "savedLastConfig": true,
  "defaultsRestored": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 4,
    "visibleUnitsSecond": 4
  },
  "reloadRetainedPlayer": true,
  "ending": "Rendición termina para ambos",
  "pageErrors": 0
}
```

### Pasó: UI multijugador cooperativo

Duración: 1.7 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "largeMap": "frontera-de-los-siete-pasos",
  "configVisibleToBoth": true,
  "hostChangesResetReady": true,
  "sameAuthorityConfig": true,
  "savedLastConfig": true,
  "defaultsRestored": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 8,
    "visibleUnitsSecond": 8
  },
  "reloadRetainedPlayer": true,
  "ending": "Retirada permite observar; salida explícita termina sala",
  "pageErrors": 0
}
```

### Pasó: Viewport teléfono 844×390 y gestos táctiles emulados

Duración: 1.3 s.

```json
{
  "viewport": {
    "width": 844,
    "height": 390
  },
  "clearMapPercent": 89,
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "touchTargetsAtLeast44px": true,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "selectionKeepsTargetVisible": true,
  "selectionStripFoldsDuringOrder": true,
  "saveRecallGroup": true,
  "panelCloseAccidentalOrders": 0,
  "intentionalMoveWorked": true,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport teléfono vertical 390×844 y gestos táctiles emulados

Duración: 1.3 s.

```json
{
  "viewport": {
    "width": 390,
    "height": 844
  },
  "clearMapPercent": 91,
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "touchTargetsAtLeast44px": true,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "selectionKeepsTargetVisible": true,
  "selectionStripFoldsDuringOrder": true,
  "saveRecallGroup": true,
  "panelCloseAccidentalOrders": 0,
  "intentionalMoveWorked": true,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport tableta 1024×768 y gestos táctiles emulados

Duración: 1.3 s.

```json
{
  "viewport": {
    "width": 1024,
    "height": 768
  },
  "clearMapPercent": 95,
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "touchTargetsAtLeast44px": true,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "selectionKeepsTargetVisible": true,
  "selectionStripFoldsDuringOrder": true,
  "saveRecallGroup": true,
  "panelCloseAccidentalOrders": 0,
  "intentionalMoveWorked": true,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

## Ejecución 2026-10-01T21:01:34.245Z

Servidor: http://127.0.0.1:8787. Navegador: Microsoft Edge/Chromium 154.0.4258.48, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11).

### Pasó: UI multijugador 1 contra 1

Duración: 2.1 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "largeMap": "frontera-de-los-siete-pasos",
  "configVisibleToBoth": true,
  "hostChangesResetReady": true,
  "sameAuthorityConfig": true,
  "savedLastConfig": true,
  "defaultsRestored": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 4,
    "visibleUnitsSecond": 4
  },
  "reloadRetainedPlayer": true,
  "ending": "Rendición termina para ambos",
  "pageErrors": 0
}
```

### Pasó: UI multijugador cooperativo

Duración: 1.8 s.

```json
{
  "contexts": 2,
  "creationJoinReadyStart": true,
  "largeMap": "frontera-de-los-siete-pasos",
  "configVisibleToBoth": true,
  "hostChangesResetReady": true,
  "sameAuthorityConfig": true,
  "savedLastConfig": true,
  "defaultsRestored": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 7,
    "visibleUnitsFirst": 8,
    "visibleUnitsSecond": 8
  },
  "reloadRetainedPlayer": true,
  "ending": "Retirada permite observar; salida explícita termina sala",
  "pageErrors": 0
}
```

### Pasó: Viewport teléfono 844×390 y gestos táctiles emulados

Duración: 1.7 s.

```json
{
  "viewport": {
    "width": 844,
    "height": 390
  },
  "clearMapPercent": 89,
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "touchTargetsAtLeast44px": true,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "selectionKeepsTargetVisible": true,
  "selectionStripFoldsDuringOrder": true,
  "saveRecallGroup": true,
  "cancelMovePreservesSelection": true,
  "cancelDeployCreatesNothing": true,
  "pauseRestoresPendingHint": true,
  "panelCloseAccidentalOrders": 0,
  "intentionalMoveWorked": true,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport teléfono vertical 390×844 y gestos táctiles emulados

Duración: 1.6 s.

```json
{
  "viewport": {
    "width": 390,
    "height": 844
  },
  "clearMapPercent": 91,
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "touchTargetsAtLeast44px": true,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "selectionKeepsTargetVisible": true,
  "selectionStripFoldsDuringOrder": true,
  "saveRecallGroup": true,
  "cancelMovePreservesSelection": true,
  "cancelDeployCreatesNothing": true,
  "pauseRestoresPendingHint": true,
  "panelCloseAccidentalOrders": 0,
  "intentionalMoveWorked": true,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Viewport tableta 1024×768 y gestos táctiles emulados

Duración: 1.6 s.

```json
{
  "viewport": {
    "width": 1024,
    "height": 768
  },
  "clearMapPercent": 95,
  "horizontalOverflow": false,
  "clippedPanels": 0,
  "clippedButtons": 0,
  "touchTargetsAtLeast44px": true,
  "oneFingerPan": true,
  "twoFingerZoom": true,
  "tapSelection": true,
  "selectionKeepsTargetVisible": true,
  "selectionStripFoldsDuringOrder": true,
  "saveRecallGroup": true,
  "cancelMovePreservesSelection": true,
  "cancelDeployCreatesNothing": true,
  "pauseRestoresPendingHint": true,
  "panelCloseAccidentalOrders": 0,
  "intentionalMoveWorked": true,
  "emulation": "Chromium/Edge + CDP; no dispositivo Apple físico ni motor Safari"
}
```

### Pasó: Cambiar mapas entre partidas sin recargar la página

Duración: 1.9 s.

```json
{
  "samePage": true,
  "pageReloads": 0,
  "maps": [
    {
      "mapId": "frontera-de-los-siete-pasos",
      "sectors": 7,
      "overviewZoom": 0.47,
      "canvasCount": 1
    },
    {
      "mapId": "cuenca-del-norte",
      "sectors": 5,
      "overviewZoom": 0.61,
      "canvasCount": 1
    },
    {
      "mapId": "valle-bruma",
      "sectors": 3,
      "overviewZoom": 0.89,
      "canvasCount": 1
    }
  ],
  "cameraMinimapAndObjectivesUpdated": true,
  "pageErrors": 0
}
```

### Pasó: PWA individual tras recarga sin red

Duración: 3.7 s.

```json
{
  "loadedInFreshContext": true,
  "cachedFiles": 20,
  "missing": 0,
  "offlineReload": true,
  "soloTick": 31,
  "pageErrors": 0,
  "limitation": "Desconexión emulada con Playwright; no modo avión físico"
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

