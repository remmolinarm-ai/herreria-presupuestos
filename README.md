# PROYECTAR

App web instalable (PWA) para cargar la lista de precios de materiales y
armar presupuestos con la estructura de costos de una metalmecánica.
Funciona sin conexión y no depende de ninguna librería externa.

## Cómo usar la app

1. **Materiales**: lista de precios y stock, todo junto. Cargá cada
   material con su unidad (m, kg, unidad, chapa, barra…), un **grupo**
   opcional para organizarlos (ej: Ángulos, Chapas, Pintura — se usa al
   importar desde Sheets) y su **stock actual**. Los
   precios se cargan **en dólares** (no se desactualizan con la
   inflación) y se muestran siempre junto a su equivalente en pesos,
   según la cotización del dólar oficial (ver Ajustes). Hay dos formas
   de cargar el precio:
   - **Por peso** (para barras y chapas): completá cuántas unidades de
     medida tiene la pieza completa (ej: 6 metros por barra — dejalo en
     blanco si no aplica, como en una chapa), el peso de esa pieza en kg y
     el precio del kilo en dólares. La app calcula sola el precio por kg,
     por pieza entera y, si corresponde, por metro — se muestran todos
     juntos porque a veces un mismo material se vende de más de una forma
     (una chapa por kg o entera, una barra por kg, entera o por metro).
   - **Precio manual**: para lo que no se vende por peso (bulonería,
     insumos, etc.), cargá directamente el precio en dólares por unidad.

   Se puede editar en cualquier momento; queda registrada la fecha de la
   última actualización. El botón **"Cargar stock"** despliega las
   herramientas para sumar stock nuevo sin salir de la pantalla — a mano
   (buscás el material, ponés cuánto entró) o con ayuda de una foto del
   remito (ver más abajo). El stock se descuenta al **vender** (solapa
   Ventas), no al cotizar — no todo presupuesto se convierte en venta.
   Convierte la cantidad según cómo se vendió esa línea (si se vendió
   por metro pero el material se stockea por barra entera, descuenta la
   fracción de barra correspondiente). Puede quedar en negativo — es
   solo un aviso visual (en rojo), no bloquea nada. El botón **"Ver en
   Mercado Libre"** abre en una pestaña nueva la búsqueda de Mercado
   Libre con lo que haya escrito en el buscador de materiales (o la home
   de Mercado Libre si está vacío) — para comparar rápido un precio.
2. **Cotizador**: elegí cliente (con teléfono y email opcionales, para
   poder mandarle el presupuesto después), describí el trabajo (texto
   libre) y sumá los materiales que se van a usar con su cantidad. El
   presupuesto se calcula por capas, cada una sobre el subtotal
   acumulado (costeo de una metalmecánica estructural):

   ```
   Materia prima directa (lista de materiales)
   + Mano de obra directa (itemizada por rol: horas × tarifa/hora)
   = Costo directo base
   + Costos directos de proyecto % (fletes, subcontratos, alquiler de equipos)
   + Ingeniería y diseño % (cálculo estructural, software)
   = Costo directo total
   + Costos indirectos de fabricación (CIF) %
   = Costo con CIF
   + Gastos de administración %
   = Costo con administración
   + Gastos comerciales $ (comisión, viáticos — monto a mano)
   + Gastos financieros $ (intereses, gastos bancarios — monto a mano)
   = Costo total
   + Margen de utilidad %
   = Precio de venta
   + IVA %
   = Total
   ```

   La mano de obra se carga por rol (soldador, armador, operario de
   corte/plegado, pintor, montador, o cualquier otro que escribas), con
   horas y tarifa por hora — se suman todos los roles usados en el
   trabajo. Los porcentajes (costos directos de proyecto, ingeniería y
   diseño, CIF, gastos admin., margen, IVA) y los montos de gastos
   comerciales/financieros se cargan directo en cada presupuesto,
   editables libremente para esa cotización puntual — los porcentajes
   vienen precargados con los valores por defecto de Ajustes cuando
   existen. Dejar un porcentaje en 0 (o un monto vacío) hace que no
   aparezca ni en el presupuesto ni en el PDF. Si un material tiene más
   de una forma de venta (ej: una chapa por kg o entera), aparece un
   selector "Vender por" para elegir cuál usar en esa línea. Los totales
   y el PDF se muestran en pesos (con el equivalente en dólares al lado)
   porque es lo que ve el cliente final. Al guardar, genera y descarga
   automáticamente el PDF con el desglose completo (incluida la mano de
   obra itemizada por rol) — el mensaje de WhatsApp/email al cliente,
   en cambio, solo muestra el total y la descripción del trabajo, nunca
   el desglose interno de costos.
3. **Historial**: todos los presupuestos guardados, con opción de volver a
   descargar el PDF, eliminarlos, o **enviarlos por WhatsApp o email** al
   cliente — abre WhatsApp/el programa de mail con un mensaje ya escrito
   (no hace falta backend ni cuesta nada: son los links `wa.me` y
   `mailto:` de toda la vida). Ese mensaje, a propósito, **no** incluye el
   desglose de costos del PDF interno — solo dice la descripción del
   trabajo y el total final, que es lo único que le importa a quien pidió
   el presupuesto.
4. **Finanzas**: cinco sub-solapas con los datos del negocio agrupados
   según su índole:
   - **Ventas**: buscá una cotización (por cliente o número), opcionalmente
     ponele una fecha estimada de entrega, y marcala como vendida — ahí
     recién se descuenta el stock (ver Materiales arriba) y se genera la
     **OT** (orden de trabajo) de esa venta, con su propio número
     correlativo (OT-1, OT-2, …) independiente del número de presupuesto.
     Arriba de todo, la **"Vista de proyectos"** muestra un Gantt simple:
     una fila por cada OT en proceso, con una barra dividida en las etapas
     configuradas (verde lo ya hecho, azul la etapa actual, gris lo que
     falta, roja si está pausada) — de un vistazo se ve en qué está cada
     proyecto. Abajo, la tabla de ventas confirmadas tiene el detalle de
     cada OT: un selector de etapa (las etapas son las que definas en
     Ajustes → Producción, ver más abajo) y la fecha estimada de entrega,
     editable — si esa fecha ya pasó y el trabajo no llegó a la última
     etapa, se marca como **Atrasado**. Un botón **"Pausar"** permite
     frenar una OT en cualquier etapa cargando la **causa** (de una lista
     configurable) y notas opcionales; al **"Reanudar"** se guarda cuánto
     duró la parada, con un historial de paradas de todo el taller abajo
     de la tabla (para ver qué es lo que más frena la producción). También
     hay opción de deshacer la venta (repone el stock, se pierde el
     seguimiento de esa OT). Cada venta confirmada tiene además una
     columna **Cobrado** con el botón **"Registrar cobro"**: para cargar
     una seña o un pago parcial, cargá el **% del total** (se calcula solo
     el monto, ej. 40%) o directamente un **monto** a mano — se pueden
     cargar tantos cobros como haga falta hasta completar el total, con su
     propio historial completo de cobros de todas las ventas.
   - **Rentabilidad**: por cada mes (últimos 6), margen bruto de las
     ventas confirmadas (el campo `margen` que ya calcula el Cotizador)
     menos los sueldos y cuotas de crédito pagados ese mes = rentabilidad
     neta. También los totales del mes en curso arriba, en tarjetas. Esta
     cuenta usa el margen de la venta completa (se factura), no lo que ya
     se cobró — para eso está Ingresos.
   - **Ingresos**: a diferencia de Rentabilidad, acá se distingue lo
     **cobrado** (la plata que realmente entró, según los cobros
     registrados en Ventas) de lo **facturado** (el total de la venta
     apenas se confirma, aunque el cliente todavía deba parte). Muestra
     ambos por separado, por mes y acumulado histórico, más el total
     **pendiente de cobro** de todas las ventas confirmadas.
   - **Sueldos**: alta de empleados (nombre + sueldo mensual) y botón
     "Registrar pago" por empleado para ir guardando cada liquidación
     (monto, fecha, período, notas), con historial de pagos abajo.
   - **Créditos**: alta de créditos/préstamos (concepto, monto total,
     interés anual, cuota mensual, próximo vencimiento). El saldo
     pendiente se calcula solo (monto total menos lo ya pagado); al
     "Registrar pago" de una cuota, el próximo vencimiento se corre un
     mes automáticamente. Si la fecha de vencimiento ya pasó y todavía
     hay saldo, se marca **Atrasado**.
5. **Ajustes**: datos de la empresa (aparecen en el PDF), la cotización del
   dólar usada para convertir los precios de materiales a pesos, y botones
   para exportar/importar una copia de seguridad completa (materiales,
   presupuestos, cobros, empleados/sueldos, créditos y datos de la empresa)
   en un archivo `.json`. La sección **Producción** define, con listas
   editables (agregar, quitar, subir/bajar de orden), las **etapas de
   producción** que usa el seguimiento de OT en Finanzas → Ventas (por
   defecto Corte → Soldadura → Pintura → Terminado → Entregado, pero se
   pueden renombrar/agregar/reordenar libremente) y las **causas de
   parada** que aparecen al pausar una OT (por defecto: falta de
   material, rotura de máquina, falta de personal, espera de aprobación
   del cliente, otro).
6. **Botón de chat**: preguntá el precio de un material por nombre o
   por medida, por ejemplo *"cuánto vale un caño de 20x20x1.6"*. Es un
   buscador local sobre los materiales ya cargados (no manda nada a
   internet), útil para consultar rápido sin entrar a la lista completa.

## Cotización del dólar

Los precios de materiales se cargan en dólares; para mostrar los
presupuestos en pesos hace falta una cotización. En **Ajustes →
Cotización del dólar**:

- Al abrir la app, intenta traer sola el dólar oficial (referencia Banco
  Nación, vía la API pública de [dolarapi.com](https://dolarapi.com))
  usando el endpoint que toma como fuente la pizarra de Ámbito
  Financiero/Banco Nación. Si no hay internet o la API no responde, sigue
  usando el último valor guardado sin interrumpir nada.
- Se puede escribir el valor a mano en cualquier momento (botón "Guardar
  valor") — útil sin conexión o si se prefiere no depender de la API.
- Cada presupuesto guarda la cotización que se usó en el momento de
  crearlo, así el PDF de un presupuesto viejo no cambia si después se
  actualiza el dólar.

No fue posible probar el fetch real a la API desde este entorno de
desarrollo (sin salida a internet hacia dominios externos), pero el
código tiene manejo de errores para que, si falla, la app simplemente
siga con el último valor guardado — el mismo patrón que ya se usa para
Firebase y Google Sheets en esta app.

## Instalar en el celular / la compu

Es una PWA: abriendo el sitio publicado (`https://remmolinarm-ai.github.io/herreria-presupuestos/`
una vez activado GitHub Pages), el navegador (Chrome/Edge en Android o
compu) ofrece "Instalar app" / "Agregar a la pantalla de inicio". Una vez
instalada funciona como una app normal, con ícono propio, y sigue andando
sin conexión a internet gracias al service worker que cachea la app.

## Dónde se guardan los datos

La app ya está conectada al proyecto Firebase **carpinteria-metalica-c2c15**
(`js/firebase-config.js`). Con eso:

- **Sin iniciar sesión**: todo se guarda solo en este dispositivo
  (`localStorage`), igual que antes.
- **Iniciando sesión con Google** (botón en **Ajustes → Sincronización
  entre dispositivos**): los materiales, presupuestos y datos de la
  empresa se guardan en Firestore y se sincronizan solos con
  cualquier otro dispositivo donde se inicie sesión con esa misma cuenta
  de Google — sigue funcionando sin conexión (Firestore cachea localmente
  y sube los cambios cuando vuelve el internet).
- **La primera vez que se inicia sesión** en una cuenta que todavía no
  tiene nada guardado en la nube, la app sube automáticamente lo que ya
  hubiera cargado en ese dispositivo (no hace falta cargar todo de nuevo).
  Un segundo dispositivo que inicie sesión después ya va a encontrar los
  datos de la nube — si ese segundo dispositivo tenía datos propios
  cargados de antes, conviene exportarlos primero (**Ajustes → Exportar
  copia**) por si hace falta revisarlos o sumarlos a mano.

### Falta un paso en Firebase Console para que funcione: reglas de seguridad

Sin esto, Firestore rechaza todas las lecturas/escrituras (ya lo
verificamos: por defecto deniega todo, lo cual está bien mientras no haya
reglas). Para habilitar el acceso *solo al dueño de cada cuenta*:

1. En Firebase Console → **Bases de datos y almacenamiento → Firestore
   Database → pestaña "Reglas"**.
2. Reemplazar el contenido por:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
         match /{document=**} {
           allow read, write: if request.auth != null && request.auth.uid == uid;
         }
       }
     }
   }
   ```
3. **Publicar**.

   Esto permite que una persona autenticada lea y escriba únicamente
   dentro de `users/{su-propio-uid}/...` — nadie puede ver ni tocar datos
   de otra cuenta.

### Dominios autorizados para el botón "Iniciar sesión con Google"

Google exige que el dominio desde donde se abre la app esté en la lista
blanca de Firebase Auth, si no el botón va a fallar con un error de
"dominio no autorizado":

1. Firebase Console → **Seguridad → Authentication → Settings →
   Authorized domains**.
2. Verificar que esté el dominio donde se publique el sitio. Como este
   repo se publica en `remmolinarm-ai.github.io/herreria-presupuestos/`,
   el dominio a autorizar es **`remmolinarm-ai.github.io`** (el dominio
   alcanza, no hace falta la carpeta) — si ya se había agregado para otro
   proyecto en el mismo usuario de GitHub, no hace falta agregarlo de
   nuevo. `localhost` ya viene habilitado por defecto para probar en la
   compu.

### Cómo verificar que quedó funcionando

No fue posible probar el inicio de sesión real con Google ni la
sincronización en vivo desde este entorno de desarrollo (no tiene salida
a internet hacia los dominios de Google necesarios para eso). Una vez
publicado el sitio con las reglas y el dominio autorizado, conviene
comprobar:

1. Abrir la app, ir a **Ajustes** y tocar **"Iniciar sesión con Google"**
   → debería abrir la ventana de cuentas de Google y, al elegir una,
   volver a la app mostrando el badge superior como **"☁️ Sincronizado"**
   y en Ajustes "Conectado como [email]".
2. Cargar un material de prueba, abrir la misma app en el otro
   dispositivo, iniciar sesión con la misma cuenta, y confirmar que el
   material aparece solo sin tener que cargarlo de nuevo.
3. Si el botón de login falla con un error de dominio: revisar el paso
   de "Dominios autorizados" de arriba.
4. Si aparece "no se pudo guardar" al generar un presupuesto: revisar que
   las reglas de seguridad se hayan publicado (paso anterior) y que haya
   conexión a internet en ese momento.

## Cargar stock: a mano y foto del remito (OCR)

En **Materiales → Cargar stock** se puede sumar stock nuevo de dos formas:

- **A mano**: buscás el material (igual que en el cotizador) y ponés
  cuánto entró. Se arma una lista de lo que vas cargando y se confirma
  todo junto.
- **Foto del remito**: elegís una foto (o sacás una con la cámara del
  celular) y la app lee el texto con **Tesseract.js**, una librería de
  reconocimiento de texto que corre 100% en el navegador — no manda la
  imagen a ningún servidor ni tiene costo. Se carga sola la primera vez
  que se usa (desde un CDN, necesita internet esa vez). Después intenta
  reconocer qué línea del texto corresponde a qué material ya cargado (por
  nombre) y qué número es la cantidad, y arma la misma lista de arriba
  para revisar antes de confirmar.

  **Esto es asistencia, no magia**: el reconocimiento de texto en fotos es
  bastante menos preciso que un servicio de IA pago, sobre todo con
  remitos manuscritos, mal escaneados o con formatos raros — a veces no
  va a reconocer nada, o va a mezclar cantidades. Siempre hay que revisar
  la lista antes de tocar "Confirmar carga de stock". No fue posible
  probar el reconocimiento con una foto real desde este entorno de
  desarrollo (sin salida a internet para bajar la librería), pero la
  lógica de coincidencia de texto contra los nombres de materiales sí se
  probó con texto de ejemplo.

## Actualizar precios desde Google Sheets

En **Ajustes → Lista de precios desde Google Sheets** (visible una vez
iniciada sesión con Google) se puede pegar el link de una planilla con
columnas **Material | Unidad | Cant./pieza | Kg/pieza | Precio ($)**
(fila 1 = encabezado; Cant./pieza y Kg/pieza se pueden dejar en blanco)
y tocar "Actualizar precios desde Sheets": actualiza los materiales que
coincidan por nombre y agrega los que todavía no existan. El precio se
carga **en pesos** en la planilla (igual que en la lista de la app) y se
convierte a dólares con la cotización cargada en ese momento en Ajustes
— por eso hace falta tenerla cargada antes de importar. No usa ningún
backend ni tiene costo — pide, en el momento, permiso de solo lectura
sobre Sheets con **Google Identity Services**, independiente del login
de Firebase (`js/sheets-sync.js`, `window.GOOGLE_OAUTH_CLIENT_ID` en
`js/firebase-config.js`).

Ya está habilitado en el proyecto **carpinteria-metalica-c2c15**: la
Google Sheets API estaba activa y el "Web client (auto created by Google
Service)" en Google Cloud Console → Credenciales ya provee el Client ID
usado. Como la pantalla de consentimiento de ese proyecto está en estado
**"En producción"** (no "Prueba"), Google puede mostrar una vez el cartel
**"Google no verificó esta app"** al pedir el permiso — es esperable para
una app de uso personal no enviada a revisión; se avanza con
"Avanzado → Ir a [app] (no seguro)".

### Por qué no usa el token de Firebase Auth directamente

Firebase permite agregar scopes extra al proveedor de Google
(`addScope` + `signInWithPopup`/`reauthenticateWithPopup`) para,
en teoría, reutilizar el mismo login. En la práctica, para un usuario ya
autenticado, `credential.accessToken` volvía `undefined` con ambos
métodos (confirmado en pruebas reales) — es un problema conocido del SDK
de Firebase Auth al pedir scopes adicionales sobre una sesión existente.
Por eso este permiso se pide aparte, con la librería de Google pensada
para esto (Google Identity Services / `google.accounts.oauth2`).

### Cómo verificar que quedó funcionando

Tampoco se pudo probar esto desde este entorno (mismo motivo que el login
de Google).

1. Crear una planilla de prueba en Google Sheets con columnas
   `Material | Unidad | Cant./pieza | Kg/pieza | Precio ($)` y un par
   de filas de ejemplo (con el precio en pesos).
2. En la app, Ajustes → pegar el link → "Actualizar precios desde
   Sheets". La primera vez pide confirmar el permiso de lectura sobre
   Sheets — puede aparecer el cartel de "Google no verificó esta app"
   (ver arriba) y/o el de elegir cuenta, ambos son esperables.
3. Si dice "No se pudo cargar el inicio de sesión de Google": la
   página se abrió sin conexión al momento de cargar, o algún bloqueador
   de scripts está frenando `accounts.google.com` — recargar y probar de
   nuevo.
4. Si vuelve a fallar con otro mensaje: pasarlo tal cual aparece para
   revisar la causa puntual.

## Estructura

```
index.html             Shell de la app (navegación por pestañas)
manifest.webmanifest    Metadata de instalación (PWA)
service-worker.js       Cacheo para uso sin conexión
css/app.css             Estilos (mobile-first, con layout de escritorio)
icons/                  Íconos de la app
js/
  firebase-config.js    Config pública del proyecto Firebase (no son
                         contraseñas)
  firebase-sync.js      Login con Google + sincronización con Firestore
                         (opcional: si no carga, la app sigue 100% local)
  sheets-sync.js        Actualiza precios leyendo una planilla de Google
                         Sheets (usa el token de Google del login)
  util.js               Helpers compartidos (toast, formateo, descargas)
  store.js              Capa de datos (materiales, trabajos, presupuestos,
                         empresa, backup) — local por defecto, reemplazada
                         por Firestore cuando hay sesión iniciada
  dolar.js              Cotización del dólar oficial (auto + manual)
  precios.js            Calcula las formas de venta de un material (por
                         kg, pieza entera, por metro) en USD
  pdf-lite.js           Generador de PDF genérico, sin dependencias
  budget-pdf.js         Arma el PDF de un presupuesto sobre pdf-lite.js
  materiales.js         Pantalla Materiales (lista de precios + stock,
                         con carga a mano y OCR de remitos)
  presupuestos.js       Pantallas Nuevo presupuesto + Historial
  ventas.js             Ventas (marcar cotización como vendida) — vive
                         como sub-solapa dentro de Finanzas
  finanzas.js           Pantalla Finanzas (ventas, rentabilidad, ingresos,
                         sueldos, créditos, en sub-solapas)
  ajustes.js            Pantalla Ajustes (empresa + backup + login)
  asistente.js          Buscador de precios en lenguaje natural
  app.js                Navegación entre pantallas e inicialización
```

### Por qué el PDF se genera "a mano" (`pdf-lite.js`)

No se usa una librería como jsPDF porque este entorno de desarrollo no
tiene salida a redes de terceros (CDNs) para descargarla, y además así la
app no depende de ningún script externo para funcionar sin conexión desde
el celular. `pdf-lite.js` escribe directamente el archivo PDF (texto con
las fuentes estándar Helvetica/Helvetica-Bold, líneas, rectángulos y
paginado automático) — probado generando y leyendo presupuestos de varias
páginas con `pypdf`.

## Previsualizar localmente

```bash
python3 -m http.server 8000
```

y abrir `http://localhost:8000`.

## Publicar en GitHub Pages

En este repositorio, Settings → Pages → Source: "Deploy from a branch" →
rama `main`, carpeta `/ (root)` → Save. Queda publicado en
`https://remmolinarm-ai.github.io/herreria-presupuestos/`.
