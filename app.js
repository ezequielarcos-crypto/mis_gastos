"use strict";

/* ================= Estado y persistencia ================= */
const CLAVE = "gastos-viaje-v1";

let estado = cargar();

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const datos = JSON.parse(crudo);
      datos.pagosSaldados ??= [];
      datos.vuelosGuardados ??= [];
      return datos;
    }
  } catch (_) { /* datos corruptos: se reinicia */ }
  return { personas: [], gastos: [], pagosSaldados: [], vuelosGuardados: [] };
}

function guardar() {
  localStorage.setItem(CLAVE, JSON.stringify(estado));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ================= Utilidades ================= */
const LOCALES = { ARS: "es-AR", USD: "en-US", EUR: "de-DE" };

function fmtMonto(valor, moneda) {
  return new Intl.NumberFormat(LOCALES[moneda] || "es-AR", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

function fmtFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " · " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

const ETIQUETAS_PAGO = { efectivo: "💵 Efectivo", credito: "💳 Crédito", debito: "🏧 Débito" };

function iniciales(nombre) {
  return nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function nombreDe(id) {
  const p = estado.personas.find(p => p.id === id);
  return p ? p.nombre : "?";
}

function escaparHtml(t) {
  const div = document.createElement("div");
  div.textContent = t;
  return div.innerHTML;
}

let toastTimer;
function toast(msj) {
  const el = document.getElementById("toast");
  el.textContent = msj;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

/* ================= Diálogo de confirmación ================= */
// Reemplaza a confirm() del navegador, que muestra el dominio ("… dice") y no
// se puede estilar. Devuelve una promesa que resuelve true/false.
const overlayConfirmar = document.getElementById("overlay-confirmar");
let resolverConfirmacion = null;

function confirmar({ titulo, texto, icono = "🗑️", aceptar = "Borrar" }) {
  document.getElementById("confirmar-icono").textContent = icono;
  document.getElementById("confirmar-titulo").textContent = titulo;
  document.getElementById("confirmar-texto").textContent = texto;
  document.getElementById("confirmar-si").textContent = aceptar;
  overlayConfirmar.classList.remove("hidden");
  document.getElementById("confirmar-no").focus();
  return new Promise(resolve => { resolverConfirmacion = resolve; });
}

function cerrarConfirmacion(respuesta) {
  overlayConfirmar.classList.add("hidden");
  const resolver = resolverConfirmacion;
  resolverConfirmacion = null;
  if (resolver) resolver(respuesta);
}

document.getElementById("confirmar-si").addEventListener("click", () => cerrarConfirmacion(true));
document.getElementById("confirmar-no").addEventListener("click", () => cerrarConfirmacion(false));
overlayConfirmar.addEventListener("click", e => { if (e.target === overlayConfirmar) cerrarConfirmacion(false); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !overlayConfirmar.classList.contains("hidden")) cerrarConfirmacion(false);
});

/* ================= Navegación por pestañas ================= */
document.querySelectorAll(".tabbar-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabbar-btn").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    document.getElementById("fab").style.display = btn.dataset.tab === "gastos" ? "" : "none";
  });
});

/* ================= Personas ================= */
document.getElementById("form-persona").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("input-nombre");
  const nombre = input.value.trim();
  if (!nombre) return;
  if (estado.personas.some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
    toast("Ya hay un viajero con ese nombre");
    return;
  }
  estado.personas.push({ id: uid(), nombre });
  input.value = "";
  guardar();
  render();
});

function quitarPersona(id) {
  const involucrada = estado.gastos.some(g => g.pagadorId === id || g.participantes.includes(id)) ||
    estado.pagosSaldados.some(p => p.de === id || p.a === id);
  if (involucrada) {
    toast("No se puede quitar: tiene gastos o pagos asociados");
    return;
  }
  estado.personas = estado.personas.filter(p => p.id !== id);
  guardar();
  render();
}

/* ================= Hoja de nuevo gasto ================= */
const overlay = document.getElementById("overlay");
let seleccion = { moneda: "ARS", pago: "efectivo", pagadorId: null, participantes: new Set() };

document.getElementById("fab").addEventListener("click", abrirSheet);
document.getElementById("btn-cancelar").addEventListener("click", cerrarSheet);
overlay.addEventListener("click", e => { if (e.target === overlay) cerrarSheet(); });

function abrirSheet() {
  if (estado.personas.length === 0) {
    toast("Primero agregá a los viajeros en la pestaña Personas");
    document.querySelector('[data-tab="personas"]').click();
    return;
  }
  document.getElementById("form-gasto").reset();
  seleccion.pago = "efectivo";
  seleccion.pagadorId = estado.personas[0].id;
  seleccion.participantes = new Set(estado.personas.map(p => p.id));
  pintarSegmentos("seg-moneda", seleccion.moneda);
  pintarSegmentos("seg-pago", seleccion.pago);
  document.getElementById("check-dividir").checked = true;
  document.getElementById("campo-participantes").classList.remove("hidden");
  pintarChips();
  document.getElementById("fecha-auto").textContent =
    "📅 Fecha y hora de carga: " + fmtFecha(new Date().toISOString()) + " (automática)";
  overlay.classList.remove("hidden");
  document.getElementById("input-monto").focus();
}

function cerrarSheet() {
  overlay.classList.add("hidden");
}

function pintarSegmentos(idGrupo, valorActivo) {
  document.querySelectorAll(`#${idGrupo} .seg`).forEach(b =>
    b.classList.toggle("activo", b.dataset.valor === valorActivo));
}

document.getElementById("seg-moneda").addEventListener("click", e => {
  const b = e.target.closest(".seg");
  if (!b) return;
  seleccion.moneda = b.dataset.valor;
  pintarSegmentos("seg-moneda", seleccion.moneda);
});

document.getElementById("seg-pago").addEventListener("click", e => {
  const b = e.target.closest(".seg");
  if (!b) return;
  seleccion.pago = b.dataset.valor;
  pintarSegmentos("seg-pago", seleccion.pago);
});

document.getElementById("check-dividir").addEventListener("change", e => {
  document.getElementById("campo-participantes").classList.toggle("hidden", !e.target.checked);
});

function pintarChips() {
  const cPagador = document.getElementById("chips-pagador");
  const cPart = document.getElementById("chips-participantes");
  cPagador.innerHTML = "";
  cPart.innerHTML = "";
  estado.personas.forEach(p => {
    const b1 = document.createElement("button");
    b1.type = "button";
    b1.className = "chip" + (seleccion.pagadorId === p.id ? " activo" : "");
    b1.textContent = p.nombre;
    b1.addEventListener("click", () => { seleccion.pagadorId = p.id; pintarChips(); });
    cPagador.appendChild(b1);

    const b2 = document.createElement("button");
    b2.type = "button";
    b2.className = "chip" + (seleccion.participantes.has(p.id) ? " activo" : "");
    b2.textContent = p.nombre;
    b2.addEventListener("click", () => {
      seleccion.participantes.has(p.id) ? seleccion.participantes.delete(p.id) : seleccion.participantes.add(p.id);
      pintarChips();
    });
    cPart.appendChild(b2);
  });
}

document.getElementById("form-gasto").addEventListener("submit", e => {
  e.preventDefault();
  const textoMonto = document.getElementById("input-monto").value.trim()
    .replace(/\./g, "").replace(",", ".");
  const monto = parseFloat(textoMonto);
  const motivo = document.getElementById("input-motivo").value.trim();

  const divide = document.getElementById("check-dividir").checked;

  if (!monto || monto <= 0) { toast("Ingresá un monto válido"); return; }
  if (!motivo) { toast("Ingresá el motivo del gasto"); return; }
  if (!seleccion.pagadorId) { toast("Seleccioná quién pagó"); return; }
  if (divide && seleccion.participantes.size === 0) { toast("Seleccioná entre quiénes se divide"); return; }

  estado.gastos.unshift({
    id: uid(),
    monto,
    motivo,
    moneda: seleccion.moneda,
    pago: seleccion.pago,
    pagadorId: seleccion.pagadorId,
    participantes: divide ? [...seleccion.participantes] : [seleccion.pagadorId],
    fecha: new Date().toISOString(),
  });
  guardar();
  cerrarSheet();
  render();
  toast("Gasto guardado ✔");
});

async function borrarGasto(id) {
  const gasto = estado.gastos.find(g => g.id === id);
  if (!gasto) return;
  const ok = await confirmar({
    titulo: "¿Borrar este gasto?",
    texto: `“${gasto.motivo}” · ${fmtMonto(gasto.monto, gasto.moneda)}\nSe va a recalcular el balance del grupo.`,
  });
  if (!ok) return;
  estado.gastos = estado.gastos.filter(g => g.id !== id);
  guardar();
  render();
  toast("Gasto borrado");
}

/* ================= Balance ================= */
function calcularBalances() {
  // Agrupado por moneda: { moneda: { total, porPersona: { id: {pago, consumio, transfirio, recibio} }, transferencias } }
  const porMoneda = {};
  for (const g of estado.gastos) {
    const m = porMoneda[g.moneda] ??= { total: 0, porPersona: {} };
    m.total += g.monto;
    const cuota = g.monto / g.participantes.length;
    const reg = id => m.porPersona[id] ??= { pago: 0, consumio: 0, transfirio: 0, recibio: 0 };
    reg(g.pagadorId).pago += g.monto;
    g.participantes.forEach(id => { reg(id).consumio += cuota; });
  }
  // Los pagos ya saldados corrigen los saldos pendientes
  for (const p of estado.pagosSaldados) {
    const m = porMoneda[p.moneda];
    if (!m) continue;
    const reg = id => m.porPersona[id] ??= { pago: 0, consumio: 0, transfirio: 0, recibio: 0 };
    reg(p.de).transfirio += p.monto;
    reg(p.a).recibio += p.monto;
  }
  for (const m of Object.values(porMoneda)) {
    m.transferencias = liquidar(m.porPersona);
  }
  return porMoneda;
}

function saldoDe(v) {
  return v.pago - v.consumio + v.transfirio - v.recibio;
}

// Algoritmo voraz: empareja deudores con acreedores para minimizar transferencias
function liquidar(porPersona) {
  const saldos = Object.entries(porPersona)
    .map(([id, v]) => ({ id, saldo: saldoDe(v) }))
    .filter(s => Math.abs(s.saldo) > 0.005);
  const deudores = saldos.filter(s => s.saldo < 0).sort((a, b) => a.saldo - b.saldo);
  const acreedores = saldos.filter(s => s.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const movimientos = [];
  let i = 0, j = 0;
  while (i < deudores.length && j < acreedores.length) {
    const pago = Math.min(-deudores[i].saldo, acreedores[j].saldo);
    movimientos.push({ de: deudores[i].id, a: acreedores[j].id, monto: pago });
    deudores[i].saldo += pago;
    acreedores[j].saldo -= pago;
    if (deudores[i].saldo > -0.005) i++;
    if (acreedores[j].saldo < 0.005) j++;
  }
  return movimientos;
}

function saldarDeuda(de, a, monto, moneda) {
  estado.pagosSaldados.push({ id: uid(), de, a, monto, moneda, fecha: new Date().toISOString() });
  guardar();
  render();
  toast(`Pago de ${nombreDe(de)} a ${nombreDe(a)} registrado ✔`);
}

function deshacerPago(id) {
  estado.pagosSaldados = estado.pagosSaldados.filter(p => p.id !== id);
  guardar();
  render();
  toast("Pago deshecho");
}

/* ================= Render ================= */
function render() {
  renderPersonas();
  renderGastos();
  renderBalance();
}

function renderPersonas() {
  const ul = document.getElementById("lista-personas");
  ul.innerHTML = "";
  estado.personas.forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="avatar">${escaparHtml(iniciales(p.nombre))}</span>
      <span class="nombre">${escaparHtml(p.nombre)}</span>`;
    const btn = document.createElement("button");
    btn.className = "btn-quitar";
    btn.textContent = "✕";
    btn.setAttribute("aria-label", "Quitar a " + p.nombre);
    btn.addEventListener("click", () => quitarPersona(p.id));
    li.appendChild(btn);
    ul.appendChild(li);
  });
  document.getElementById("personas-vacio").classList.toggle("hidden", estado.personas.length > 0);
}

let filtroPersona = null; // null = todos

function renderGastos() {
  const cont = document.getElementById("lista-gastos");
  const totales = document.getElementById("resumen-totales");
  const filtro = document.getElementById("filtro-personas");
  cont.innerHTML = "";
  totales.innerHTML = "";
  filtro.innerHTML = "";

  // Si la persona filtrada fue eliminada, volver a "Todos"
  if (filtroPersona && !estado.personas.some(p => p.id === filtroPersona)) filtroPersona = null;

  // Chips de filtro por persona (solo si hay viajeros y gastos)
  if (estado.personas.length > 0 && estado.gastos.length > 0) {
    const chipTodos = document.createElement("button");
    chipTodos.className = "chip" + (filtroPersona === null ? " activo" : "");
    chipTodos.textContent = "Todos";
    chipTodos.addEventListener("click", () => { filtroPersona = null; renderGastos(); });
    filtro.appendChild(chipTodos);
    estado.personas.forEach(p => {
      const chip = document.createElement("button");
      chip.className = "chip" + (filtroPersona === p.id ? " activo" : "");
      chip.textContent = p.nombre;
      chip.addEventListener("click", () => { filtroPersona = p.id; renderGastos(); });
      filtro.appendChild(chip);
    });
  }

  // Gastos visibles según el filtro (pagó o participa)
  const visibles = filtroPersona
    ? estado.gastos.filter(g => g.pagadorId === filtroPersona || g.participantes.includes(filtroPersona))
    : estado.gastos;

  document.getElementById("gastos-vacio").classList.toggle("hidden", estado.gastos.length > 0);

  // Chips de total por moneda: todo el viaje, o la parte de la persona filtrada
  const sumas = {};
  if (filtroPersona) {
    estado.gastos.forEach(g => {
      if (!g.participantes.includes(filtroPersona)) return;
      sumas[g.moneda] = (sumas[g.moneda] || 0) + g.monto / g.participantes.length;
    });
  } else {
    estado.gastos.forEach(g => sumas[g.moneda] = (sumas[g.moneda] || 0) + g.monto);
  }
  const etiqueta = filtroPersona ? `Parte de ${nombreDe(filtroPersona)}` : "Total";
  Object.entries(sumas).forEach(([moneda, total]) => {
    const chip = document.createElement("div");
    chip.className = "total-chip";
    chip.innerHTML = `<small>${escaparHtml(etiqueta)} ${moneda}</small>${fmtMonto(total, moneda)}`;
    totales.appendChild(chip);
  });

  visibles.forEach(g => {
    const card = document.createElement("div");
    card.className = "gasto-card";
    const nombresPart = g.participantes.map(nombreDe).join(", ");
    card.innerHTML = `
      <div class="gasto-info">
        <div class="gasto-motivo">${escaparHtml(g.motivo)}</div>
        <div class="gasto-meta">
          Pagó <strong>${escaparHtml(nombreDe(g.pagadorId))}</strong> · ${fmtFecha(g.fecha)}<br>
          Dividido entre: ${escaparHtml(nombresPart)}
        </div>
      </div>
      <div class="gasto-derecha">
        <span class="gasto-monto">${fmtMonto(g.monto, g.moneda)}</span>
        <span class="etiqueta-pago">${ETIQUETAS_PAGO[g.pago]}</span>
      </div>`;
    const btn = document.createElement("button");
    btn.className = "btn-borrar-gasto";
    btn.textContent = "🗑";
    btn.setAttribute("aria-label", "Borrar gasto");
    btn.addEventListener("click", () => borrarGasto(g.id));
    card.querySelector(".gasto-derecha").appendChild(btn);
    cont.appendChild(card);
  });
}

function renderBalance() {
  const cont = document.getElementById("contenido-balance");
  cont.innerHTML = "";
  document.getElementById("balance-vacio").classList.toggle("hidden", estado.gastos.length > 0);
  if (estado.gastos.length === 0) return;

  const balances = calcularBalances();
  for (const [moneda, datos] of Object.entries(balances)) {
    const bloque = document.createElement("div");
    bloque.className = "bloque-moneda card";
    let html = `<div class="titulo-moneda">Moneda: ${moneda} — Total ${fmtMonto(datos.total, moneda)}</div>`;

    for (const [id, v] of Object.entries(datos.porPersona)) {
      const saldo = saldoDe(v);
      const clase = saldo > 0.005 ? "positivo" : saldo < -0.005 ? "negativo" : "neutro";
      const signo = saldo > 0.005 ? "+" : "";
      let sub = `Pagó ${fmtMonto(v.pago, moneda)} · Le corresponde ${fmtMonto(v.consumio, moneda)}`;
      if (v.transfirio > 0.005) sub += ` · Ya transfirió ${fmtMonto(v.transfirio, moneda)}`;
      if (v.recibio > 0.005) sub += ` · Ya recibió ${fmtMonto(v.recibio, moneda)}`;
      html += `
        <div class="fila-balance">
          <span class="avatar">${escaparHtml(iniciales(nombreDe(id)))}</span>
          <div class="detalle">
            <div class="nombre">${escaparHtml(nombreDe(id))}</div>
            <div class="sub">${sub}</div>
          </div>
          <span class="saldo ${clase}">${signo}${fmtMonto(saldo, moneda)}</span>
        </div>`;
    }
    bloque.innerHTML = html;

    if (datos.transferencias.length > 0) {
      const titulo = document.createElement("div");
      titulo.className = "titulo-moneda";
      titulo.style.marginTop = "14px";
      titulo.textContent = "Cómo saldar las cuentas";
      bloque.appendChild(titulo);
      datos.transferencias.forEach(t => {
        const fila = document.createElement("div");
        fila.className = "transferencia";
        fila.innerHTML = `<span class="transferencia-texto">💸 <strong>${escaparHtml(nombreDe(t.de))}</strong>
          le paga <strong>${fmtMonto(t.monto, moneda)}</strong>
          a <strong>${escaparHtml(nombreDe(t.a))}</strong></span>`;
        const btn = document.createElement("button");
        btn.className = "btn-check";
        btn.textContent = "✓";
        btn.setAttribute("aria-label", "Marcar pago como realizado");
        btn.addEventListener("click", () => saldarDeuda(t.de, t.a, t.monto, moneda));
        fila.appendChild(btn);
        bloque.appendChild(fila);
      });
    } else {
      const ok = document.createElement("div");
      ok.className = "transferencia";
      ok.textContent = "✅ Las cuentas están saldadas";
      bloque.appendChild(ok);
    }

    // Historial de pagos ya marcados como realizados en esta moneda
    const realizados = estado.pagosSaldados.filter(p => p.moneda === moneda);
    if (realizados.length > 0) {
      const titulo = document.createElement("div");
      titulo.className = "titulo-moneda";
      titulo.style.marginTop = "14px";
      titulo.textContent = "Pagos realizados";
      bloque.appendChild(titulo);
      realizados.forEach(p => {
        const fila = document.createElement("div");
        fila.className = "transferencia pago-realizado";
        fila.innerHTML = `<span class="transferencia-texto">✔ <strong>${escaparHtml(nombreDe(p.de))}</strong>
          le pagó <strong>${fmtMonto(p.monto, moneda)}</strong>
          a <strong>${escaparHtml(nombreDe(p.a))}</strong> · ${fmtFecha(p.fecha)}</span>`;
        const btn = document.createElement("button");
        btn.className = "btn-deshacer";
        btn.textContent = "↩";
        btn.setAttribute("aria-label", "Deshacer este pago");
        btn.addEventListener("click", () => deshacerPago(p.id));
        fila.appendChild(btn);
        bloque.appendChild(fila);
      });
    }

    cont.appendChild(bloque);
  }
}

/* ================= Conversor de moneda ================= */
const NOMBRES_MONEDA_BASE = { ARS: "Peso argentino", USD: "Dólar estadounidense", EUR: "Euro" };

let conversorEstado = {
  de: "ARS",
  a: "USD",
  tipoDolar: "blue",
  monedasExtra: [], // [{ codigo, nombre }] agregadas por el usuario en esta sesión
};

const selConvDe = document.getElementById("conv-de");
const selConvA = document.getElementById("conv-a");
const selNuevaMoneda = document.getElementById("conv-nueva-moneda");

// Formato seguro: algunas monedas de DolarAPI (ej. cripto) no son códigos ISO
// válidos para Intl.NumberFormat, así que si falla se usa un formato genérico.
function fmtMontoSeguro(valor, moneda) {
  try {
    return fmtMonto(valor, moneda);
  } catch (_) {
    return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor) + " " + moneda;
  }
}

function pintarSelectsConversor() {
  const opciones = [
    ...MONEDAS_BASE.map(codigo => ({ codigo, nombre: NOMBRES_MONEDA_BASE[codigo] })),
    ...conversorEstado.monedasExtra,
  ];
  [selConvDe, selConvA].forEach(sel => {
    sel.innerHTML = "";
    opciones.forEach(({ codigo, nombre }) => {
      const opt = document.createElement("option");
      opt.value = codigo;
      opt.textContent = `${codigo} — ${nombre}`;
      sel.appendChild(opt);
    });
  });
  selConvDe.value = conversorEstado.de;
  selConvA.value = conversorEstado.a;
}

function actualizarVisibilidadTipoDolar() {
  const involucraDolar = conversorEstado.de === "USD" || conversorEstado.a === "USD";
  document.getElementById("campo-tipo-dolar").classList.toggle("hidden", !involucraDolar);
}

let tokenConversion = 0;
async function actualizarConversion() {
  const elResultado = document.getElementById("conv-resultado-valor");
  const elEstado = document.getElementById("conv-estado");
  const textoMonto = document.getElementById("conv-monto").value.trim()
    .replace(/\./g, "").replace(",", ".");
  const monto = parseFloat(textoMonto);

  if (!monto || monto <= 0) {
    elResultado.textContent = "—";
    elEstado.textContent = "";
    elEstado.className = "nota";
    return;
  }

  const miToken = ++tokenConversion;
  const { valor, desactualizado, error, actualizadoEn } =
    await convertCurrency(monto, conversorEstado.de, conversorEstado.a, conversorEstado.tipoDolar);
  if (miToken !== tokenConversion) return; // llegó una respuesta vieja: se descarta

  if (valor == null) {
    elResultado.textContent = "—";
    elEstado.textContent = "⚠️ " + (error || "No se pudo obtener la cotización");
    elEstado.className = "nota nota-error";
    return;
  }

  elResultado.textContent = fmtMontoSeguro(valor, conversorEstado.a);
  const fecha = actualizadoEn ? "Cotización del " + fmtFecha(new Date(actualizadoEn).toISOString()) : "";
  if (desactualizado) {
    elEstado.textContent = "⚠️ " + (fecha || "Sin conexión") + " (desactualizada)";
    elEstado.className = "nota nota-desactualizado";
  } else {
    elEstado.textContent = fecha;
    elEstado.className = "nota";
  }
}

selConvDe.addEventListener("change", () => {
  conversorEstado.de = selConvDe.value;
  actualizarVisibilidadTipoDolar();
  actualizarConversion();
});
selConvA.addEventListener("change", () => {
  conversorEstado.a = selConvA.value;
  actualizarVisibilidadTipoDolar();
  actualizarConversion();
});

document.getElementById("conv-invertir").addEventListener("click", () => {
  [conversorEstado.de, conversorEstado.a] = [conversorEstado.a, conversorEstado.de];
  pintarSelectsConversor();
  actualizarVisibilidadTipoDolar();
  actualizarConversion();
});

document.getElementById("conv-monto").addEventListener("input", actualizarConversion);

document.getElementById("seg-tipo-dolar").addEventListener("click", e => {
  const b = e.target.closest(".seg");
  if (!b) return;
  conversorEstado.tipoDolar = b.dataset.valor;
  pintarSegmentos("seg-tipo-dolar", conversorEstado.tipoDolar);
  actualizarConversion();
});

document.getElementById("btn-agregar-moneda").addEventListener("click", async () => {
  const datos = await obtenerCotizaciones();
  const yaAgregadas = new Set([...MONEDAS_BASE, ...conversorEstado.monedasExtra.map(m => m.codigo)]);
  const disponibles = monedasDisponibles(datos).filter(m => !yaAgregadas.has(m.codigo));
  if (disponibles.length === 0) {
    toast("No hay más monedas disponibles para agregar");
    return;
  }
  selNuevaMoneda.innerHTML = "";
  disponibles.forEach(({ codigo, nombre }) => {
    const opt = document.createElement("option");
    opt.value = codigo;
    opt.textContent = `${codigo} — ${nombre}`;
    selNuevaMoneda.appendChild(opt);
  });
  selNuevaMoneda.classList.remove("hidden");
  selNuevaMoneda.focus();
});

selNuevaMoneda.addEventListener("change", () => {
  const codigo = selNuevaMoneda.value;
  if (!codigo) return;
  const nombre = selNuevaMoneda.selectedOptions[0]?.textContent.split(" — ")[1] || codigo;
  conversorEstado.monedasExtra.push({ codigo, nombre });
  conversorEstado.a = codigo;
  selNuevaMoneda.classList.add("hidden");
  selNuevaMoneda.innerHTML = "";
  pintarSelectsConversor();
  actualizarVisibilidadTipoDolar();
  actualizarConversion();
  toast(`${codigo} agregado al conversor`);
});

document.getElementById("btn-refrescar-cotizacion").addEventListener("click", async () => {
  await obtenerCotizaciones({ forzar: true });
  actualizarConversion();
});

pintarSelectsConversor();
actualizarVisibilidadTipoDolar();
actualizarConversion();

/* ================= Vuelos (AviationStack) ================= */
let vuelosEstado = {
  modo: "numero",       // "numero" | "ruta"
  resultados: [],
  buscado: false,
};

const inputVueloNumero = document.getElementById("vuelo-numero");
const inputVueloOrigen = document.getElementById("vuelo-origen");
const inputVueloDestino = document.getElementById("vuelo-destino");
const elVuelosEstado = document.getElementById("vuelos-estado");
const contConfigVuelos = document.getElementById("config-vuelos");

// Hora local del aeropuerto (AviationStack devuelve ISO + su zona horaria IANA)
function fmtHoraAeropuerto(iso, zona) {
  if (!iso) return "--:--";
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zona || undefined,
    });
  } catch (_) {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

function fmtFechaVuelo(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha + "T00:00:00");
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });
}

function idDeVuelo(v) {
  const numero = v.flight?.iata || v.flight?.number || "?";
  return `${numero}-${v.flight_date || ""}`;
}

document.getElementById("seg-modo-vuelo").addEventListener("click", e => {
  const b = e.target.closest(".seg");
  if (!b) return;
  vuelosEstado.modo = b.dataset.valor;
  pintarSegmentos("seg-modo-vuelo", vuelosEstado.modo);
  document.getElementById("campo-vuelo-numero").classList.toggle("hidden", vuelosEstado.modo !== "numero");
  document.getElementById("campo-vuelo-ruta").classList.toggle("hidden", vuelosEstado.modo !== "ruta");
});

document.getElementById("vuelo-invertir").addEventListener("click", () => {
  const o = inputVueloOrigen.value;
  inputVueloOrigen.value = inputVueloDestino.value;
  inputVueloDestino.value = o;
});

[inputVueloNumero, inputVueloOrigen, inputVueloDestino].forEach(input => {
  input.addEventListener("input", () => { input.value = input.value.toUpperCase(); });
});

document.getElementById("form-vuelo").addEventListener("submit", e => {
  e.preventDefault();
  ejecutarBusquedaVuelos();
});

async function ejecutarBusquedaVuelos({ forzar = false } = {}) {
  let filtros;
  if (vuelosEstado.modo === "numero") {
    const numero = inputVueloNumero.value.trim().replace(/\s+/g, "");
    if (!numero) { toast("Ingresá el número de vuelo (ej: AR1301)"); return; }
    filtros = { flight_iata: numero };
  } else {
    const origen = inputVueloOrigen.value.trim();
    const destino = inputVueloDestino.value.trim();
    if (!origen && !destino) { toast("Ingresá al menos un aeropuerto"); return; }
    filtros = { dep_iata: origen, arr_iata: destino };
  }

  elVuelosEstado.textContent = "Buscando vuelos…";
  elVuelosEstado.className = "nota";

  const { vuelos, actualizadoEn, desdeCache, error, uso } = await buscarVuelos(filtros, { forzar });
  vuelosEstado.resultados = vuelos;
  vuelosEstado.buscado = true;
  renderVuelos();
  renderUsoApi(uso);

  if (error) {
    elVuelosEstado.textContent = "⚠️ " + error;
    elVuelosEstado.className = "nota nota-error";
    if (!obtenerClaveApi()) contConfigVuelos.classList.remove("hidden");
    return;
  }
  if (vuelos.length === 0) {
    elVuelosEstado.textContent = "No se encontraron vuelos con esos datos.";
    elVuelosEstado.className = "nota";
    return;
  }
  const cuando = actualizadoEn ? fmtFecha(new Date(actualizadoEn).toISOString()) : "";
  elVuelosEstado.textContent = `${vuelos.length} vuelo(s) · ${desdeCache ? "guardado del " : "consultado el "}${cuando}`;
  elVuelosEstado.className = "nota";
}

function tarjetaVuelo(v, { guardado = false } = {}) {
  const est = estadoVuelo(v.flight_status);
  const salida = v.departure || {};
  const llegada = v.arrival || {};
  const numero = v.flight?.iata || v.flight?.number || "—";
  const aerolinea = v.airline?.name || "";
  const demora = salida.delay || llegada.delay;

  const card = document.createElement("div");
  card.className = "vuelo-card";
  card.innerHTML = `
    <div class="vuelo-cabecera">
      <div>
        <div class="vuelo-numero">${escaparHtml(numero)}</div>
        <div class="vuelo-aerolinea">${escaparHtml(aerolinea)}${v.flight_date ? " · " + escaparHtml(fmtFechaVuelo(v.flight_date)) : ""}</div>
      </div>
      <span class="vuelo-estado ${est.clase}">${est.icono} ${est.texto}</span>
    </div>
    <div class="vuelo-ruta">
      <div class="vuelo-punta">
        <div class="vuelo-iata">${escaparHtml(salida.iata || "???")}</div>
        <div class="vuelo-hora">${fmtHoraAeropuerto(salida.estimated || salida.scheduled, salida.timezone)}</div>
        <div class="vuelo-detalle">${escaparHtml(salida.airport || "")}</div>
        <div class="vuelo-detalle">${salida.terminal ? "Terminal " + escaparHtml(salida.terminal) : ""}${salida.gate ? " · Puerta " + escaparHtml(salida.gate) : ""}</div>
      </div>
      <div class="vuelo-flecha">✈</div>
      <div class="vuelo-punta vuelo-punta-fin">
        <div class="vuelo-iata">${escaparHtml(llegada.iata || "???")}</div>
        <div class="vuelo-hora">${fmtHoraAeropuerto(llegada.estimated || llegada.scheduled, llegada.timezone)}</div>
        <div class="vuelo-detalle">${escaparHtml(llegada.airport || "")}</div>
        <div class="vuelo-detalle">${llegada.terminal ? "Terminal " + escaparHtml(llegada.terminal) : ""}${llegada.baggage ? " · Cinta " + escaparHtml(llegada.baggage) : ""}</div>
      </div>
    </div>
    ${demora ? `<div class="vuelo-demora">⏱️ Demora de ${demora} min</div>` : ""}`;

  const btn = document.createElement("button");
  btn.className = guardado ? "btn-secundario btn-vuelo-accion" : "btn-secundario btn-vuelo-accion";
  btn.textContent = guardado ? "🗑 Quitar de mi itinerario" : "📌 Guardar en mi itinerario";
  btn.addEventListener("click", () => guardado ? quitarVueloGuardado(idDeVuelo(v)) : guardarVuelo(v));
  card.appendChild(btn);
  return card;
}

function renderVuelos() {
  const cont = document.getElementById("lista-vuelos");
  cont.innerHTML = "";
  const guardados = new Set(estado.vuelosGuardados.map(idDeVuelo));
  vuelosEstado.resultados.forEach(v => cont.appendChild(tarjetaVuelo(v, { guardado: guardados.has(idDeVuelo(v)) })));
  document.getElementById("vuelos-vacio").classList.toggle(
    "hidden",
    vuelosEstado.buscado || estado.vuelosGuardados.length > 0
  );
  renderVuelosGuardados();
}

function renderVuelosGuardados() {
  const cont = document.getElementById("vuelos-guardados");
  cont.innerHTML = "";
  if (estado.vuelosGuardados.length === 0) return;
  const titulo = document.createElement("div");
  titulo.className = "titulo-moneda";
  titulo.style.marginTop = "6px";
  titulo.textContent = "📌 Mi itinerario";
  cont.appendChild(titulo);
  const lista = document.createElement("div");
  lista.className = "lista";
  estado.vuelosGuardados.forEach(v => lista.appendChild(tarjetaVuelo(v, { guardado: true })));
  cont.appendChild(lista);
}

function guardarVuelo(v) {
  if (estado.vuelosGuardados.some(g => idDeVuelo(g) === idDeVuelo(v))) return;
  estado.vuelosGuardados.push(v);
  guardar();
  renderVuelos();
  toast("Vuelo guardado en tu itinerario ✔");
}

function quitarVueloGuardado(id) {
  estado.vuelosGuardados = estado.vuelosGuardados.filter(v => idDeVuelo(v) !== id);
  guardar();
  renderVuelos();
  toast("Vuelo quitado del itinerario");
}

/* ---------- Configuración de la clave de API ---------- */
function renderUsoApi(uso) {
  const el = document.getElementById("uso-api");
  const u = uso || usoMensual();
  el.textContent = `Consultas hechas este mes: ${u.consultas} de ${u.limite} (plan gratuito).`;
  el.className = u.consultas >= u.limite ? "nota nota-error" : "nota";
}

document.getElementById("btn-config-vuelos").addEventListener("click", () => {
  const oculto = contConfigVuelos.classList.toggle("hidden");
  if (!oculto) {
    document.getElementById("input-api-key").value = obtenerClaveApi();
    document.getElementById("input-api-proxy").value = obtenerProxy();
    renderUsoApi();
  }
});

document.getElementById("btn-guardar-key").addEventListener("click", () => {
  guardarClaveApi(document.getElementById("input-api-key").value);
  guardarProxy(document.getElementById("input-api-proxy").value);
  contConfigVuelos.classList.add("hidden");
  toast(obtenerClaveApi() ? "Clave guardada ✔" : "Clave vacía: no se podrán buscar vuelos");
});

document.getElementById("btn-borrar-key").addEventListener("click", () => {
  borrarClaveApi();
  guardarProxy("");
  document.getElementById("input-api-key").value = "";
  document.getElementById("input-api-proxy").value = "";
  toast("Clave borrada de este dispositivo");
});

renderVuelos();

/* ================= Reiniciar viaje ================= */
document.getElementById("btn-reiniciar").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "¿Empezar un viaje nuevo?",
    texto: "Se van a borrar todos los viajeros, gastos, pagos y vuelos guardados de este dispositivo.\nEsta acción no se puede deshacer.",
    icono: "⚠️",
    aceptar: "Borrar todo",
  });
  if (!ok) return;
  estado = { personas: [], gastos: [], pagosSaldados: [], vuelosGuardados: [] };
  guardar();
  render();
  renderVuelos();
  toast("Viaje reiniciado");
});

/* ================= Service worker (PWA) ================= */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
