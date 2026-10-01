# Pruebas de navegador

Pruebas automatizadas en contextos nuevos y aislados: no se reutilizaron perfiles personales, cookies ni historial. Se controló la interfaz y se leyó `window.__FB__` para observar estado/cámara, sin modificar reglas mediante API de depuración.

Ejecución reproducible: inicia `npm start` y ejecuta `node tests/browser.mjs`. Requiere Playwright instalado o `PLAYWRIGHT_MODULE` con su URL de módulo. `GAME_URL` permite cambiar el servidor local. `--skip-offline` y `--offline-only` separan las comprobaciones cuando se están editando recursos. Ejecuta `npm run prepare:assets` antes de probar offline.

## Ejecución 2026-10-01T22:26:02.811Z

Servidor: http://127.0.0.1:8791. Navegador: Microsoft Edge/Chromium 154.0.4258.48, headless, sin forzar SwiftShader. Adaptador WebGL comunicado: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11).

### Pasó: UI multijugador 1 contra 1

Duración: 2.7 s.

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
  "personalRevealIndependentForBoth": true,
  "revealPermissionShownBeforeReady": true,
  "revealOffRemovesExtraUnits": true,
  "reloadRetainedReveal": true,
  "movement": {
    "unitId": "u1",
    "distance": 20.7
  },
  "coherence": {
    "commonTick": 9,
    "visibleUnitsFirst": 4,
    "visibleUnitsSecond": 4
  },
  "cooperativeClock": null,
  "reloadRetainedPlayer": true,
  "ending": "Rendición termina para ambos",
  "pageErrors": 0
}
```

### Pasó: UI multijugador cooperativo

Duración: 2.9 s.

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
  "personalRevealIndependentForBoth": true,
  "revealPermissionShownBeforeReady": true,
  "revealOffRemovesExtraUnits": true,
  "reloadRetainedReveal": true,
  "movement": {
    "unitId": "u1",
    "distance": 27.6
  },
  "coherence": {
    "commonTick": 9,
    "visibleUnitsFirst": 8,
    "visibleUnitsSecond": 8
  },
  "cooperativeClock": {
    "bothPlayersControlledTime": true,
    "guestSpeed": 0.5,
    "hostSpeed": 2,
    "pauseFreezesBoth": true,
    "pauseRetainedOnReconnect": true
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
  "clearMapPercent": 82,
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

Duración: 1.7 s.

```json
{
  "viewport": {
    "width": 390,
    "height": 844
  },
  "clearMapPercent": 84,
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

Duración: 1.7 s.

```json
{
  "viewport": {
    "width": 1024,
    "height": 768
  },
  "clearMapPercent": 92,
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

### Pasó: Viewport tableta vertical 768×1024 y gestos táctiles emulados

Duración: 1.7 s.

```json
{
  "viewport": {
    "width": 768,
    "height": 1024
  },
  "clearMapPercent": 93,
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

### Pasó: Cambiar cuatro mapas entre partidas sin recargar la página

Duración: 2.4 s.

```json
{
  "samePage": true,
  "pageReloads": 0,
  "maps": [
    {
      "mapId": "llanura-del-estuario",
      "sectors": 9,
      "overviewZoom": 0.32,
      "canvasCount": 1
    },
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

### Pasó: Reloj y ocupación mediante controles táctiles de la interfaz

Duración: 8.1 s.

```json
{
  "mapId": "valle-bruma",
  "buildingId": "town-west-building-1",
  "rates": [
    {
      "speed": 0.5,
      "gameSeconds": 0.5,
      "income": 3
    },
    {
      "speed": 1,
      "gameSeconds": 1.1,
      "income": 6.6
    },
    {
      "speed": 2,
      "gameSeconds": 2.3,
      "income": 13.8
    }
  ],
  "pausedTimeAndEconomyFrozen": true,
  "twoOrdersQueuedWithoutEffects": true,
  "selectionAndZoomDuringPause": true,
  "deploymentOnResumeOnly": true,
  "garrisonWalkedToDoor": true,
  "occupiedBuildingPanelAccessible": true,
  "occupantsShown": 1,
  "explicitExitQueuedThenExecuted": true,
  "hpAmmoPreserved": true,
  "pageErrors": 0,
  "limitation": "Interacción táctil emulada en Edge; no Safari físico"
}
```

### Pasó: Ocupación real en el mapa nuevo y captura de población

Duración: 10.9 s.

```json
{
  "mapId": "llanura-del-estuario",
  "buildingId": "western-rear-market-building-4",
  "rates": [
    {
      "speed": 0.5,
      "gameSeconds": 0.5,
      "income": 3
    },
    {
      "speed": 1,
      "gameSeconds": 1.1,
      "income": 6.6
    },
    {
      "speed": 2,
      "gameSeconds": 2.3,
      "income": 13.8
    }
  ],
  "pausedTimeAndEconomyFrozen": true,
  "twoOrdersQueuedWithoutEffects": true,
  "selectionAndZoomDuringPause": true,
  "deploymentOnResumeOnly": true,
  "garrisonWalkedToDoor": true,
  "occupiedBuildingPanelAccessible": true,
  "occupantsShown": 1,
  "explicitExitQueuedThenExecuted": true,
  "hpAmmoPreserved": true,
  "pageErrors": 0,
  "limitation": "Interacción táctil emulada en Edge; no Safari físico"
}
```

### Pasó: Permiso y revelado individual mediante interfaz real

Duración: 1.9 s.

```json
{
  "defaultDeniedAndButtonHidden": true,
  "lastPermissionSavedAcrossReload": true,
  "newMatchRevealInitiallyOff": true,
  "allowedRevealDuringPause": true,
  "extraEnemies": 4,
  "enemyPrivateDetailsWithheld": true,
  "revealOffRestoresExactPausedVisibility": true,
  "clockEconomyUnchanged": true,
  "narrowScreenControlsChecked": [
    320,
    350,
    375
  ],
  "resetDisablesPermission": true,
  "pageErrors": 0
}
```

### Pasó: Edificio enemigo ocupado y limpieza del panel al ocultar

Duración: 5.9 s.

```json
{
  "buildingId": "town-east-building-1",
  "realEnemyGarrisonWalkedToDoor": true,
  "hiddenBeforeReveal": true,
  "onlyShownOccupancyLabel": true,
  "noEnemyReservationsDisclosed": true,
  "openPanelClearedWhenDisabled": true,
  "pageErrors": 0
}
```

### Pasó: PWA individual tras recarga sin red

Duración: 4 s.

```json
{
  "loadedInFreshContext": true,
  "cachedFiles": 25,
  "missing": 0,
  "offlineReload": true,
  "soloMap": "llanura-del-estuario",
  "soloTick": 31,
  "revealWorksOffline": true,
  "pageErrors": 0,
  "limitation": "Desconexión emulada con Playwright; no modo avión físico"
}
```

**Límites:** estas pruebas usan el navegador del ordenador. Los viewports y contactos táctiles son emulación; no acreditan Safari, instalación desde Inicio, rendimiento de iPhone/iPad ni redes distintas. Offline significa bloqueo de red de este contexto; las capturas están en `docs/screenshots/`.

