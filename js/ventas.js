/**
 * Ventas: buscar una cotización guardada y marcarla como vendida. Ahí (y
 * no al cotizar, porque no todo presupuesto se vende) se descuenta el
 * stock de los materiales usados, convirtiendo la cantidad de cada línea
 * a la unidad propia del material según cómo se vendió (por kg, entera o
 * por metro). "Deshacer" repone el stock y vuelve a dejarla disponible
 * para buscar.
 *
 * Cada venta confirmada puede tener uno o más cobros parciales asociados
 * (Store.cobros: {presupuestoId, monto, fecha, notas}) — por ejemplo una
 * seña del 40% al confirmar y el saldo contra entrega. "Ingresos" en
 * Finanzas se calcula a partir de estos cobros reales, no del total
 * facturado.
 */
(function (global) {
  'use strict';

  var ETAPAS = ['Corte', 'Soldadura', 'Pintura', 'Terminado', 'Entregado'];
  var busqueda = '';
  var cobroAbierto = null; // id del presupuesto con el form de "registrar cobro" abierto

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  function estaAtrasado(p) {
    if (!p.fechaEntregaEstimada || p.etapaProduccion === 'Entregado') return false;
    return new Date(p.fechaEntregaEstimada) < new Date(new Date().toDateString());
  }

  function totalCobrado(presupuestoId) {
    return Store.cobros.getAll()
      .filter(function (c) { return c.presupuestoId === presupuestoId; })
      .reduce(function (a, c) { return a + (Number(c.monto) || 0); }, 0);
  }

  function saldoCobro(p) {
    return (Number(p.total) || 0) - totalCobrado(p.id);
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
      '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th>Total</th><th class="hide-narrow">Entrega estimada</th><th></th></tr></thead>' +
      '<tbody>' +
      resultados.map(function (p) {
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-title">' + p.numero + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
          '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
          '<td class="cell-title">' + BudgetPDF.money(p.total) + '</td>' +
          '<td class="hide-narrow"><input type="date" class="input" data-fecha-entrega="' + p.id + '" style="padding:6px 8px;"></td>' +
          '<td class="col-actions"><button class="btn btn-primary btn-sm" data-action="vender">Marcar como vendida</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function cobradoCeldaHTML(p) {
    var cobrado = totalCobrado(p.id);
    var saldo = (Number(p.total) || 0) - cobrado;
    var completo = saldo <= 0.005;
    return '<div>' + BudgetPDF.money(cobrado) + (completo ? '' : ' <span class="cell-sub">/ ' + BudgetPDF.money(p.total) + '</span>') + '</div>' +
      (completo
        ? '<div style="color:var(--success);font-size:0.72rem;font-weight:700;">Cobrado completo</div>'
        : '<button class="btn btn-outline btn-sm" data-action="cobrar" style="margin-top:4px;">Registrar cobro</button>');
  }

  function tablaVendidasHTML() {
    var vendidas = Store.presupuestos.getAll().filter(function (p) { return p.vendido; })
      .sort(function (a, b) { return new Date(b.fechaVenta || 0) - new Date(a.fechaVenta || 0); });
    if (vendidas.length === 0) return '<p class="empty-state">Todavía no marcaste ninguna venta.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th class="hide-narrow">Total</th><th>Cobrado</th><th>Etapa</th><th class="hide-narrow">Entrega estimada</th><th></th></tr></thead>' +
      '<tbody>' +
      vendidas.map(function (p) {
        var atrasado = estaAtrasado(p);
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-title">' + p.numero + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
          '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
          '<td class="cell-sub hide-narrow">' + BudgetPDF.money(p.total) + '</td>' +
          '<td>' + cobradoCeldaHTML(p) + '</td>' +
          '<td>' +
            '<select class="input" data-etapa="' + p.id + '" style="padding:6px 8px;">' +
              ETAPAS.map(function (e) { return '<option value="' + e + '"' + (p.etapaProduccion === e ? ' selected' : '') + '>' + e + '</option>'; }).join('') +
            '</select>' +
            (atrasado ? '<div style="color:var(--danger);font-size:0.72rem;font-weight:700;margin-top:3px;">Atrasado</div>' : '') +
          '</td>' +
          '<td class="hide-narrow"><input type="date" class="input" data-fecha-entrega-edit="' + p.id + '" style="padding:6px 8px;" value="' + (p.fechaEntregaEstimada ? p.fechaEntregaEstimada.slice(0, 10) : '') + '"></td>' +
          '<td class="col-actions"><button class="btn btn-outline btn-sm" data-action="deshacer">Deshacer</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function formCobroHTML() {
    if (!cobroAbierto) return '';
    var p = Store.presupuestos.get(cobroAbierto);
    if (!p) return '';
    var saldo = Math.max(saldoCobro(p), 0);
    return '<div class="form-panel">' +
      '<div class="form-panel-head"><h2>Registrar cobro — N° ' + p.numero + (p.cliente ? ' (' + Util.escapeHtml(p.cliente) + ')' : '') + '</h2></div>' +
      '<p style="font-size:0.78rem;color:var(--steel-500);margin:-4px 0 10px;">Total: ' + BudgetPDF.money(p.total) + ' · Pendiente de cobro: ' + BudgetPDF.money(saldo) + '</p>' +
      '<form id="ventas-cobro-form">' +
        '<div class="field-row">' +
          '<div class="field"><label for="ventas-cobro-pct">% del total (opcional)</label>' +
            '<input class="input" id="ventas-cobro-pct" type="number" min="0" max="100" step="1" placeholder="Ej: 40"></div>' +
          '<div class="field"><label for="ventas-cobro-monto">Monto ($)</label>' +
            '<input class="input" id="ventas-cobro-monto" type="number" min="0" step="0.01" required></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="ventas-cobro-fecha">Fecha</label>' +
            '<input class="input" id="ventas-cobro-fecha" type="date" value="' + hoyISO() + '"></div>' +
          '<div class="field"><label for="ventas-cobro-notas">Notas</label>' +
            '<input class="input" id="ventas-cobro-notas" placeholder="Ej: seña, anticipo"></div>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="ventas-cobro-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Registrar cobro</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function historialCobrosHTML() {
    var presupuestosPorId = {};
    Store.presupuestos.getAll().forEach(function (p) { presupuestosPorId[p.id] = p; });
    var cobros = Store.cobros.getAll().sort(function (a, b) { return new Date(b.fecha || 0) - new Date(a.fecha || 0); }).slice(0, 30);
    if (cobros.length === 0) return '<p class="empty-state">Todavía no registraste cobros.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Presupuesto</th><th class="hide-narrow">Notas</th><th>Monto</th><th></th></tr></thead>' +
      '<tbody>' +
      cobros.map(function (c) {
        var p = presupuestosPorId[c.presupuestoId];
        return '<tr data-id="' + c.id + '">' +
          '<td class="cell-sub">' + Util.fechaCorta(c.fecha) + '</td>' +
          '<td class="cell-title cell-wrap">' + (p ? ('N° ' + p.numero + (p.cliente ? ' — ' + Util.escapeHtml(p.cliente) : '')) : '(eliminado)') + '</td>' +
          '<td class="hide-narrow cell-sub">' + Util.escapeHtml(c.notas || '—') + '</td>' +
          '<td>' + BudgetPDF.money(c.monto) + '</td>' +
          '<td class="col-actions"><button class="icon-btn" data-action="borrar-cobro" aria-label="Eliminar">' + Util.iconTrash() + '</button></td>' +
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
        formCobroHTML() +
        tablaVendidasHTML() +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Historial de cobros</h2>' +
        historialCobrosHTML() +
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
        var fechaInput = cont.querySelector('[data-fecha-entrega="' + id + '"]');
        descontarStock(p.items);
        Store.presupuestos.save(Object.assign({}, p, {
          vendido: true, fechaVenta: Store.nowISO(),
          etapaProduccion: ETAPAS[0],
          fechaEntregaEstimada: (fechaInput && fechaInput.value) ? fechaInput.value : null
        }));
        Util.toast('Venta registrada — stock actualizado');
        render();
      });
    });

    cont.querySelectorAll('[data-etapa]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var id = sel.dataset.etapa;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        Store.presupuestos.save(Object.assign({}, p, { etapaProduccion: sel.value }));
        Util.toast('Etapa actualizada: ' + sel.value);
      });
    });

    cont.querySelectorAll('[data-fecha-entrega-edit]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var id = inp.dataset.fechaEntregaEdit;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        Store.presupuestos.save(Object.assign({}, p, { fechaEntregaEstimada: inp.value || null }));
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

    cont.querySelectorAll('[data-action="cobrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cobroAbierto = btn.closest('tr').dataset.id;
        render();
      });
    });

    var formCobro = document.getElementById('ventas-cobro-form');
    if (formCobro) {
      document.getElementById('ventas-cobro-cancelar').addEventListener('click', function () {
        cobroAbierto = null;
        render();
      });
      document.getElementById('ventas-cobro-pct').addEventListener('input', function (e) {
        var pct = parseFloat(e.target.value);
        var p = Store.presupuestos.get(cobroAbierto);
        if (!p || isNaN(pct)) return;
        document.getElementById('ventas-cobro-monto').value = ((Number(p.total) || 0) * pct / 100).toFixed(2);
      });
      formCobro.addEventListener('submit', function (e) {
        e.preventDefault();
        var monto = parseFloat(document.getElementById('ventas-cobro-monto').value);
        var fecha = document.getElementById('ventas-cobro-fecha').value || hoyISO();
        var notas = document.getElementById('ventas-cobro-notas').value.trim();
        if (isNaN(monto) || monto <= 0) { Util.toast('Ingresá un monto válido'); return; }
        Store.cobros.save({ presupuestoId: cobroAbierto, monto: monto, fecha: fecha, notas: notas });
        Util.toast('Cobro registrado');
        cobroAbierto = null;
        render();
      });
    }

    cont.querySelectorAll('[data-action="borrar-cobro"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        if (confirm('¿Eliminar este cobro del historial?')) {
          Store.cobros.remove(id);
          Util.toast('Cobro eliminado');
          render();
        }
      });
    });
  }

  global.VistaVentas = { init: render, render: render };
})(window);
