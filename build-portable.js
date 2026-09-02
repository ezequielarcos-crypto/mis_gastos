#!/usr/bin/env node
"use strict";

/* Genera `gastos-viaje-portable.html`: un único archivo con el HTML, el CSS y
   el JS embebidos, para compartir la app sin instalar ni servir nada.
   Uso:  node build-portable.js                                              */

const fs = require("fs");
const path = require("path");

const raiz = __dirname;
const leer = (f) => fs.readFileSync(path.join(raiz, f), "utf8");

const css = leer("styles.css");
const js = ["cotizaciones.js", "vuelos.js", "app.js"].map(leer).join("\n\n");

let html = leer("index.html");

// CSS embebido
html = html.replace(
  '<link rel="stylesheet" href="styles.css">',
  `<style>\n${css}\n</style>`
);

// JS embebido (los tres archivos, en el mismo orden que en index.html)
html = html.replace(
  /  <script src="cotizaciones\.js"><\/script>\n  <script src="vuelos\.js"><\/script>\n  <script src="app\.js"><\/script>/,
  `  <script>\n${js}\n  </script>`
);

// Sin manifest ni service worker: el archivo suelto no es instalable
html = html.replace('  <link rel="manifest" href="manifest.webmanifest">\n', "");
html = html.replace('  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">\n', "");
html = html.replace('  <link rel="apple-touch-icon" href="icons/icon-192.png">\n', "");
html = html.replace(
  /if \("serviceWorker" in navigator\) \{\n  navigator\.serviceWorker\.register\("sw\.js"\)\.catch\(\(\) => \{\}\);\n\}/,
  "/* (versión portable: sin service worker) */"
);

html = html.replace(
  "<title>Gastos de Viaje</title>",
  "<title>Gastos de Viaje — versión portable</title>"
);

fs.writeFileSync(path.join(raiz, "gastos-viaje-portable.html"), html);
console.log("✔ gastos-viaje-portable.html generado");
