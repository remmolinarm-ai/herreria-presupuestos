/**
 * Capa de datos. Hoy persiste en localStorage; mañana se puede reemplazar
 * la implementación interna de cada colección por Firestore sin tocar las
 * pantallas, que solo conocen esta API (getAll/get/save/remove/subscribe).
 */
(function (global) {
  'use strict';

  var PREFIX = 'presupuestador:v1:';
  var listeners = {};

  function emit(collection) {
    (listeners[collection] || []).forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  function subscribe(collection, fn) {
    listeners[collection] = listeners[collection] || [];
    listeners[collection].push(fn);
    return function unsubscribe() {
      listeners[collection] = listeners[collection].filter(function (f) { return f !== fn; });
    };
  }

  function readRaw(key, fallback) {
    try {
      var raw = global.localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('No se pudo leer ' + key, e);
      return fallback;
    }
  }

  function writeRaw(key, value) {
    global.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowISO() { return new Date().toISOString(); }

  function makeCollection(name) {
    return {
      getAll: function () { return readRaw(name, []); },
      get: function (id) { return readRaw(name, []).find(function (x) { return x.id === id; }) || null; },
      save: function (item) {
        var list = readRaw(name, []);
        if (!item.id) item.id = uid();
        var idx = list.findIndex(function (x) { return x.id === item.id; });
        if (idx >= 0) list[idx] = item; else list.push(item);
        writeRaw(name, list);
        emit(name);
        return item;
      },
      remove: function (id) {
        var list = readRaw(name, []).filter(function (x) { return x.id !== id; });
        writeRaw(name, list);
        emit(name);
      },
      replaceAll: function (items) {
        writeRaw(name, items || []);
        emit(name);
      },
      subscribe: function (fn) { return subscribe(name, fn); }
    };
  }

  var materiales = makeCollection('materiales');
  var categorias = makeCollection('categorias');
  var presupuestos = makeCollection('presupuestos');

  var CATEGORIAS_DEFAULT = [
    { nombre: 'Portones (corredizos / hojas)', porcentaje: 35 },
    { nombre: 'Rejas y protecciones', porcentaje: 30 },
    { nombre: 'Barandas y pasamanos', porcentaje: 40 },
    { nombre: 'Escaleras metálicas', porcentaje: 35 },
    { nombre: 'Estructuras metálicas (galpones, entrepisos)', porcentaje: 25 },
    { nombre: 'Herrería artística / ornamental', porcentaje: 60 },
    { nombre: 'Muebles y trabajos a medida', porcentaje: 45 },
    { nombre: 'Reparaciones y mantenimiento', porcentaje: 55 }
  ];

  function ensureSeed() {
    if (categorias.getAll().length === 0) {
      CATEGORIAS_DEFAULT.forEach(function (c, i) {
        categorias.save({ id: uid(), nombre: c.nombre, porcentaje: c.porcentaje, orden: i });
      });
    }
  }

  var EMPRESA_KEY = 'empresa';
  var empresa = {
    get: function () {
      return readRaw(EMPRESA_KEY, {
        nombre: '',
        telefono: '',
        direccion: '',
        condiciones: 'Presupuesto válido por 15 días. No incluye instalación salvo que se indique. Se solicita anticipo del 50% para reservar materiales.',
        proximoNumero: 1,
        cifPorcentaje: 0,
        gastosAdminPorcentaje: 0,
        margenPorcentaje: 0,
        ivaPorcentaje: 0
      });
    },
    save: function (data) {
      writeRaw(EMPRESA_KEY, data);
      emit(EMPRESA_KEY);
    },
    subscribe: function (fn) { return subscribe(EMPRESA_KEY, fn); },
    tomarNumero: function () {
      var e = this.get();
      var numero = e.proximoNumero || 1;
      e.proximoNumero = numero + 1;
      this.save(e);
      return numero;
    }
  };

  // Usa siempre la colección ACTIVA (global.Store.xxx), no los closures locales
  // de más arriba, para que el backup funcione igual en modo local o nube.
  var backup = {
    exportJSON: function () {
      return JSON.stringify({
        version: 1,
        exportado: nowISO(),
        materiales: global.Store.materiales.getAll(),
        categorias: global.Store.categorias.getAll(),
        presupuestos: global.Store.presupuestos.getAll(),
        empresa: global.Store.empresa.get()
      }, null, 2);
    },
    importJSON: function (jsonString) {
      var data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') throw new Error('Archivo inválido');
      if (Array.isArray(data.materiales)) global.Store.materiales.replaceAll(data.materiales);
      if (Array.isArray(data.categorias)) global.Store.categorias.replaceAll(data.categorias);
      if (Array.isArray(data.presupuestos)) global.Store.presupuestos.replaceAll(data.presupuestos);
      if (data.empresa) global.Store.empresa.save(data.empresa);
    }
  };

  global.Store = {
    uid: uid,
    nowISO: nowISO,
    materiales: materiales,
    categorias: categorias,
    presupuestos: presupuestos,
    empresa: empresa,
    backup: backup,
    ensureSeed: ensureSeed,
    // API estable de eventos: no cambia aunque materiales/categorias/etc. se
    // reemplacen por una implementación respaldada en Firestore al iniciar
    // sesión (ver firebase-sync.js). Así las pantallas siempre se enteran de
    // cambios, vengan de este dispositivo o de otro sincronizado.
    subscribe: subscribe,
    notify: emit,
    // Implementación 100% local (localStorage), para volver a este modo al
    // cerrar sesión y para la migración inicial de datos a la nube.
    _local: { materiales: materiales, categorias: categorias, presupuestos: presupuestos, empresa: empresa }
  };
})(window);
