/**
 * Ventas: buscar una cotización guardada y marcarla como vendida. Ahí (y
 * no al cotizar, porque no todo presupuesto se vende) se descuenta el
 * stock de los materiales usados, convirtiendo la cantidad de cada línea
 * a la unidad propia del material según cómo se vendió (por kg, entera o
 * por metro), y se genera la OT (orden de trabajo) de esa venta con su
 * propio número correlativo. "Deshacer" repone el stock y vuelve a dejarla
 * disponible para buscar.
 *
 * Las etapas de producción y las causas de parada son listas configurables
 * en Ajustes (empresa.etapasProduccion / empresa.causasParada), no fijas —
 * así cada taller arma su propio flujo. Una OT se puede pausar en
 * cualquier etapa: al pausar se pide la causa (de esa lista) y notas
 * opcionales, y al reanudar se guarda cuánto duró la parada en el
 * historial de esa OT (y en el historial general de paradas, más abajo).
 *
 * Cada venta confirmada puede tener uno o más cobros parciales asociados
 * (Store.cobros: {presupuestoId, monto, fecha, notas}) — por ejemplo una
 * seña del 40% al confirmar y el saldo contra entrega. "Ingresos" en
 * Finanzas se calcula a partir de estos cobros reales, no del total
 * facturado.
 */
(function (global) {
  'use strict';

  var DEFAULT_ETAPAS = ['Corte', 'Soldadura', 'Pintura', 'Terminado', 'Entregado'];
  var DEFAULT_CAUSAS = ['Falta de material', 'Rotura de máquina', 'Falta de personal', 'Espera de aprobación del cliente', 'Otro'];
  var busqueda = '';
  var cobroAbierto = null; // id del presupuesto con el form de "registrar cobro" abierto
  var pausaAbierta = null; // id del presupuesto con el form de "pausar OT" abierto

  function etapasProduccion() {
    var e = Store.empresa.get().etapasProduccion;
    return (e && e.length) ? e : DEFAULT_ETAPAS;
  }

  function causasParada() {
    var c = Store.empresa.get().causasParada;
    return (c && c.length) ? c : DEFAULT_CAUSAS;
  }

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  function estaAtrasado(p) {
    var etapas = etapasProduccion();
    if (!p.fechaEntregaEstimada || p.etapaProduccion === etapas[etapas.length - 1]) return false;
    return new Date(p.fechaEntregaEstimada) < new Date(new Date().toDateString());
  }

  function formatDuracion(desde, hasta) {
    var ms = new Date(hasta) - new Date(desde);
    if (isNaN(ms) || ms < 0) return '—';
    var horas = ms / 3600000;
    if (horas < 1) return Math.max(Math.round(ms / 60000), 1) + ' min';
    if (horas < 48) return horas.toFixed(1) + ' h';
    return (horas / 24).toFixed(1) + ' días';
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

  function etapaCeldaHTML(p, etapas, atrasado) {
    if (p.pausada) {
      var parada = p.paradaActual || {};
      return '<div style="color:var(--danger);font-weight:700;font-size:0.82rem;">Pausada</div>' +
        '<div class="cell-sub">' + Util.escapeHtml(parada.causa || '') + '</div>' +
        (parada.notas ? '<div class="cell-sub" style="font-style:italic;">' + Util.escapeHtml(parada.notas) + '</div>' : '') +
        '<button class="btn btn-primary btn-sm" data-action="reanudar" style="margin-top:4px;">Reanudar</button>';
    }
    return '<div><select class="input" data-etapa="' + p.id + '" style="padding:6px 8px;">' +
        etapas.map(function (e) { return '<option value="' + Util.escapeHtml(e) + '"' + (p.etapaProduccion === e ? ' selected' : '') + '>' + Util.escapeHtml(e) + '</option>'; }).join('') +
      '</select></div>' +
      (atrasado ? '<div style="color:var(--danger);font-size:0.72rem;font-weight:700;margin-top:3px;">Atrasado</div>' : '') +
      '<button class="btn btn-outline btn-sm" data-action="pausar" style="margin-top:4px;">Pausar</button>';
  }

  function tablaVendidasHTML() {
    var etapas = etapasProduccion();
    var vendidas = Store.presupuestos.getAll().filter(function (p) { return p.vendido; })
      .sort(function (a, b) { return new Date(b.fechaVenta || 0) - new Date(a.fechaVenta || 0); });
    if (vendidas.length === 0) return '<p class="empty-state">Todavía no marcaste ninguna venta.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>OT</th><th class="hide-narrow">N° presup.</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th class="hide-narrow">Total</th><th>Cobrado</th><th>Etapa</th><th class="hide-narrow">Entrega estimada</th><th></th></tr></thead>' +
      '<tbody>' +
      vendidas.map(function (p) {
        var atrasado = estaAtrasado(p);
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-title">' + (p.numeroOT ? 'OT-' + p.numeroOT : '—') + '</td>' +
          '<td class="cell-sub hide-narrow">' + p.numero + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
          '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
          '<td class="cell-sub hide-narrow">' + BudgetPDF.money(p.total) + '</td>' +
          '<td>' + cobradoCeldaHTML(p) + '</td>' +
          '<td>' + etapaCeldaHTML(p, etapas, atrasado) + '</td>' +
          '<td class="hide-narrow"><input type="date" class="input" data-fecha-entrega-edit="' + p.id + '" style="padding:6px 8px;" value="' + (p.fechaEntregaEstimada ? p.fechaEntregaEstimada.slice(0, 10) : '') + '"></td>' +
          '<td class="col-actions"><button class="btn btn-outline btn-sm" data-action="deshacer">Deshacer</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function resumenProduccionHTML() {
    var etapas = etapasProduccion();
    var ultima = etapas[etapas.length - 1];
    var enProceso = Store.presupuestos.getAll().filter(function (p) { return p.vendido && p.etapaProduccion !== ultima; });
    if (enProceso.length === 0) return '';
    var pausadas = enProceso.filter(function (p) { return p.pausada; }).length;
    var atrasadas = enProceso.filter(estaAtrasado).length;
    return '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:10px;">' +
      enProceso.length + (enProceso.length === 1 ? ' OT en proceso' : ' OTs en proceso') +
      (pausadas > 0 ? ' — <span style="color:var(--danger);font-weight:700;">' + pausadas + (pausadas === 1 ? ' pausada' : ' pausadas') + '</span>' : '') +
      (atrasadas > 0 ? ' — <span style="color:var(--danger);font-weight:700;">' + atrasadas + (atrasadas === 1 ? ' atrasada' : ' atrasadas') + '</span>' : '') +
    '</p>';
  }

  // Vista tipo Gantt: no maneja fechas por etapa (solo hay una etapa actual
  // por OT), así que en vez de barras por fecha se muestra un stepper con
  // un segmento por etapa — verde lo ya hecho, azul (o rojo si está
  // pausada) la etapa actual, gris lo que falta. Alcanza para "ver de un
  // vistazo en qué estado está cada proyecto", que es lo que se pidió.
  function ganttFilaHTML(p, etapas) {
    var idxActual = etapas.indexOf(p.etapaProduccion);
    var atrasado = estaAtrasado(p);
    var titulo = (p.numeroOT ? 'OT-' + p.numeroOT : 'N° ' + p.numero) + ' — ' + Util.escapeHtml(p.cliente || 'Sin cliente') + (p.categoriaNombre ? ' (' + Util.escapeHtml(p.categoriaNombre) + ')' : '');
    var estadoTxt = (p.pausada ? 'Pausada · ' : '') + (atrasado ? 'Atrasado · ' : '') + Util.escapeHtml(p.etapaProduccion || '—');
    var estadoColor = (p.pausada || atrasado) ? 'var(--danger)' : 'var(--steel-500)';
    var segmentos = etapas.map(function (etapa, i) {
      var color = 'var(--border)';
      if (i < idxActual) color = 'var(--success)';
      else if (i === idxActual) color = p.pausada ? 'var(--danger)' : 'var(--brand-700)';
      return '<div title="' + Util.escapeHtml(etapa) + '" style="flex:1;height:16px;background:' + color + ';border-radius:3px;"></div>';
    }).join('<div style="width:3px;"></div>');
    return '<div style="margin-bottom:14px;">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.8rem;margin-bottom:4px;">' +
        '<span style="font-weight:600;color:var(--steel-700);">' + titulo + '</span>' +
        '<span style="color:' + estadoColor + ';font-weight:' + ((p.pausada || atrasado) ? '700' : '400') + ';white-space:nowrap;">' + estadoTxt + '</span>' +
      '</div>' +
      '<div style="display:flex;">' + segmentos + '</div>' +
    '</div>';
  }

  function ganttHTML() {
    var etapas = etapasProduccion();
    var ultima = etapas[etapas.length - 1];
    var enProceso = Store.presupuestos.getAll()
      .filter(function (p) { return p.vendido && p.etapaProduccion !== ultima; })
      .sort(function (a, b) { return new Date(a.fechaVenta || 0) - new Date(b.fechaVenta || 0); });
    if (enProceso.length === 0) return '';
    return '<div class="card">' +
      '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:2px;">Vista de proyectos</h2>' +
      '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:14px;">En qué etapa está cada OT en proceso.</p>' +
      enProceso.map(function (p) { return ganttFilaHTML(p, etapas); }).join('') +
    '</div>';
  }

  function formPausaHTML() {
    if (!pausaAbierta) return '';
    var p = Store.presupuestos.get(pausaAbierta);
    if (!p) return '';
    var causas = causasParada();
    return '<div class="form-panel">' +
      '<div class="form-panel-head"><h2>Pausar ' + (p.numeroOT ? 'OT-' + p.numeroOT : 'N° ' + p.numero) + '</h2></div>' +
      '<form id="ventas-pausa-form">' +
        '<div class="field"><label for="ventas-pausa-causa">Causa</label>' +
          '<select class="input" id="ventas-pausa-causa">' +
            causas.map(function (c) { return '<option value="' + Util.escapeHtml(c) + '">' + Util.escapeHtml(c) + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="field"><label for="ventas-pausa-notas">Notas</label>' +
          '<input class="input" id="ventas-pausa-notas" placeholder="Opcional"></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="ventas-pausa-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Pausar</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function historialParadasHTML() {
    var presupuestosPorId = {};
    Store.presupuestos.getAll().forEach(function (p) { presupuestosPorId[p.id] = p; });
    var filas = [];
    Store.presupuestos.getAll().forEach(function (p) {
      (p.paradas || []).forEach(function (parada) { filas.push({ presupuesto: p, parada: parada }); });
    });
    filas.sort(function (a, b) { return new Date(b.parada.desde || 0) - new Date(a.parada.desde || 0); });
    filas = filas.slice(0, 30);
    if (filas.length === 0) return '<p class="empty-state">Todavía no hay paradas registradas.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>OT</th><th>Causa</th><th class="hide-narrow">Desde</th><th class="hide-narrow">Hasta</th><th>Duración</th><th class="hide-narrow">Notas</th></tr></thead>' +
      '<tbody>' +
      filas.map(function (f) {
        var p = f.presupuesto, parada = f.parada;
        return '<tr>' +
          '<td class="cell-title">' + (p.numeroOT ? 'OT-' + p.numeroOT : '—') + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(parada.causa || '—') + '</td>' +
          '<td class="hide-narrow cell-sub">' + Util.fechaCorta(parada.desde) + '</td>' +
          '<td class="hide-narrow cell-sub">' + (parada.hasta ? Util.fechaCorta(parada.hasta) : '—') + '</td>' +
          '<td>' + formatDuracion(parada.desde, parada.hasta) + '</td>' +
          '<td class="hide-narrow cell-sub">' + Util.escapeHtml(parada.notas || '—') + '</td>' +
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
      ganttHTML() +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:2px;">Ventas confirmadas</h2>' +
        resumenProduccionHTML() +
        formPausaHTML() +
        formCobroHTML() +
        tablaVendidasHTML() +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Historial de paradas</h2>' +
        historialParadasHTML() +
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
        btn.disabled = true;
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        var fechaInput = cont.querySelector('[data-fecha-entrega="' + id + '"]');
        var fechaEntregaEstimada = (fechaInput && fechaInput.value) ? fechaInput.value : null;
        // tomarNumeroOT() es síncrono en modo local y una transacción (Promise)
        // en modo Firestore; Promise.resolve cubre ambos casos por igual.
        Promise.resolve(Store.empresa.tomarNumeroOT()).then(function (numeroOT) {
          descontarStock(p.items);
          Store.presupuestos.save(Object.assign({}, p, {
            vendido: true, fechaVenta: Store.nowISO(),
            numeroOT: numeroOT,
            etapaProduccion: etapasProduccion()[0],
            pausada: false, paradaActual: null, paradas: p.paradas || [],
            fechaEntregaEstimada: fechaEntregaEstimada
          }));
          Util.toast('Venta registrada — OT-' + numeroOT + ' generada, stock actualizado');
          render();
        }).catch(function (err) {
          console.error(err);
          Util.toast('No se pudo registrar la venta, revisá la conexión');
          btn.disabled = false;
        });
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
        var etiqueta = p.numeroOT ? 'OT-' + p.numeroOT : 'N° ' + p.numero;
        if (!confirm('¿Deshacer la venta (' + etiqueta + ')? Se repone el stock y se pierde el seguimiento de producción (etapa y paradas) de esta OT.')) return;
        reponerStock(p.items);
        Store.presupuestos.save(Object.assign({}, p, { vendido: false, fechaVenta: null }));
        Util.toast('Venta deshecha — stock repuesto');
        render();
      });
    });

    cont.querySelectorAll('[data-action="pausar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pausaAbierta = btn.closest('tr').dataset.id;
        cobroAbierto = null;
        render();
      });
    });

    cont.querySelectorAll('[data-action="reanudar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p || !p.paradaActual) return;
        var parada = Object.assign({}, p.paradaActual, { hasta: Store.nowISO() });
        var paradas = (p.paradas || []).concat([parada]);
        Store.presupuestos.save(Object.assign({}, p, { pausada: false, paradaActual: null, paradas: paradas }));
        Util.toast('OT reanudada — parada de ' + formatDuracion(parada.desde, parada.hasta));
        render();
      });
    });

    var formPausa = document.getElementById('ventas-pausa-form');
    if (formPausa) {
      document.getElementById('ventas-pausa-cancelar').addEventListener('click', function () {
        pausaAbierta = null;
        render();
      });
      formPausa.addEventListener('submit', function (e) {
        e.preventDefault();
        var causa = document.getElementById('ventas-pausa-causa').value;
        var notas = document.getElementById('ventas-pausa-notas').value.trim();
        var p = Store.presupuestos.get(pausaAbierta);
        if (!p) return;
        Store.presupuestos.save(Object.assign({}, p, {
          pausada: true,
          paradaActual: { causa: causa, notas: notas, desde: Store.nowISO() }
        }));
        Util.toast('OT pausada');
        pausaAbierta = null;
        render();
      });
    }

    cont.querySelectorAll('[data-action="cobrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cobroAbierto = btn.closest('tr').dataset.id;
        pausaAbierta = null;
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
