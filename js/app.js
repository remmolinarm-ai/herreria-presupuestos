(function (global) {
  'use strict';

  var REFRESH = {
    materiales: function () { VistaMateriales.renderLista(); },
    categorias: function () { VistaCategorias.renderLista(); },
    nuevo: function () { VistaNuevo.render(); },
    historial: function () { VistaHistorial.renderLista(); },
    ajustes: function () { VistaAjustes.init(); }
  };

  function mostrarVista(nombre) {
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.dataset.view === nombre);
    });
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      var activo = btn.dataset.target === nombre;
      if (activo) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (REFRESH[nombre]) REFRESH[nombre]();
    window.scrollTo({ top: 0 });
  }

  function refrescarTodo() {
    VistaMateriales.renderLista();
    VistaCategorias.renderLista();
    VistaNuevo.init();
    VistaHistorial.renderLista();
    VistaAjustes.init();
  }

  function registrarServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('service-worker.js').catch(function (err) {
        console.warn('No se pudo registrar el service worker', err);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    Store.ensureSeed();

    VistaMateriales.init();
    VistaCategorias.init();
    VistaNuevo.init();
    VistaHistorial.init();
    VistaAjustes.init();
    Asistente.initUI();

    // Se suscribe a la API estable de eventos (no a Store.materiales
    // directamente, que puede reemplazarse por una versión Firestore al
    // iniciar sesión) para refrescar la pantalla ante cualquier cambio,
    // sea de este dispositivo o de otro sincronizado por la nube.
    Store.subscribe('materiales', function () { VistaMateriales.renderLista(); VistaNuevo.render(); });
    Store.subscribe('categorias', function () { VistaCategorias.renderLista(); VistaNuevo.render(); });
    Store.subscribe('presupuestos', function () { VistaHistorial.renderLista(); });
    Store.subscribe('empresa', function () { VistaAjustes.init(); });

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { mostrarVista(btn.dataset.target); });
    });

    mostrarVista('materiales');
    registrarServiceWorker();
    if (global.FirebaseSync) global.FirebaseSync.init();
  });

  global.App = { refrescarTodo: refrescarTodo, mostrarVista: mostrarVista };
})(window);
