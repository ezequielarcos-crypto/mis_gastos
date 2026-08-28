# ✈️ Gastos de Viaje

App web para llevar el control de gastos compartidos entre un grupo de viajeros: quién pagó qué, cómo se divide entre los participantes y cuánto le debe cada uno a cada uno.

Es una **PWA** (se puede instalar en el celular y funciona offline): sin backend, sin build, todo corre en el navegador y los datos se guardan en `localStorage` del dispositivo.

🔗 Demo: https://ezequielarcos-crypto.github.io/mis_gastos/

## Funcionalidad

- **Gastos**: cargar gastos con monto (ARS/USD/EUR), motivo, forma de pago y entre quiénes se divide. Filtro por persona y totales por moneda.
- **Balance**: calcula automáticamente cuánto puso, consumió y debe cada persona, y sugiere las transferencias mínimas para saldar las cuentas (algoritmo voraz deudor↔acreedor). Permite marcar pagos como realizados.
- **Personas**: alta y baja de viajeros (no se puede borrar a alguien con gastos o pagos asociados).
- **Cambio** *(nuevo en v3.0)*: conversor de moneda en tiempo real usando [DolarAPI](https://dolarapi.com) (Argentina, sin API key). Convierte entre ARS, USD, EUR y otras divisas (real, etc.), eligiendo dólar oficial o blue. Cotizaciones cacheadas 15 minutos; si no hay conexión, muestra el último valor conocido marcado como desactualizado.

## Estructura

- `index.html` / `styles.css` — interfaz.
- `app.js` — estado, persistencia y lógica de la app (vanilla JS, sin frameworks).
- `cotizaciones.js` — servicio de cotizaciones y conversión de moneda (fetch + cache).
- `sw.js` / `manifest.webmanifest` — soporte de PWA (instalación e uso offline del shell de la app).
- `gastos-viaje-portable.html` — versión de un solo archivo para compartir sin instalar nada.

## Privacidad

Todos los datos (viajeros, gastos, pagos) quedan guardados únicamente en el `localStorage` del navegador donde se usa la app — no se envían a ningún servidor.
