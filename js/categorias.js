(function (global) {
  'use strict';

  var editandoId = null;

  function renderForm() {
    var container = document.getElementById('cat-form-container');
    if (editandoId === null) { container.innerHTML = ''; return; }

    var cat = editandoId ? Store.categorias.get(editandoId) : null;
    container.innerHTML =
      '<div class="form-panel">' +
        '<div class="form-panel-head"><h2>' + (cat ? 'Editar tipo de trabajo' : 'Nuevo tipo de trabajo') + '</h2></div>' +
        '<form id="cat-form">' +
          '<div class="field"><label for="cat-nombre">Nombre</label>' +
            '<input class="input" id="cat-nombre" required placeholder="Ej: Portones" value="' + Util.escapeHtml(cat ? cat.nombre : '') + '"></div>' +
          '<div class="field"><label for="cat-porcentaje">Mano de obra (% sobre materiales)</label>' +
            '<input class="input" id="cat-porcentaje" type="number" min="0" max="500" step="1" required value="' + (cat ? cat.porcentaje : '') + '"></div>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-outline" id="cat-cancelar">Cancelar</button>' +
            '<button type="submit" class="btn btn-primary">Guardar</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    document.getElementById('cat-cancelar').addEventListener('click', function () {
      editandoId = null;
      renderForm();
    });
    document.getElementById('cat-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nombre = document.getElementById('cat-nombre').value.trim();
      var porcentaje = parseFloat(document.getElementById('cat-porcentaje').value);
      if (!nombre || isNaN(porcentaje) || porcentaje < 0) {
        Util.toast('Completá el nombre y un porcentaje válido');
        return;
      }
      var item = cat ? Object.assign({}, cat) : { orden: Store.categorias.getAll().length };
      item.nombre = nombre;
      item.porcentaje = porcentaje;
      Store.categorias.save(item);
      Util.toast('Tipo de trabajo guardado');
      editandoId = null;
      renderForm();
      renderLista();
    });
  }

  function renderLista() {
    var cont = document.getElementById('cat-lista');
    var categorias = Store.categorias.getAll().sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });

    if (categorias.length === 0) {
      cont.innerHTML = '<p class="empty-state">No hay tipos de trabajo cargados.</p>';
      return;
    }

    cont.innerHTML = categorias.map(function (c) {
      return '<div class="list-row" data-id="' + c.id + '">' +
        '<div class="list-row-main">' +
          '<div class="list-row-title">' + Util.escapeHtml(c.nombre) + '</div>' +
          '<div class="list-row-sub"><span class="chip">' + c.porcentaje + '% mano de obra</span></div>' +
        '</div>' +
        '<div class="list-row-actions">' +
          '<button data-action="editar" aria-label="Editar">✏️</button>' +
          '<button data-action="borrar" aria-label="Eliminar">🗑️</button>' +
        '</div>' +
      '</div>';
    }).join('');

    cont.querySelectorAll('[data-action="editar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editandoId = btn.closest('.list-row').dataset.id;
        renderForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    cont.querySelectorAll('[data-action="borrar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('.list-row').dataset.id;
        var cat = Store.categorias.get(id);
        if (!cat) return;
        if (confirm('¿Eliminar el tipo de trabajo "' + cat.nombre + '"? Los presupuestos ya guardados no se modifican.')) {
          Store.categorias.remove(id);
          Util.toast('Tipo de trabajo eliminado');
          renderLista();
        }
      });
    });
  }

  function init() {
    editandoId = null;
    renderForm();
    renderLista();

    document.getElementById('cat-nuevo-btn').addEventListener('click', function () {
      editandoId = '';
      renderForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  global.VistaCategorias = { init: init, renderLista: renderLista };
})(window);
