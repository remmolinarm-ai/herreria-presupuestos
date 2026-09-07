(function (global) {
  'use strict';

  // ============ Nuevo presupuesto ============
  var estado = null;

  function estadoInicial() {
    var empresa = Store.empresa.get();
    return {
      cliente: '', obra: '', descripcionTrabajo: '',
      manoObraPorcentaje: Number(empresa.manoObraPorcentajeDefault) || 0,
      cifPorcentaje: Number(empresa.cifPorcentaje) || 0,
      gastosAdminPorcentaje: Number(empresa.gastosAdminPorcentaje) || 0,
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
   * acumulado hasta ese punto (costeo estándar de una metalmecánica):
   * Materiales + Mano de obra = Costo de producción
   *   + CIF = costo con indirectos de fabricación
   *     + Gastos de administración/comercialización = Costo total
   *       + Margen de utilidad = Precio de venta
   *         + IVA = Total
   * Los 5 porcentajes se cargan directo en este presupuesto (precargados
   * con los valores por defecto de Ajustes, pero editables acá).
   */
  function calcularTotales() {
    var totalMateriales = estado.items.reduce(function (a, i) { return a + i.subtotal; }, 0);
    var totalMaterialesUsd = estado.items.reduce(function (a, i) { return a + (i.subtotalUsd || 0); }, 0);
    var porcentaje = Number(estado.manoObraPorcentaje) || 0;
    var manoObra = totalMateriales * porcentaje / 100;
    var costoProduccion = totalMateriales + manoObra;

    var cifPorcentaje = Number(estado.cifPorcentaje) || 0;
    var gastosAdminPorcentaje = Number(estado.gastosAdminPorcentaje) || 0;
    var margenPorcentaje = Number(estado.margenPorcentaje) || 0;
    var ivaPorcentaje = Number(estado.ivaPorcentaje) || 0;

    var cif = costoProduccion * cifPorcentaje / 100;
    var costoConCif = costoProduccion + cif;

    var gastosAdmin = costoConCif * gastosAdminPorcentaje / 100;
    var costoTotal = costoConCif + gastosAdmin;

    var margen = costoTotal * margenPorcentaje / 100;
    var precioVenta = costoTotal + margen;

    var iva = precioVenta * ivaPorcentaje / 100;
    var total = precioVenta + iva;
    var cotizacion = Dolar.valorActual();
    var totalUsd = cotizacion > 0 ? total / cotizacion : 0;

    return {
      totalMateriales: totalMateriales, totalMaterialesUsd: totalMaterialesUsd,
      porcentaje: porcentaje, manoObra: manoObra,
      cifPorcentaje: cifPorcentaje, cif: cif,
      gastosAdminPorcentaje: gastosAdminPorcentaje, gastosAdmin: gastosAdmin,
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
    return (
      '<div class="totals-row"><span>Materiales</span><span>' + BudgetPDF.money(t.totalMateriales) + usdEquiv(t.totalMaterialesUsd) + '</span></div>' +
      '<div class="totals-row"><span>Mano de obra (' + t.porcentaje + '%)</span><span>' + BudgetPDF.money(t.manoObra) + '</span></div>' +
      (t.cifPorcentaje > 0 ? '<div class="totals-row"><span>Costos indirectos de fabricación (' + t.cifPorcentaje + '%)</span><span>' + BudgetPDF.money(t.cif) + '</span></div>' : '') +
      (t.gastosAdminPorcentaje > 0 ? '<div class="totals-row"><span>Gastos de administración y comercialización (' + t.gastosAdminPorcentaje + '%)</span><span>' + BudgetPDF.money(t.gastosAdmin) + '</span></div>' : '') +
      (t.margenPorcentaje > 0 ? '<div class="totals-row"><span>Margen de utilidad (' + t.margenPorcentaje + '%)</span><span>' + BudgetPDF.money(t.margen) + '</span></div>' : '') +
      (t.ivaPorcentaje > 0 ? '<div class="totals-row"><span>IVA (' + t.ivaPorcentaje + '%)</span><span>' + BudgetPDF.money(t.iva) + '</span></div>' : '') +
      '<div class="totals-row total"><span>Total</span><span>' + BudgetPDF.money(t.total) + usdEquiv(t.totalUsd, '0.6em') + '</span></div>'
    );
  }

  function actualizarTotales() {
    var box = document.getElementById('np-totals');
    if (box) box.innerHTML = totalsBoxHTML(calcularTotales());
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
        '<div class="field"><label for="np-obra">Obra / Dirección</label>' +
          '<input class="input" id="np-obra" placeholder="Opcional" value="' + Util.escapeHtml(estado.obra) + '"></div>' +
        '<div class="field"><label for="np-descripcion">Descripción del trabajo</label>' +
          '<input class="input" id="np-descripcion" placeholder="Ej: Portón corredizo 4x2m" value="' + Util.escapeHtml(estado.descripcionTrabajo) + '"></div>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.92rem;font-weight:700;margin-bottom:2px;">Estructura de costos</h2>' +
        '<p style="font-size:0.78rem;color:var(--steel-500);margin-bottom:10px;">Precargada con los valores por defecto de Ajustes — se puede cambiar solo para este presupuesto.</p>' +
        '<div class="field"><label for="np-mano-obra">Mano de obra (%)</label>' +
          '<input class="input" id="np-mano-obra" type="number" min="0" step="0.1" value="' + estado.manoObraPorcentaje + '"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="np-cif">Costos indirectos (CIF %)</label>' +
            '<input class="input" id="np-cif" type="number" min="0" step="0.1" value="' + estado.cifPorcentaje + '"></div>' +
          '<div class="field"><label for="np-gastos-admin">Gastos admin. (%)</label>' +
            '<input class="input" id="np-gastos-admin" type="number" min="0" step="0.1" value="' + estado.gastosAdminPorcentaje + '"></div>' +
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
    document.getElementById('np-obra').addEventListener('input', function (e) { estado.obra = e.target.value; });
    document.getElementById('np-descripcion').addEventListener('input', function (e) { estado.descripcionTrabajo = e.target.value; });
    document.getElementById('np-notas').addEventListener('input', function (e) { estado.notas = e.target.value; });

    [
      ['np-mano-obra', 'manoObraPorcentaje'],
      ['np-cif', 'cifPorcentaje'],
      ['np-gastos-admin', 'gastosAdminPorcentaje'],
      ['np-margen', 'margenPorcentaje'],
      ['np-iva', 'ivaPorcentaje']
    ].forEach(function (par) {
      document.getElementById(par[0]).addEventListener('input', function (e) {
        estado[par[1]] = parseFloat(e.target.value) || 0;
        actualizarTotales();
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
          precioUnitario: precioUnitarioArs,
          precioUnitarioUsd: precioUnitarioUsd,
          cantidad: cantidad,
          subtotal: precioUnitarioArs * cantidad,
          subtotalUsd: precioUnitarioUsd * cantidad
        });
      }
      renderNuevo();
    });

    cont.querySelectorAll('.line-item-remove').forEach(function (btn) {
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
          obra: estado.obra.trim(),
          categoriaNombre: estado.descripcionTrabajo.trim(),
          porcentaje: totales.porcentaje,
          items: estado.items,
          totalMateriales: totales.totalMateriales,
          totalMaterialesUsd: totales.totalMaterialesUsd,
          manoObra: totales.manoObra,
          cifPorcentaje: totales.cifPorcentaje,
          cif: totales.cif,
          gastosAdminPorcentaje: totales.gastosAdminPorcentaje,
          gastosAdmin: totales.gastosAdmin,
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
      if (estado.items.length > 0) return;
      var empresa = Store.empresa.get();
      estado.manoObraPorcentaje = Number(empresa.manoObraPorcentajeDefault) || 0;
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
        '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Trabajo</th><th class="hide-narrow">Fecha</th><th>Total</th><th></th></tr></thead>' +
        '<tbody>' +
        lista.map(function (p) {
          return '<tr data-id="' + p.id + '">' +
            '<td class="cell-title">' + p.numero + '</td>' +
            '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
            '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
            '<td class="cell-sub hide-narrow">' + Util.fechaCorta(p.fecha) + '</td>' +
            '<td class="cell-title">' + BudgetPDF.money(p.total) + '</td>' +
            '<td class="col-actions">' +
              '<button class="icon-btn" data-action="pdf" aria-label="Descargar PDF">' + Util.iconDoc() + '</button>' +
              '<button class="icon-btn" data-action="borrar" aria-label="Eliminar">' + Util.iconTrash() + '</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table></div>';

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
