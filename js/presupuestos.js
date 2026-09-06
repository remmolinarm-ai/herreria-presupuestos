(function (global) {
  'use strict';

  // ============ Nuevo presupuesto ============
  var estado = null;

  function estadoInicial() {
    return { cliente: '', obra: '', categoriaId: '', notas: '', items: [] };
  }

  function normalizar(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function filtrarMateriales(materiales, query) {
    var q = normalizar(query).trim();
    if (!q) return [];
    return materiales.filter(function (m) { return normalizar(m.nombre).indexOf(q) !== -1; }).slice(0, 8);
  }

  function calcularTotales() {
    var totalMateriales = estado.items.reduce(function (a, i) { return a + i.subtotal; }, 0);
    var categoria = estado.categoriaId ? Store.categorias.get(estado.categoriaId) : null;
    var porcentaje = categoria ? categoria.porcentaje : 0;
    var manoObra = totalMateriales * porcentaje / 100;
    return { totalMateriales: totalMateriales, porcentaje: porcentaje, manoObra: manoObra, total: totalMateriales + manoObra, categoria: categoria };
  }

  function renderNuevo() {
    var cont = document.getElementById('nuevo-presupuesto');
    var categorias = Store.categorias.getAll().sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
    var materiales = Store.materiales.getAll().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });

    if (categorias.length === 0) {
      cont.innerHTML = '<p class="empty-state">Antes de presupuestar, cargá al menos un tipo de trabajo en la pestaña "Trabajos".</p>';
      return;
    }
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
        '<div class="field"><label for="np-categoria">Tipo de trabajo</label>' +
          '<select class="input" id="np-categoria">' +
            '<option value="">Elegir…</option>' +
            categorias.map(function (c) {
              return '<option value="' + c.id + '"' + (c.id === estado.categoriaId ? ' selected' : '') + '>' + Util.escapeHtml(c.nombre) + ' (' + c.porcentaje + '%)</option>';
            }).join('') +
          '</select></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="field">' +
          '<label for="np-material">Agregar material</label>' +
          '<div class="autocomplete">' +
            '<input class="input" id="np-material" placeholder="Escribí para buscar… (ej: caño)" autocomplete="off">' +
            '<div class="autocomplete-list" id="np-material-dropdown" hidden></div>' +
          '</div>' +
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
                  '<div class="line-item-meta">' + it.cantidad + ' ' + Util.escapeHtml(it.unidad) + ' × ' + BudgetPDF.money(it.precioUnitario) + '</div></div>' +
                  '<div class="line-item-total">' + BudgetPDF.money(it.subtotal) + '</div>' +
                  '<button class="line-item-remove" data-idx="' + idx + '" aria-label="Quitar">✕</button>' +
                '</div>';
              }).join('')
          ) +
        '</div>' +
      '</div>' +

      '<div class="totals-box">' +
        '<div class="totals-row"><span>Materiales</span><span>' + BudgetPDF.money(t.totalMateriales) + '</span></div>' +
        '<div class="totals-row"><span>Mano de obra (' + t.porcentaje + '%)</span><span>' + BudgetPDF.money(t.manoObra) + '</span></div>' +
        '<div class="totals-row total"><span>Total</span><span>' + BudgetPDF.money(t.total) + '</span></div>' +
      '</div>' +

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
    document.getElementById('np-notas').addEventListener('input', function (e) { estado.notas = e.target.value; });
    document.getElementById('np-categoria').addEventListener('change', function (e) {
      estado.categoriaId = e.target.value;
      renderNuevo();
    });

    // ---- Autocompletado de materiales ----
    var materialInput = document.getElementById('np-material');
    var materialDropdown = document.getElementById('np-material-dropdown');
    var materialSeleccionado = null;

    function elegirMaterial(m) {
      materialInput.value = m.nombre;
      materialSeleccionado = m;
      materialDropdown.hidden = true;
      document.getElementById('np-cantidad').focus();
    }

    function mostrarDropdown() {
      var coincidencias = filtrarMateriales(materiales, materialInput.value);
      if (coincidencias.length === 0) {
        materialDropdown.hidden = true;
        materialDropdown.innerHTML = '';
        return;
      }
      materialDropdown.innerHTML = coincidencias.map(function (m) {
        return '<button type="button" class="autocomplete-item">' +
          '<span class="autocomplete-item-nombre">' + Util.escapeHtml(m.nombre) + '</span>' +
          '<span class="autocomplete-item-precio">' + BudgetPDF.money(m.precio) + ' / ' + Util.escapeHtml(m.unidad) + '</span>' +
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

      var existente = estado.items.find(function (i) { return i.materialId === material.id; });
      if (existente) {
        existente.cantidad += cantidad;
        existente.subtotal = existente.cantidad * existente.precioUnitario;
      } else {
        estado.items.push({
          materialId: material.id,
          nombre: material.nombre,
          unidad: material.unidad,
          precioUnitario: material.precio,
          cantidad: cantidad,
          subtotal: material.precio * cantidad
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
      if (!estado.categoriaId) { Util.toast('Elegí el tipo de trabajo'); return; }
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
          categoriaId: estado.categoriaId,
          categoriaNombre: totales.categoria ? totales.categoria.nombre : '',
          porcentaje: totales.porcentaje,
          items: estado.items,
          totalMateriales: totales.totalMateriales,
          manoObra: totales.manoObra,
          total: totales.total,
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
        '<thead><tr><th>N°</th><th>Cliente</th><th class="hide-narrow">Tipo de trabajo</th><th class="hide-narrow">Fecha</th><th>Total</th><th></th></tr></thead>' +
        '<tbody>' +
        lista.map(function (p) {
          return '<tr data-id="' + p.id + '">' +
            '<td class="cell-title">' + p.numero + '</td>' +
            '<td class="cell-wrap">' + Util.escapeHtml(p.cliente || '—') + '</td>' +
            '<td class="hide-narrow">' + Util.escapeHtml(p.categoriaNombre || '—') + '</td>' +
            '<td class="cell-sub hide-narrow">' + Util.fechaCorta(p.fecha) + '</td>' +
            '<td class="cell-title">' + BudgetPDF.money(p.total) + '</td>' +
            '<td class="col-actions">' +
              '<button class="icon-btn" data-action="pdf" aria-label="Descargar PDF">📄</button>' +
              '<button class="icon-btn" data-action="borrar" aria-label="Eliminar">🗑️</button>' +
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
