(function (global) {
  'use strict';

  // ============ Nuevo presupuesto ============
  var estado = null;

  var ROLES_MANO_OBRA = ['Soldador', 'Armador/Ajustador', 'Operario de corte', 'Operario de plegado/rolado', 'Pintor industrial', 'Montador'];

  function estadoInicial() {
    var empresa = Store.empresa.get();
    return {
      cliente: '', telefono: '', email: '', obra: '', descripcionTrabajo: '',
      manoObraItems: [],
      costosDirectosProyectoPorcentaje: Number(empresa.costosDirectosProyectoPorcentajeDefault) || 0,
      ingenieriaDisenoPorcentaje: Number(empresa.ingenieriaDisenoPorcentajeDefault) || 0,
      cifPorcentaje: Number(empresa.cifPorcentaje) || 0,
      gastosAdminPorcentaje: Number(empresa.gastosAdminPorcentaje) || 0,
      gastosComerciales: 0,
      gastosFinancieros: 0,
      margenPorcentaje: Number(empresa.margenPorcentaje) || 0,
      ivaPorcentaje: Number(empresa.ivaPorcentaje) || 0,
      notas: '', items: []
    };
  }

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }


  function filtrarMateriales(materiales, query) {
    var q = normalizar(query).trim();
    if (!q) return [];
    return materiales.filter(function (m) { return normalizar(m.nombre).indexOf(q) !== -1; }).slice(0, 8);
  }

  /**
   * Estructura de costos por capas, cada una calculada sobre el subtotal
   * acumulado hasta ese punto (costeo de una metalmecánica estructural):
   * Materia prima directa + Mano de obra directa (itemizada por rol) = Costo directo base
   *   + Costos directos de proyecto (%) + Ingeniería y diseño (%) = Costo directo total
   *     + CIF (%) = costo con indirectos de fabricación
   *       + Gastos de administración (%) = costo con admin.
   *         + Gastos comerciales ($) + Gastos financieros ($) = Costo total
   *           + Margen de utilidad (%) = Precio de venta
   *             + IVA (%) = Total
   * Los porcentajes se cargan directo en este presupuesto (precargados con
   * los valores por defecto de Ajustes cuando existen, pero editables acá);
   * gastos comerciales/financieros son montos que se cargan a mano porque
   * varían mucho de una cotización a otra (comisión de venta, viáticos,
   * financiamiento al cliente, etc.).
   */
  function calcularTotales() {
    var totalMateriales = estado.items.reduce(function (a, i) { return a + i.subtotal; }, 0);
    var totalMaterialesUsd = estado.items.reduce(function (a, i) { return a + (i.subtotalUsd || 0); }, 0);
    var manoObra = estado.manoObraItems.reduce(function (a, i) { return a + i.subtotal; }, 0);
    var costoDirectoBase = totalMateriales + manoObra;

    var costosDirectosProyectoPorcentaje = Number(estado.costosDirectosProyectoPorcentaje) || 0;
    var costosDirectosProyecto = costoDirectoBase * costosDirectosProyectoPorcentaje / 100;

    var ingenieriaDisenoPorcentaje = Number(estado.ingenieriaDisenoPorcentaje) || 0;
    var ingenieriaDiseno = costoDirectoBase * ingenieriaDisenoPorcentaje / 100;

    var costoDirectoTotal = costoDirectoBase + costosDirectosProyecto + ingenieriaDiseno;

    var cifPorcentaje = Number(estado.cifPorcentaje) || 0;
    var cif = costoDirectoTotal * cifPorcentaje / 100;
    var costoConCif = costoDirectoTotal + cif;

    var gastosAdminPorcentaje = Number(estado.gastosAdminPorcentaje) || 0;
    var gastosAdmin = costoConCif * gastosAdminPorcentaje / 100;
    var costoConAdmin = costoConCif + gastosAdmin;

    var gastosComerciales = Number(estado.gastosComerciales) || 0;
    var gastosFinancieros = Number(estado.gastosFinancieros) || 0;
    var costoTotal = costoConAdmin + gastosComerciales + gastosFinancieros;

    var margenPorcentaje = Number(estado.margenPorcentaje) || 0;
    var margen = costoTotal * margenPorcentaje / 100;
    var precioVenta = costoTotal + margen;

    var ivaPorcentaje = Number(estado.ivaPorcentaje) || 0;
    var iva = precioVenta * ivaPorcentaje / 100;
    var total = precioVenta + iva;
    var cotizacion = Dolar.valorActual();
    var totalUsd = cotizacion > 0 ? total / cotizacion : 0;

    return {
      totalMateriales: totalMateriales, totalMaterialesUsd: totalMaterialesUsd,
      manoObraItems: estado.manoObraItems, manoObra: manoObra,
      costosDirectosProyectoPorcentaje: costosDirectosProyectoPorcentaje, costosDirectosProyecto: costosDirectosProyecto,
      ingenieriaDisenoPorcentaje: ingenieriaDisenoPorcentaje, ingenieriaDiseno: ingenieriaDiseno,
      cifPorcentaje: cifPorcentaje, cif: cif,
      gastosAdminPorcentaje: gastosAdminPorcentaje, gastosAdmin: gastosAdmin,
      gastosComerciales: gastosComerciales, gastosFinancieros: gastosFinancieros,
      margenPorcentaje: margenPorcentaje, margen: margen,
      ivaPorcentaje: ivaPorcentaje, iva: iva,
      total: total, totalUsd: totalUsd, cotizacionDolar: cotizacion
    };
  }

  function usdEquiv(usd, size) {
    if (!(Dolar.valorActual() > 0)) return '';
    return ' <span style="opacity:.6;font-size:' + (size || '0.85em') + ';">(' + Dolar.formatearUsd(usd) + ')</span>';
  }

  function precioOpcionTxt(op) {
    if (Dolar.valorActual() > 0) {
      return BudgetPDF.money(Dolar.aPesos(op.precioUsd)) + ' (≈ ' + Dolar.formatearUsd(op.precioUsd) + ')';
    }
    return Dolar.formatearUsd(op.precioUsd);
  }

  function totalsBoxHTML(t) {
    var manoObraLabel = 'Mano de obra directa' + (t.manoObraItems && t.manoObraItems.length ? ' (' + t.manoObraItems.length + (t.manoObraItems.length === 1 ? ' ítem' : ' ítems') + ')' : '');
    return (
      '<div class="totals-row"><span>Materia prima directa</span><span>' + BudgetPDF.money(t.totalMateriales) + usdEquiv(t.totalMaterialesUsd) + '</span></div>' +
      '<div class="totals-row"><span>' + manoObraLabel + '</span><span>' + BudgetPDF.money(t.manoObra) + '</span></div>' +
      (t.costosDirectosProyectoPorcentaje > 0 ? '<div class="totals-row"><span>Costos directos de proyecto (' + t.costosDirectosProyectoPorcentaje + '%)</span><span>' + BudgetPDF.money(t.costosDirectosProyecto) + '</span></div>' : '') +
      (t.ingenieriaDisenoPorcentaje > 0 ? '<div class="totals-row"><span>Ingeniería y diseño (' + t.ingenieriaDisenoPorcentaje + '%)</span><span>' + BudgetPDF.money(t.ingenieriaDiseno) + '</span></div>' : '') +
      (t.cifPorcentaje > 0 ? '<div class="totals-row"><span>Costos indirectos de fabricación (' + t.cifPorcentaje + '%)</span><span>' + BudgetPDF.money(t.cif) + '</span></div>' : '') +
      (t.gastosAdminPorcentaje > 0 ? '<div class="totals-row"><span>Gastos de administración (' + t.gastosAdminPorcentaje + '%)</span><span>' + BudgetPDF.money(t.gastosAdmin) + '</span></div>' : '') +
      (t.gastosComerciales > 0 ? '<div class="totals-row"><span>Gastos comerciales</span><span>' + BudgetPDF.money(t.gastosComerciales) + '</span></div>' : '') +
      (t.gastosFinancieros > 0 ? '<div class="totals-row"><span>Gastos financieros</span><span>' + BudgetPDF.money(t.gastosFinancieros) + '</span></div>' : '') +
      (t.margenPorcentaje > 0 ? '<div class="totals-row"><span>Margen de utilidad (' + t.margenPorcentaje + '%)</span><span>' + BudgetPDF.money(t.margen) + '</span></div>' : '') +
      (t.ivaPorcentaje > 0 ? '<div class="totals-row"><span>IVA (' + t.ivaPorcentaje + '%)</span><span>' + BudgetPDF.money(t.iva) + '</span></div>' : '') +
      '<div class="totals-row total"><span>Total</span><span>' + BudgetPDF.money(t.total) + usdEquiv(t.totalUsd, '0.6em') + '</span></div>'
    );
  }

  function actualizarTotales() {
    var box = document.getElementById('np-totals');
    if (box) box.innerHTML = totalsBoxHTML(calcularTotales());
  }

  function manoObraItemsHTML() {
    if (estado.manoObraItems.length === 0) return '<p class="empty-state">Todavía no agregaste mano de obra.</p>';
    return estado.manoObraItems.map(function (it, idx) {
      return '<div class="line-item" data-idx="' + idx + '">' +
        '<div><div class="line-item-name">' + Util.escapeHtml(it.rol) + '</div>' +
        '<div class="line-item-meta">' + it.horas + ' h × ' + BudgetPDF.money(it.tarifaHora) + '/h</div></div>' +
        '<div class="line-item-total">' + BudgetPDF.money(it.subtotal) + '</div>' +
        '<button class="line-item-remove" data-idx="' + idx + '" aria-label="Quitar">' + Util.iconClose() + '</button>' +
      '</div>';
    }).join('');
  }

  function renderNuevo() {
    var cont = document.getElementById('nuevo-presupuesto');
    var materiales = Store.materiales.getAll().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });

    if (materiales.length === 0) {
      cont.innerHTML = '<p class="empty-state">Antes de presupuestar, cargá materiales con su precio en la pestaña "Materiales".</p>';
      return;
    }

    var t = calcularTotales();

    cont.innerHTML =
      '<div class="card">' +
        '<div class="field"><label for="np-cliente">Cliente</label>' +
          '<input class="input" id="np-cliente" placeholder="Nombre del cliente" value="' + Util.escapeHtml(estado.cliente) + '"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-telefono">WhatsApp del cliente</label>' +
            '<input class="input" id="np-telefono" type="tel" placeholder="Opcional, ej: 54911…" value="' + Util.escapeHtml(estado.telefono) + '"></div>' +
          '<div class="field"><label for="np-email">Email del cliente</label>' +
            '<input class="input" id="np-email" type="email" placeholder="Opcional" value="' + Util.escapeHtml(estado.email) + '"></div>' +
        '</div>' +
        '<div class="field"><label for="np-obra">Obra / Dirección</label>' +
          '<input class="input" id="np-obra" placeholder="Opcional" value="' + Util.escapeHtml(estado.obra) + '"></div>' +
        '<div class="field"><label for="np-descripcion">Descripción del trabajo</label>' +
          '<input class="input" id="np-descripcion" placeholder="Ej: Portón corredizo 4x2m" value="' + Util.escapeHtml(estado.descripcionTrabajo) + '"></div>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.92rem;font-weight:700;margin-bottom:2px;">Estructura de costos</h2>' +
        '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:10px;">Los porcentajes vienen precargados con los valores por defecto de Ajustes cuando existen — se pueden cambiar solo para este presupuesto.</p>' +

        '<h3 style="font-size:0.85rem;font-weight:700;margin:4px 0 8px;">Mano de obra directa</h3>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-labor-rol">Rol</label>' +
            '<input class="input" id="np-labor-rol" list="np-labor-roles" placeholder="Ej: Soldador"></div>' +
          '<div class="field"><label for="np-labor-horas">Horas</label>' +
            '<input class="input" id="np-labor-horas" type="number" min="0" step="0.5" value="1"></div>' +
          '<div class="field"><label for="np-labor-tarifa">Tarifa/hora ($)</label>' +
            '<input class="input" id="np-labor-tarifa" type="number" min="0" step="0.01"></div>' +
        '</div>' +
        '<datalist id="np-labor-roles">' + ROLES_MANO_OBRA.map(function (r) { return '<option value="' + r + '">'; }).join('') + '</datalist>' +
        '<button type="button" class="btn btn-outline btn-block" id="np-labor-agregar-btn" style="margin-bottom:10px;">+ Agregar mano de obra</button>' +
        '<div class="line-items" id="np-labor-items">' + manoObraItemsHTML() + '</div>' +

        '<h3 style="font-size:0.85rem;font-weight:700;margin:14px 0 8px;">Costos directos e indirectos</h3>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-cdp">Costos directos de proyecto (%)</label>' +
            '<input class="input" id="np-cdp" type="number" min="0" step="0.1" value="' + estado.costosDirectosProyectoPorcentaje + '"></div>' +
          '<div class="field"><label for="np-ing">Ingeniería y diseño (%)</label>' +
            '<input class="input" id="np-ing" type="number" min="0" step="0.1" value="' + estado.ingenieriaDisenoPorcentaje + '"></div>' +
        '</div>' +
        '<p style="font-size:0.74rem;color:var(--steel-500);margin:-6px 0 10px;">Costos directos de proyecto: fletes, subcontratos (galvanizado, arenado), alquiler de equipos.</p>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-cif">Costos indirectos de fabricación (CIF %)</label>' +
            '<input class="input" id="np-cif" type="number" min="0" step="0.1" value="' + estado.cifPorcentaje + '"></div>' +
          '<div class="field"><label for="np-gastos-admin">Gastos de administración (%)</label>' +
            '<input class="input" id="np-gastos-admin" type="number" min="0" step="0.1" value="' + estado.gastosAdminPorcentaje + '"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-gastos-com">Gastos comerciales ($)</label>' +
            '<input class="input" id="np-gastos-com" type="number" min="0" step="0.01" value="' + estado.gastosComerciales + '"></div>' +
          '<div class="field"><label for="np-gastos-fin">Gastos financieros ($)</label>' +
            '<input class="input" id="np-gastos-fin" type="number" min="0" step="0.01" value="' + estado.gastosFinancieros + '"></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-margen">Margen de utilidad (%)</label>' +
            '<input class="input" id="np-margen" type="number" min="0" step="0.1" value="' + estado.margenPorcentaje + '"></div>' +
          '<div class="field"><label for="np-iva">IVA (%)</label>' +
            '<input class="input" id="np-iva" type="number" min="0" step="0.1" value="' + estado.ivaPorcentaje + '"></div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="field">' +
          '<label for="np-material">Agregar material</label>' +
          '<div class="autocomplete">' +
            '<input class="input" id="np-material" placeholder="Escribí para buscar… (ej: caño)" autocomplete="off">' +
            '<div class="autocomplete-list" id="np-material-dropdown" hidden></div>' +
          '</div>' +
        '</div>' +
        '<div class="field" id="np-basis-container" hidden>' +
          '<label for="np-basis">Vender por</label>' +
          '<select class="input" id="np-basis"></select>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-cantidad">Cantidad</label>' +
            '<input class="input" id="np-cantidad" type="number" min="0" step="0.01" value="1"></div>' +
          '<div class="field" style="justify-content:flex-end;">' +
            '<button type="button" class="btn btn-primary btn-block" id="np-agregar-btn">+ Agregar</button></div>' +
        '</div>' +

        '<div class="line-items" id="np-items">' +
          (estado.items.length === 0
            ? '<p class="empty-state">Todavía no agregaste materiales.</p>'
            : estado.items.map(function (it, idx) {
                return '<div class="line-item" data-idx="' + idx + '">' +
                  '<div><div class="line-item-name">' + Util.escapeHtml(it.nombre) + '</div>' +
                  '<div class="line-item-meta">' + it.cantidad + ' ' + Util.escapeHtml(it.unidad) + ' × ' + BudgetPDF.money(it.precioUnitario) + usdEquiv(it.precioUnitarioUsd, '0.9em') + '</div></div>' +
                  '<div class="line-item-total">' + BudgetPDF.money(it.subtotal) + '</div>' +
                  '<button class="line-item-remove" data-idx="' + idx + '" aria-label="Quitar">' + Util.iconClose() + '</button>' +
                '</div>';
              }).join('')
          ) +
        '</div>' +
      '</div>' +

      '<div class="totals-box" id="np-totals">' + totalsBoxHTML(t) + '</div>' +

      '<div class="card">' +
        '<div class="field"><label for="np-notas">Notas (opcional)</label>' +
          '<textarea class="input" id="np-notas" rows="3" placeholder="Ej: incluye pintura antióxido">' + Util.escapeHtml(estado.notas) + '</textarea></div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn btn-outline" id="np-limpiar">Limpiar</button>' +
          '<button type="button" class="btn btn-primary" id="np-guardar">Guardar y generar PDF</button>' +
        '</div>' +
      '</div>';

    document.getElementById('np-cliente').addEventListener('input', function (e) { estado.cliente = e.target.value; });
    document.getElementById('np-telefono').addEventListener('input', function (e) { estado.telefono = e.target.value; });
    document.getElementById('np-email').addEventListener('input', function (e) { estado.email = e.target.value; });
    document.getElementById('np-obra').addEventListener('input', function (e) { estado.obra = e.target.value; });
    document.getElementById('np-descripcion').addEventListener('input', function (e) { estado.descripcionTrabajo = e.target.value; });
    document.getElementById('np-notas').addEventListener('input', function (e) { estado.notas = e.target.value; });

    [
      ['np-cdp', 'costosDirectosProyectoPorcentaje'],
      ['np-ing', 'ingenieriaDisenoPorcentaje'],
      ['np-cif', 'cifPorcentaje'],
      ['np-gastos-admin', 'gastosAdminPorcentaje'],
      ['np-gastos-com', 'gastosComerciales'],
      ['np-gastos-fin', 'gastosFinancieros'],
      ['np-margen', 'margenPorcentaje'],
      ['np-iva', 'ivaPorcentaje']
    ].forEach(function (par) {
      document.getElementById(par[0]).addEventListener('input', function (e) {
        estado[par[1]] = parseFloat(e.target.value) || 0;
        actualizarTotales();
      });
    });

    document.getElementById('np-labor-agregar-btn').addEventListener('click', function () {
      var rol = document.getElementById('np-labor-rol').value.trim();
      var horas = parseFloat(document.getElementById('np-labor-horas').value);
      var tarifaHora = parseFloat(document.getElementById('np-labor-tarifa').value);
      if (!rol) { Util.toast('Ingresá el rol'); return; }
      if (isNaN(horas) || horas <= 0) { Util.toast('Ingresá las horas trabajadas'); return; }
      if (isNaN(tarifaHora) || tarifaHora <= 0) { Util.toast('Ingresá la tarifa por hora'); return; }
      estado.manoObraItems.push({ rol: rol, horas: horas, tarifaHora: tarifaHora, subtotal: horas * tarifaHora });
      renderNuevo();
    });

    document.getElementById('np-labor-items').querySelectorAll('.line-item-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        estado.manoObraItems.splice(parseInt(btn.dataset.idx, 10), 1);
        renderNuevo();
      });
    });

    // ---- Autocompletado de materiales ----
    var materialInput = document.getElementById('np-material');
    var materialDropdown = document.getElementById('np-material-dropdown');
    var basisContainer = document.getElementById('np-basis-container');
    var basisSelect = document.getElementById('np-basis');
    var materialSeleccionado = null;
    var opcionesActuales = [];

    function elegirMaterial(m) {
      materialInput.value = m.nombre;
      materialSeleccionado = m;
      materialDropdown.hidden = true;
      opcionesActuales = Precios.opciones(m);
      if (opcionesActuales.length > 1) {
        basisSelect.innerHTML = opcionesActuales.map(function (op, i) {
          return '<option value="' + i + '">' + Util.escapeHtml(op.label) + ' — ' + precioOpcionTxt(op) + '</option>';
        }).join('');
        basisContainer.hidden = false;
      } else {
        basisContainer.hidden = true;
      }
      document.getElementById('np-cantidad').focus();
    }

    function opcionSeleccionada() {
      if (opcionesActuales.length === 0) return null;
      if (!basisContainer.hidden) return opcionesActuales[parseInt(basisSelect.value, 10)] || opcionesActuales[0];
      return opcionesActuales[0];
    }

    function mostrarDropdown() {
      var coincidencias = filtrarMateriales(materiales, materialInput.value);
      if (coincidencias.length === 0) {
        materialDropdown.hidden = true;
        materialDropdown.innerHTML = '';
        return;
      }
      materialDropdown.innerHTML = coincidencias.map(function (m) {
        var op = Precios.opciones(m)[0];
        var precioTxt = op ? (precioOpcionTxt(op) + ' / ' + op.unidadLabel) : 'Sin precio';
        return '<button type="button" class="autocomplete-item">' +
          '<span class="autocomplete-item-nombre">' + Util.escapeHtml(m.nombre) + '</span>' +
          '<span class="autocomplete-item-precio">' + precioTxt + '</span>' +
        '</button>';
      }).join('');
      materialDropdown.hidden = false;
      materialDropdown.querySelectorAll('.autocomplete-item').forEach(function (btn, i) {
        // mousedown (no click) para que se dispare antes del blur del input.
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          elegirMaterial(coincidencias[i]);
        });
      });
    }

    materialInput.addEventListener('input', function () {
      materialSeleccionado = null;
      opcionesActuales = [];
      basisContainer.hidden = true;
      mostrarDropdown();
    });
    materialInput.addEventListener('focus', mostrarDropdown);
    materialInput.addEventListener('blur', function () {
      setTimeout(function () { materialDropdown.hidden = true; }, 120);
    });
    materialInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var coincidencias = filtrarMateriales(materiales, materialInput.value);
        if (coincidencias.length > 0) elegirMaterial(coincidencias[0]);
      } else if (e.key === 'Escape') {
        materialDropdown.hidden = true;
      }
    });

    document.getElementById('np-agregar-btn').addEventListener('click', function () {
      var nombre = materialInput.value.trim();
      var cantidad = parseFloat(document.getElementById('np-cantidad').value);
      if (!nombre) { Util.toast('Elegí un material de la lista'); return; }
      if (isNaN(cantidad) || cantidad <= 0) { Util.toast('Ingresá una cantidad válida'); return; }
      var material = (materialSeleccionado && materialSeleccionado.nombre === nombre)
        ? materialSeleccionado
        : materiales.find(function (m) { return m.nombre === nombre; });
      if (!material) { Util.toast('Ese material no está en la lista de precios'); return; }

      var opciones = (materialSeleccionado === material && opcionesActuales.length) ? opcionesActuales : Precios.opciones(material);
      var opcion = (materialSeleccionado === material) ? opcionSeleccionada() : opciones[0];
      if (!opcion) { Util.toast('Ese material no tiene un precio cargado'); return; }

      var precioUnitarioUsd = opcion.precioUsd;
      var precioUnitarioArs = Dolar.aPesos(precioUnitarioUsd);
      var unidadLinea = opcion.unidadLabel;

      var existente = estado.items.find(function (i) { return i.materialId === material.id && i.unidad === unidadLinea; });
      if (existente) {
        existente.cantidad += cantidad;
        existente.subtotal = existente.cantidad * existente.precioUnitario;
        existente.subtotalUsd = existente.cantidad * existente.precioUnitarioUsd;
      } else {
        estado.items.push({
          materialId: material.id,
          nombre: material.nombre,
          unidad: unidadLinea,
          basis: opcion.basis,
          precioUnitario: precioUnitarioArs,
          precioUnitarioUsd: precioUnitarioUsd,
          cantidad: cantidad,
          subtotal: precioUnitarioArs * cantidad,
          subtotalUsd: precioUnitarioUsd * cantidad
        });
      }
      renderNuevo();
    });

    document.getElementById('np-items').querySelectorAll('.line-item-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        estado.items.splice(parseInt(btn.dataset.idx, 10), 1);
        renderNuevo();
      });
    });

    document.getElementById('np-limpiar').addEventListener('click', function () {
      if (estado.items.length === 0 && !estado.cliente && !estado.obra) return;
      if (confirm('¿Limpiar el presupuesto en curso?')) {
        estado = estadoInicial();
        renderNuevo();
      }
    });

    document.getElementById('np-guardar').addEventListener('click', function () {
      if (estado.items.length === 0) { Util.toast('Agregá al menos un material'); return; }

      var totales = calcularTotales();
      var empresa = Store.empresa.get();
      var guardarBtn = document.getElementById('np-guardar');
      guardarBtn.disabled = true;

      // tomarNumero() es síncrono en modo local y una transacción (Promise)
      // en modo Firestore; Promise.resolve cubre ambos casos por igual.
      Promise.resolve(Store.empresa.tomarNumero()).then(function (numero) {
        var presupuesto = {
          numero: numero,
          fecha: Store.nowISO(),
          cliente: estado.cliente.trim(),
          telefono: estado.telefono.trim(),
          email: estado.email.trim(),
          obra: estado.obra.trim(),
          categoriaNombre: estado.descripcionTrabajo.trim(),
          vendido: false,
          fechaVenta: null,
          items: estado.items,
          totalMateriales: totales.totalMateriales,
          totalMaterialesUsd: totales.totalMaterialesUsd,
          manoObraItems: totales.manoObraItems,
          manoObra: totales.manoObra,
          costosDirectosProyectoPorcentaje: totales.costosDirectosProyectoPorcentaje,
          costosDirectosProyecto: totales.costosDirectosProyecto,
          ingenieriaDisenoPorcentaje: totales.ingenieriaDisenoPorcentaje,
          ingenieriaDiseno: totales.ingenieriaDiseno,
          cifPorcentaje: totales.cifPorcentaje,
          cif: totales.cif,
          gastosAdminPorcentaje: totales.gastosAdminPorcentaje,
          gastosAdmin: totales.gastosAdmin,
          gastosComerciales: totales.gastosComerciales,
          gastosFinancieros: totales.gastosFinancieros,
          margenPorcentaje: totales.margenPorcentaje,
          margen: totales.margen,
          ivaPorcentaje: totales.ivaPorcentaje,
          iva: totales.iva,
          total: totales.total,
          totalUsd: totales.totalUsd,
          cotizacionDolar: totales.cotizacionDolar,
          notas: estado.notas.trim(),
          condiciones: empresa.condiciones
        };
        Store.presupuestos.save(presupuesto);
        BudgetPDF.descargar(presupuesto, empresa);
        Util.toast('Presupuesto N° ' + presupuesto.numero + ' guardado');
        estado = estadoInicial();
        renderNuevo();
        if (global.VistaHistorial) global.VistaHistorial.renderLista();
      }).catch(function (err) {
        console.error(err);
        Util.toast('No se pudo guardar el presupuesto, revisá la conexión');
        guardarBtn.disabled = false;
      });
    });
  }

  function initNuevo() {
    estado = estadoInicial();
    renderNuevo();

    // Si cambian los valores por defecto en Ajustes mientras el presupuesto
    // en curso todavía está vacío (no se empezó a cargar nada), lo
    // refresca — así no hace falta recargar la página para verlos.
    Store.subscribe('empresa', function () {
      if (estado.items.length > 0 || estado.manoObraItems.length > 0) return;
      var empresa = Store.empresa.get();
      estado.costosDirectosProyectoPorcentaje = Number(empresa.costosDirectosProyectoPorcentajeDefault) || 0;
      estado.ingenieriaDisenoPorcentaje = Number(empresa.ingenieriaDisenoPorcentajeDefault) || 0;
      estado.cifPorcentaje = Number(empresa.cifPorcentaje) || 0;
      estado.gastosAdminPorcentaje = Number(empresa.gastosAdminPorcentaje) || 0;
      estado.margenPorcentaje = Number(empresa.margenPorcentaje) || 0;
      estado.ivaPorcentaje = Number(empresa.ivaPorcentaje) || 0;
      renderNuevo();
    });
  }

  // ============ Historial ============
  function renderHistorial() {
    var cont = document.getElementById('historial-lista');
    var lista = Store.presupuestos.getAll().sort(function (a, b) { return (b.numero || 0) - (a.numero || 0); });

    if (lista.length === 0) {
      cont.innerHTML = '<p class="empty-state">Todavía no guardaste ningún presupuesto.</p>';
      return;
    }

    cont.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th class="hide-narrow">Fecha</th><th>Total</th><th class="hide-narrow">Vendido</th><th></th></tr></thead>' +
        '<tbody>' +
        lista.map(function (p) {
          return '<tr data-id="' + p.id + '">' +
            '<td class="cell-title">' + p.numero + '</td>' +
            '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
            '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
            '<td class="cell-sub hide-narrow">' + Util.fechaCorta(p.fecha) + '</td>' +
            '<td class="cell-title">' + BudgetPDF.money(p.total) + '</td>' +
            '<td class="hide-narrow">' + (p.vendido ? '<span style="color:var(--success);">' + Util.iconCheck() + '</span>' : '<span class="cell-sub">—</span>') + '</td>' +
            '<td class="col-actions">' +
              '<button class="icon-btn" data-action="whatsapp" aria-label="Enviar por WhatsApp">' + Util.iconWhatsapp() + '</button>' +
              '<button class="icon-btn" data-action="email" aria-label="Enviar por email">' + Util.iconMail() + '</button>' +
              '<button class="icon-btn" data-action="pdf" aria-label="Descargar PDF">' + Util.iconDoc() + '</button>' +
              '<button class="icon-btn" data-action="borrar" aria-label="Eliminar">' + Util.iconTrash() + '</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table></div>';

    cont.querySelectorAll('[data-action="whatsapp"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        window.open(BudgetPDF.linkWhatsapp(p, Store.empresa.get()), '_blank');
      });
    });
    cont.querySelectorAll('[data-action="email"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        window.location.href = BudgetPDF.linkEmail(p, Store.empresa.get());
      });
    });
    cont.querySelectorAll('[data-action="pdf"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        BudgetPDF.descargar(p, Store.empresa.get());
      });
    });
    cont.querySelectorAll('[data-action="borrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('tr').dataset.id;
        var p = Store.presupuestos.get(id);
        if (!p) return;
        if (confirm('¿Eliminar el presupuesto N° ' + p.numero + '?')) {
          Store.presupuestos.remove(id);
          Util.toast('Presupuesto eliminado');
          renderHistorial();
        }
      });
    });
  }

  global.VistaNuevo = { init: initNuevo, render: renderNuevo };
  global.VistaHistorial = { init: renderHistorial, renderLista: renderHistorial };
})(window);
