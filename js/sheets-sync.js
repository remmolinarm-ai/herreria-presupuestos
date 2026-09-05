/**
 * Actualiza la lista de precios leyendo una planilla de Google Sheets.
 * Sin backend ni costo: usa el token de Google que entrega el propio login
 * (Firebase Auth) con permiso de solo lectura sobre Sheets, pedido bajo
 * demanda, y llama a la API REST de Sheets directo desde el navegador.
 *
 * Formato esperado de la planilla (primera hoja, fila 1 = encabezado):
 *   Columna A: Nombre   |   Columna B: Unidad   |   Columna C: Precio
 */
(function (global) {
  'use strict';

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

  function actualizarDesdeSheet(urlOId, rango) {
    var sheetId = extraerId(urlOId);
    if (!sheetId) return Promise.reject(new Error('No pude reconocer el ID de la planilla. Pegá el link completo de Google Sheets.'));
    rango = rango && rango.trim() ? rango.trim() : 'A2:C1000';

    return global.FirebaseSync.obtenerTokenSheets()
      .then(function (token) { return leerFilas(sheetId, rango, token); })
      .then(function (filas) {
        var materiales = global.Store.materiales.getAll();
        var porNombre = {};
        materiales.forEach(function (m) { porNombre[normalizar(m.nombre)] = m; });

        var agregados = 0, actualizados = 0, invalidas = 0;
        filas.forEach(function (fila) {
          var nombre = String((fila && fila[0]) || '').trim();
          var unidad = String((fila && fila[1]) || '').trim() || 'unidad';
          var precio = Number(fila && fila[2]);
          if (!nombre || !isFinite(precio) || precio < 0) { invalidas++; return; }

          var existente = porNombre[normalizar(nombre)];
          if (existente) {
            global.Store.materiales.save(Object.assign({}, existente, {
              unidad: unidad, precio: precio, actualizado: global.Store.nowISO()
            }));
            actualizados++;
          } else {
            var nuevo = { nombre: nombre, unidad: unidad, precio: precio, actualizado: global.Store.nowISO() };
            global.Store.materiales.save(nuevo);
            porNombre[normalizar(nombre)] = nuevo;
            agregados++;
          }
        });

        return { agregados: agregados, actualizados: actualizados, invalidas: invalidas, total: filas.length };
      });
  }

  global.SheetsSync = { actualizarDesdeSheet: actualizarDesdeSheet, extraerId: extraerId };
})(window);
