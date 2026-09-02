"use strict";

/* =========================================================================
   Servicio de vuelos (AviationStack — https://aviationstack.com)
   Expone: buscarVuelos(), obtenerClaveApi(), guardarClaveApi(),
           borrarClaveApi(), usoMensual(), estadoVuelo()

   ┌───────────────────────────────────────────────────────────────────────┐
   │  🔑 DÓNDE VA TU CLAVE DE API                                          │
   │                                                                       │
   │  Opción A (RECOMENDADA): desde la app.                                │
   │     Pestaña "Vuelos" → botón ⚙️ → pegás la clave → "Guardar".         │
   │     Queda en el localStorage de tu teléfono y NO se sube a GitHub.    │
   │                                                                       │
   │  Opción B: acá abajo, en la constante CLAVE_API_POR_DEFECTO.          │
   │     ⚠️ Este repositorio es PÚBLICO: si escribís la clave acá,         │
   │     queda visible para cualquiera y te pueden gastar las 100          │
   │     consultas mensuales del plan gratuito. Usalo solo si la app       │
   │     corre en privado.                                                 │
   └───────────────────────────────────────────────────────────────────────┘
   ========================================================================= */

// 👇👇👇  PEGÁ ACÁ TU CLAVE SI ELEGÍS LA OPCIÓN B (si no, dejala vacía)  👇👇👇
const CLAVE_API_POR_DEFECTO = "";
// 👆👆👆 -------------------------------------------------------------- 👆👆👆

const CLAVE_LS_API = "gastos-viaje-aviationstack-key";
const CLAVE_LS_PROXY = "gastos-viaje-aviationstack-proxy";
const CLAVE_LS_CACHE = "gastos-viaje-vuelos-cache-v1";
const CLAVE_LS_USO = "gastos-viaje-vuelos-uso-v1";

const HOST_AVIATIONSTACK = "api.aviationstack.com/v1/flights";
const TTL_VUELOS_MS = 15 * 60 * 1000; // 15 min: el plan free son 100 consultas/mes
const MAX_ENTRADAS_CACHE = 25;
const LIMITE_MENSUAL_FREE = 100;

/* ---------------- Clave de API ---------------- */
function obtenerClaveApi() {
  try {
    return (localStorage.getItem(CLAVE_LS_API) || CLAVE_API_POR_DEFECTO || "").trim();
  } catch (_) {
    return CLAVE_API_POR_DEFECTO;
  }
}

function guardarClaveApi(clave) {
  try {
    localStorage.setItem(CLAVE_LS_API, (clave || "").trim());
  } catch (_) { /* almacenamiento no disponible */ }
}

function borrarClaveApi() {
  try {
    localStorage.removeItem(CLAVE_LS_API);
  } catch (_) { /* nada que hacer */ }
}

/* Proxy opcional (ver nota sobre HTTPS más abajo) */
function obtenerProxy() {
  try {
    return (localStorage.getItem(CLAVE_LS_PROXY) || "").trim();
  } catch (_) {
    return "";
  }
}

function guardarProxy(url) {
  try {
    localStorage.setItem(CLAVE_LS_PROXY, (url || "").trim());
  } catch (_) { /* almacenamiento no disponible */ }
}

/* ---------------- Contador de consultas del mes ---------------- */
function mesActual() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function usoMensual() {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_LS_USO) || "null");
    if (crudo && crudo.mes === mesActual()) return crudo;
  } catch (_) { /* dato corrupto */ }
  return { mes: mesActual(), consultas: 0, limite: LIMITE_MENSUAL_FREE };
}

function sumarConsulta() {
  const uso = usoMensual();
  uso.consultas += 1;
  try {
    localStorage.setItem(CLAVE_LS_USO, JSON.stringify(uso));
  } catch (_) { /* almacenamiento no disponible */ }
  return uso;
}

/* ---------------- Cache en localStorage ---------------- */
function leerCache() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_LS_CACHE) || "{}") || {};
  } catch (_) {
    return {};
  }
}

function guardarEnCache(clave, vuelos) {
  const cache = leerCache();
  cache[clave] = { vuelos, actualizadoEn: Date.now() };
  // Se conservan solo las consultas más recientes para no llenar el storage
  const entradas = Object.entries(cache).sort((a, b) => b[1].actualizadoEn - a[1].actualizadoEn);
  const recortado = Object.fromEntries(entradas.slice(0, MAX_ENTRADAS_CACHE));
  try {
    localStorage.setItem(CLAVE_LS_CACHE, JSON.stringify(recortado));
  } catch (_) { /* almacenamiento lleno: se sigue igual */ }
}

function limpiarCacheVuelos() {
  try {
    localStorage.removeItem(CLAVE_LS_CACHE);
  } catch (_) { /* nada que hacer */ }
}

/* ---------------- Consulta a la API ---------------- */
function claveDeConsulta(params) {
  return Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${String(v).toUpperCase()}`)
    .sort()
    .join("&");
}

/**
 * Arma la URL final.
 * IMPORTANTE: el plan gratuito de AviationStack solo permite HTTP (sin la "s").
 * Como esta app se sirve por HTTPS en GitHub Pages, el navegador bloquea ese
 * pedido por "contenido mixto". Por eso:
 *   - se intenta HTTPS (funciona en planes pagos),
 *   - si la página misma se abre por HTTP (localhost / archivo local), se usa HTTP,
 *   - y se puede configurar un proxy HTTPS desde la pestaña Vuelos (⚙️).
 */
function armarUrl(params, { forzarHttp = false } = {}) {
  const query = new URLSearchParams(params).toString();
  const proxy = obtenerProxy();
  const esquema = forzarHttp || location.protocol === "http:" ? "http" : "https";
  const directa = `${esquema}://${HOST_AVIATIONSTACK}?${query}`;
  if (!proxy) return directa;
  // El proxy puede esperar la URL completa (…?url=) o solo el host (…/https://…)
  return proxy.includes("=") ? proxy + encodeURIComponent(directa) : proxy + directa;
}

function normalizarError(codigo, mensaje) {
  const mapa = {
    invalid_access_key: "La clave de API no es válida. Revisala en ⚙️.",
    missing_access_key: "Falta la clave de API. Cargala con el botón ⚙️.",
    inactive_user: "La cuenta de AviationStack está inactiva.",
    usage_limit_reached: "Se agotaron las consultas del plan (100 por mes en el gratuito).",
    rate_limit_reached: "Demasiadas consultas seguidas. Esperá un momento.",
    function_access_restricted: "Esa búsqueda no está incluida en el plan gratuito.",
    https_access_restricted: "El plan gratuito no permite HTTPS. Configurá un proxy en ⚙️ o abrí la app localmente.",
    invalid_api_function: "El endpoint consultado no existe.",
    "404_not_found": "No se encontró el recurso consultado.",
  };
  return mapa[codigo] || mensaje || "No se pudo consultar AviationStack";
}

/**
 * Busca vuelos en AviationStack.
 * @param {object} filtros - { flight_iata } o { dep_iata, arr_iata } (+ airline_name…)
 * @param {object} opciones - { forzar: true } para saltear el cache.
 * @returns Promise<{ vuelos, actualizadoEn, desdeCache, desactualizado, error, uso }>
 */
async function buscarVuelos(filtros, { forzar = false } = {}) {
  const limpios = Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v != null && String(v).trim() !== "")
  );
  const clave = claveDeConsulta(limpios);
  const cache = leerCache();
  const entrada = cache[clave];
  const vigente = entrada && Date.now() - entrada.actualizadoEn < TTL_VUELOS_MS;

  if (vigente && !forzar) {
    return {
      vuelos: entrada.vuelos,
      actualizadoEn: entrada.actualizadoEn,
      desdeCache: true,
      desactualizado: false,
      error: null,
      uso: usoMensual(),
    };
  }

  const accessKey = obtenerClaveApi();
  if (!accessKey) {
    return {
      vuelos: entrada?.vuelos || [],
      actualizadoEn: entrada?.actualizadoEn || null,
      desdeCache: !!entrada,
      desactualizado: !!entrada,
      error: "Falta la clave de API. Cargala con el botón ⚙️.",
      uso: usoMensual(),
    };
  }

  const params = { access_key: accessKey, limit: 20, ...limpios };

  try {
    const res = await fetch(armarUrl(params));
    if (!res.ok) throw new Error(`AviationStack respondió ${res.status}`);
    const json = await res.json();

    if (json.error) throw new Error(normalizarError(json.error.code, json.error.message));
    if (!Array.isArray(json.data)) throw new Error("Respuesta inesperada de AviationStack");

    const uso = sumarConsulta();
    guardarEnCache(clave, json.data);
    return {
      vuelos: json.data,
      actualizadoEn: Date.now(),
      desdeCache: false,
      desactualizado: false,
      error: null,
      uso,
    };
  } catch (err) {
    const mixto = location.protocol === "https:" && !obtenerProxy();
    const detalle = err instanceof TypeError && mixto
      ? "No se pudo conectar. El plan gratuito de AviationStack solo funciona por HTTP: configurá un proxy HTTPS en ⚙️ o abrí la app en tu compu (http://localhost)."
      : err.message;
    return {
      vuelos: entrada?.vuelos || [],
      actualizadoEn: entrada?.actualizadoEn || null,
      desdeCache: !!entrada,
      desactualizado: !!entrada,
      error: detalle,
      uso: usoMensual(),
    };
  }
}

/* ---------------- Presentación ---------------- */
const ESTADOS_VUELO = {
  scheduled: { texto: "Programado", clase: "estado-programado", icono: "🕒" },
  active: { texto: "En vuelo", clase: "estado-activo", icono: "✈️" },
  landed: { texto: "Aterrizó", clase: "estado-aterrizado", icono: "🛬" },
  cancelled: { texto: "Cancelado", clase: "estado-cancelado", icono: "🚫" },
  incident: { texto: "Incidente", clase: "estado-cancelado", icono: "⚠️" },
  diverted: { texto: "Desviado", clase: "estado-desviado", icono: "↩️" },
  unknown: { texto: "Sin datos", clase: "estado-neutro", icono: "❔" },
};

function estadoVuelo(codigo) {
  return ESTADOS_VUELO[codigo] || ESTADOS_VUELO.unknown;
}
