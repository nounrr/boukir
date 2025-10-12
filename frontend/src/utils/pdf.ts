import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { createRoot } from 'react-dom/client';
import React from 'react';

/**
 * Generate a PDF Blob from a React element rendered offscreen.
 * @param element React element to render (e.g. <BonPrintTemplate ... />)
 * @param widthPx Width in px (default: 794 for A4)
 * @param heightPx Height in px (default: 1123 for A4)
 * @returns Promise<Blob> PDF file blob
 */
export async function generatePDFBlobFromElement(element: React.ReactElement, widthPx = 794, heightPx = 1123): Promise<Blob> {
  // Create offscreen container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = `${widthPx}px`;
  container.style.height = `${heightPx}px`;
  container.style.background = '#fff';
  document.body.appendChild(container);

  // Render element using React 18 root
  const root = createRoot(container);
  root.render(element);

  // Wait for render
  await new Promise(resolve => setTimeout(resolve, 300));

  // Hide print-hidden elements
  const hiddenEls = Array.from(container.querySelectorAll('.print-hidden')) as HTMLElement[];
  const previousDisplay = hiddenEls.map(el => el.style.display);
  hiddenEls.forEach(el => { el.style.display = 'none'; });

  // Capture canvas
  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff'
  });

  // Restore hidden elements
  hiddenEls.forEach((el, i) => { el.style.display = previousDisplay[i] || ''; });

  // Remove container
  root.unmount();
  document.body.removeChild(container);

  // Create PDF
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const ratio = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
  const imgWidth = canvasWidth * ratio;
  const imgHeight = canvasHeight * ratio;
  const x = (pdfWidth - imgWidth) / 2;
  const y = (pdfHeight - imgHeight) / 2;
  const imgData = canvas.toDataURL('image/png');
  pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
  const pdfBlob = pdf.output('blob');
  return pdfBlob;
}
