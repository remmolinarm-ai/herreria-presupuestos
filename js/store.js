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
  var empleados = makeCollection('empleados');
  var pagosSueldo = makeCollection('pagosSueldo');
  var creditos = makeCollection('creditos');
  var pagosCredito = makeCollection('pagosCredito');
  var cobros = makeCollection('cobros');

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
  var EMPRESA_DEFAULTS = {
    nombre: '',
    telefono: '',
    direccion: '',
    condiciones: 'Presupuesto válido por 15 días. No incluye instalación salvo que se indique. Se solicita anticipo del 50% para reservar materiales.',
    proximoNumero: 1,
    proximoNumeroOT: 1,
    costosDirectosProyectoPorcentajeDefault: 0,
    ingenieriaDisenoPorcentajeDefault: 0,
    cifPorcentaje: 0,
    gastosAdminPorcentaje: 0,
    margenPorcentaje: 0,
    ivaPorcentaje: 0,
    dolarOficial: 0,
    dolarActualizado: null,
    etapasProduccion: ['Corte', 'Soldadura', 'Pintura', 'Terminado', 'Entregado'],
    causasParada: ['Falta de material', 'Rotura de máquina', 'Falta de personal', 'Espera de aprobación del cliente', 'Otro']
  };
  var empresa = {
    // Combinado con los defaults (no devuelto tal cual) para que un campo
    // nuevo (ej. etapasProduccion) aparezca aunque la empresa ya tuviera
    // datos guardados de antes de que ese campo existiera.
    get: function () {
      return Object.assign({}, EMPRESA_DEFAULTS, readRaw(EMPRESA_KEY, {}));
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
    },
    tomarNumeroOT: function () {
      var e = this.get();
      var numero = e.proximoNumeroOT || 1;
      e.proximoNumeroOT = numero + 1;
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
        empleados: global.Store.empleados.getAll(),
        pagosSueldo: global.Store.pagosSueldo.getAll(),
        creditos: global.Store.creditos.getAll(),
        pagosCredito: global.Store.pagosCredito.getAll(),
        cobros: global.Store.cobros.getAll(),
        empresa: global.Store.empresa.get()
      }, null, 2);
    },
    importJSON: function (jsonString) {
      var data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') throw new Error('Archivo inválido');
      if (Array.isArray(data.materiales)) global.Store.materiales.replaceAll(data.materiales);
      if (Array.isArray(data.categorias)) global.Store.categorias.replaceAll(data.categorias);
      if (Array.isArray(data.presupuestos)) global.Store.presupuestos.replaceAll(data.presupuestos);
      if (Array.isArray(data.empleados)) global.Store.empleados.replaceAll(data.empleados);
      if (Array.isArray(data.pagosSueldo)) global.Store.pagosSueldo.replaceAll(data.pagosSueldo);
      if (Array.isArray(data.creditos)) global.Store.creditos.replaceAll(data.creditos);
      if (Array.isArray(data.pagosCredito)) global.Store.pagosCredito.replaceAll(data.pagosCredito);
      if (Array.isArray(data.cobros)) global.Store.cobros.replaceAll(data.cobros);
      if (data.empresa) global.Store.empresa.save(data.empresa);
    }
  };

  global.Store = {
    uid: uid,
    nowISO: nowISO,
    materiales: materiales,
    categorias: categorias,
    presupuestos: presupuestos,
    empleados: empleados,
    pagosSueldo: pagosSueldo,
    creditos: creditos,
    pagosCredito: pagosCredito,
    cobros: cobros,
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
    _local: {
      materiales: materiales, categorias: categorias, presupuestos: presupuestos,
      empleados: empleados, pagosSueldo: pagosSueldo, creditos: creditos, pagosCredito: pagosCredito,
      cobros: cobros,
      empresa: empresa
    }
  };
})(window);
