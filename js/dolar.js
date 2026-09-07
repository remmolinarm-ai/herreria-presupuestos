/**
 * Cotización del dólar oficial (referencia Banco Nación) para convertir los
 * precios de materiales, cargados en USD, a pesos en el presupuesto y el PDF.
 * Se guarda en Store.empresa (dolarOficial + dolarActualizado) para que
 * siga funcionando sin conexión con el último valor conocido; el usuario
 * también puede escribirlo a mano en Ajustes.
 */
(function (global) {
  'use strict';

  // Ámbito Financiero toma como "dólar oficial" la pizarra del Banco Nación.
  var API_URL = 'https://dolarapi.com/v1/ambito/dolares/oficial';

  function valorActual() {
    var e = Store.empresa.get();
    return Number(e.dolarOficial) || 0;
  }

  function fechaActualizado() {
    var e = Store.empresa.get();
    return e.dolarActualizado || null;
  }

  function guardar(valor, fechaIso) {
    Store.empresa.save(Object.assign({}, Store.empresa.get(), {
      dolarOficial: Number(valor) || 0,
      dolarActualizado: fechaIso || new Date().toISOString()
    }));
  }

  function actualizar() {
    return fetch(API_URL).then(function (resp) {
      if (!resp.ok) throw new Error('Respuesta no válida de la cotización');
      return resp.json();
    }).then(function (data) {
      var venta = Number(data && data.venta);
      if (!venta || venta <= 0) throw new Error('No se pudo leer la cotización');
      guardar(venta, new Date().toISOString());
      return venta;
    });
  }

  function aPesos(usd) {
    return (Number(usd) || 0) * valorActual();
  }

  function formatearUsd(n) {
    var v = Number(n) || 0;
    return 'US$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  global.Dolar = {
    valorActual: valorActual,
    fechaActualizado: fechaActualizado,
    guardar: guardar,
    actualizar: actualizar,
    aPesos: aPesos,
    formatearUsd: formatearUsd
  };
})(window);
