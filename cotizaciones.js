"use strict";

/* =========================================================================
   Servicio de cotizaciones (DolarAPI - Argentina, sin API key)
   Expone: obtenerCotizaciones(), convertCurrency(), monedasDisponibles()
   ========================================================================= */

const CLAVE_COTIZACIONES = "gastos-viaje-cotizaciones-v1";
const TTL_COTIZACIONES_MS = 15 * 60 * 1000; // refrescar cada 15 minutos

const URL_DOLARES = "https://dolarapi.com/v1/dolares";
const URL_COTIZACIONES = "https://dolarapi.com/v1/cotizaciones";

const MONEDAS_BASE = ["ARS", "USD", "EUR"];

/* ---------------- Cache en localStorage ---------------- */
function cargarCacheCotizaciones() {
  try {
    const crudo = localStorage.getItem(CLAVE_COTIZACIONES);
    return crudo ? JSON.parse(crudo) : null;
  } catch (_) {
    return null; // cache corrupto: se ignora y se vuelve a pedir
  }
}

function guardarCacheCotizaciones(dolares, cotizaciones) {
  const datos = { dolares, cotizaciones, actualizadoEn: Date.now() };
  try {
    localStorage.setItem(CLAVE_COTIZACIONES, JSON.stringify(datos));
  } catch (_) { /* almacenamiento lleno o no disponible: se sigue igual */ }
  return datos;
}

let promesaEnCurso = null; // evita disparar pedidos duplicados en paralelo

/**
 * Devuelve { dolares, cotizaciones, actualizadoEn, desactualizado, error }.
 * Si el cache (localStorage) tiene menos de TTL_COTIZACIONES_MS, lo reutiliza
 * sin pegarle a la red. Si falla el fetch, cae al último cache disponible
 * marcado como "desactualizado"; si no hay ningún cache, devuelve error.
 */
async function obtenerCotizaciones({ forzar = false } = {}) {
  const cache = cargarCacheCotizaciones();
  const vigente = cache && (Date.now() - cache.actualizadoEn < TTL_COTIZACIONES_MS);

  if (vigente && !forzar) {
    return { ...cache, desactualizado: false, error: null };
  }

  if (promesaEnCurso) return promesaEnCurso;

  promesaEnCurso = (async () => {
    try {
      const [resDolares, resCotizaciones] = await Promise.all([
        fetch(URL_DOLARES),
        fetch(URL_COTIZACIONES),
      ]);
      if (!resDolares.ok || !resCotizaciones.ok) throw new Error("DolarAPI no respondió correctamente");
      const [dolares, cotizaciones] = await Promise.all([resDolares.json(), resCotizaciones.json()]);
      const datos = guardarCacheCotizaciones(dolares, cotizaciones);
      return { ...datos, desactualizado: false, error: null };
    } catch (err) {
      if (cache) return { ...cache, desactualizado: true, error: err.message };
      return { dolares: [], cotizaciones: [], actualizadoEn: null, desactualizado: true, error: err.message };
    } finally {
      promesaEnCurso = null;
    }
  })();

  return promesaEnCurso;
}

/* ---------------- Tasas y conversión ---------------- */
function tasaDeDolar(dolares, tipo) {
  const d = dolares.find(x => x.casa === tipo);
  return d ? (d.compra + d.venta) / 2 : null;
}

function tasaDeCotizacion(cotizaciones, moneda) {
  const c = cotizaciones.find(x => x.moneda === moneda);
  return c ? (c.compra + c.venta) / 2 : null;
}

// Cuántos ARS vale 1 unidad de `moneda` (promedio compra/venta de DolarAPI).
// `tipo` solo aplica cuando moneda === "USD" (oficial | blue | bolsa | ...).
function tasaEnArs(datos, moneda, tipo) {
  if (moneda === "ARS") return 1;
  if (moneda === "USD") return tasaDeDolar(datos.dolares, tipo);
  return tasaDeCotizacion(datos.cotizaciones, moneda);
}

/**
 * Convierte `amount` de la moneda `from` a la moneda `to`.
 * tipo: "oficial" | "blue" (u otra casa de DolarAPI) — por defecto "blue",
 * ya que es el tipo de cambio de referencia real. Solo afecta si from/to es USD.
 * Devuelve una Promise<{ valor, desactualizado, error, actualizadoEn }>.
 * `valor` es null si no hay cotización disponible para alguna de las monedas.
 */
async function convertCurrency(amount, from, to, tipo = "blue") {
  const datos = await obtenerCotizaciones();

  if (from === to) {
    return { valor: amount, desactualizado: datos.desactualizado, error: datos.error, actualizadoEn: datos.actualizadoEn };
  }

  const tasaFrom = tasaEnArs(datos, from, tipo);
  const tasaTo = tasaEnArs(datos, to, tipo);
  if (tasaFrom == null || tasaTo == null) {
    return {
      valor: null,
      desactualizado: datos.desactualizado,
      error: `No hay cotización disponible para ${tasaFrom == null ? from : to}`,
      actualizadoEn: datos.actualizadoEn,
    };
  }

  const enArs = amount * tasaFrom;
  const valor = to === "ARS" ? enArs : enArs / tasaTo;
  return { valor, desactualizado: datos.desactualizado, error: datos.error, actualizadoEn: datos.actualizadoEn };
}

/**
 * Monedas que se pueden agregar al conversor además de ARS/USD/EUR,
 * a partir de lo que devuelve /v1/cotizaciones (euro, real, etc.).
 * Devuelve [{ codigo, nombre }] sin duplicados.
 */
function monedasDisponibles(datos) {
  const vistas = new Set();
  const lista = [];
  for (const c of datos.cotizaciones || []) {
    if (MONEDAS_BASE.includes(c.moneda) || vistas.has(c.moneda)) continue;
    vistas.add(c.moneda);
    lista.push({ codigo: c.moneda, nombre: c.nombre });
  }
  return lista;
}
