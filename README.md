# PROYECTAR

App web instalable (PWA) para cargar la lista de precios de materiales y
armar presupuestos con la estructura de costos de una metalmecánica.
Funciona sin conexión y no depende de ninguna librería externa.

## Cómo usar la app

1. **Materiales**: cargá cada material con su unidad (m, kg, unidad, chapa,
   barra…). Los precios se cargan **en dólares** (no se desactualizan con la
   inflación) y se muestran siempre junto a su equivalente en pesos, según
   la cotización del dólar oficial (ver Ajustes). Hay dos formas de cargar
   el precio:
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
   última actualización.
2. **Cotizador**: elegí cliente, describí el trabajo (texto libre) y
   sumá los materiales que se van a usar con su cantidad. El presupuesto
   se calcula por capas, cada una sobre el subtotal acumulado:

   ```
   Materiales directos
   + Mano de obra directa
   = Costo de producción
   + Costos indirectos de fabricación (CIF)
   + Gastos de administración y comercialización
   = Costo total
   + Margen de utilidad
   = Precio de venta
   + IVA
   = Total
   ```

   Los 5 porcentajes (Mano de obra, CIF, Gastos admin., Margen, IVA) se
   cargan directo en cada presupuesto, editable libremente para esa
   cotización puntual. Dejar uno en 0 hace que no aparezca ni en el
   presupuesto ni en el PDF. Si un material tiene más de una forma de
   venta (ej: una chapa por kg o entera), aparece un selector "Vender
   por" para elegir cuál usar en esa línea. Los totales y el PDF se
   muestran en pesos (con el equivalente en dólares al lado) porque es
   lo que ve el cliente final. Al guardar, genera y descarga
   automáticamente el PDF con el desglose completo.
3. **Historial**: todos los presupuestos guardados, con opción de volver a
   descargar el PDF o eliminarlos.
4. **Ajustes**: datos de la empresa (aparecen en el PDF), la cotización del
   dólar usada para convertir los precios de materiales a pesos, y botones
   para exportar/importar una copia de seguridad completa (materiales,
   presupuestos y datos de la empresa) en un archivo `.json`.
5. **Botón de chat**: preguntá el precio de un material por nombre o
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
  materiales.js         Pantalla Lista de precios
  presupuestos.js       Pantallas Nuevo presupuesto + Historial
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
