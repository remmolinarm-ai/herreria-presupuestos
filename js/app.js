(function (global) {
  'use strict';

  var REFRESH = {
    materiales: function () { VistaMateriales.renderLista(); },
    nuevo: function () { VistaNuevo.render(); },
    historial: function () { VistaHistorial.renderLista(); },
    ajustes: function () { VistaAjustes.init(); }
  };

  function cerrarNav() {
    var nav = document.getElementById('side-nav');
    var backdrop = document.getElementById('nav-backdrop');
    var toggle = document.getElementById('nav-toggle');
    if (nav) nav.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function mostrarVista(nombre) {
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('is-active', v.dataset.view === nombre);
    });
    document.querySelectorAll('.nav-link').forEach(function (btn) {
      var activo = btn.dataset.target === nombre;
      if (activo) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (REFRESH[nombre]) REFRESH[nombre]();
    cerrarNav();
    window.scrollTo({ top: 0 });
  }

  function refrescarTodo() {
    VistaMateriales.renderLista();
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
    VistaMateriales.init();
    VistaNuevo.init();
    VistaHistorial.init();
    VistaAjustes.init();
    Asistente.initUI();

    // Se suscribe a la API estable de eventos (no a Store.materiales
    // directamente, que puede reemplazarse por una versión Firestore al
    // iniciar sesión) para refrescar la pantalla ante cualquier cambio,
    // sea de este dispositivo o de otro sincronizado por la nube.
    Store.subscribe('materiales', function () { VistaMateriales.renderLista(); VistaNuevo.render(); });
    Store.subscribe('presupuestos', function () { VistaHistorial.renderLista(); });
    Store.subscribe('empresa', function () { VistaAjustes.init(); });

    document.querySelectorAll('.nav-link').forEach(function (btn) {
      btn.addEventListener('click', function () { mostrarVista(btn.dataset.target); });
    });

    var navToggle = document.getElementById('nav-toggle');
    var navBackdrop = document.getElementById('nav-backdrop');
    if (navToggle) {
      navToggle.addEventListener('click', function () {
        var nav = document.getElementById('side-nav');
        var abierto = nav.classList.toggle('is-open');
        navBackdrop.classList.toggle('is-open', abierto);
        navToggle.setAttribute('aria-expanded', String(abierto));
      });
    }
    if (navBackdrop) navBackdrop.addEventListener('click', cerrarNav);

    mostrarVista('materiales');
    registrarServiceWorker();
    if (global.FirebaseSync) global.FirebaseSync.init();
  });

  global.App = { refrescarTodo: refrescarTodo, mostrarVista: mostrarVista };
})(window);
