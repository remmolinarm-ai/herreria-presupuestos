/**
 * Generador de PDF minimalista, sin dependencias externas.
 *
 * Se escribe a mano (en vez de usar una librería como jsPDF) porque este
 * entorno no tiene salida a internet para descargar y empaquetar una
 * librería de terceros, y la app tiene que poder generar el PDF sin
 * conexión desde el celular. Solo soporta lo que necesita un presupuesto:
 * texto con las fuentes estándar Helvetica/Helvetica-Bold (WinAnsiEncoding,
 * cubre tildes y ñ), líneas y rectángulos, y paginado automático.
 */
(function (global) {
  'use strict';

  var PAGE_W = 595.28;
  var PAGE_H = 841.89;

  // Métricas AFM estándar de Helvetica / Helvetica-Bold (1/1000 em), para
  // estimar anchos de texto y armar el layout (ajuste de líneas, columnas).
  var WIDTHS_REGULAR = buildWidths({
    32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
    40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
    48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
    56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
    64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
    72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
    80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
    88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
    96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278,
    103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833,
    110: 556, 111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278,
    117: 556, 118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334,
    124: 260, 125: 334, 126: 584, 161: 333, 191: 556
  }, 556);

  var WIDTHS_BOLD = buildWidths({
    32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238,
    40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
    48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
    56: 556, 57: 556, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611,
    64: 975, 65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
    72: 722, 73: 278, 74: 556, 75: 722, 76: 611, 77: 833, 78: 722, 79: 778,
    80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
    88: 667, 89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556,
    96: 333, 97: 556, 98: 611, 99: 556, 100: 611, 101: 556, 102: 333,
    103: 611, 104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889,
    110: 611, 111: 611, 112: 611, 113: 611, 114: 389, 115: 556, 116: 333,
    117: 611, 118: 556, 119: 778, 120: 556, 121: 556, 122: 500, 123: 389,
    124: 280, 125: 389, 126: 584, 161: 333, 191: 611
  }, 611);

  // Letras acentuadas / ñ: aproximamos con el ancho de la letra base.
  var ACCENT_BASE = {
    193: 65, 201: 69, 205: 73, 211: 79, 218: 85, 209: 78, 220: 85, 191: 63,
    225: 97, 233: 101, 237: 105, 243: 111, 250: 117, 241: 110, 252: 117, 161: 33
  };

  function buildWidths(map, fallback) {
    var w = new Array(256).fill(fallback);
    Object.keys(map).forEach(function (k) { w[k] = map[k]; });
    return w;
  }

  function widthTable(bold) { return bold ? WIDTHS_BOLD : WIDTHS_REGULAR; }

  function charWidth(code, bold) {
    var table = widthTable(bold);
    if (code < 256) return table[code];
    var base = ACCENT_BASE[code];
    if (base !== undefined) return table[base];
    return table[97]; // fallback razonable
  }

  function textWidth(str, size, bold) {
    var total = 0;
    for (var i = 0; i < str.length; i++) total += charWidth(str.charCodeAt(i), bold);
    return (total / 1000) * size;
  }

  /** Corta `str` en líneas que entran en `maxWidth` puntos. */
  function wrapText(str, size, bold, maxWidth) {
    var words = String(str).split(/\s+/).filter(Boolean);
    var lines = [];
    var current = '';
    words.forEach(function (word) {
      var candidate = current ? current + ' ' + word : word;
      if (textWidth(candidate, size, bold) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function escapePdfString(bytes) {
    var out = [];
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c); // ( ) \
      out.push(b);
    }
    return out;
  }

  // Puntuación "tipográfica" fuera de Latin-1 que sí existe en WinAnsi/CP-1252.
  var SMART_PUNCT = {
    0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94,
    0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x2022: 0x95
  };

  function strToWinAnsiBytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code >= 256) code = SMART_PUNCT[code] || 0x3f; // '?' si no mapea
      bytes.push(code);
    }
    return bytes;
  }

  function asciiBytes(str) {
    var bytes = new Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    return bytes;
  }

  function PDFLite() {
    this.pages = [];
  }

  PDFLite.prototype.addPage = function () {
    var page = { ops: [] };
    this.pages.push(page);
    return this.pages.length - 1;
  };

  PDFLite.prototype.pageHeight = function () { return PAGE_H; };
  PDFLite.prototype.pageWidth = function () { return PAGE_W; };
  PDFLite.prototype.textWidth = textWidth;
  PDFLite.prototype.wrapText = wrapText;

  /** x,y en coordenadas "de arriba hacia abajo" (y=0 es el borde superior). */
  PDFLite.prototype.text = function (pageIndex, x, y, str, opts) {
    opts = opts || {};
    this.pages[pageIndex].ops.push({
      type: 'text',
      x: x,
      y: PAGE_H - y,
      str: String(str),
      size: opts.size || 10,
      bold: !!opts.bold,
      color: opts.color || [0, 0, 0]
    });
  };

  PDFLite.prototype.line = function (pageIndex, x1, y1, x2, y2, opts) {
    opts = opts || {};
    this.pages[pageIndex].ops.push({
      type: 'line',
      x1: x1, y1: PAGE_H - y1, x2: x2, y2: PAGE_H - y2,
      width: opts.width || 1,
      color: opts.color || [0, 0, 0]
    });
  };

  PDFLite.prototype.rect = function (pageIndex, x, y, w, h, opts) {
    opts = opts || {};
    this.pages[pageIndex].ops.push({
      type: 'rect',
      x: x, y: PAGE_H - y - h, w: w, h: h,
      fill: opts.fill || null,
      stroke: opts.stroke || null,
      lineWidth: opts.lineWidth || 1
    });
  };

  function colorOp(rgb, strokeOp) {
    return rgb[0] + ' ' + rgb[1] + ' ' + rgb[2] + ' ' + (strokeOp ? 'RG' : 'rg');
  }

  function buildContentStream(page) {
    var bytes = [];
    function push(strAscii) { bytes = bytes.concat(asciiBytes(strAscii)); }

    page.ops.forEach(function (op) {
      if (op.type === 'text') {
        push('BT\n/' + (op.bold ? 'F2' : 'F1') + ' ' + op.size + ' Tf\n');
        push(colorOp(op.color, false) + '\n');
        push(op.x.toFixed(2) + ' ' + op.y.toFixed(2) + ' Td\n');
        push('(');
        bytes = bytes.concat(escapePdfString(strToWinAnsiBytes(op.str)));
        push(') Tj\nET\n');
      } else if (op.type === 'line') {
        push(op.width + ' w\n');
        push(colorOp(op.color, true) + '\n');
        push(op.x1.toFixed(2) + ' ' + op.y1.toFixed(2) + ' m\n');
        push(op.x2.toFixed(2) + ' ' + op.y2.toFixed(2) + ' l\nS\n');
      } else if (op.type === 'rect') {
        push(op.x.toFixed(2) + ' ' + op.y.toFixed(2) + ' ' + op.w.toFixed(2) + ' ' + op.h.toFixed(2) + ' re\n');
        if (op.fill) { push(colorOp(op.fill, false) + '\n'); }
        if (op.stroke) { push(op.lineWidth + ' w\n' + colorOp(op.stroke, true) + '\n'); }
        if (op.fill && op.stroke) push('B\n');
        else if (op.fill) push('f\n');
        else if (op.stroke) push('S\n');
      }
    });
    return bytes;
  }

  PDFLite.prototype.build = function () {
    var objects = []; // cada entrada: array de bytes del objeto completo "N 0 obj\n...\nendobj\n"
    var CRLF = [0x0d, 0x0a];

    function ascii(str) { return asciiBytes(str); }

    var numPages = this.pages.length || 1;
    if (this.pages.length === 0) this.addPage();

    var fontF1Num = 3, fontF2Num = 4;
    var firstPageNum = 5;
    var firstContentNum = firstPageNum + numPages;

    // 1: Catalog
    objects[1] = ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2: Pages
    var kids = [];
    for (var i = 0; i < numPages; i++) kids.push((firstPageNum + i) + ' 0 R');
    objects[2] = ascii('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + numPages + ' >>\nendobj\n');

    // 3, 4: Fonts
    objects[3] = ascii('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    objects[4] = ascii('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');

    // Pages + content streams
    this.pages.forEach(function (page, idx) {
      var pageNum = firstPageNum + idx;
      var contentNum = firstContentNum + idx;
      objects[pageNum] = ascii(
        pageNum + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W.toFixed(2) + ' ' + PAGE_H.toFixed(2) + ']' +
        ' /Resources << /Font << /F1 ' + fontF1Num + ' 0 R /F2 ' + fontF2Num + ' 0 R >> >>' +
        ' /Contents ' + contentNum + ' 0 R >>\nendobj\n'
      );

      var streamBytes = buildContentStream(page);
      var head = ascii(contentNum + ' 0 obj\n<< /Length ' + streamBytes.length + ' >>\nstream\n');
      var tail = ascii('\nendstream\nendobj\n');
      objects[contentNum] = head.concat(streamBytes, tail);
    });

    // Serializar con cálculo de offsets
    var out = ascii('%PDF-1.4\n');
    var offsets = [];
    var maxObjNum = firstContentNum + numPages - 1;
    for (var n = 1; n <= maxObjNum; n++) {
      offsets[n] = out.length;
      out = out.concat(objects[n]);
    }

    var xrefStart = out.length;
    var xref = ascii('xref\n0 ' + (maxObjNum + 1) + '\n0000000000 65535 f \r\n');
    for (var m = 1; m <= maxObjNum; m++) {
      var off = String(offsets[m]);
      while (off.length < 10) off = '0' + off;
      xref = xref.concat(ascii(off + ' 00000 n \r\n'));
    }
    out = out.concat(xref);
    out = out.concat(ascii(
      'trailer\n<< /Size ' + (maxObjNum + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF'
    ));

    return new Uint8Array(out);
  };

  PDFLite.prototype.toBlob = function () {
    return new Blob([this.build()], { type: 'application/pdf' });
  };

  global.PDFLite = PDFLite;
})(window);
