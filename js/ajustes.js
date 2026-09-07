(function (global) {
  'use strict';

  function renderSincronizacion() {
    if (!global.FirebaseSync || !global.FirebaseSync.estaConfigurado()) {
      return '<p style="font-size:0.82rem;color:var(--steel-500);">' +
        'La sincronización con la nube todavía no está conectada en esta app.' +
        '</p>';
    }
    var user = global.FirebaseSync.usuarioActual();
    if (user) {
      return '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:12px;">' +
          'Conectado como <strong>' + Util.escapeHtml(user.email || '') + '</strong>. ' +
          'Los materiales y presupuestos se sincronizan solos con cualquier otro dispositivo donde inicies sesión con esta misma cuenta.' +
        '</p>' +
        '<button class="btn btn-outline btn-block" id="aj-auth-btn" data-action="salir">Cerrar sesión</button>';
    }
    return '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:12px;">' +
        'Iniciá sesión con Google para que los datos se sincronicen solos entre el celular y la compu. ' +
        'Hasta entonces, quedan solo en este dispositivo (podés usar Exportar/Importar copia para pasarlos manualmente).' +
      '</p>' +
      '<button class="btn btn-primary btn-block" id="aj-auth-btn" data-action="entrar">Iniciar sesión con Google</button>';
  }

  function renderSheets(empresa) {
    var conectado = global.FirebaseSync && global.FirebaseSync.estaConfigurado() && global.FirebaseSync.usuarioActual();
    if (!conectado) {
      return '<p style="font-size:0.82rem;color:var(--steel-500);">' +
        'Iniciá sesión con Google (arriba) para poder traer precios desde una planilla de Sheets.' +
        '</p>';
    }
    return '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:12px;">' +
        'Planilla con columnas <strong>Nombre | Unidad | Precio</strong> (fila 1 = encabezado, se ignora). ' +
        'Actualiza el precio de los materiales que coincidan por nombre y agrega los que no existan todavía.' +
      '</p>' +
      '<div class="field"><label for="aj-sheets-url">Link de la planilla</label>' +
        '<input class="input" id="aj-sheets-url" placeholder="https://docs.google.com/spreadsheets/d/…" value="' + Util.escapeHtml(empresa.sheetsUrl || '') + '"></div>' +
      '<button class="btn btn-primary btn-block" id="aj-sheets-actualizar">Actualizar precios desde Sheets</button>';
  }

  function render() {
    var cont = document.getElementById('ajustes-container');
    var e = Store.empresa.get();

    cont.innerHTML =
      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Datos de la empresa</h2>' +
        '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:12px;">Aparecen en el encabezado del PDF de cada presupuesto.</p>' +
        '<div class="field"><label for="aj-nombre">Nombre del taller</label>' +
          '<input class="input" id="aj-nombre" placeholder="Ej: Herrería Molina" value="' + Util.escapeHtml(e.nombre) + '"></div>' +
        '<div class="field"><label for="aj-telefono">Teléfono</label>' +
          '<input class="input" id="aj-telefono" value="' + Util.escapeHtml(e.telefono) + '"></div>' +
        '<div class="field"><label for="aj-direccion">Dirección</label>' +
          '<input class="input" id="aj-direccion" value="' + Util.escapeHtml(e.direccion) + '"></div>' +
        '<div class="field"><label for="aj-condiciones">Condiciones (van al pie de cada presupuesto)</label>' +
          '<textarea class="input" id="aj-condiciones" rows="4">' + Util.escapeHtml(e.condiciones) + '</textarea></div>' +
        '<button class="btn btn-primary btn-block" id="aj-guardar">Guardar datos</button>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Cotización del dólar</h2>' +
        '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:12px;">' +
          'Se usa para convertir a pesos los materiales cargados en dólares. ' +
          (Dolar.fechaActualizado() ? 'Última actualización: ' + Util.fechaCorta(Dolar.fechaActualizado()) + '.' : 'Todavía no se actualizó.') +
        '</p>' +
        '<div class="field"><label for="aj-dolar">Dólar oficial (venta, en pesos)</label>' +
          '<input class="input" id="aj-dolar" type="number" min="0" step="0.01" value="' + (Dolar.valorActual() || '') + '"></div>' +
        '<div class="form-actions">' +
          '<button class="btn btn-outline" id="aj-dolar-guardar">Guardar valor</button>' +
          '<button class="btn btn-primary" id="aj-dolar-actualizar">Actualizar automático</button>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:10px;">Copia de seguridad</h2>' +
        '<p style="font-size:0.82rem;color:var(--steel-500);margin-bottom:12px;">' +
          'Mientras no esté conectada la sincronización automática, usá esto para pasar los datos entre el celular y la compu: ' +
          'exportá un archivo desde un dispositivo y luego importalo en el otro.' +
        '</p>' +
        '<div class="form-actions">' +
          '<button class="btn btn-outline" id="aj-exportar">' + Util.iconDownload() + ' Exportar copia</button>' +
          '<button class="btn btn-outline" id="aj-importar-btn">' + Util.iconUpload() + ' Importar copia</button>' +
        '</div>' +
        '<input type="file" id="aj-importar-file" accept="application/json,.json" hidden>' +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Sincronización entre dispositivos</h2>' +
        renderSincronizacion() +
      '</div>' +

      '<div class="card">' +
        '<h2 style="font-size:0.95rem;font-weight:700;margin-bottom:6px;">Lista de precios desde Google Sheets</h2>' +
        renderSheets(e) +
      '</div>';

    document.getElementById('aj-guardar').addEventListener('click', function () {
      Store.empresa.save(Object.assign({}, Store.empresa.get(), {
        nombre: document.getElementById('aj-nombre').value.trim(),
        telefono: document.getElementById('aj-telefono').value.trim(),
        direccion: document.getElementById('aj-direccion').value.trim(),
        condiciones: document.getElementById('aj-condiciones').value.trim()
      }));
      Util.toast('Datos de la empresa guardados');
    });

    document.getElementById('aj-dolar-guardar').addEventListener('click', function () {
      var v = parseFloat(document.getElementById('aj-dolar').value);
      if (isNaN(v) || v <= 0) { Util.toast('Ingresá un valor válido'); return; }
      Dolar.guardar(v);
      Util.toast('Cotización guardada');
    });

    document.getElementById('aj-dolar-actualizar').addEventListener('click', function () {
      var btn = document.getElementById('aj-dolar-actualizar');
      var textoOriginal = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Actualizando…';
      Dolar.actualizar().then(function (valor) {
        Util.toast('Cotización actualizada: $ ' + valor);
      }).catch(function (err) {
        console.error(err);
        Util.toast('No se pudo traer la cotización, revisá la conexión');
        btn.disabled = false;
        btn.textContent = textoOriginal;
      });
    });

    document.getElementById('aj-exportar').addEventListener('click', function () {
      var json = Store.backup.exportJSON();
      var blob = new Blob([json], { type: 'application/json' });
      var fecha = new Date().toISOString().slice(0, 10);
      Util.descargarBlob(blob, 'presupuestador-backup-' + fecha + '.json');
      Util.toast('Copia exportada');
    });

    document.getElementById('aj-importar-btn').addEventListener('click', function () {
      document.getElementById('aj-importar-file').click();
    });
    document.getElementById('aj-importar-file').addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      if (!confirm('Importar reemplaza los materiales, presupuestos y datos de la empresa guardados en este dispositivo por los del archivo. ¿Continuar?')) {
        ev.target.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          Store.backup.importJSON(String(reader.result));
          Util.toast('Copia importada correctamente');
          if (global.App && global.App.refrescarTodo) global.App.refrescarTodo();
          render();
        } catch (err) {
          console.error(err);
          Util.toast('El archivo no es una copia de seguridad válida');
        }
        ev.target.value = '';
      };
      reader.readAsText(file);
    });

    var authBtn = document.getElementById('aj-auth-btn');
    if (authBtn) {
      authBtn.addEventListener('click', function () {
        if (authBtn.dataset.action === 'entrar') global.FirebaseSync.iniciarSesion();
        else global.FirebaseSync.cerrarSesion();
      });
    }

    var sheetsBtn = document.getElementById('aj-sheets-actualizar');
    if (sheetsBtn) {
      sheetsBtn.addEventListener('click', function () {
        var url = document.getElementById('aj-sheets-url').value.trim();
        if (!url) { Util.toast('Pegá el link de la planilla'); return; }

        Store.empresa.save(Object.assign({}, Store.empresa.get(), { sheetsUrl: url }));

        var textoOriginal = sheetsBtn.textContent;
        sheetsBtn.disabled = true;
        sheetsBtn.textContent = 'Actualizando…';
        global.SheetsSync.actualizarDesdeSheet(url).then(function (r) {
          Util.toast('Listo: ' + r.actualizados + ' actualizados, ' + r.agregados + ' nuevos' + (r.invalidas ? ', ' + r.invalidas + ' filas inválidas' : ''));
          if (global.VistaMateriales) global.VistaMateriales.renderLista();
        }).catch(function (err) {
          console.error(err);
          Util.toast('No se pudo actualizar: ' + err.message);
        }).finally(function () {
          sheetsBtn.disabled = false;
          sheetsBtn.textContent = textoOriginal;
        });
      });
    }
  }

  global.VistaAjustes = { init: render };
})(window);
