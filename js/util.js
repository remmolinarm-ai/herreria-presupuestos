(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fechaCorta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-visible'); }, 2600);
  }

  function descargarBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // Íconos de línea en SVG inline (sin emojis) para un look consistente y prolijo.
  function iconPencil() {
    return '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.7 3.3a1.6 1.6 0 0 1 2.3 2.3l-9 9-3 .7.7-3 9-9Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function iconTrash() {
    return '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M15 6l-.7 9.3a1.5 1.5 0 0 1-1.5 1.4H7.2a1.5 1.5 0 0 1-1.5-1.4L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function iconDoc() {
    return '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 2.5h6l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 2.5v3h3" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function iconDownload() {
    return '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 15.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function iconUpload() {
    return '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 12V3M6.5 6.5 10 3l3.5 3.5M4 15.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function iconClose() {
    return '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  function iconCloud() {
    return '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 15H6a3.5 3.5 0 0 1-.5-6.96A4.5 4.5 0 0 1 14 6.55 3.5 3.5 0 0 1 14.5 15Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }
  function iconDevice() {
    return '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="2" width="8" height="16" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M9 15.2h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  function iconClock() {
    return '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10.5" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.5V10.5L12.8 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  global.Util = {
    escapeHtml: escapeHtml, fechaCorta: fechaCorta, toast: toast, descargarBlob: descargarBlob,
    iconPencil: iconPencil, iconTrash: iconTrash, iconDoc: iconDoc,
    iconDownload: iconDownload, iconUpload: iconUpload, iconClose: iconClose,
    iconCloud: iconCloud, iconDevice: iconDevice, iconClock: iconClock
  };
})(window);
