/**
 * Proyectos: seguimiento de producción de cada OT (orden de trabajo), que
 * se genera al confirmar una venta en Finanzas > Ventas. Acá vive todo lo
 * operativo de la OT — vista tipo Gantt, etapa actual, pausar/reanudar con
 * causa, entrega estimada y el historial de paradas — separado de lo
 * financiero (cobros, deshacer la venta), que sigue en Ventas.
 *
 * Las etapas de producción y las causas de parada son listas configurables
 * en Ajustes (empresa.etapasProduccion / empresa.causasParada), no fijas —
 * así cada taller arma su propio flujo.
 */
(function (global) {
  'use strict';

  var DEFAULT_ETAPAS = ['Corte', 'Soldadura', 'Pintura', 'Terminado', 'Entregado'];
  var DEFAULT_CAUSAS = ['Falta de material', 'Rotura de máquina', 'Falta de personal', 'Espera de aprobación del cliente', 'Otro'];
  var pausaAbierta = null; // id del presupuesto con el form de "pausar OT" abierto

  function etapasProduccion() {
    var e = Store.empresa.get().etapasProduccion;
    return (e && e.length) ? e : DEFAULT_ETAPAS;
  }

  function causasParada() {
    var c = Store.empresa.get().causasParada;
    return (c && c.length) ? c : DEFAULT_CAUSAS;
  }

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
  // vistazo en qué estado está cada proyecto".
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
    if (enProceso.length === 0) {
      return '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Vista de proyectos</h2>' +
        '<p class="empty-state">No hay OTs en proceso — se generan al marcar una cotización como vendida en Finanzas &gt; Ventas.</p>' +
      '</div>';
    }
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
      '<form id="proy-pausa-form">' +
        '<div class="field"><label for="proy-pausa-causa">Causa</label>' +
          '<select class="input" id="proy-pausa-causa">' +
            causas.map(function (c) { return '<option value="' + Util.escapeHtml(c) + '">' + Util.escapeHtml(c) + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="field"><label for="proy-pausa-notas">Notas</label>' +
          '<input class="input" id="proy-pausa-notas" placeholder="Opcional"></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="proy-pausa-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Pausar</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function etapaCeldaHTML(p, etapas) {
    if (p.pausada) {
      var parada = p.paradaActual || {};
      return '<div style="color:var(--danger);font-weight:700;font-size:0.82rem;">Pausada</div>' +
        '<div class="cell-sub">' + Util.escapeHtml(parada.causa || '') + '</div>' +
        (parada.notas ? '<div class="cell-sub" style="font-style:italic;">' + Util.escapeHtml(parada.notas) + '</div>' : '') +
        '<button class="btn btn-primary btn-sm" data-action="reanudar" style="margin-top:4px;">Reanudar</button>';
    }
    var atrasado = estaAtrasado(p);
    return '<div><select class="input" data-etapa="' + p.id + '" style="padding:6px 8px;">' +
        etapas.map(function (e) { return '<option value="' + Util.escapeHtml(e) + '"' + (p.etapaProduccion === e ? ' selected' : '') + '>' + Util.escapeHtml(e) + '</option>'; }).join('') +
      '</select></div>' +
      (atrasado ? '<div style="color:var(--danger);font-size:0.72rem;font-weight:700;margin-top:3px;">Atrasado</div>' : '') +
      '<button class="btn btn-outline btn-sm" data-action="pausar" style="margin-top:4px;">Pausar</button>';
  }

  function tablaProyectosHTML() {
    var etapas = etapasProduccion();
    var ots = Store.presupuestos.getAll().filter(function (p) { return p.vendido; })
      .sort(function (a, b) { return new Date(b.fechaVenta || 0) - new Date(a.fechaVenta || 0); });
    if (ots.length === 0) return '<p class="empty-state">Todavía no hay ninguna OT — se generan al marcar una cotización como vendida en Finanzas &gt; Ventas.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>OT</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th>Etapa</th><th class="hide-narrow">Entrega estimada</th></tr></thead>' +
      '<tbody>' +
      ots.map(function (p) {
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-title">' + (p.numeroOT ? 'OT-' + p.numeroOT : '—') + '</td>' +
          '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
          '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
          '<td>' + etapaCeldaHTML(p, etapas) + '</td>' +
          '<td class="hide-narrow"><input type="date" class="input" data-fecha-entrega-edit="' + p.id + '" style="padding:6px 8px;" value="' + (p.fechaEntregaEstimada ? p.fechaEntregaEstimada.slice(0, 10) : '') + '"></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function historialParadasHTML() {
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

  function render() {
    var cont = document.getElementById('proyectos-container');
    if (!cont) return;

    cont.innerHTML =
      ganttHTML() +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:2px;">OTs</h2>' +
        resumenProduccionHTML() +
        formPausaHTML() +
        tablaProyectosHTML() +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Historial de paradas</h2>' +
        historialParadasHTML() +
      '</div>';

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

    cont.querySelectorAll('[data-action="pausar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pausaAbierta = btn.closest('tr').dataset.id;
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

    var formPausa = document.getElementById('proy-pausa-form');
    if (formPausa) {
      document.getElementById('proy-pausa-cancelar').addEventListener('click', function () {
        pausaAbierta = null;
        render();
      });
      formPausa.addEventListener('submit', function (e) {
        e.preventDefault();
        var causa = document.getElementById('proy-pausa-causa').value;
        var notas = document.getElementById('proy-pausa-notas').value.trim();
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
  }

  global.VistaProyectos = { init: render, render: render };
})(window);
