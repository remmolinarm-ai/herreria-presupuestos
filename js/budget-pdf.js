/**
 * Arma el PDF de un presupuesto (encabezado, tabla de materiales, mano de
 * obra, notas) usando el motor genérico de js/pdf-lite.js, con paginado
 * automático y reimpresión del encabezado de tabla si el presupuesto no
 * entra en una sola página.
 */
(function (global) {
  'use strict';

  var MARGIN = { top: 56, bottom: 56, left: 50, right: 50 };
  var COL = { desc: 235, cant: 55, unidad: 60, precio: 80, subtotal: 85 };
  var LINE_H = 14;

  function money(n) {
    var v = Number(n) || 0;
    return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fechaLarga(iso) {
    var d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function generarPDFPresupuesto(presupuesto, empresa) {
    var doc = new global.PDFLite();
    var pageW = doc.pageWidth();
    var contentW = pageW - MARGIN.left - MARGIN.right;
    var pageIdx = doc.addPage();
    var y = MARGIN.top;

    function ensureSpace(nextHeight, onNewPage) {
      if (y + nextHeight > doc.pageHeight() - MARGIN.bottom) {
        pageIdx = doc.addPage();
        y = MARGIN.top;
        if (onNewPage) onNewPage();
      }
    }

    function drawTableHeader() {
      doc.rect(pageIdx, MARGIN.left, y, contentW, 22, { fill: [0.93, 0.95, 0.97] });
      var x = MARGIN.left + 6;
      doc.text(pageIdx, x, y + 15, 'Descripción', { size: 9, bold: true });
      x += COL.desc;
      doc.text(pageIdx, x, y + 15, 'Cant.', { size: 9, bold: true });
      x += COL.cant;
      doc.text(pageIdx, x, y + 15, 'Unidad', { size: 9, bold: true });
      x += COL.unidad;
      doc.text(pageIdx, x, y + 15, 'P. Unit.', { size: 9, bold: true });
      x += COL.precio;
      doc.text(pageIdx, x, y + 15, 'Subtotal', { size: 9, bold: true });
      y += 22;
    }

    // ---- Encabezado empresa ----
    doc.text(pageIdx, MARGIN.left, y, empresa.nombre || 'Herrería', { size: 17, bold: true, color: [0.106, 0.173, 0.388] });
    doc.text(pageIdx, pageW - MARGIN.right - 160, y, 'PRESUPUESTO N° ' + (presupuesto.numero || ''), { size: 11, bold: true });
    y += 18;
    var infoEmpresa = [empresa.telefono, empresa.direccion].filter(Boolean).join(' · ');
    if (infoEmpresa) { doc.text(pageIdx, MARGIN.left, y, infoEmpresa, { size: 9, color: [0.3, 0.35, 0.42] }); }
    doc.text(pageIdx, pageW - MARGIN.right - 160, y, 'Fecha: ' + fechaLarga(presupuesto.fecha), { size: 9, color: [0.3, 0.35, 0.42] });
    y += 16;
    doc.line(pageIdx, MARGIN.left, y, pageW - MARGIN.right, y, { width: 1, color: [0.106, 0.173, 0.388] });
    y += 22;

    // ---- Datos del cliente / obra ----
    if (presupuesto.cliente) { doc.text(pageIdx, MARGIN.left, y, 'Cliente: ' + presupuesto.cliente, { size: 10 }); y += LINE_H; }
    if (presupuesto.obra) { doc.text(pageIdx, MARGIN.left, y, 'Obra / Dirección: ' + presupuesto.obra, { size: 10 }); y += LINE_H; }
    doc.text(pageIdx, MARGIN.left, y, 'Tipo de trabajo: ' + (presupuesto.categoriaNombre || '-') + '  (mano de obra ' + (presupuesto.porcentaje || 0) + '%)', { size: 10 });
    y += LINE_H + 10;

    // ---- Tabla de materiales ----
    drawTableHeader();

    (presupuesto.items || []).forEach(function (item) {
      var lines = doc.wrapText(item.nombre || '', 9, false, COL.desc - 10);
      var rowH = Math.max(lines.length, 1) * LINE_H + 6;
      ensureSpace(rowH, drawTableHeader);

      var rowTop = y;
      lines.forEach(function (line, i) {
        doc.text(pageIdx, MARGIN.left + 6, rowTop + 14 + i * LINE_H, line, { size: 9 });
      });
      var x = MARGIN.left + COL.desc;
      doc.text(pageIdx, x + 6, rowTop + 14, String(item.cantidad), { size: 9 });
      x += COL.cant;
      doc.text(pageIdx, x + 6, rowTop + 14, item.unidad || '-', { size: 9 });
      x += COL.unidad;
      doc.text(pageIdx, x + 6, rowTop + 14, money(item.precioUnitario), { size: 9 });
      x += COL.precio;
      doc.text(pageIdx, x + 6, rowTop + 14, money(item.subtotal), { size: 9 });

      y += rowH;
      doc.line(pageIdx, MARGIN.left, y, pageW - MARGIN.right, y, { width: 0.5, color: [0.85, 0.85, 0.85] });
    });

    y += 10;
    ensureSpace(80);

    // ---- Totales ----
    var totalsX = pageW - MARGIN.right - 220;
    function totalRow(label, value, opts) {
      opts = opts || {};
      doc.text(pageIdx, totalsX, y, label, { size: opts.size || 10, bold: !!opts.bold });
      doc.text(pageIdx, totalsX + 130, y, value, { size: opts.size || 10, bold: !!opts.bold });
      y += (opts.size || 10) + 8;
    }
    doc.line(pageIdx, totalsX, y, pageW - MARGIN.right, y, { width: 0.5, color: [0.7, 0.7, 0.7] });
    y += 14;
    totalRow('Materiales', money(presupuesto.totalMateriales));
    totalRow('Mano de obra (' + (presupuesto.porcentaje || 0) + '%)', money(presupuesto.manoObra));
    y += 4;
    doc.line(pageIdx, totalsX, y, pageW - MARGIN.right, y, { width: 1, color: [0.106, 0.173, 0.388] });
    y += 16;
    totalRow('TOTAL', money(presupuesto.total), { size: 13, bold: true });
    y += 14;

    // ---- Notas / condiciones ----
    var condiciones = presupuesto.condiciones || empresa.condiciones;
    if (condiciones) {
      ensureSpace(40);
      doc.text(pageIdx, MARGIN.left, y, 'Condiciones', { size: 9, bold: true, color: [0.3, 0.35, 0.42] });
      y += LINE_H;
      doc.wrapText(condiciones, 8.5, false, contentW).forEach(function (line) {
        ensureSpace(LINE_H);
        doc.text(pageIdx, MARGIN.left, y, line, { size: 8.5, color: [0.35, 0.4, 0.47] });
        y += LINE_H - 2;
      });
    }
    if (presupuesto.notas) {
      ensureSpace(40);
      y += 6;
      doc.text(pageIdx, MARGIN.left, y, 'Notas', { size: 9, bold: true, color: [0.3, 0.35, 0.42] });
      y += LINE_H;
      doc.wrapText(presupuesto.notas, 8.5, false, contentW).forEach(function (line) {
        ensureSpace(LINE_H);
        doc.text(pageIdx, MARGIN.left, y, line, { size: 8.5, color: [0.35, 0.4, 0.47] });
        y += LINE_H - 2;
      });
    }

    // ---- Pie de página ----
    var totalPages = doc.pages.length;
    for (var i = 0; i < totalPages; i++) {
      doc.text(i, MARGIN.left, doc.pageHeight() - 28, 'Página ' + (i + 1) + ' de ' + totalPages, { size: 8, color: [0.6, 0.6, 0.6] });
    }

    return doc.toBlob();
  }

  global.BudgetPDF = {
    generar: generarPDFPresupuesto,
    descargar: function (presupuesto, empresa) {
      var blob = generarPDFPresupuesto(presupuesto, empresa);
      var nombreArchivo = 'presupuesto-' + (presupuesto.numero || 's-n') + '.pdf';
      global.Util.descargarBlob(blob, nombreArchivo);
    },
    money: money
  };
})(window);
