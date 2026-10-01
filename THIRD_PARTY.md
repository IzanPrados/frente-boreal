# Licencias y procedencia

El código propio del proyecto se distribuye bajo la licencia MIT, incluida en `LICENSE`.

| Componente | Versión fijada | Uso | Licencia y origen |
|---|---|---|---|
| Three.js | 0.186.1 | Representación 3D en el navegador | MIT; [repositorio oficial](https://github.com/mrdoob/three.js). Texto completo copiado desde el paquete a `public/vendor/THREE-LICENSE.txt`. |
| ws | 8.22.0 | Conexiones WebSocket del servidor Node | MIT; [repositorio oficial](https://github.com/websockets/ws). Texto completo copiado desde el paquete a `public/vendor/WS-LICENSE.txt`. |
| Node.js | 22 o posterior | Ejecución y herramientas locales | [Licencias del proyecto Node](https://github.com/nodejs/node/blob/main/LICENSE); se instala por separado. |

`npm run prepare:assets` copia las bibliotecas y sus avisos desde las dependencias instaladas. Three.js incluye dos archivos de ejecución: `three.module.js` y `three.core.js`. No se descargan bibliotecas desde CDN durante una partida.

El mapa, estadísticas de equilibrio, interfaz y monograma FB son originales. Los iconos PNG se generan mediante `scripts/icons.mjs`, sin fuentes ni imágenes externas. Los modelos del prototipo se construyen con geometría del proyecto. Se utilizan las tipografías del sistema operativo.

WARNO se menciona exclusivamente como referencia de diseño. No se incluyen ni extraen sus modelos, mapas, sonidos, textos o logotipos. Frente Boreal es un proyecto independiente y no es un producto oficial de Eugen Systems.
