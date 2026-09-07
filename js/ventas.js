/**
 * Ventas: buscar una cotización guardada y marcarla como vendida. Ahí (y
 * no al cotizar, porque no todo presupuesto se vende) se descuenta el
 * stock de los materiales usados, convirtiendo la cantidad de cada línea
 * a la unidad propia del material según cómo se vendió (por kg, entera o
 * por metro). "Deshacer" repone el stock y vuelve a dejarla disponible
 * para buscar.
 */
(function (global) {
  'use strict';

  var busqueda = '';

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function descontarStock(items) {
    (items || []).forEach(function (it) {
      var mat = Store.materiales.get(it.materialId);
      if (!mat) return;
      var piezas = Precios.aPiezas(mat, it.basis, it.cantidad);
      Store.materiales.save(Object.assign({}, mat, { stock: (Number(mat.stock) || 0) - piezas }));
    });
  }

  function reponerStock(items) {
    (items || []).forEach(function (it) {
      var mat = Store.materiales.get(it.materialId);
      if (!mat) return;
      var piezas = Precios.aPiezas(mat, it.basis, it.cantidad);
      Store.materiales.save(Object.assign({}, mat, { stock: (Number(mat.stock) || 0) + piezas }));
    });
  }

  function resultadosPendientes() {
    var q = normalizar(busqueda).trim();
    var pendientes = Store.presupuestos.getAll().filter(function (p) { return !p.vendido; });
    if (q) {
      pendientes = pendientes.filter(function (p) {
        return normalizar(p.cliente).indexOf(q) !== -1 || String(p.numero || '').indexOf(q) !== -1;
      });
    }
    return pendientes.sort(function (a, b) { return (b.numero || 0) - (a.numero || 0); }).slice(0, 15);
  }

  function tablaPendientesHTML() {
    var resultados = resultadosPendientes();
    if (resultados.length === 0) {
      return '<p class="empty-state">' + (busqueda ? 'No hay cotizaciones sin vender que coincidan.' : 'No hay cotizaciones pendientes de venta.') + '</p>';
    }
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th class="hide-narrow">Fecha</th><th>Total</th><th></th></tr></thead>' +
      '<tbody>' +
      resultados.map(function (p) {
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-title">' + p.numero + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
          '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
          '<td class="cell-sub hide-narrow">' + Util.fechaCorta(p.fecha) + '</td>' +
          '<td class="cell-title">' + BudgetPDF.money(p.total) + '</td>' +
          '<td class="col-actions"><button class="btn btn-primary btn-sm" data-action="vender">Marcar como vendida</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function tablaVendidasHTML() {
    var vendidas = Store.presupuestos.getAll().filter(function (p) { return p.vendido; })
      .sort(function (a, b) { return new Date(b.fechaVenta || 0) - new Date(a.fechaVenta || 0); });
    if (vendidas.length === 0) return '<p class="empty-state">Todavía no marcaste ninguna venta.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th>Total</th><th class="hide-narrow">Fecha de venta</th><th></th></tr></thead>' +
      '<tbody>' +
      vendidas.map(function (p) {
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-title">' + p.numero + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
          '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
          '<td class="cell-title">' + BudgetPDF.money(p.total) + '</td>' +
          '<td class="cell-sub hide-narrow">' + Util.fechaCorta(p.fechaVenta) + '</td>' +
          '<td class="col-actions"><button class="btn btn-outline btn-sm" data-action="deshacer">Deshacer</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function render() {
    var cont = document.getElementById('ventas-container');
    if (!cont) return;

    cont.innerHTML =
      '<div class="card">' +
        '<div class="field"><label for="ventas-buscar">Buscar cotización (cliente o N°)</label>' +
          '<input type="search" class="input" id="ventas-buscar" placeholder="Ej: Juan Pérez, o 12" value="' + Util.escapeHtml(busqueda) + '"></div>' +
        tablaPendientesHTML() +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Ventas confirmadas</h2>' +
        tablaVendidasHTML() +
      '</div>';

    document.getElementById('ventas-buscar').addEventListener('input', function (e) {
      busqueda = e.target.value;
      render();
      // el foco se pierde al re-renderizar el HTML entero; lo recuperamos.
      var input = document.getElementById('ventas-buscar');
      input.focus();
      input.selectionStart = input.selectionEnd = input.value.length;
    });

    cont.querySelectorAll('[data-action="vender"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        descontarStock(p.items);
        Store.presupuestos.save(Object.assign({}, p, { vendido: true, fechaVenta: Store.nowISO() }));
        Util.toast('Venta registrada — stock actualizado');
        render();
      });
    });

    cont.querySelectorAll('[data-action="deshacer"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        if (!confirm('¿Deshacer la venta del presupuesto N° ' + p.numero + '? Se repone el stock que se había descontado.')) return;
        reponerStock(p.items);
        Store.presupuestos.save(Object.assign({}, p, { vendido: false, fechaVenta: null }));
        Util.toast('Venta deshecha — stock repuesto');
        render();
      });
    });
  }

  global.VistaVentas = { init: render, render: render };
})(window);
