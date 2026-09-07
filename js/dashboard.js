/**
 * Resumen: ventas por mes (a partir del historial de presupuestos) y stock
 * por grupo de materiales. Gráficos simples con barras CSS, sin librerías.
 */
(function (global) {
  'use strict';

  function claveMes(fecha) {
    var d = new Date(fecha);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function mesesRecientes(n) {
    var out = [];
    var ahora = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      out.push({
        key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
        label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
      });
    }
    return out;
  }

  // Ventas confirmadas (marcadas como vendidas en la solapa Ventas),
  // agrupadas por mes de venta — no todo presupuesto se vende, así que
  // esto es distinto de "presupuestos generados por mes".
  function ventasPorMes() {
    var mapa = {};
    Store.presupuestos.getAll().forEach(function (p) {
      if (!p.vendido || !p.fechaVenta) return;
      var key = claveMes(p.fechaVenta);
      if (!mapa[key]) mapa[key] = { total: 0, count: 0 };
      mapa[key].total += Number(p.total) || 0;
      mapa[key].count += 1;
    });
    return mapa;
  }

  function presupuestosPorMes() {
    var mapa = {};
    Store.presupuestos.getAll().forEach(function (p) {
      if (!p.fecha) return;
      var key = claveMes(p.fecha);
      mapa[key] = (mapa[key] || 0) + 1;
    });
    return mapa;
  }

  function statCard(label, valor) {
    return '<div class="card" style="flex:1;min-width:150px;">' +
      '<div style="font-size:0.75rem;color:var(--steel-500);font-weight:600;margin-bottom:4px;">' + label + '</div>' +
      '<div style="font-size:1.4rem;font-weight:800;color:var(--ink-900);">' + valor + '</div>' +
    '</div>';
  }

  function barraHTML(label, valor, max, sub) {
    var pct = max > 0 ? Math.max((valor / max) * 100, valor > 0 ? 3 : 0) : 0;
    return '<div style="margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:3px;">' +
        '<span style="font-weight:600;color:var(--steel-700);">' + label + '</span>' +
        '<span style="color:var(--steel-500);">' + sub + '</span>' +
      '</div>' +
      '<div style="background:var(--surface-alt);border-radius:var(--radius-sm);height:10px;overflow:hidden;">' +
        '<div style="background:var(--brand-700);height:100%;width:' + pct + '%;border-radius:var(--radius-sm);"></div>' +
      '</div>' +
    '</div>';
  }

  function seccionVentas() {
    var mapa = ventasPorMes();
    var meses = mesesRecientes(6);
    var max = Math.max.apply(null, meses.map(function (m) { return (mapa[m.key] || {}).total || 0; }).concat([0]));
    return '<div class="card">' +
      '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:2px;">Ventas por mes</h2>' +
      '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:12px;">Presupuestos marcados como vendidos en la solapa Ventas.</p>' +
      meses.map(function (m) {
        var d = mapa[m.key] || { total: 0, count: 0 };
        return barraHTML(m.label, d.total, max, BudgetPDF.money(d.total) + ' · ' + d.count + (d.count === 1 ? ' venta' : ' ventas'));
      }).join('') +
    '</div>';
  }

  function seccionStockPorGrupo() {
    var materiales = Store.materiales.getAll();
    if (materiales.length === 0) {
      return '<div class="card"><h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Stock por grupo</h2>' +
        '<p class="empty-state">Todavía no cargaste materiales.</p></div>';
    }
    var grupos = {};
    materiales.forEach(function (m) {
      var g = m.grupo || 'Sin grupo';
      if (!grupos[g]) grupos[g] = { total: 0, sinStock: 0 };
      grupos[g].total++;
      if (!(Number(m.stock) > 0)) grupos[g].sinStock++;
    });
    var nombres = Object.keys(grupos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    return '<div class="card">' +
      '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Stock por grupo</h2>' +
      '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:12px;">Materiales sin stock cargado, por grupo.</p>' +
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Grupo</th><th>Materiales</th><th>Sin stock</th></tr></thead>' +
        '<tbody>' +
        nombres.map(function (g) {
          var d = grupos[g];
          return '<tr><td class="cell-title">' + Util.escapeHtml(g) + '</td><td>' + d.total + '</td>' +
            '<td' + (d.sinStock > 0 ? ' style="color:var(--danger);font-weight:700;"' : '') + '>' + d.sinStock + '</td></tr>';
        }).join('') +
        '</tbody>' +
      '</table></div>' +
    '</div>';
  }

  function render() {
    var cont = document.getElementById('dashboard-container');
    if (!cont) return;

    var keyEsteMes = claveMes(new Date().toISOString());
    var ventasEsteMes = ventasPorMes()[keyEsteMes] || { total: 0, count: 0 };
    var presupuestosEsteMes = presupuestosPorMes()[keyEsteMes] || 0;
    var materiales = Store.materiales.getAll();
    var sinStock = materiales.filter(function (m) { return !(Number(m.stock) > 0); }).length;

    cont.innerHTML =
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
        statCard('Presupuestos este mes', presupuestosEsteMes) +
        statCard('Vendido este mes', BudgetPDF.money(ventasEsteMes.total)) +
        statCard('Materiales sin stock', sinStock) +
      '</div>' +
      seccionVentas() +
      seccionStockPorGrupo();
  }

  global.VistaDashboard = { init: render, render: render };
})(window);
