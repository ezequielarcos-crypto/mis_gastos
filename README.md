# ✈️ Gastos de Viaje

App web para llevar el control de gastos compartidos entre un grupo de viajeros: quién pagó qué, cómo se divide entre los participantes y cuánto le debe cada uno a cada uno.

Es una **PWA** (se puede instalar en el celular y funciona offline): sin backend, sin build, todo corre en el navegador y los datos se guardan en `localStorage` del dispositivo.

🔗 Demo: https://ezequielarcos-crypto.github.io/mis_gastos/

## Funcionalidad

- **Gastos**: cargar gastos con monto (ARS/USD/EUR), motivo, forma de pago y entre quiénes se divide. Filtro por persona y totales por moneda.
- **Balance**: calcula automáticamente cuánto puso, consumió y debe cada persona, y sugiere las transferencias mínimas para saldar las cuentas (algoritmo voraz deudor↔acreedor). Permite marcar pagos como realizados.
- **Personas**: alta y baja de viajeros (no se puede borrar a alguien con gastos o pagos asociados).
- **Cambio** *(v3.0)*: conversor de moneda en tiempo real usando [DolarAPI](https://dolarapi.com) (Argentina, sin API key). Convierte entre ARS, USD, EUR y otras divisas (real, etc.), eligiendo dólar oficial o blue. Cotizaciones cacheadas 15 minutos; si no hay conexión, muestra el último valor conocido marcado como desactualizado.
- **Confirmaciones propias** *(nuevo en v4.1)*: las acciones destructivas (borrar un gasto, reiniciar el viaje) usan un diálogo con el diseño de la app en lugar del `confirm()` del navegador, que mostraba el dominio (“…github.io dice”) y no se puede estilar. Se cierra con Cancelar, tocando afuera o con Escape.
- **Vuelos** *(v4.0)*: estado de vuelos en vivo con [AviationStack](https://aviationstack.com). Búsqueda por número de vuelo (ej. `AR1132`) o por ruta (`EZE` → `MAD`), con horario estimado en la hora local de cada aeropuerto, terminal, puerta, cinta de equipaje, demora y estado (programado / en vuelo / aterrizó / cancelado / desviado). Los vuelos se pueden guardar en **Mi itinerario**, que queda disponible offline junto al resto de los datos del viaje.

## Configurar la clave de AviationStack

La pestaña **Vuelos** necesita una clave gratuita de [aviationstack.com](https://aviationstack.com) (100 consultas por mes). Hay dos formas de cargarla:

1. **Desde la app (recomendado)**: pestaña *Vuelos* → botón ⚙️ → pegar la clave → *Guardar*. Queda en el `localStorage` del dispositivo y **no se sube al repositorio**.
2. **En el código**: constante `CLAVE_API_POR_DEFECTO`, arriba de todo en [`vuelos.js`](vuelos.js). ⚠️ Este repo es público: una clave escrita ahí queda visible para cualquiera.

Para no gastar el cupo mensual, cada búsqueda se cachea 15 minutos y la app muestra cuántas consultas se hicieron en el mes (⚙️).

> **Nota sobre HTTPS**: el plan gratuito de AviationStack **solo responde por HTTP**. Como la app se sirve por HTTPS en GitHub Pages, el navegador bloquea ese pedido por contenido mixto. Alternativas: abrir la app localmente (`http://localhost`), cargar un proxy HTTPS en ⚙️, o usar un plan pago (que sí admite HTTPS directo).

## Estructura

- `index.html` / `styles.css` — interfaz.
- `app.js` — estado, persistencia y lógica de la app (vanilla JS, sin frameworks).
- `cotizaciones.js` — servicio de cotizaciones y conversión de moneda (fetch + cache).
- `vuelos.js` — servicio de AviationStack: clave de API, cache, contador de consultas y manejo de errores.
- `sw.js` / `manifest.webmanifest` — soporte de PWA (instalación e uso offline del shell de la app).
- `gastos-viaje-portable.html` — versión de un solo archivo para compartir sin instalar nada. Se regenera desde los fuentes con `node build-portable.js`.

## Privacidad

Todos los datos (viajeros, gastos, pagos, vuelos guardados) quedan guardados únicamente en el `localStorage` del navegador donde se usa la app — no se envían a ningún servidor. La clave de AviationStack también se guarda solo en el dispositivo; si configurás un proxy, tené en cuenta que la clave viaja a través de él.
