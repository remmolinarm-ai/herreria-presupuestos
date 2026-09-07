/**
 * Calcula las distintas formas válidas de vender un material a partir de sus
 * datos cargados en Materiales. Un material puede tener más de un precio
 * válido a la vez (ej: una chapa se vende por kg o entera; una barra se
 * vende por kg, entera o por metro) — se listan todas las que apliquen para
 * que tanto la lista de materiales como el cotizador puedan mostrarlas o
 * dejar elegir cuál usar.
 */
(function (global) {
  'use strict';

  // Devuelve un array de { basis, label, unidadLabel, precioUsd }.
  // basis: 'kg' | 'pieza' | 'medida' | 'manual'
  function opciones(material) {
    var m = material || {};
    var precioKg = Number(m.precioKg) || 0;
    var pesoUnidad = Number(m.pesoUnidad) || 0;
    var cantidad = Number(m.cantidad) || 0;
    var unidad = (m.unidad || '').trim();
    var out = [];

    if (precioKg > 0) {
      out.push({ basis: 'kg', label: 'Por kg', unidadLabel: 'kg', precioUsd: precioKg });
      if (pesoUnidad > 0) {
        out.push({
          basis: 'pieza',
          label: (unidad ? unidad.charAt(0).toUpperCase() + unidad.slice(1) : 'Pieza') + ' entera',
          unidadLabel: unidad || 'unidad',
          precioUsd: precioKg * pesoUnidad
        });
        if (cantidad > 0) {
          out.push({
            basis: 'medida',
            label: 'Por metro',
            unidadLabel: 'm',
            precioUsd: (precioKg * pesoUnidad) / cantidad
          });
        }
      }
    } else if (Number(m.precio) > 0) {
      out.push({ basis: 'manual', label: unidad || 'Unidad', unidadLabel: unidad || 'unidad', precioUsd: Number(m.precio) });
    }
    return out;
  }

  function precioPrincipal(material) {
    var op = opciones(material);
    return op.length ? op[0].precioUsd : 0;
  }

  global.Precios = { opciones: opciones, precioPrincipal: precioPrincipal };
})(window);
