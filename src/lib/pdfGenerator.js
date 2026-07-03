/**
 * SaveBoth - pdfGenerator
 * JPEG 캡처 이미지들을 외부 라이브러리 없이 하나의 PDF로 조립한다.
 * 각 이미지는 DCTDecode 필터로 그대로 임베딩되며, 이미지 1장 = PDF 1페이지.
 * 완전 로컬 처리이며 네트워크 접근이 없다.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SaveBothPdf = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /**
   * @param {Array<{data: Uint8Array, width: number, height: number}>} images
   *        JPEG 바이트와 픽셀 크기 (위에서 아래 순서)
   * @param {{devicePixelRatio?: number}} [options]
   * @returns {Uint8Array} PDF 파일 바이트
   */
  function createPdfFromJpegs(images, options) {
    if (!images || images.length === 0) {
      throw new Error('No images to convert');
    }
    const dpr = Math.max(0.1, (options && options.devicePixelRatio) || 1);
    // CSS px -> PDF pt: 96 CSS px = 72 pt, 캡처는 dpr 배율 픽셀
    const scale = 72 / (96 * dpr);

    const encoder = new TextEncoder();
    const chunks = [];
    let offset = 0;
    const offsets = [];

    function push(data) {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data;
      chunks.push(bytes);
      offset += bytes.length;
    }

    function beginObj(num) {
      offsets[num] = offset;
      push(num + ' 0 obj\n');
    }

    push('%PDF-1.4\n');
    // 바이너리 파일임을 알리는 고바이트 주석 (PDF 규약 권장)
    push(new Uint8Array([37, 255, 255, 255, 255, 10]));

    const pageCount = images.length;
    const objCount = 2 + pageCount * 3;

    beginObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    const kids = images.map(function (_, i) {
      return 3 + i * 3 + ' 0 R';
    }).join(' ');
    beginObj(2);
    push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pageCount + ' >>\nendobj\n');

    images.forEach(function (img, i) {
      const pageNum = 3 + i * 3;
      const contentNum = pageNum + 1;
      const imageNum = pageNum + 2;
      const w = (img.width * scale).toFixed(2);
      const h = (img.height * scale).toFixed(2);

      beginObj(pageNum);
      push(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] ' +
        '/Resources << /XObject << /Im' + i + ' ' + imageNum + ' 0 R >> ' +
        '/ProcSet [/PDF /ImageC] >> /Contents ' + contentNum + ' 0 R >>\nendobj\n'
      );

      const content = 'q\n' + w + ' 0 0 ' + h + ' 0 0 cm\n/Im' + i + ' Do\nQ\n';
      beginObj(contentNum);
      push('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');

      beginObj(imageNum);
      push(
        '<< /Type /XObject /Subtype /Image /Width ' + img.width +
        ' /Height ' + img.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        img.data.length + ' >>\nstream\n'
      );
      push(img.data);
      push('\nendstream\nendobj\n');
    });

    const xrefOffset = offset;
    let xref = 'xref\n0 ' + (objCount + 1) + '\n0000000000 65535 f \n';
    for (let n = 1; n <= objCount; n++) {
      xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    }
    push(xref);
    push(
      'trailer\n<< /Size ' + (objCount + 1) + ' /Root 1 0 R >>\nstartxref\n' +
      xrefOffset + '\n%%EOF\n'
    );

    const total = chunks.reduce(function (sum, c) { return sum + c.length; }, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  return {
    createPdfFromJpegs: createPdfFromJpegs
  };
});
