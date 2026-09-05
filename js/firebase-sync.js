/**
 * Sincronización opcional con Firebase (Auth con Google + Firestore).
 *
 * Si no está configurado (falta js/firebase-config.js o no cargaron los
 * scripts de Firebase por falta de conexión), la app sigue funcionando
 * 100% con el almacenamiento local de store.js — este archivo nunca rompe
 * ese modo, solo lo reemplaza cuando hay sesión iniciada.
 *
 * Al iniciar sesión por primera vez con una cuenta cuyo espacio en la nube
 * todavía está vacío, se suben los datos que ya hubiera cargados en este
 * dispositivo (así no se pierde lo que se cargó antes de conectar Firebase).
 */
(function (global) {
  'use strict';

  var auth = null;
  var db = null;
  var provider = null;
  var unsubsNube = [];

  function estaConfigurado() {
    return !!(global.firebase && global.FIREBASE_CONFIG && global.FIREBASE_CONFIG.apiKey);
  }

  function actualizarBadge(estado, detalle) {
    var el = document.getElementById('sync-badge');
    if (!el) return;
    if (estado === 'nube') {
      el.textContent = '☁️ Sincronizado';
      el.title = 'Sincronizado en la nube como ' + (detalle || '');
    } else if (estado === 'conectando') {
      el.textContent = '⏳ Conectando…';
      el.title = '';
    } else {
      el.textContent = '📱 Local';
      el.title = 'Guardado solo en este dispositivo';
    }
  }

  function manejarErrorAuth(err) {
    if (!err || err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    if (err.code === 'auth/unauthorized-domain') {
      Util.toast('Este sitio no está autorizado en Firebase (Authentication → Settings → Authorized domains).');
    } else if (err.code === 'auth/network-request-failed') {
      Util.toast('Sin conexión: no se pudo iniciar sesión ahora.');
    } else {
      Util.toast('No se pudo iniciar sesión: ' + (err.message || err.code || err));
    }
    console.error('Firebase auth', err);
  }

  function limpiarSuscripcionesNube() {
    unsubsNube.forEach(function (fn) { try { fn(); } catch (e) { /* ignorar */ } });
    unsubsNube = [];
  }

  function firestoreCollection(name, uid) {
    var colRef = db.collection('users').doc(uid).collection(name);
    var cache = [];
    var unsub = colRef.onSnapshot(function (snap) {
      cache = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      Store.notify(name);
    }, function (err) { console.error('Firestore ' + name, err); });

    return {
      _unsub: unsub,
      getAll: function () { return cache.slice(); },
      get: function (id) { return cache.find(function (x) { return x.id === id; }) || null; },
      save: function (item) {
        var data = Object.assign({}, item);
        delete data.id;
        if (item.id) {
          colRef.doc(item.id).set(data);
        } else {
          var ref = colRef.doc();
          item.id = ref.id;
          ref.set(data);
        }
        return item;
      },
      remove: function (id) { return colRef.doc(id).delete(); },
      replaceAll: function (items) {
        var batch = db.batch();
        cache.forEach(function (old) { batch.delete(colRef.doc(old.id)); });
        (items || []).forEach(function (item) {
          var id = item.id || colRef.doc().id;
          var data = Object.assign({}, item);
          delete data.id;
          batch.set(colRef.doc(id), data);
        });
        return batch.commit();
      },
      subscribe: function (fn) { return Store.subscribe(name, fn); }
    };
  }

  function firestoreEmpresa(uid) {
    var ref = db.collection('users').doc(uid);
    var cache = null;
    var unsub = ref.onSnapshot(function (doc) {
      cache = doc.exists ? doc.data() : null;
      Store.notify('empresa');
    }, function (err) { console.error('Firestore empresa', err); });

    var DEFAULTS = {
      nombre: '', telefono: '', direccion: '',
      condiciones: 'Presupuesto válido por 15 días. No incluye instalación salvo que se indique. Se solicita anticipo del 50% para reservar materiales.',
      proximoNumero: 1
    };

    return {
      _unsub: unsub,
      get: function () { return Object.assign({}, DEFAULTS, cache || {}); },
      save: function (data) { return ref.set(data, { merge: true }); },
      subscribe: function (fn) { return Store.subscribe('empresa', fn); },
      tomarNumero: function () {
        return db.runTransaction(function (tx) {
          return tx.get(ref).then(function (doc) {
            var data = doc.exists ? doc.data() : {};
            var numero = data.proximoNumero || 1;
            tx.set(ref, Object.assign({}, data, { proximoNumero: numero + 1 }), { merge: true });
            return numero;
          });
        });
      }
    };
  }

  /** Si la cuenta todavía no tiene nada en la nube, sube lo que ya había local. */
  function migrarSiCorresponde(uid) {
    var matRef = db.collection('users').doc(uid).collection('materiales');
    var catRef = db.collection('users').doc(uid).collection('categorias');
    var preRef = db.collection('users').doc(uid).collection('presupuestos');
    var empRef = db.collection('users').doc(uid);

    return Promise.all([matRef.limit(1).get(), catRef.limit(1).get(), preRef.limit(1).get(), empRef.get()])
      .then(function (r) {
        var nubeVacia = r[0].empty && r[1].empty && r[2].empty && !r[3].exists;
        var local = Store._local;
        var hayDatosLocales = local.materiales.getAll().length > 0 ||
          local.categorias.getAll().length > 0 ||
          local.presupuestos.getAll().length > 0 ||
          !!local.empresa.get().nombre;
        if (!nubeVacia || !hayDatosLocales) return;

        var batch = db.batch();
        function agregar(ref, items) {
          items.forEach(function (item) {
            var data = Object.assign({}, item);
            var id = data.id;
            delete data.id;
            batch.set(ref.doc(id), data);
          });
        }
        agregar(matRef, local.materiales.getAll());
        agregar(catRef, local.categorias.getAll());
        agregar(preRef, local.presupuestos.getAll());
        batch.set(empRef, local.empresa.get());
        return batch.commit().then(function () {
          Util.toast('Los datos de este dispositivo se subieron a la nube');
        });
      });
  }

  function switchToCloud(uid, email) {
    actualizarBadge('conectando');
    migrarSiCorresponde(uid).catch(function (err) {
      console.error('Migración a Firestore', err);
    }).then(function () {
      limpiarSuscripcionesNube();
      var mat = firestoreCollection('materiales', uid);
      var cat = firestoreCollection('categorias', uid);
      var pre = firestoreCollection('presupuestos', uid);
      var emp = firestoreEmpresa(uid);
      unsubsNube = [mat._unsub, cat._unsub, pre._unsub, emp._unsub];
      Store.materiales = mat;
      Store.categorias = cat;
      Store.presupuestos = pre;
      Store.empresa = emp;
      actualizarBadge('nube', email);
    });
  }

  function switchToLocal() {
    limpiarSuscripcionesNube();
    Store.materiales = Store._local.materiales;
    Store.categorias = Store._local.categorias;
    Store.presupuestos = Store._local.presupuestos;
    Store.empresa = Store._local.empresa;
    ['materiales', 'categorias', 'presupuestos', 'empresa'].forEach(function (n) { Store.notify(n); });
    actualizarBadge('local');
  }

  function iniciarSesion() {
    if (!auth) { Util.toast('La sincronización con la nube no está disponible ahora (sin conexión).'); return; }
    auth.signInWithPopup(provider).catch(function (err) {
      var sinPopup = err && (
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/operation-not-supported-in-this-environment' ||
        err.code === 'auth/cancelled-popup-request'
      );
      if (sinPopup) { auth.signInWithRedirect(provider).catch(manejarErrorAuth); return; }
      manejarErrorAuth(err);
    });
  }

  function cerrarSesion() {
    if (!auth) return;
    auth.signOut();
  }

  function usuarioActual() {
    return auth && auth.currentUser ? auth.currentUser : null;
  }

  /**
   * Pide (bajo demanda, no en el login normal) permiso de lectura sobre
   * Google Sheets y devuelve un access token de Google válido por un rato.
   * Vuelve a pedirlo cada vez que hace falta en vez de guardarlo, porque
   * expira en aprox. 1 hora y esto se usa esporádicamente.
   */
  function obtenerTokenSheets() {
    if (!auth || !auth.currentUser) {
      return Promise.reject(new Error('Iniciá sesión con Google primero.'));
    }
    var providerSheets = new global.firebase.auth.GoogleAuthProvider();
    providerSheets.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
    // Sugiere la misma cuenta ya conectada, para no terminar con el token
    // de una cuenta de Google distinta a la que sincroniza los datos.
    providerSheets.setCustomParameters({ login_hint: auth.currentUser.email || '' });
    // signInWithPopup (no reauthenticateWithPopup) es el que efectivamente
    // devuelve el accessToken de Google con el scope pedido; como es la
    // misma cuenta, no crea un usuario nuevo ni cierra la sesión actual.
    return auth.signInWithPopup(providerSheets).then(function (result) {
      var credential = global.firebase.auth.GoogleAuthProvider.credentialFromResult(result);
      if (!credential || !credential.accessToken) {
        throw new Error('Google no devolvió permiso de acceso a Sheets.');
      }
      return credential.accessToken;
    });
  }

  function init() {
    if (!estaConfigurado()) {
      console.warn('Firebase no configurado: la app sigue en modo local.');
      return;
    }
    global.firebase.initializeApp(global.FIREBASE_CONFIG);
    auth = global.firebase.auth();
    db = global.firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
      console.warn('Persistencia offline de Firestore no disponible:', err.code);
    });
    provider = new global.firebase.auth.GoogleAuthProvider();

    auth.getRedirectResult().catch(manejarErrorAuth);
    auth.onAuthStateChanged(function (user) {
      if (user) switchToCloud(user.uid, user.email);
      else switchToLocal();
    });
  }

  global.FirebaseSync = {
    init: init,
    estaConfigurado: estaConfigurado,
    iniciarSesion: iniciarSesion,
    cerrarSesion: cerrarSesion,
    usuarioActual: usuarioActual,
    obtenerTokenSheets: obtenerTokenSheets
  };
})(window);
