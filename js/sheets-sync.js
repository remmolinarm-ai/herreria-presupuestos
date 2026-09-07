/**
 * Actualiza la lista de precios leyendo una planilla de Google Sheets.
 * Sin backend ni costo: pide un permiso de solo lectura sobre Sheets con
 * Google Identity Services (independiente del login de Firebase) y llama
 * a la API REST de Sheets directo desde el navegador con ese token.
 *
 * La planilla puede tener varias solapas — cada una se trata como un
 * grupo de materiales (ej. "Ángulos", "Chapas", "Pintura") y ese nombre
 * queda cargado como Grupo en cada material de esa solapa. En cada
 * solapa, fila 1 = encabezado, y las columnas son:
 *   A: Material | B: Unidad | C: Cant./pieza | D: Kg/pieza | E: Precio ($)
 * Cant./pieza y Kg/pieza son opcionales (se pueden dejar en blanco). El
 * precio se carga en pesos, igual que en la lista de la app — se
 * convierte a dólares para guardarlo con la cotización del momento de la
 * importación (por eso hace falta tener cargada la cotización del dólar
 * en Ajustes antes de importar).
 */
(function (global) {
  'use strict';

  var SCOPE_SHEETS = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  var clienteToken = null; // se crea una sola vez y se reutiliza

  function obtenerTokenSheets() {
    return new Promise(function (resolve, reject) {
      if (!global.google || !global.google.accounts || !global.google.accounts.oauth2) {
        reject(new Error('No se pudo cargar el inicio de sesión de Google. Revisá la conexión y recargá la página.'));
        return;
      }
      if (!global.GOOGLE_OAUTH_CLIENT_ID) {
        reject(new Error('Falta configurar GOOGLE_OAUTH_CLIENT_ID.'));
        return;
      }
      var email = (global.FirebaseSync && global.FirebaseSync.usuarioActual() && global.FirebaseSync.usuarioActual().email) || '';

      if (!clienteToken) {
        clienteToken = global.google.accounts.oauth2.initTokenClient({
          client_id: global.GOOGLE_OAUTH_CLIENT_ID,
          scope: SCOPE_SHEETS,
          hint: email,
          callback: function () {}, // se pisa en cada llamado, ver abajo
          error_callback: function () {}
        });
      }
      // Pisamos el callback en cada pedido para poder resolver/rechazar
      // esta promesa puntual (initTokenClient no admite pasarlo por llamado).
      clienteToken.callback = function (resp) {
        if (resp && resp.error) { reject(new Error('Google no otorgó el permiso (' + resp.error + ').')); return; }
        if (!resp || !resp.access_token) { reject(new Error('Google no devolvió un token de acceso.')); return; }
        resolve(resp.access_token);
      };
      clienteToken.error_callback = function (err) {
        reject(new Error((err && err.type === 'popup_closed') ? 'Se cerró la ventana de permiso de Google.' : ((err && err.message) || 'No se pudo completar el permiso de Google.')));
      };
      clienteToken.requestAccessToken({ hint: email });
    });
  }

  function normalizar(str) {
    return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function extraerId(urlOId) {
    var s = String(urlOId || '').trim();
    var m = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
    return null;
  }

  function leerFilas(sheetId, rango, token) {
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) +
      '/values/' + encodeURIComponent(rango) + '?valueRenderOption=UNFORMATTED_VALUE';
    return fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (data) {
          var msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
          throw new Error(msg);
        });
      }
      return res.json();
    }).then(function (data) { return data.values || []; });
  }

  function listarHojas(sheetId, token) {
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) + '?fields=sheets.properties.title';
    return fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (data) {
          throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        });
      }
      return res.json();
    }).then(function (data) {
      return (data.sheets || []).map(function (s) { return s.properties.title; });
    });
  }

  function comillarNombreHoja(nombre) {
    return "'" + String(nombre).replace(/'/g, "''") + "'";
  }

  function actualizarDesdeSheet(urlOId, rangoManual) {
    var sheetId = extraerId(urlOId);
    if (!sheetId) return Promise.reject(new Error('No pude reconocer el ID de la planilla. Pegá el link completo de Google Sheets.'));

    var cotizacion = global.Dolar ? global.Dolar.valorActual() : 0;
    if (!(cotizacion > 0)) {
      return Promise.reject(new Error('Cargá la cotización del dólar en Ajustes antes de importar (los precios de la planilla están en pesos).'));
    }

    return obtenerTokenSheets().then(function (token) {
      if (rangoManual && rangoManual.trim()) {
        return leerFilas(sheetId, rangoManual.trim(), token).then(function (filas) {
          return [{ grupo: '', filas: filas }];
        });
      }
      // Sin rango manual: se lee cada solapa de la planilla y su nombre
      // queda como Grupo de los materiales que trae.
      return listarHojas(sheetId, token).then(function (titulos) {
        return Promise.all(titulos.map(function (titulo) {
          var rango = comillarNombreHoja(titulo) + '!A2:E5000';
          return leerFilas(sheetId, rango, token)
            .then(function (filas) { return { grupo: titulo, filas: filas }; })
            .catch(function (err) {
              console.warn('No se pudo leer la solapa "' + titulo + '": ' + err.message);
              return { grupo: titulo, filas: [] };
            });
        }));
      });
    }).then(function (hojas) {
      var materiales = global.Store.materiales.getAll();
      var porNombre = {};
      materiales.forEach(function (m) { porNombre[normalizar(m.nombre)] = m; });

      var agregados = 0, actualizados = 0, invalidas = 0, total = 0;
      hojas.forEach(function (hoja) {
        hoja.filas.forEach(function (fila) {
          total++;
          var nombre = String((fila && fila[0]) || '').trim();
          var unidad = String((fila && fila[1]) || '').trim() || 'unidad';
          var cantidad = Number(fila && fila[2]) || 0;
          var pesoUnidad = Number(fila && fila[3]) || 0;
          var precioArs = Number(fila && fila[4]);
          if (!nombre || !isFinite(precioArs) || precioArs < 0) { invalidas++; return; }
          var precioUsd = precioArs / cotizacion;
          var datos = {
            unidad: unidad, grupo: hoja.grupo, cantidad: cantidad, pesoUnidad: pesoUnidad,
            precioKg: 0, precio: precioUsd, actualizado: global.Store.nowISO()
          };

          var existente = porNombre[normalizar(nombre)];
          if (existente) {
            global.Store.materiales.save(Object.assign({}, existente, datos));
            actualizados++;
          } else {
            var nuevo = Object.assign({ nombre: nombre }, datos);
            global.Store.materiales.save(nuevo);
            porNombre[normalizar(nombre)] = nuevo;
            agregados++;
          }
        });
      });

      return { agregados: agregados, actualizados: actualizados, invalidas: invalidas, total: total, hojas: hojas.length };
    });
  }

  global.SheetsSync = { actualizarDesdeSheet: actualizarDesdeSheet, extraerId: extraerId };
})(window);
