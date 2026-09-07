/**
 * Finanzas: ventas, rentabilidad, ingresos, sueldos y créditos del taller,
 * en sub-solapas dentro de una sola sección. La sub-solapa Ventas delega
 * por completo en VistaVentas (js/ventas.js) — acá solo se le da un
 * contenedor y se la renderiza al entrar. Ingresos/Rentabilidad se calculan
 * directo de las ventas confirmadas (Store.presupuestos con vendido:true) —
 * no hay carga de ingresos aparte. Sueldos y Créditos sí tienen su propia
 * carga (empleados/pagos y créditos/pagos respectivamente).
 */
(function (global) {
  'use strict';

  var TABS = [
    { id: 'ventas', label: 'Ventas' },
    { id: 'rentabilidad', label: 'Rentabilidad' },
    { id: 'ingresos', label: 'Ingresos' },
    { id: 'sueldos', label: 'Sueldos' },
    { id: 'creditos', label: 'Créditos' }
  ];
  var subTab = 'ventas';

  var mostrarFormEmpleado = false;
  var editandoEmpleadoId = null;
  var pagoEmpleadoAbierto = null; // id del empleado con el form de "registrar pago" abierto

  var mostrarFormCredito = false;
  var editandoCreditoId = null;
  var pagoCreditoAbierto = null; // id del crédito con el form de "registrar pago" abierto

  // ============ Helpers comunes ============
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

  function periodoActual() {
    var s = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function hoyISO() { return new Date().toISOString().slice(0, 10); }

  function sumarMeses(fechaISO, n) {
    var d = fechaISO ? new Date(fechaISO) : new Date();
    d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 10);
  }

  function statCard(label, valor, danger) {
    return '<div class="card" style="flex:1;min-width:150px;">' +
      '<div style="font-size:0.75rem;color:var(--steel-500);font-weight:600;margin-bottom:4px;">' + label + '</div>' +
      '<div style="font-size:1.4rem;font-weight:800;color:' + (danger ? 'var(--danger)' : 'var(--ink-900)') + ';">' + valor + '</div>' +
    '</div>';
  }

  function money(n) { return BudgetPDF.money(n); }

  // ============ Datos derivados de Ventas (Ingresos = Ventas) ============
  function ventasVendidas() {
    return Store.presupuestos.getAll().filter(function (p) { return p.vendido && p.fechaVenta; });
  }

  function resumenPorMes(n) {
    var ventas = ventasVendidas();
    var sueldos = Store.pagosSueldo.getAll();
    var creditos = Store.pagosCredito.getAll();
    var meses = mesesRecientes(n);
    return meses.map(function (m) {
      var vDelMes = ventas.filter(function (p) { return claveMes(p.fechaVenta) === m.key; });
      var ingresos = vDelMes.reduce(function (a, p) { return a + (Number(p.total) || 0); }, 0);
      var margen = vDelMes.reduce(function (a, p) { return a + (Number(p.margen) || 0); }, 0);
      var gastoSueldos = sueldos.filter(function (s) { return claveMes(s.fecha) === m.key; })
        .reduce(function (a, s) { return a + (Number(s.monto) || 0); }, 0);
      var gastoCreditos = creditos.filter(function (c) { return claveMes(c.fecha) === m.key; })
        .reduce(function (a, c) { return a + (Number(c.monto) || 0); }, 0);
      var gastos = gastoSueldos + gastoCreditos;
      return {
        key: m.key, label: m.label, cantVentas: vDelMes.length,
        ingresos: ingresos, margen: margen,
        gastoSueldos: gastoSueldos, gastoCreditos: gastoCreditos, gastos: gastos,
        neto: margen - gastos
      };
    });
  }

  // ============ Rentabilidad ============
  function renderRentabilidad() {
    var datos = resumenPorMes(6);
    var esteMes = datos[datos.length - 1];

    return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
        statCard('Ingresos este mes', money(esteMes.ingresos)) +
        statCard('Margen bruto este mes', money(esteMes.margen)) +
        statCard('Gastos operativos este mes', money(esteMes.gastos)) +
        statCard('Rentabilidad neta este mes', money(esteMes.neto), esteMes.neto < 0) +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:2px;">Rentabilidad por mes</h2>' +
        '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:12px;">Margen bruto de las ventas confirmadas, menos sueldos y cuotas de crédito pagados en cada mes.</p>' +
        '<div class="table-wrap"><table class="data-table">' +
          '<thead><tr><th>Mes</th><th>Ingresos</th><th class="hide-narrow">Margen bruto</th><th class="hide-narrow">Gastos</th><th>Rentabilidad neta</th></tr></thead>' +
          '<tbody>' +
          datos.slice().reverse().map(function (d) {
            return '<tr>' +
              '<td class="cell-title">' + d.label + '</td>' +
              '<td>' + money(d.ingresos) + '</td>' +
              '<td class="hide-narrow cell-sub">' + money(d.margen) + '</td>' +
              '<td class="hide-narrow cell-sub">' + money(d.gastos) + '</td>' +
              '<td style="font-weight:700;color:' + (d.neto < 0 ? 'var(--danger)' : 'var(--success)') + ';">' + money(d.neto) + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div>' +
      '</div>';
  }

  // ============ Ingresos ============
  function renderIngresos() {
    var datos = resumenPorMes(6);
    var max = Math.max.apply(null, datos.map(function (d) { return d.ingresos; }).concat([0]));
    var ventas = ventasVendidas();
    var totalHistorico = ventas.reduce(function (a, p) { return a + (Number(p.total) || 0); }, 0);

    function barraHTML(label, valor, subLabel) {
      var pct = max > 0 ? Math.max((valor / max) * 100, valor > 0 ? 3 : 0) : 0;
      return '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:3px;">' +
          '<span style="font-weight:600;color:var(--steel-700);">' + label + '</span>' +
          '<span style="color:var(--steel-500);">' + subLabel + '</span>' +
        '</div>' +
        '<div style="background:var(--surface-alt);border-radius:var(--radius-sm);height:10px;overflow:hidden;">' +
          '<div style="background:var(--brand-700);height:100%;width:' + pct + '%;border-radius:var(--radius-sm);"></div>' +
        '</div>' +
      '</div>';
    }

    return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
        statCard('Ingresos totales (histórico)', money(totalHistorico)) +
        statCard('Ventas confirmadas (histórico)', ventas.length) +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:2px;">Ingresos por mes</h2>' +
        '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:12px;">Total facturado en las ventas marcadas como vendidas, por mes de venta.</p>' +
        datos.map(function (d) {
          return barraHTML(d.label, d.ingresos, money(d.ingresos) + ' · ' + d.cantVentas + (d.cantVentas === 1 ? ' venta' : ' ventas'));
        }).join('') +
      '</div>';
  }

  // ============ Sueldos ============
  function totalPagadoSueldosEsteMes() {
    var key = claveMes(new Date().toISOString());
    return Store.pagosSueldo.getAll().filter(function (s) { return claveMes(s.fecha) === key; })
      .reduce(function (a, s) { return a + (Number(s.monto) || 0); }, 0);
  }

  function formEmpleadoHTML() {
    if (!mostrarFormEmpleado && editandoEmpleadoId === null) return '';
    var emp = editandoEmpleadoId ? Store.empleados.get(editandoEmpleadoId) : null;
    return '<div class="form-panel">' +
      '<div class="form-panel-head"><h2>' + (emp ? 'Editar empleado' : 'Nuevo empleado') + '</h2></div>' +
      '<form id="fin-emp-form">' +
        '<div class="field"><label for="fin-emp-nombre">Nombre</label>' +
          '<input class="input" id="fin-emp-nombre" required value="' + Util.escapeHtml(emp ? emp.nombre : '') + '"></div>' +
        '<div class="field"><label for="fin-emp-sueldo">Sueldo mensual ($)</label>' +
          '<input class="input" id="fin-emp-sueldo" type="number" min="0" step="0.01" value="' + (emp && emp.sueldoMensual ? emp.sueldoMensual : '') + '"></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="fin-emp-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Guardar</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function formPagoEmpleadoHTML() {
    if (!pagoEmpleadoAbierto) return '';
    var emp = Store.empleados.get(pagoEmpleadoAbierto);
    if (!emp) return '';
    return '<div class="form-panel">' +
      '<div class="form-panel-head"><h2>Registrar pago a ' + Util.escapeHtml(emp.nombre) + '</h2></div>' +
      '<form id="fin-pago-emp-form">' +
        '<div class="field-row">' +
          '<div class="field"><label for="fin-pago-emp-monto">Monto ($)</label>' +
            '<input class="input" id="fin-pago-emp-monto" type="number" min="0" step="0.01" required value="' + (Number(emp.sueldoMensual) || '') + '"></div>' +
          '<div class="field"><label for="fin-pago-emp-fecha">Fecha</label>' +
            '<input class="input" id="fin-pago-emp-fecha" type="date" value="' + hoyISO() + '"></div>' +
        '</div>' +
        '<div class="field"><label for="fin-pago-emp-periodo">Período</label>' +
          '<input class="input" id="fin-pago-emp-periodo" value="' + periodoActual() + '"></div>' +
        '<div class="field"><label for="fin-pago-emp-notas">Notas</label>' +
          '<input class="input" id="fin-pago-emp-notas" placeholder="Opcional"></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="fin-pago-emp-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Registrar pago</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function listaEmpleadosHTML() {
    var empleados = Store.empleados.getAll().sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || '', 'es'); });
    if (empleados.length === 0) return '<p class="empty-state">Todavía no cargaste empleados. Tocá "+ Empleado" para agregar el primero.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Empleado</th><th>Sueldo mensual</th><th></th></tr></thead>' +
      '<tbody>' +
      empleados.map(function (e) {
        return '<tr data-id="' + e.id + '">' +
          '<td class="cell-title">' + Util.escapeHtml(e.nombre) + '</td>' +
          '<td>' + money(e.sueldoMensual) + '</td>' +
          '<td class="col-actions">' +
            '<button class="btn btn-outline btn-sm" data-action="pagar">Registrar pago</button> ' +
            '<button class="icon-btn" data-action="editar" aria-label="Editar">' + Util.iconPencil() + '</button>' +
            '<button class="icon-btn" data-action="borrar" aria-label="Eliminar">' + Util.iconTrash() + '</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function historialPagosSueldoHTML() {
    var empleadosPorId = {};
    Store.empleados.getAll().forEach(function (e) { empleadosPorId[e.id] = e; });
    var pagos = Store.pagosSueldo.getAll().sort(function (a, b) { return new Date(b.fecha || 0) - new Date(a.fecha || 0); }).slice(0, 30);
    if (pagos.length === 0) return '<p class="empty-state">Todavía no registraste pagos de sueldo.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Empleado</th><th class="hide-narrow">Período</th><th>Monto</th><th></th></tr></thead>' +
      '<tbody>' +
      pagos.map(function (p) {
        var emp = empleadosPorId[p.empleadoId];
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-sub">' + Util.fechaCorta(p.fecha) + '</td>' +
          '<td class="cell-title">' + Util.escapeHtml(emp ? emp.nombre : '(eliminado)') + '</td>' +
          '<td class="hide-narrow cell-sub">' + Util.escapeHtml(p.periodo || '—') + '</td>' +
          '<td>' + money(p.monto) + '</td>' +
          '<td class="col-actions"><button class="icon-btn" data-action="borrar-pago" aria-label="Eliminar">' + Util.iconTrash() + '</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderSueldos() {
    return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
        statCard('Empleados activos', Store.empleados.getAll().length) +
        statCard('Pagado este mes', money(totalPagadoSueldosEsteMes())) +
      '</div>' +
      '<div class="card">' +
        '<div class="toolbar" style="margin-bottom:12px;padding:0;">' +
          '<h2 style="font-size:0.95rem;font-weight:700;flex:1;">Empleados</h2>' +
          '<button class="btn btn-primary btn-sm" id="fin-emp-nuevo-btn">+ Empleado</button>' +
        '</div>' +
        formEmpleadoHTML() +
        formPagoEmpleadoHTML() +
        listaEmpleadosHTML() +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Historial de pagos</h2>' +
        historialPagosSueldoHTML() +
      '</div>';
  }

  function wireSueldos(cont) {
    document.getElementById('fin-emp-nuevo-btn').addEventListener('click', function () {
      mostrarFormEmpleado = true; editandoEmpleadoId = null; pagoEmpleadoAbierto = null;
      render();
    });
    var formEmp = document.getElementById('fin-emp-form');
    if (formEmp) {
      document.getElementById('fin-emp-cancelar').addEventListener('click', function () {
        mostrarFormEmpleado = false; editandoEmpleadoId = null; render();
      });
      formEmp.addEventListener('submit', function (e) {
        e.preventDefault();
        var nombre = document.getElementById('fin-emp-nombre').value.trim();
        var sueldoMensual = parseFloat(document.getElementById('fin-emp-sueldo').value) || 0;
        if (!nombre) { Util.toast('Ingresá el nombre del empleado'); return; }
        var item = editandoEmpleadoId ? Object.assign({}, Store.empleados.get(editandoEmpleadoId)) : {};
        item.nombre = nombre;
        item.sueldoMensual = sueldoMensual;
        Store.empleados.save(item);
        Util.toast('Empleado guardado');
        mostrarFormEmpleado = false; editandoEmpleadoId = null;
        render();
      });
    }
    var formPago = document.getElementById('fin-pago-emp-form');
    if (formPago) {
      document.getElementById('fin-pago-emp-cancelar').addEventListener('click', function () {
        pagoEmpleadoAbierto = null; render();
      });
      formPago.addEventListener('submit', function (e) {
        e.preventDefault();
        var monto = parseFloat(document.getElementById('fin-pago-emp-monto').value) || 0;
        var fecha = document.getElementById('fin-pago-emp-fecha').value || hoyISO();
        var periodo = document.getElementById('fin-pago-emp-periodo').value.trim();
        var notas = document.getElementById('fin-pago-emp-notas').value.trim();
        if (monto <= 0) { Util.toast('Ingresá un monto válido'); return; }
        Store.pagosSueldo.save({ empleadoId: pagoEmpleadoAbierto, monto: monto, fecha: fecha, periodo: periodo, notas: notas });
        Util.toast('Pago registrado');
        pagoEmpleadoAbierto = null;
        render();
      });
    }
    cont.querySelectorAll('[data-action="pagar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pagoEmpleadoAbierto = btn.closest('tr').dataset.id;
        mostrarFormEmpleado = false; editandoEmpleadoId = null;
        render();
      });
    });
    cont.querySelectorAll('[data-action="editar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editandoEmpleadoId = btn.closest('tr').dataset.id;
        mostrarFormEmpleado = false; pagoEmpleadoAbierto = null;
        render();
      });
    });
    cont.querySelectorAll('[data-action="borrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var emp = Store.empleados.get(id);
        if (!emp) return;
        if (confirm('¿Eliminar a "' + emp.nombre + '"? No se borra el historial de pagos ya registrado.')) {
          Store.empleados.remove(id);
          Util.toast('Empleado eliminado');
          render();
        }
      });
    });
    cont.querySelectorAll('[data-action="borrar-pago"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        if (confirm('¿Eliminar este pago del historial?')) {
          Store.pagosSueldo.remove(id);
          Util.toast('Pago eliminado');
          render();
        }
      });
    });
  }

  // ============ Créditos ============
  function saldoPendiente(credito) {
    var pagado = Store.pagosCredito.getAll()
      .filter(function (p) { return p.creditoId === credito.id; })
      .reduce(function (a, p) { return a + (Number(p.monto) || 0); }, 0);
    return (Number(credito.montoTotal) || 0) - pagado;
  }

  function estaAtrasadoCredito(credito) {
    if (!credito.fechaProximoVencimiento) return false;
    if (saldoPendiente(credito) <= 0) return false;
    return new Date(credito.fechaProximoVencimiento) < new Date(new Date().toDateString());
  }

  function totalSaldoPendiente() {
    return Store.creditos.getAll().reduce(function (a, c) { return a + Math.max(saldoPendiente(c), 0); }, 0);
  }

  function formCreditoHTML() {
    if (!mostrarFormCredito && editandoCreditoId === null) return '';
    var cr = editandoCreditoId ? Store.creditos.get(editandoCreditoId) : null;
    return '<div class="form-panel">' +
      '<div class="form-panel-head"><h2>' + (cr ? 'Editar crédito' : 'Nuevo crédito') + '</h2></div>' +
      '<form id="fin-cred-form">' +
        '<div class="field"><label for="fin-cred-concepto">Concepto</label>' +
          '<input class="input" id="fin-cred-concepto" required placeholder="Ej: Préstamo compra de plegadora" value="' + Util.escapeHtml(cr ? cr.concepto : '') + '"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="fin-cred-monto">Monto total ($)</label>' +
            '<input class="input" id="fin-cred-monto" type="number" min="0" step="0.01" required value="' + (cr && cr.montoTotal ? cr.montoTotal : '') + '"></div>' +
          '<div class="field"><label for="fin-cred-tasa">Interés anual (%)</label>' +
            '<input class="input" id="fin-cred-tasa" type="number" min="0" step="0.01" value="' + (cr && cr.tasaInteresAnual ? cr.tasaInteresAnual : '') + '"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="fin-cred-cuota">Cuota mensual ($)</label>' +
            '<input class="input" id="fin-cred-cuota" type="number" min="0" step="0.01" value="' + (cr && cr.cuotaMensual ? cr.cuotaMensual : '') + '"></div>' +
          '<div class="field"><label for="fin-cred-vencimiento">Próximo vencimiento</label>' +
            '<input class="input" id="fin-cred-vencimiento" type="date" value="' + (cr && cr.fechaProximoVencimiento ? cr.fechaProximoVencimiento.slice(0, 10) : '') + '"></div>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="fin-cred-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Guardar</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function formPagoCreditoHTML() {
    if (!pagoCreditoAbierto) return '';
    var cr = Store.creditos.get(pagoCreditoAbierto);
    if (!cr) return '';
    return '<div class="form-panel">' +
      '<div class="form-panel-head"><h2>Registrar pago de cuota — ' + Util.escapeHtml(cr.concepto) + '</h2></div>' +
      '<form id="fin-pago-cred-form">' +
        '<div class="field-row">' +
          '<div class="field"><label for="fin-pago-cred-monto">Monto ($)</label>' +
            '<input class="input" id="fin-pago-cred-monto" type="number" min="0" step="0.01" required value="' + (Number(cr.cuotaMensual) || '') + '"></div>' +
          '<div class="field"><label for="fin-pago-cred-fecha">Fecha</label>' +
            '<input class="input" id="fin-pago-cred-fecha" type="date" value="' + hoyISO() + '"></div>' +
        '</div>' +
        '<p style="font-size:0.78rem;color:var(--steel-500);margin:2px 0 10px;">Al confirmar, el próximo vencimiento se corre un mes.</p>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="fin-pago-cred-cancelar">Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">Registrar pago</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function listaCreditosHTML() {
    var creditos = Store.creditos.getAll().sort(function (a, b) { return (a.concepto || '').localeCompare(b.concepto || '', 'es'); });
    if (creditos.length === 0) return '<p class="empty-state">Todavía no cargaste créditos. Tocá "+ Crédito" para agregar el primero.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Concepto</th><th class="hide-narrow">Interés anual</th><th class="hide-narrow">Cuota</th><th>Saldo pendiente</th><th>Próx. vencimiento</th><th></th></tr></thead>' +
      '<tbody>' +
      creditos.map(function (c) {
        var saldo = saldoPendiente(c);
        var atrasado = estaAtrasadoCredito(c);
        return '<tr data-id="' + c.id + '">' +
          '<td class="cell-title cell-wrap">' + Util.escapeHtml(c.concepto) + '</td>' +
          '<td class="hide-narrow cell-sub">' + (c.tasaInteresAnual ? c.tasaInteresAnual + '%' : '—') + '</td>' +
          '<td class="hide-narrow cell-sub">' + (c.cuotaMensual ? money(c.cuotaMensual) : '—') + '</td>' +
          '<td style="font-weight:700;">' + money(Math.max(saldo, 0)) + (saldo <= 0 ? ' <span class="cell-sub">(saldado)</span>' : '') + '</td>' +
          '<td>' + (c.fechaProximoVencimiento ? Util.fechaCorta(c.fechaProximoVencimiento) : '—') +
            (atrasado ? '<div style="color:var(--danger);font-size:0.72rem;font-weight:700;">Atrasado</div>' : '') +
          '</td>' +
          '<td class="col-actions">' +
            (saldo > 0 ? '<button class="btn btn-outline btn-sm" data-action="pagar">Registrar pago</button> ' : '') +
            '<button class="icon-btn" data-action="editar" aria-label="Editar">' + Util.iconPencil() + '</button>' +
            '<button class="icon-btn" data-action="borrar" aria-label="Eliminar">' + Util.iconTrash() + '</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function historialPagosCreditoHTML() {
    var creditosPorId = {};
    Store.creditos.getAll().forEach(function (c) { creditosPorId[c.id] = c; });
    var pagos = Store.pagosCredito.getAll().sort(function (a, b) { return new Date(b.fecha || 0) - new Date(a.fecha || 0); }).slice(0, 30);
    if (pagos.length === 0) return '<p class="empty-state">Todavía no registraste pagos de cuotas.</p>';
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Crédito</th><th>Monto</th><th></th></tr></thead>' +
      '<tbody>' +
      pagos.map(function (p) {
        var cr = creditosPorId[p.creditoId];
        return '<tr data-id="' + p.id + '">' +
          '<td class="cell-sub">' + Util.fechaCorta(p.fecha) + '</td>' +
          '<td class="cell-title cell-wrap">' + Util.escapeHtml(cr ? cr.concepto : '(eliminado)') + '</td>' +
          '<td>' + money(p.monto) + '</td>' +
          '<td class="col-actions"><button class="icon-btn" data-action="borrar-pago" aria-label="Eliminar">' + Util.iconTrash() + '</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderCreditos() {
    var creditos = Store.creditos.getAll();
    var atrasados = creditos.filter(estaAtrasadoCredito).length;
    return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">' +
        statCard('Saldo pendiente total', money(totalSaldoPendiente())) +
        statCard('Cuotas atrasadas', atrasados, atrasados > 0) +
      '</div>' +
      '<div class="card">' +
        '<div class="toolbar" style="margin-bottom:12px;padding:0;">' +
          '<h2 style="font-size:0.95rem;font-weight:700;flex:1;">Créditos y préstamos</h2>' +
          '<button class="btn btn-primary btn-sm" id="fin-cred-nuevo-btn">+ Crédito</button>' +
        '</div>' +
        formCreditoHTML() +
        formPagoCreditoHTML() +
        listaCreditosHTML() +
      '</div>' +
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Historial de pagos</h2>' +
        historialPagosCreditoHTML() +
      '</div>';
  }

  function wireCreditos(cont) {
    document.getElementById('fin-cred-nuevo-btn').addEventListener('click', function () {
      mostrarFormCredito = true; editandoCreditoId = null; pagoCreditoAbierto = null;
      render();
    });
    var formCr = document.getElementById('fin-cred-form');
    if (formCr) {
      document.getElementById('fin-cred-cancelar').addEventListener('click', function () {
        mostrarFormCredito = false; editandoCreditoId = null; render();
      });
      formCr.addEventListener('submit', function (e) {
        e.preventDefault();
        var concepto = document.getElementById('fin-cred-concepto').value.trim();
        var montoTotal = parseFloat(document.getElementById('fin-cred-monto').value) || 0;
        var tasaInteresAnual = parseFloat(document.getElementById('fin-cred-tasa').value) || 0;
        var cuotaMensual = parseFloat(document.getElementById('fin-cred-cuota').value) || 0;
        var fechaProximoVencimiento = document.getElementById('fin-cred-vencimiento').value || null;
        if (!concepto || montoTotal <= 0) { Util.toast('Completá el concepto y el monto total'); return; }
        var item = editandoCreditoId ? Object.assign({}, Store.creditos.get(editandoCreditoId)) : {};
        item.concepto = concepto;
        item.montoTotal = montoTotal;
        item.tasaInteresAnual = tasaInteresAnual;
        item.cuotaMensual = cuotaMensual;
        item.fechaProximoVencimiento = fechaProximoVencimiento;
        Store.creditos.save(item);
        Util.toast('Crédito guardado');
        mostrarFormCredito = false; editandoCreditoId = null;
        render();
      });
    }
    var formPagoCr = document.getElementById('fin-pago-cred-form');
    if (formPagoCr) {
      document.getElementById('fin-pago-cred-cancelar').addEventListener('click', function () {
        pagoCreditoAbierto = null; render();
      });
      formPagoCr.addEventListener('submit', function (e) {
        e.preventDefault();
        var cr = Store.creditos.get(pagoCreditoAbierto);
        if (!cr) return;
        var monto = parseFloat(document.getElementById('fin-pago-cred-monto').value) || 0;
        var fecha = document.getElementById('fin-pago-cred-fecha').value || hoyISO();
        if (monto <= 0) { Util.toast('Ingresá un monto válido'); return; }
        Store.pagosCredito.save({ creditoId: pagoCreditoAbierto, monto: monto, fecha: fecha });
        Store.creditos.save(Object.assign({}, cr, { fechaProximoVencimiento: sumarMeses(cr.fechaProximoVencimiento || fecha, 1) }));
        Util.toast('Pago registrado — próximo vencimiento actualizado');
        pagoCreditoAbierto = null;
        render();
      });
    }
    cont.querySelectorAll('[data-action="pagar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pagoCreditoAbierto = btn.closest('tr').dataset.id;
        mostrarFormCredito = false; editandoCreditoId = null;
        render();
      });
    });
    cont.querySelectorAll('[data-action="editar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editandoCreditoId = btn.closest('tr').dataset.id;
        mostrarFormCredito = false; pagoCreditoAbierto = null;
        render();
      });
    });
    cont.querySelectorAll('[data-action="borrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var cr = Store.creditos.get(id);
        if (!cr) return;
        if (confirm('¿Eliminar el crédito "' + cr.concepto + '"? No se borra el historial de pagos ya registrado.')) {
          Store.creditos.remove(id);
          Util.toast('Crédito eliminado');
          render();
        }
      });
    });
    cont.querySelectorAll('[data-action="borrar-pago"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        if (confirm('¿Eliminar este pago del historial?')) {
          Store.pagosCredito.remove(id);
          Util.toast('Pago eliminado');
          render();
        }
      });
    });
  }

  // ============ Render principal ============
  function render() {
    var cont = document.getElementById('finanzas-container');
    if (!cont) return;

    var tabsHTML = '<div class="subtabs">' +
      TABS.map(function (t) {
        return '<button class="subtab-btn' + (t.id === subTab ? ' is-active' : '') + '" data-subtab="' + t.id + '">' + t.label + '</button>';
      }).join('') +
    '</div>';

    var body;
    if (subTab === 'ventas') body = '<div id="ventas-container"></div>';
    else if (subTab === 'rentabilidad') body = renderRentabilidad();
    else if (subTab === 'ingresos') body = renderIngresos();
    else if (subTab === 'sueldos') body = renderSueldos();
    else body = renderCreditos();

    cont.innerHTML = tabsHTML + '<div id="finanzas-tab-body">' + body + '</div>';

    cont.querySelectorAll('[data-subtab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        subTab = btn.dataset.subtab;
        mostrarFormEmpleado = false; editandoEmpleadoId = null; pagoEmpleadoAbierto = null;
        mostrarFormCredito = false; editandoCreditoId = null; pagoCreditoAbierto = null;
        render();
      });
    });

    if (subTab === 'ventas') global.VistaVentas.render();
    else if (subTab === 'sueldos') wireSueldos(cont);
    else if (subTab === 'creditos') wireCreditos(cont);
  }

  global.VistaFinanzas = { init: render, render: render };
})(window);
